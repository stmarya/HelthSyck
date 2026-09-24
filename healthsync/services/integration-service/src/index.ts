import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { z, ZodError } from 'zod';
import crypto from 'crypto';

const PORT = parseInt(process.env['PORT'] ?? '3010', 10);
const JWT_SECRET: string = process.env['JWT_SECRET'] ?? (() => {
  throw new Error('JWT_SECRET is required; refusing to start with a fallback secret');
})();
const SERVICE_NAME = 'integration-service';

// ─────────────────────────────────────────────
// External integration targets:
//   1. SATUSEHAT (Kemenkes) — FHIR R4-based national health data platform
//      - Patient registration sync (Patient resource)
//      - Encounter/consultation sync (Encounter resource)
//      - Observation sync for vitals (Observation resource)
//      - Medication request sync (MedicationRequest resource)
//   2. BPJS Kesehatan — national health insurance
//      - Eligibility check (peserta aktif?)
//      - Claim submission (SEP — Surat Eligibilitas Peserta)
//      - Rujukan validation
// ─────────────────────────────────────────────

interface JwtPayload { sub: string; role: string; }
interface ProblemDetail { type: string; title: string; status: number; detail: string; instance: string; requestId: string; }

const SatusehatSyncSchema = z.object({
  resourceType: z.enum(['Patient', 'Encounter', 'Observation', 'MedicationRequest', 'Condition']),
  resourceId: z.string().uuid(),
  action: z.enum(['CREATE', 'UPDATE']),
});

const BpjsEligibilitySchema = z.object({
  nik: z.string().length(16),
  bpjsNumber: z.string().min(13).optional(),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const BpjsSepSchema = z.object({
  patientId: z.string().uuid(),
  bpjsNumber: z.string().min(13),
  visitType: z.enum(['RAWAT_JALAN', 'RAWAT_INAP', 'IGD']),
  diagnosisCode: z.string().min(3),
  referralId: z.string().uuid().optional(),
  notes: z.string().max(500).optional(),
});

function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json(buildProblem(401, 'Unauthorized', 'Missing or invalid Authorization header', req.path));
    return;
  }
  try {
    const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as JwtPayload;
    (req as Request & { user: JwtPayload }).user = payload;
    next();
  } catch {
    res.status(401).json(buildProblem(401, 'Unauthorized', 'Token is invalid or expired', req.path));
  }
}

function buildProblem(status: number, title: string, detail: string, instance: string): ProblemDetail {
  return { type: `https://errors.healthsync.id/${title.toLowerCase().replace(/\s+/g, '-')}`, title, status, detail, instance, requestId: crypto.randomUUID() };
}

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: SERVICE_NAME, timestamp: new Date().toISOString() });
});

// ─────────────────────────────────────────────
// SATUSEHAT routes
// ─────────────────────────────────────────────

/** POST /v1/satusehat/sync — manually trigger FHIR resource sync */
app.post('/v1/satusehat/sync', authenticate, async (req: Request, res: Response) => {
  const parsed = SatusehatSyncSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path));
    return;
  }
  res.status(501).json(buildProblem(501, 'Not Implemented', 'SATUSEHAT integration is not enabled', req.path));
});

/** GET /v1/satusehat/status — check SATUSEHAT connection status */
app.get('/v1/satusehat/status', authenticate, async (_req: Request, res: Response) => {
  res.status(501).json(buildProblem(501, 'Not Implemented', 'SATUSEHAT integration is not enabled', '/v1/satusehat/status'));
});

// ─────────────────────────────────────────────
// BPJS routes
// ─────────────────────────────────────────────

/** POST /v1/bpjs/eligibility — check BPJS member eligibility */
app.post('/v1/bpjs/eligibility', authenticate, (req: Request, res: Response) => {
  const parsed = BpjsEligibilitySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path));
    return;
  }
  res.status(501).json(buildProblem(501, 'Not Implemented', 'BPJS integration is not enabled', req.path));
});

/** POST /v1/bpjs/sep — create SEP (Surat Eligibilitas Peserta) */
app.post('/v1/bpjs/sep', authenticate, (req: Request, res: Response) => {
  const parsed = BpjsSepSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path));
    return;
  }
  void parsed.data;
  res.status(501).json(buildProblem(501, 'Not Implemented', 'BPJS integration is not enabled', req.path));
});

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(422).json(buildProblem(422, 'Validation Error', err.issues[0]?.message ?? 'Invalid input', req.path));
    return;
  }
  console.error(`[${SERVICE_NAME}] Unhandled error:`, err);
  res.status(500).json(buildProblem(500, 'Internal Server Error', 'An unexpected error occurred', req.path));
});

if (require.main === module) {
  const server = app.listen(PORT, () => console.log(`[${SERVICE_NAME}] Listening on port ${PORT}`));

  const shutdown = (signal: string) => {
    console.log(`[${SERVICE_NAME}] ${signal} received — shutting down gracefully`);
    server.close(() => {
      console.log(`[${SERVICE_NAME}] Shutdown complete`);
      process.exit(0);
    });
    setTimeout(() => { console.error(`[${SERVICE_NAME}] Forced shutdown`); process.exit(1); }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

export default app;
