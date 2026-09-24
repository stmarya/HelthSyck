import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { z, ZodError } from 'zod';
import crypto from 'crypto';
import { Pool } from 'pg';
import Redis from 'ioredis';
import * as admin from 'firebase-admin';

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────

const PORT = parseInt(process.env['PORT'] ?? '3009', 10);
const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production';
const SERVICE_NAME = 'notification-service';
const FCM_PROJECT_ID = process.env['FCM_PROJECT_ID'];
const SMS_API_KEY = process.env['SMS_API_KEY'];
const DATABASE_URL = process.env['DATABASE_URL'] ?? '';
const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

// ─────────────────────────────────────────────
// Infrastructure
// ─────────────────────────────────────────────

const db = new Pool({ connectionString: DATABASE_URL });

const redis = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 3 });
redis.on('error', (err) => console.error(`[${SERVICE_NAME}] Redis error:`, err));

// Firebase Admin — only init if credentials are provided
let fcmApp: admin.app.App | null = null;
if (FCM_PROJECT_ID) {
  try {
    fcmApp = admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: FCM_PROJECT_ID,
    });
    console.log(`[${SERVICE_NAME}] Firebase Admin initialized for project ${FCM_PROJECT_ID}`);
  } catch (err) {
    console.warn(`[${SERVICE_NAME}] Firebase Admin init failed (running in stub mode):`, err);
  }
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface JwtPayload { sub: string; role: string; }
interface ProblemDetail { type: string; title: string; status: number; detail: string; instance: string; requestId: string; }

type AuthRequest = Request & { user: JwtPayload };

// ─────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────

const SendNotificationSchema = z.object({
  userId: z.string().uuid(),
  channel: z.enum(['PUSH', 'SMS', 'IN_APP', 'EMAIL']),
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1),
  data: z.record(z.unknown()).optional(),
  priority: z.enum(['CRITICAL', 'HIGH', 'NORMAL', 'LOW']).default('NORMAL'),
  referenceId: z.string().uuid().optional(),
  referenceType: z.string().optional(),
});

const SendBulkSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(1000),
  channel: z.enum(['PUSH', 'SMS', 'IN_APP', 'EMAIL']),
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1),
  data: z.record(z.unknown()).optional(),
  priority: z.enum(['CRITICAL', 'HIGH', 'NORMAL', 'LOW']).default('NORMAL'),
});

const MarkReadSchema = z.object({
  notificationIds: z.array(z.string().uuid()).min(1).max(100),
});

const RegisterPushTokenSchema = z.object({
  token: z.string().min(10),
  platform: z.enum(['ANDROID', 'IOS', 'WEB']),
});

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json(buildProblem(401, 'Unauthorized', 'Missing or invalid Authorization header', req.path));
    return;
  }
  try {
    const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as JwtPayload;
    (req as AuthRequest).user = payload;
    next();
  } catch {
    res.status(401).json(buildProblem(401, 'Unauthorized', 'Token is invalid or expired', req.path));
  }
}

function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as AuthRequest).user;
    if (!roles.includes(user.role)) {
      res.status(403).json(buildProblem(403, 'Forbidden', 'Insufficient permissions', req.path));
      return;
    }
    next();
  };
}

function buildProblem(status: number, title: string, detail: string, instance: string): ProblemDetail {
  return {
    type: `https://errors.healthsync.id/${title.toLowerCase().replace(/\s+/g, '-')}`,
    title, status, detail, instance,
    requestId: crypto.randomUUID(),
  };
}

function ok<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ data, meta: { timestamp: new Date().toISOString() } });
}

// ─────────────────────────────────────────────
// Channel senders
// ─────────────────────────────────────────────

interface PushToken { token: string; platform: string; }

async function getPushTokens(userId: string): Promise<PushToken[]> {
  const result = await db.query<PushToken>(
    'SELECT token, platform FROM push_tokens WHERE user_id=$1 AND is_active=TRUE',
    [userId]
  );
  return result.rows;
}

