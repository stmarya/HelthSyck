import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z, ZodError } from 'zod';
import { Pool } from 'pg';
import Redis from 'ioredis';

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────
const PORT = parseInt(process.env['PORT'] ?? '3001', 10);
const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production';
const JWT_EXPIRES_IN = '15m';
const REFRESH_TTL = 7 * 24 * 60 * 60; // 7 days in seconds
const SERVICE_NAME = 'auth-service';

// ─────────────────────────────────────────────
// DB / Redis singletons
// ─────────────────────────────────────────────
let _pool: Pool | null = null;
function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  }
  return _pool;
}

let _redis: Redis | null = null;
function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });
  }
  return _redis;
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface JwtPayload {
  sub: string;
  role: string;
  iat?: number;
  exp?: number;
}

interface AuthRequest extends Request {
  user: JwtPayload;
}

interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  requestId: string;
}

// ─────────────────────────────────────────────
// Validation schemas
// ─────────────────────────────────────────────
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(PASSWORD_REGEX, 'Password must contain uppercase, lowercase, number, and special character'),
  role: z.enum(['PATIENT', 'DOCTOR', 'COMMAND_CENTER', 'PHARMACIST', 'PHARMACY_DRIVER', 'AMBULANCE_DRIVER']).default('PATIENT'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().min(8).optional(),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(PASSWORD_REGEX, 'Password must contain uppercase, lowercase, number, and special character'),
});

const SendOtpSchema = z.object({
  phone: z.string().min(8),
  purpose: z.enum(['PHONE_VERIFY', 'PASSWORD_RESET']),
});

const VerifyOtpSchema = z.object({
  userId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits'),
  purpose: z.enum(['PHONE_VERIFY', 'PASSWORD_RESET']),
});

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function buildProblem(status: number, title: string, detail: string, instance: string): ProblemDetail {
  return {
    type: `https://errors.healthsync.id/${title.toLowerCase().replace(/\s+/g, '-')}`,
    title,
    status,
    detail,
    instance,
    requestId: crypto.randomUUID(),
  };
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function issueTokens(userId: string, role: string): { accessToken: string; refreshToken: string; tokenHash: string } {
  const accessToken = jwt.sign({ sub: userId, role } as JwtPayload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    algorithm: 'HS256',
  } as jwt.SignOptions);

  const refreshToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = hashToken(refreshToken);
  return { accessToken, refreshToken, tokenHash };
}

async function storeRefreshToken(userId: string, role: string, tokenHash: string): Promise<void> {
  const redis = getRedis();
  await redis.set(
    `refresh:${tokenHash}`,
    JSON.stringify({ userId, role }),
    'EX',
    REFRESH_TTL,
  );
}

