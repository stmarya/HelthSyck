import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type UserRole =
  | 'PATIENT'
  | 'DOCTOR'
  | 'COMMAND_CENTER'
  | 'PHARMACIST'
  | 'AMBULANCE_DRIVER'
  | 'ADMIN';

export interface JwtPayload {
  sub: string;   // user UUID
  role: UserRole;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
  requestId: string;
}

export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  requestId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// RFC 7807 Problem Detail builder
// ─────────────────────────────────────────────────────────────────────────────

export function buildProblem(
  status: number,
  title: string,
  detail: string,
  instance: string,
  requestId?: string,
): ProblemDetail {
  return {
    type: `https://errors.healthsync.id/${title.toLowerCase().replace(/\s+/g, '-')}`,
    title,
    status,
    detail,
    instance,
    requestId: requestId ?? crypto.randomUUID(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Standard response helpers
// ─────────────────────────────────────────────────────────────────────────────

export function ok<T>(res: Response, data: T, status = 200, meta?: Record<string, unknown>): void {
  res.status(status).json({
    data,
    meta: { timestamp: new Date().toISOString(), ...meta },
  });
}

export function paginated<T>(
  res: Response,
  items: T[],
  page: number,
  limit: number,
  total: number,
): void {
  res.json({
    data: items,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      timestamp: new Date().toISOString(),
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Request ID middleware
// ─────────────────────────────────────────────────────────────────────────────

export function requestIdMiddleware(req: Request, _res: Response, next: NextFunction): void {
  (req as AuthenticatedRequest).requestId =
    (req.headers['x-request-id'] as string) ?? crypto.randomUUID();
  req.headers['x-request-id'] = (req as AuthenticatedRequest).requestId;
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// JWT Authentication middleware
// ─────────────────────────────────────────────────────────────────────────────

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const JWT_SECRET = process.env['JWT_SECRET'];
  if (!JWT_SECRET) {
    res.status(500).json(buildProblem(500, 'Configuration Error', 'JWT_SECRET is not configured', req.path));
    return;
  }
  const authHeader = req.headers['authorization'];

  if (!authHeader?.startsWith('Bearer ')) {
    const reqId = (req as AuthenticatedRequest).requestId;
    res.status(401).json(buildProblem(401, 'Unauthorized', 'Missing or invalid Authorization header', req.path, reqId));
    return;
  }

  try {
    const token = authHeader.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    (req as AuthenticatedRequest).user = payload;
    next();
  } catch {
    const reqId = (req as AuthenticatedRequest).requestId;
    res.status(401).json(buildProblem(401, 'Unauthorized', 'Token is invalid or expired', req.path, reqId));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Role authorization middleware factory
// ─────────────────────────────────────────────────────────────────────────────

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as AuthenticatedRequest).user;
    if (!user) {
      res.status(401).json(buildProblem(401, 'Unauthorized', 'Authentication required', req.path));
      return;
    }
    if (!roles.includes(user.role)) {
      res.status(403).json(
        buildProblem(403, 'Forbidden', `Role '${user.role}' is not authorized for this resource`, req.path),
      );
      return;
    }
    next();
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Global error handler (RFC 7807)
// ─────────────────────────────────────────────────────────────────────────────

export function errorHandler(serviceName: string) {
  return (err: Error, req: Request, res: Response, _next: NextFunction): void => {
    const reqId = (req as AuthenticatedRequest).requestId;
    console.error(`[${serviceName}] Unhandled error [${reqId}]:`, err.message, err.stack);
    res.status(500).json(
      buildProblem(500, 'Internal Server Error', 'An unexpected error occurred', req.path, reqId),
    );
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Medical audit log helper — must be called for every sensitive data access
// ─────────────────────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  accessorId: string;
  accessorRole: UserRole;
  patientId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

/** 
 * Write to medical_audit_logs table.
 * Inject a pg PoolClient to avoid circular import with db.ts.
 */
export async function writeMedicalAuditLog(
  queryFn: (sql: string, params: unknown[]) => Promise<void>,
  entry: AuditLogEntry,
): Promise<void> {
  await queryFn(
    `INSERT INTO medical_audit_logs
      (accessor_id, accessor_role, patient_id, action, resource_type, resource_id, ip_address, user_agent, request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      entry.accessorId,
      entry.accessorRole,
      entry.patientId ?? null,
      entry.action,
      entry.resourceType,
      entry.resourceId ?? null,
      entry.ipAddress ?? null,
      entry.userAgent ?? null,
      entry.requestId ?? null,
    ],
  );
}