async function sendPushNotification(
  userId: string,
  title: string | undefined,
  body: string,
  data?: Record<string, unknown>,
  highPriority = false,
): Promise<'SENT' | 'FAILED'> {
  const tokens = await getPushTokens(userId);
  if (tokens.length === 0) {
    console.warn(`[${SERVICE_NAME}] No push tokens for user ${userId}`);
    return 'FAILED';
  }

  if (!fcmApp) {
    // Stub mode
    console.log(`[${SERVICE_NAME}] [push-stub] userId=${userId} title="${title}" body="${body}" tokens=${tokens.length}`);
    await db.query(
      'UPDATE push_tokens SET last_used_at=NOW() WHERE user_id=$1 AND is_active=TRUE',
      [userId]
    );
    return 'SENT';
  }

  const messaging = admin.messaging(fcmApp);
  const stringData: Record<string, string> = {};
  if (data) {
    for (const [k, v] of Object.entries(data)) {
      stringData[k] = String(v);
    }
  }

  try {
    const sendResults = await messaging.sendEachForMulticast({
      tokens: tokens.map((t) => t.token),
      notification: { title, body },
      data: stringData,
      android: highPriority ? { priority: 'high' } : undefined,
      apns: highPriority ? { headers: { 'apns-priority': '10' } } : undefined,
    });

    await db.query(
      'UPDATE push_tokens SET last_used_at=NOW() WHERE user_id=$1 AND is_active=TRUE',
      [userId]
    );

    const success = sendResults.responses.some((r) => r.success);
    return success ? 'SENT' : 'FAILED';
  } catch (err) {
    console.error(`[${SERVICE_NAME}] FCM send error:`, err);
    return 'FAILED';
  }
}

async function sendSmsNotification(userId: string, body: string): Promise<'SENT' | 'FAILED'> {
  const result = await db.query<{ phone: string }>(
    'SELECT phone FROM users WHERE id=$1',
    [userId]
  );
  const phone = result.rows[0]?.phone;
  if (!phone) {
    console.warn(`[${SERVICE_NAME}] No phone for user ${userId}`);
    return 'FAILED';
  }

  if (!SMS_API_KEY) {
    // Stub mode
    console.log(`[${SERVICE_NAME}] [sms-stub] to=${phone} body="${body}"`);
    return 'SENT';
  }

  // Production SMS provider call (Vonage-style stub — swap for real provider)
  try {
    console.log(`[${SERVICE_NAME}] [sms] Sending to ${phone}: "${body}"`);
    // Real implementation: POST to SMS provider API with SMS_API_KEY
    return 'SENT';
  } catch (err) {
    console.error(`[${SERVICE_NAME}] SMS send error:`, err);
    return 'FAILED';
  }
}

async function sendInAppNotification(): Promise<'SENT'> {
  // IN_APP: persist only. WebSocket push is handled by a separate ws server in prod.
  return 'SENT';
}

// ─────────────────────────────────────────────
// Notification INSERT helper
// ─────────────────────────────────────────────

interface NotifInsertParams {
  id: string;
  userId: string;
  channel: string;
  title?: string;
  body: string;
  data?: Record<string, unknown>;
  priority: string;
  referenceId?: string;
  referenceType?: string;
  status: string;
}

async function insertNotification(p: NotifInsertParams): Promise<void> {
  await db.query(
    `INSERT INTO notifications
       (id, user_id, channel, title, body, data, priority, reference_id, reference_type, status, sent_at, created_at)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10, CASE WHEN $10 IN ('SENT','READ') THEN NOW() ELSE NULL END, NOW())`,
    [
      p.id, p.userId, p.channel, p.title ?? null, p.body,
      p.data ? JSON.stringify(p.data) : null,
      p.priority, p.referenceId ?? null, p.referenceType ?? null, p.status,
    ]
  );
}

// ─────────────────────────────────────────────
// Channel dispatcher
// ─────────────────────────────────────────────

async function dispatchNotification(
  userId: string,
  channel: string,
  title: string | undefined,
  body: string,
  data: Record<string, unknown> | undefined,
  priority: string,
  referenceId: string | undefined,
  referenceType: string | undefined,
  highPriority = false,
): Promise<{ notificationId: string; status: string }> {
  const notificationId = crypto.randomUUID();
  let status: string;

  if (channel === 'PUSH') {
    status = await sendPushNotification(userId, title, body, data, highPriority);
  } else if (channel === 'SMS') {
    status = await sendSmsNotification(userId, body);
  } else if (channel === 'IN_APP') {
    status = await sendInAppNotification();
  } else {
    // EMAIL — stub
    console.log(`[${SERVICE_NAME}] [email-stub] userId=${userId} title="${title}"`);
    status = 'SENT';
  }

  await insertNotification({ id: notificationId, userId, channel, title, body, data, priority, referenceId, referenceType, status });
  return { notificationId, status };
}

// ─────────────────────────────────────────────
// Express app
// ─────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: SERVICE_NAME, timestamp: new Date().toISOString() });
});

// ─────────────────────────────────────────────
// POST /v1/notifications/send
// ─────────────────────────────────────────────