async function writeAuditLog(
  userId: string | null,
  event: string,
  req: Request,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO auth_audit_logs (user_id, event, ip_address, user_agent, metadata)
       VALUES ($1, $2, $3::inet, $4, $5)`,
      [
        userId,
        event,
        req.ip ?? null,
        req.headers['user-agent'] ?? null,
        metadata ? JSON.stringify(metadata) : null,
      ],
    );
  } catch (err) {
    // Audit log failures must not break the main flow
    console.error(`[${SERVICE_NAME}] Audit log write failed:`, err);
  }
}

// ─────────────────────────────────────────────
// Middleware — JWT Authentication
// ─────────────────────────────────────────────
function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json(buildProblem(401, 'Unauthorized', 'Missing or invalid Authorization header', req.path));
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    (req as AuthRequest).user = payload;
    next();
  } catch {
    res.status(401).json(buildProblem(401, 'Unauthorized', 'Token is invalid or expired', req.path));
  }
}

// ─────────────────────────────────────────────
// App
// ─────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// Request ID injection
app.use((req: Request, _res: Response, next: NextFunction) => {
  req.headers['x-request-id'] = req.headers['x-request-id'] ?? crypto.randomUUID();
  next();
});

// ─────────────────────────────────────────────
// GET / — Web Login UI (browser-friendly)
// ─────────────────────────────────────────────
app.get('/', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>HealthSync — Login</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,"Segoe UI",system-ui,sans-serif;background:#f0f4f8;display:flex;align-items:center;justify-content:center;min-height:100vh}
    .card{background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.1);padding:40px 36px;width:100%;max-width:400px}
    .logo{text-align:center;margin-bottom:28px}
    .logo svg{width:48px;height:48px;fill:#1e88e5}
    h1{font-size:24px;font-weight:700;color:#1e88e5;text-align:center}
    p.sub{font-size:13px;color:#666;text-align:center;margin-top:4px;margin-bottom:28px}
    label{display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px}
    input{width:100%;padding:10px 14px;border:1.5px solid #d1d5db;border-radius:8px;font-size:14px;outline:none;transition:border .2s}
    input:focus{border-color:#1e88e5}
    .field{margin-bottom:16px}
    .btn{width:100%;padding:12px;background:#1e88e5;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;margin-top:8px;transition:background .2s}
    .btn:hover{background:#1565c0}
    .btn:disabled{background:#93c5fd;cursor:not-allowed}
    .error{background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:14px;display:none}
    .success{background:#f0fdf4;border:1px solid #86efac;color:#16a34a;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:14px;display:none}
    .links{text-align:center;margin-top:20px;font-size:13px;color:#6b7280}
    .links a{color:#1e88e5;text-decoration:none;font-weight:600}
    .token-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;font-size:11px;font-family:monospace;word-break:break-all;margin-top:12px;display:none}
    hr{border:none;border-top:1px solid #e5e7eb;margin:20px 0}
    .tabs{display:flex;gap:4px;margin-bottom:20px;background:#f3f4f6;padding:4px;border-radius:8px}
    .tab{flex:1;padding:8px;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;background:transparent;color:#6b7280}
    .tab.active{background:#fff;color:#1e88e5;box-shadow:0 1px 4px rgba(0,0,0,.08)}
    .panel{display:none}.panel.active{display:block}
  </style>
</head>
<body>
<div class="card">
  <div class="logo">
    <svg viewBox="0 0 24 24"><path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z"/></svg>
  </div>
  <h1>HealthSync Indonesia</h1>
  <p class="sub">Platform Kesehatan Terintegrasi</p>

  <div class="tabs">
    <button class="tab active" onclick="switchTab('login')">Login</button>
    <button class="tab" onclick="switchTab('register')">Register</button>
  </div>

  <!-- LOGIN PANEL -->
  <div id="panel-login" class="panel active">
    <div id="login-error" class="error"></div>
    <div id="login-success" class="success"></div>
    <div class="field"><label>Email</label><input id="l-email" type="email" placeholder="user@healthsync.id"/></div>
    <div class="field"><label>Password</label><input id="l-pass" type="password" placeholder="Min. 8 karakter"/></div>
    <button class="btn" id="btn-login" onclick="doLogin()">Masuk</button>
    <div class="token-box" id="token-box"></div>
  </div>

  <!-- REGISTER PANEL -->
  <div id="panel-register" class="panel">
    <div id="reg-error" class="error"></div>
    <div id="reg-success" class="success"></div>
    <div class="field"><label>Nama Lengkap</label><input id="r-name" type="text" placeholder="Budi Santoso"/></div>
    <div class="field"><label>Email</label><input id="r-email" type="email" placeholder="user@healthsync.id"/></div>
    <div class="field"><label>Password</label><input id="r-pass" type="password" placeholder="Min. 8 karakter, huruf besar, angka, simbol"/></div>
    <div class="field">
      <label>Role</label>
      <select id="r-role" style="width:100%;padding:10px 14px;border:1.5px solid #d1d5db;border-radius:8px;font-size:14px">
        <option value="PATIENT">Pasien</option>
        <option value="DOCTOR">Dokter</option>
        <option value="PHARMACIST">Apoteker</option>
        <option value="AMBULANCE_DRIVER">Pengemudi Ambulans</option>
        <option value="COMMAND_CENTER">Command Center</option>
      </select>
    </div>
    <button class="btn" id="btn-register" onclick="doRegister()">Daftar</button>
  </div>

  <hr/>
  <div class="links">
    <a href="/health">Health Check</a> &nbsp;·&nbsp;
    <a href="http://localhost:4010/docs" target="_blank">Swagger API Docs</a>
  </div>
</div>

<script>
function switchTab(t){
  document.querySelectorAll('.tab').forEach((el,i)=>el.classList.toggle('active',['login','register'][i]===t));
  document.querySelectorAll('.panel').forEach(el=>el.classList.remove('active'));
  document.getElementById('panel-'+t).classList.add('active');
}
function show(id,msg,type){
  const el=document.getElementById(id);
  el.textContent=msg;el.style.display='block';
  if(type==='hide')el.style.display='none';
}
async function doLogin(){
  const btn=document.getElementById('btn-login');
  btn.disabled=true;btn.textContent='Memuat...';
  show('login-error','','hide');show('login-success','','hide');
  document.getElementById('token-box').style.display='none';
  try{
    const r=await fetch('/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:document.getElementById('l-email').value,password:document.getElementById('l-pass').value})});
    const j=await r.json();
    if(!r.ok)throw new Error(j.detail||j.title||'Login gagal');
    show('login-success','✅ Login berhasil! Token JWT:','');
    const tb=document.getElementById('token-box');
    tb.textContent='Bearer '+j.data.accessToken;
    tb.style.display='block';
    tb.title='Klik untuk menyalin';
    tb.style.cursor='pointer';
    tb.onclick=()=>{navigator.clipboard.writeText('Bearer '+j.data.accessToken);tb.style.background='#ecfdf5'};
  }catch(e){show('login-error',e.message,'');}
  finally{btn.disabled=false;btn.textContent='Masuk';}
}
async function doRegister(){
  const btn=document.getElementById('btn-register');
  btn.disabled=true;btn.textContent='Mendaftar...';
  show('reg-error','','hide');show('reg-success','','hide');
  try{
    const r=await fetch('/v1/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:document.getElementById('r-name').value,email:document.getElementById('r-email').value,
        password:document.getElementById('r-pass').value,role:document.getElementById('r-role').value})});
    const j=await r.json();
    if(!r.ok)throw new Error(j.detail||j.title||'Pendaftaran gagal');
    show('reg-success','✅ Pendaftaran berhasil! Silakan login.','');
    setTimeout(()=>switchTab('login'),1500);
  }catch(e){show('reg-error',e.message,'');}
  finally{btn.disabled=false;btn.textContent='Daftar';}
}
document.addEventListener('keydown',e=>{if(e.key==='Enter'){
  const tab=document.querySelector('.tab.active').textContent;
  if(tab==='Login')doLogin();else doRegister();
}});
</script>
</body>
</html>`);
});