app.post('/v1/notifications/send', authenticate, async (req: Request, res: Response) => {
  const parsed = SendNotificationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path));
    return;
  }
  const { userId, channel, title, body, data, priority, referenceId, referenceType } = parsed.data;
  try {
    const result = await dispatchNotification(userId, channel, title, body, data, priority, referenceId, referenceType);
    ok(res, { ...result, channel, sentAt: new Date().toISOString() }, 202);
  } catch (err) {
    console.error(`[${SERVICE_NAME}] send error:`, err);
    res.status(500).json(buildProblem(500, 'Internal Server Error', 'Failed to send notification', req.path));
  }
});

// ─────────────────────────────────────────────
// POST /v1/notifications/bulk  (ADMIN only)
// ─────────────────────────────────────────────

app.post('/v1/notifications/bulk', authenticate, requireRole('ADMIN', 'SYSTEM'), async (req: Request, res: Response) => {
  const parsed = SendBulkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path));
    return;
  }
  const { userIds, channel, title, body, data, priority } = parsed.data;
  try {
    const pipeline = redis.pipeline();
    for (const userId of userIds) {
      const item = JSON.stringify({ userId, channel, title, body, data, priority, queuedAt: new Date().toISOString() });
      pipeline.lpush('notif:queue', item);
    }
    await pipeline.exec();
    ok(res, { queued: userIds.length, channel }, 202);
  } catch (err) {
    console.error(`[${SERVICE_NAME}] bulk error:`, err);
    res.status(500).json(buildProblem(500, 'Internal Server Error', 'Failed to queue bulk notifications', req.path));
  }
});

// ─────────────────────────────────────────────
// GET /v1/notifications
// ─────────────────────────────────────────────

app.get('/v1/notifications', authenticate, async (req: Request, res: Response) => {
  const user = (req as AuthRequest).user;
  const { unread, limit: limitStr = '20', page: pageStr = '1' } = req.query as Record<string, string>;
  const limit = Math.min(parseInt(limitStr, 10) || 20, 100);
  const page = Math.max(parseInt(pageStr, 10) || 1, 1);
  const offset = (page - 1) * limit;
  const unreadOnly = unread === 'true';

  try {
    let query = `
      SELECT id, channel, status, title, body, data, priority, reference_id, reference_type,
             sent_at, read_at, created_at
      FROM notifications
      WHERE user_id=$1 AND status != 'FAILED'`;
    const params: unknown[] = [user.sub];

    if (unreadOnly) {
      query += ` AND read_at IS NULL`;
    }
    query += ` ORDER BY created_at DESC LIMIT $2 OFFSET $3`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    const countQuery = `
      SELECT COUNT(*) FROM notifications
      WHERE user_id=$1 AND status != 'FAILED'${unreadOnly ? ' AND read_at IS NULL' : ''}`;
    const countResult = await db.query(countQuery, [user.sub]);
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    ok(res, {
      notifications: result.rows,
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error(`[${SERVICE_NAME}] get notifications error:`, err);
    res.status(500).json(buildProblem(500, 'Internal Server Error', 'Failed to fetch notifications', req.path));
  }
});

// ─────────────────────────────────────────────
// PUT /v1/notifications/read
// ─────────────────────────────────────────────

app.put('/v1/notifications/read', authenticate, async (req: Request, res: Response) => {
  const user = (req as AuthRequest).user;
  const parsed = MarkReadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path));
    return;
  }
  const { notificationIds } = parsed.data;
  try {
    const result = await db.query<{ id: string }>(
      `UPDATE notifications SET read_at=NOW(), status='READ'
       WHERE id = ANY($1::uuid[]) AND user_id=$2 AND read_at IS NULL
       RETURNING id`,
      [notificationIds, user.sub]
    );
    ok(res, { updated: result.rows.map((r) => r.id) });
  } catch (err) {
    console.error(`[${SERVICE_NAME}] mark read error:`, err);
    res.status(500).json(buildProblem(500, 'Internal Server Error', 'Failed to mark as read', req.path));
  }
});

// ─────────────────────────────────────────────
// GET /v1/notifications/unread-count
// ─────────────────────────────────────────────

app.get('/v1/notifications/unread-count', authenticate, async (req: Request, res: Response) => {
  const user = (req as AuthRequest).user;
  try {
    const result = await db.query<{ count: string }>(
      `SELECT COUNT(*) FROM notifications WHERE user_id=$1 AND read_at IS NULL AND status != 'FAILED'`,
      [user.sub]
    );
    ok(res, { count: parseInt(result.rows[0]?.count ?? '0', 10) });
  } catch (err) {
    console.error(`[${SERVICE_NAME}] unread count error:`, err);
    res.status(500).json(buildProblem(500, 'Internal Server Error', 'Failed to fetch unread count', req.path));
  }
});