// ─────────────────────────────────────────────
// GET /health
// ─────────────────────────────────────────────
app.get('/health', async (_req: Request, res: Response) => {
  let dbOk = false;
  let redisOk = false;
  try {
    await getPool().query('SELECT 1');
    dbOk = true;
  } catch { /* intentionally swallowed */ }
  try {
    await getRedis().ping();
    redisOk = true;
  } catch { /* intentionally swallowed */ }
  res.json({ status: 'ok', service: SERVICE_NAME, db: dbOk, redis: redisOk, timestamp: new Date().toISOString() });
});

// ─────────────────────────────────────────────
// POST /v1/auth/register
// ─────────────────────────────────────────────
app.post('/v1/auth/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path));
      return;
    }

    const { email, password, role, name, phone } = parsed.data;
    const pool = getPool();

    // Check email uniqueness
    const existing = await pool.query<{ id: string }>(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [email],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      res.status(409).json(buildProblem(409, 'Conflict', 'Email already registered', req.path));
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);
    const userId = crypto.randomUUID();

    // Insert user — name is stored in a separate profile, so pass it as metadata
    const inserted = await pool.query<{ id: string; email: string; role: string }>(
      `INSERT INTO users (id, email, phone, password_hash, role, status)
       VALUES ($1, $2, $3, $4, $5::user_role, 'ACTIVE')
       RETURNING id, email, role`,
      [userId, email, phone ?? null, passwordHash, role],
    );

    const user = inserted.rows[0];
    if (!user) throw new Error('Insert failed unexpectedly');

    const { accessToken, refreshToken, tokenHash } = issueTokens(user.id, user.role);
    await storeRefreshToken(user.id, user.role, tokenHash);
    await writeAuditLog(user.id, 'LOGIN_SUCCESS', req, { method: 'register' });

    res.status(201).json({
      data: { userId: user.id, email: user.email, name, role: user.role, accessToken, refreshToken },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
// POST /v1/auth/login
// ─────────────────────────────────────────────
app.post('/v1/auth/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path));
      return;
    }

    const { email, password } = parsed.data;
    const pool = getPool();
    const redis = getRedis();

    // Fetch user — same generic response for not-found and wrong-password (prevent enumeration)
    const result = await pool.query<{ id: string; email: string; password_hash: string; role: string; status: string }>(
      'SELECT id, email, password_hash, role, status FROM users WHERE LOWER(email) = LOWER($1)',
      [email],
    );

    const user = result.rows[0];

    if (!user || user.status !== 'ACTIVE') {
      res.status(401).json(buildProblem(401, 'Unauthorized', 'Invalid email or password', req.path));
      return;
    }

    // Rate limit check: max 5 failures per 15 minutes
    const failKey = `login_fail:${user.id}`;
    const failCount = await redis.get(failKey);
    if (failCount && parseInt(failCount, 10) >= 5) {
      res.status(429).json(buildProblem(429, 'Too Many Requests', 'Too many failed login attempts. Try again in 15 minutes.', req.path));
      return;
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      // Increment failure counter with 15-minute TTL
      await redis.multi()
        .incr(failKey)
        .expire(failKey, 15 * 60)
        .exec();
      await writeAuditLog(user.id, 'LOGIN_FAIL', req);
      res.status(401).json(buildProblem(401, 'Unauthorized', 'Invalid email or password', req.path));
      return;
    }

    // Reset failure counter on successful login
    await redis.del(failKey);

    const { accessToken, refreshToken, tokenHash } = issueTokens(user.id, user.role);
    await storeRefreshToken(user.id, user.role, tokenHash);

    // Update last_login_at
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    await writeAuditLog(user.id, 'LOGIN_SUCCESS', req);

    res.json({
      data: { userId: user.id, email: user.email, role: user.role, accessToken, refreshToken },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
// POST /v1/auth/refresh
// ─────────────────────────────────────────────
app.post('/v1/auth/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = RefreshSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json(buildProblem(422, 'Validation Error', 'refreshToken is required', req.path));
      return;
    }

    const { refreshToken } = parsed.data;
    const redis = getRedis();
    const oldHash = hashToken(refreshToken);
    const stored = await redis.get(`refresh:${oldHash}`);

    if (!stored) {
      res.status(401).json(buildProblem(401, 'Unauthorized', 'Refresh token is invalid or expired', req.path));
      return;
    }

    const { userId, role } = JSON.parse(stored) as { userId: string; role: string };

    // Token rotation — delete old, issue new
    await redis.del(`refresh:${oldHash}`);

    const { accessToken: newAccessToken, refreshToken: newRefreshToken, tokenHash: newHash } = issueTokens(userId, role);
    await storeRefreshToken(userId, role, newHash);

    await writeAuditLog(userId, 'TOKEN_REFRESH', req);

    res.json({
      data: { accessToken: newAccessToken, refreshToken: newRefreshToken },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
// POST /v1/auth/logout
// ─────────────────────────────────────────────
app.post('/v1/auth/logout', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as AuthRequest).user;
    const { refreshToken } = req.body as { refreshToken?: string };

    if (refreshToken) {
      const hash = hashToken(refreshToken);
      await getRedis().del(`refresh:${hash}`);
    }

    await writeAuditLog(user.sub, 'LOGOUT', req);

    res.json({ data: { message: 'Logged out successfully' }, meta: { timestamp: new Date().toISOString() } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
// GET /v1/auth/me
// ─────────────────────────────────────────────
app.get('/v1/auth/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sub } = (req as AuthRequest).user;
    const result = await getPool().query<{
      id: string; email: string; phone: string | null; role: string;
      status: string; last_login_at: string | null; created_at: string;
    }>(
      'SELECT id, email, phone, role, status, last_login_at, created_at FROM users WHERE id = $1',
      [sub],
    );

    const user = result.rows[0];
    if (!user) {
      res.status(404).json(buildProblem(404, 'Not Found', 'User not found', req.path));
      return;
    }

    res.json({
      data: {
        userId: user.id,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
        lastLoginAt: user.last_login_at,
        createdAt: user.created_at,
      },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
// POST /v1/auth/change-password
// ─────────────────────────────────────────────
app.post('/v1/auth/change-password', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = ChangePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path));
      return;
    }

    const { currentPassword, newPassword } = parsed.data;
    const { sub } = (req as AuthRequest).user;
    const pool = getPool();
    const redis = getRedis();

    const result = await pool.query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [sub],
    );

    const row = result.rows[0];
    if (!row) {
      res.status(404).json(buildProblem(404, 'Not Found', 'User not found', req.path));
      return;
    }

    const match = await bcrypt.compare(currentPassword, row.password_hash);
    if (!match) {
      res.status(400).json(buildProblem(400, 'Bad Request', 'Current password is incorrect', req.path));
      return;
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, sub]);

    // Revoke all existing refresh tokens for this user by scanning Redis keys
    // Keys follow pattern refresh:{hash}; we can't scan by userId without a reverse index.
    // Instead, delete the token supplied in this request if present.
    const { refreshToken } = req.body as { refreshToken?: string };
    if (refreshToken) {
      await redis.del(`refresh:${hashToken(refreshToken)}`);
    }

    await writeAuditLog(sub, 'PASSWORD_CHANGE', req);

    res.json({ data: { message: 'Password changed successfully' }, meta: { timestamp: new Date().toISOString() } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
// POST /v1/auth/otp/send
// ─────────────────────────────────────────────
app.post('/v1/auth/otp/send', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = SendOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path));
      return;
    }

    const { phone, purpose } = parsed.data;
    const pool = getPool();

    const userResult = await pool.query<{ id: string }>(
      'SELECT id FROM users WHERE phone = $1',
      [phone],
    );

    // Always return 200 to prevent phone enumeration
    if (!userResult.rows[0]) {
      res.json({ data: { message: 'If the number is registered, an OTP will be sent.' }, meta: { timestamp: new Date().toISOString() } });
      return;
    }

    const userId = userResult.rows[0].id;
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await pool.query(
      `INSERT INTO otp_codes (user_id, code_hash, purpose, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [userId, codeHash, purpose, expiresAt],
    );

    // In production: dispatch to SMS gateway. For now, log in dev only.
    if (process.env['NODE_ENV'] !== 'production') {
      console.log(`[${SERVICE_NAME}] DEV OTP for ${phone} [${purpose}]: ${code}`);
    }

    res.json({ data: { message: 'If the number is registered, an OTP will be sent.' }, meta: { timestamp: new Date().toISOString() } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
// POST /v1/auth/otp/verify
// ─────────────────────────────────────────────
app.post('/v1/auth/otp/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = VerifyOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path));
      return;
    }

    const { userId, code, purpose } = parsed.data;
    const pool = getPool();

    const result = await pool.query<{ id: string; code_hash: string; expires_at: string; used_at: string | null; attempts: number }>(
      `SELECT id, code_hash, expires_at, used_at, attempts
       FROM otp_codes
       WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [userId, purpose],
    );

    const otp = result.rows[0];
    const invalid = () => res.status(400).json(buildProblem(400, 'Bad Request', 'OTP is invalid or expired', req.path));

    if (!otp || new Date(otp.expires_at) < new Date() || otp.attempts >= 5) {
      invalid();
      return;
    }

    const match = await bcrypt.compare(code, otp.code_hash);
    if (!match) {
      await pool.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [otp.id]);
      invalid();
      return;
    }

    await pool.query('UPDATE otp_codes SET used_at = NOW() WHERE id = $1', [otp.id]);

    if (purpose === 'PHONE_VERIFY') {
      await pool.query('UPDATE users SET phone_verified = TRUE WHERE id = $1', [userId]);
    }

    await writeAuditLog(userId, 'OTP_VERIFIED', req, { purpose });

    res.json({ data: { verified: true }, meta: { timestamp: new Date().toISOString() } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin middleware — extends authenticate to require ADMIN role
// ─────────────────────────────────────────────────────────────────────────────

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  authenticate(req, res, () => {
    const role = (req as AuthRequest).user?.role;
    if (role !== 'ADMIN') {
      res.status(403).json(buildProblem(403, 'Forbidden', 'Admin role required', req.path));
      return;
    }
    next();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/auth/admin/users — paginated user list for Admin Panel
// ─────────────────────────────────────────────────────────────────────────────

app.get('/v1/auth/admin/users', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page  = Math.max(1, parseInt(String(req.query['page']  ?? '1'),  10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query['limit'] ?? '20'), 10)));
    const q     = (req.query['q']    as string | undefined)?.trim() ?? '';
    const role  = (req.query['role'] as string | undefined)?.trim() ?? '';
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (q) {
      params.push(`%${q}%`);
      // Search by email, phone, or patient name (doctors & others fallback to email)
      conditions.push(`(u.email ILIKE $${params.length} OR u.phone ILIKE $${params.length} OR p.name ILIKE $${params.length})`);
    }
    if (role) {
      params.push(role);
      conditions.push(`u.role = $${params.length}::user_role`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count query — must join patients so search on p.name works
    const countRes = await getPool().query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM users u LEFT JOIN patients p ON p.user_id = u.id ${where}`,
      params,
    );
    const total = parseInt(countRes.rows[0]?.count ?? '0', 10);

    // Data query — derive display name:
    //   patients  → patients.name
    //   others    → title-case the local-part of their email (e.g. "dr.budi.santoso" → "Dr Budi Santoso")
    const dataParams = [...params, limit, offset];
    const dataRes = await getPool().query<{
      id: string; email: string; phone: string | null; role: string;
      status: string; created_at: string; name: string | null;
    }>(
      `SELECT u.id, u.email, u.phone, u.role, u.status, u.created_at,
              COALESCE(
                p.name,
                INITCAP(REPLACE(SPLIT_PART(u.email, '@', 1), '.', ' '))
              ) AS name
       FROM users u
       LEFT JOIN patients p ON p.user_id = u.id
       ${where}
       ORDER BY u.created_at DESC
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams,
    );

    res.json({
      data: dataRes.rows.map((u) => ({
        id:        u.id,
        email:     u.email,
        phone:     u.phone,
        role:      u.role,
        status:    u.status,
        name:      u.name ?? u.email,
        createdAt: u.created_at,
      })),
      meta: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/auth/users/stats/by-role — user count grouped by role (for Analytics)
// ─────────────────────────────────────────────────────────────────────────────

app.get('/v1/auth/users/stats/by-role', requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await getPool().query<{ role: string; count: string }>(
      `SELECT role, COUNT(*) AS count FROM users GROUP BY role ORDER BY count DESC`,
    );
    res.json({
      data: result.rows.map((r) => ({ role: r.role, count: parseInt(r.count, 10) })),
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/admin/kpis — platform KPI summary for Analytics page
// ─────────────────────────────────────────────────────────────────────────────

app.get('/v1/admin/kpis', requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const now = new Date();
    const firstThisMonth  = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const firstLastMonth  = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const firstNextMonth  = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

    const [users, consultations] = await Promise.all([
      pool.query<{ this_month: string; last_month: string }>(`
        SELECT
          COUNT(*) FILTER (WHERE created_at >= $1 AND created_at < $3) AS this_month,
          COUNT(*) FILTER (WHERE created_at >= $2 AND created_at < $1) AS last_month
        FROM users`, [firstThisMonth, firstLastMonth, firstNextMonth]),
      pool.query<{ this_month: string; last_month: string }>(`
        SELECT
          COUNT(*) FILTER (WHERE created_at >= $1 AND created_at < $3) AS this_month,
          COUNT(*) FILTER (WHERE created_at >= $2 AND created_at < $1) AS last_month
        FROM consultations`, [firstThisMonth, firstLastMonth, firstNextMonth]),
    ]);

    const toKpi = (metric: string, row: { this_month: string; last_month: string }) => ({
      metric,
      current:  parseInt(row.this_month  ?? '0', 10),
      previous: parseInt(row.last_month ?? '0', 10),
    });

    res.json({
      data: [
        toKpi('New Users',      users.rows[0]!),
        toKpi('Consultations',  consultations.rows[0]!),
      ],
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
// Global error handler (RFC 7807)
// ─────────────────────────────────────────────
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(422).json(buildProblem(422, 'Validation Error', err.issues[0]?.message ?? 'Invalid input', req.path));
    return;
  }
  console.error(`[${SERVICE_NAME}] Unhandled error:`, err);
  res.status(500).json(buildProblem(500, 'Internal Server Error', 'An unexpected error occurred', req.path));
});

// ─────────────────────────────────────────────
// Graceful shutdown
// ─────────────────────────────────────────────
function shutdown(signal: string): void {
  console.log(`[${SERVICE_NAME}] ${signal} received — shutting down gracefully`);
  void (async () => {
    try {
      if (_pool) await _pool.end();
      if (_redis) _redis.disconnect();
    } finally {
      process.exit(0);
    }
  })();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ─────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[${SERVICE_NAME}] Listening on port ${PORT}`);
  });
}

export default app;