// ─────────────────────────────────────────────
// POST /v1/devices/push-token
// ─────────────────────────────────────────────

app.post('/v1/devices/push-token', authenticate, async (req: Request, res: Response) => {
  const user = (req as AuthRequest).user;
  const parsed = RegisterPushTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path));
    return;
  }
  const { token, platform } = parsed.data;
  try {
    await db.query(
      `INSERT INTO push_tokens (id, user_id, token, platform, is_active, created_at, last_used_at)
       VALUES ($1, $2, $3, $4, TRUE, NOW(), NOW())
       ON CONFLICT (token) DO UPDATE SET user_id=$2, is_active=TRUE, last_used_at=NOW()`,
      [crypto.randomUUID(), user.sub, token, platform]
    );
    ok(res, { token, platform, registeredAt: new Date().toISOString() }, 201);
  } catch (err) {
    console.error(`[${SERVICE_NAME}] register token error:`, err);
    res.status(500).json(buildProblem(500, 'Internal Server Error', 'Failed to register push token', req.path));
  }
});

// ─────────────────────────────────────────────
// DELETE /v1/devices/push-token/:token
// ─────────────────────────────────────────────

app.delete('/v1/devices/push-token/:token', authenticate, async (req: Request, res: Response) => {
  const user = (req as AuthRequest).user;
  const { token } = req.params;
  try {
    await db.query(
      'UPDATE push_tokens SET is_active=FALSE WHERE token=$1 AND user_id=$2',
      [token, user.sub]
    );
    ok(res, { token, deregistered: true });
  } catch (err) {
    console.error(`[${SERVICE_NAME}] deregister token error:`, err);
    res.status(500).json(buildProblem(500, 'Internal Server Error', 'Failed to deregister push token', req.path));
  }
});

// ─────────────────────────────────────────────
// POST /v1/notifications/critical  (internal — alert-service)
// ─────────────────────────────────────────────

app.post('/v1/notifications/critical', authenticate, async (req: Request, res: Response) => {
  const parsed = SendNotificationSchema.safeParse({ ...req.body, priority: 'CRITICAL' });
  if (!parsed.success) {
    res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path));
    return;
  }
  const { userId, title, body, data, referenceId, referenceType } = parsed.data;

  try {
    const results: Array<{ channel: string; notificationId: string; status: string }> = [];

    // PUSH with high priority flag
    const pushResult = await dispatchNotification(userId, 'PUSH', title, body, data, 'CRITICAL', referenceId, referenceType, true);
    results.push({ channel: 'PUSH', ...pushResult });

    // SMS always — regardless of preferences
    const smsResult = await dispatchNotification(userId, 'SMS', title, body, data, 'CRITICAL', referenceId, referenceType);
    results.push({ channel: 'SMS', ...smsResult });

    // IN_APP
    const inAppResult = await dispatchNotification(userId, 'IN_APP', title, body, data, 'CRITICAL', referenceId, referenceType);
    results.push({ channel: 'IN_APP', ...inAppResult });

    // Audit log
    await db.query(
      `INSERT INTO medical_audit_logs (id, action, entity_type, entity_id, actor_id, details, created_at)
       VALUES ($1, 'CRITICAL_NOTIFICATION_SENT', 'notification', $2, $3, $4::jsonb, NOW())`,
      [
        crypto.randomUUID(),
        referenceId ?? null,
        (req as AuthRequest).user.sub,
        JSON.stringify({ userId, title, body, referenceType, channels: results.map((r) => r.channel) }),
      ]
    );

    ok(res, { userId, channels: results, sentAt: new Date().toISOString() }, 202);
  } catch (err) {
    console.error(`[${SERVICE_NAME}] critical notification error:`, err);
    res.status(500).json(buildProblem(500, 'Internal Server Error', 'Failed to send critical notification', req.path));
  }
});

// ─────────────────────────────────────────────
// Error handler
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
// Boot
// ─────────────────────────────────────────────

if (require.main === module) {
  redis.connect().catch((err) => console.error(`[${SERVICE_NAME}] Redis connect error:`, err));
  const server = app.listen(PORT, () => console.log(`[${SERVICE_NAME}] Listening on port ${PORT}`));

  const shutdown = (signal: string) => {
    console.log(`[${SERVICE_NAME}] ${signal} received — shutting down gracefully`);
    server.close(async () => {
      await redis.quit().catch(() => {});
      await db.end().catch(() => {});
      console.log(`[${SERVICE_NAME}] Shutdown complete`);
      process.exit(0);
    });
    setTimeout(() => { console.error(`[${SERVICE_NAME}] Forced shutdown`); process.exit(1); }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

export default app;
