import { createServer } from 'node:http';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import Redis from 'ioredis';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.PORT ?? 3011);
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const NODE_ENV = process.env.NODE_ENV ?? 'development';
if (NODE_ENV === 'production' && !process.env.JWT_SECRET) throw new Error('JWT_SECRET wajib di production');
const MAX_MESSAGE_LENGTH = 4000;

type Role = 'COMMAND_CENTER' | 'ADMIN' | 'AMBULANCE_DRIVER' | 'DRIVER' | 'PHARMACIST' | 'DOCTOR' | 'HOSPITAL_OPERATOR';
type Claims = { sub: string; role: Role };
type Client = { socket: WebSocket; userId: string; role: Role; entityId?: string; rooms: Set<string>; windowStartedAt: number; eventCount: number };
type Incoming = { type: string; requestId?: string; payload?: Record<string, unknown> };

type Event = {
  type: string;
  requestId?: string;
  payload: Record<string, unknown>;
};

const server = createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'realtime-service', clients: clients.size, timestamp: new Date().toISOString() }));
    return;
  }
  if (req.url === '/ready') {
    try {
      await ensureRedis();
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ready', service: 'realtime-service', redis: true }));
    } catch {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'not_ready', service: 'realtime-service', redis: false }));
    }
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
const clients = new Set<Client>();
const redis = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 2 });
redis.on('error', (error) => console.error('[realtime] redis:', error.message));
let redisConnectPromise: Promise<void> | null = null;

async function ensureRedis(): Promise<void> {
  if (redis.status === 'ready') return;
  if (redis.status !== 'wait') throw new Error(`Redis belum siap: ${redis.status}`);
  redisConnectPromise ??= redis.connect().then(() => undefined).finally(() => { redisConnectPromise = null; });
  await redisConnectPromise;
  if (redis.status !== 'ready') throw new Error(`Redis gagal siap: ${redis.status}`);
}

async function auditEvent(action: string, client: Client, details: Record<string, unknown>): Promise<void> {
  try {
    await ensureRedis();
    await redis.xadd('realtime:audit', 'MAXLEN', '~', '10000', '*', 'action', action, 'userId', client.userId, 'role', client.role, 'details', JSON.stringify(details), 'at', new Date().toISOString());
  } catch (error) {
    console.error('[realtime] audit:', (error as Error).message);
  }
}

function send(client: Client, event: Event): void {
  if (client.socket.readyState === WebSocket.OPEN) client.socket.send(JSON.stringify(event));
}

function sendError(client: Client, requestId: string | undefined, code: string, message: string): void {
  send(client, { type: 'error', requestId, payload: { code, message } });
}

function matchesTarget(client: Client, targetId: string): boolean {
  return client.userId === targetId || client.entityId === targetId;
}

function isOperator(client: Client): boolean {
  return client.role === 'COMMAND_CENTER' || client.role === 'ADMIN';
}

function broadcastToTarget(targetId: string, event: Event): boolean {
  let delivered = false;
  for (const client of clients) {
    if (matchesTarget(client, targetId)) {
      delivered = true;
      send(client, event);
    }
  }
  return delivered;
}

function canCommunicate(sender: Client, targetId: string): boolean {
  if (isOperator(sender)) return true;
  return [...clients].some((target) => matchesTarget(target, targetId) && isOperator(target));
}

function allowEvent(client: Client): boolean {
  const now = Date.now();
  if (now - client.windowStartedAt >= 60_000) {
    client.windowStartedAt = now;
    client.eventCount = 0;
  }
  client.eventCount += 1;
  return client.eventCount <= 120;
}

function broadcastPresence(client: Client, online: boolean): void {
  const event: Event = { type: 'presence.updated', payload: { userId: client.userId, entityId: client.entityId ?? client.userId, role: client.role, online, at: new Date().toISOString() } };
  for (const target of clients) if (isOperator(target) || target.userId === client.userId || target.entityId === client.entityId) send(target, event);
}

async function saveChat(message: Record<string, unknown>): Promise<void> {
  try {
    await ensureRedis();
    const conversationId = String(message.conversationId);
    const key = `realtime:chat:${conversationId}`;
    await redis.lpush(key, JSON.stringify(message));
    await redis.ltrim(key, 0, 199);
    await redis.expire(key, 60 * 60 * 24 * 30);
  } catch (error) {
    console.error('[realtime] chat persistence:', (error as Error).message);
  }
}

async function loadChat(conversationId: string): Promise<Record<string, unknown>[]> {
  try {
    await ensureRedis();
    const rows = await redis.lrange(`realtime:chat:${conversationId}`, 0, 99);
    return rows.map((row) => JSON.parse(row) as Record<string, unknown>).reverse();
  } catch {
    return [];
  }
}

function handle(client: Client, message: Incoming): void {
  const payload = message.payload ?? {};
  const requestId = message.requestId;

  if (message.type === 'chat.history') {
    const conversationId = String(payload.conversationId ?? '');
    const belongsToClient = conversationId.includes(client.userId) || Boolean(client.entityId && conversationId.includes(client.entityId));
    if (!conversationId || (!isOperator(client) && !belongsToClient)) return sendError(client, requestId, 'FORBIDDEN', 'Conversation tidak diizinkan');
    void loadChat(conversationId).then((messages) => send(client, { type: 'chat.history', requestId, payload: { conversationId, messages } }));
    return;
  }

  if (message.type === 'chat.send') {
    const recipientId = String(payload.recipientId ?? '');
    const body = String(payload.body ?? '').trim();
    const conversationId = String(payload.conversationId ?? [client.userId, recipientId].sort().join(':'));
    const validConversation = isOperator(client) || conversationId.includes(client.userId) || conversationId.includes(recipientId);
    if (!recipientId || !body || body.length > MAX_MESSAGE_LENGTH) return sendError(client, requestId, 'INVALID_MESSAGE', 'recipientId dan body valid wajib diisi');
    if (!validConversation || !canCommunicate(client, recipientId)) return sendError(client, requestId, 'FORBIDDEN', 'Target komunikasi tidak diizinkan');
    const chat = { id: crypto.randomUUID(), conversationId, senderId: client.userId, senderRole: client.role, recipientId, body, sentAt: new Date().toISOString() };
    void saveChat(chat);
    void auditEvent('chat.send', client, { recipientId, conversationId });
    const event = { type: 'chat.message', requestId, payload: chat };
    send(client, event);
    broadcastToTarget(recipientId, event);
    return;
  }

  if (message.type === 'location.update') {
    const allowed = isOperator(client) || client.role === 'AMBULANCE_DRIVER' || client.role === 'DRIVER';
    if (!allowed) return sendError(client, requestId, 'FORBIDDEN', 'Role tidak boleh mengirim lokasi');
    const requestedEntityId = String(payload.entityId ?? '');
    const entityId = isOperator(client) ? (requestedEntityId || client.entityId || client.userId) : (client.entityId || client.userId);
    if (!isOperator(client) && requestedEntityId && requestedEntityId !== entityId) return sendError(client, requestId, 'FORBIDDEN', 'Tidak boleh mengirim lokasi entity lain');
    const latitude = Number(payload.latitude);
    const longitude = Number(payload.longitude);
    const accuracyM = Number(payload.accuracyM ?? 0);
    const heading = Number(payload.heading ?? 0);
    const speedKmh = Number(payload.speedKmh ?? 0);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || !Number.isFinite(accuracyM) || accuracyM < 0 || !Number.isFinite(heading) || !Number.isFinite(speedKmh) || speedKmh < 0) return sendError(client, requestId, 'INVALID_LOCATION', 'Koordinat atau metadata lokasi tidak valid');
    const expectedType = client.role === 'AMBULANCE_DRIVER' ? 'AMBULANCE' : 'DRIVER';
    const entityType = isOperator(client) ? String(payload.entityType ?? expectedType) : expectedType;
    const event: Event = { type: 'location.updated', requestId, payload: { entityId, entityType, latitude, longitude, accuracyM, heading, speedKmh, recordedAt: new Date().toISOString(), staleAfterSeconds: 15, source: 'device' } };
    for (const target of clients) if (isOperator(target) || target.entityId === entityId) send(target, event);
    void auditEvent('location.update', client, { entityId, latitude, longitude, accuracyM: event.payload.accuracyM });
    void ensureRedis().then(() => redis.hset(`realtime:location:${entityId}`, event.payload as unknown as Record<string, string | number>).then(() => redis.expire(`realtime:location:${entityId}`, 90))).catch(() => undefined);
    return;
  }

  if (message.type.startsWith('call.')) {
    const targetId = String(payload.targetId ?? '');
    if (!targetId) return sendError(client, requestId, 'INVALID_TARGET', 'targetId wajib diisi');
    if (!canCommunicate(client, targetId)) return sendError(client, requestId, 'FORBIDDEN', 'Target call tidak diizinkan');
    const allowedCallTypes = new Set(['call.invite', 'call.answer', 'call.ice', 'call.hangup']);
    if (!allowedCallTypes.has(message.type)) return sendError(client, requestId, 'UNKNOWN_EVENT', `Event ${message.type} tidak didukung`);
    const forwarded: Event = { type: message.type, requestId, payload: { ...payload, senderId: client.userId, senderRole: client.role } };
    void auditEvent(message.type, client, { targetId });
    if (!broadcastToTarget(targetId, forwarded) && message.type !== 'call.hangup') return sendError(client, requestId, 'TARGET_OFFLINE', 'Target call sedang offline');
    return;
  }

  if (message.type === 'presence.join') {
    const room = String(payload.room ?? '');
    if (room) client.rooms.add(room);
    send(client, { type: 'presence.joined', requestId, payload: { room } });
    return;
  }

  sendError(client, requestId, 'UNKNOWN_EVENT', `Event ${message.type} tidak didukung`);
}

wss.on('connection', (socket) => {
  let client: Client | null = null;
  const authTimeout = setTimeout(() => { if (!client) socket.close(4001, 'Authentication timeout'); }, 5000);
  socket.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString()) as Incoming;
      if (!client) {
        if (message.type !== 'auth') return socket.close(4001, 'Authenticate first');
        const token = String(message.payload?.token ?? '');
        const claims = jwt.verify(token, JWT_SECRET) as Claims & { entityId?: string };
        const validRoles: Role[] = ['COMMAND_CENTER', 'ADMIN', 'AMBULANCE_DRIVER', 'DRIVER', 'PHARMACIST', 'DOCTOR', 'HOSPITAL_OPERATOR'];
        if (!claims.sub || !validRoles.includes(claims.role)) {
          socket.send(JSON.stringify({ type: 'auth.error', payload: { code: 'INVALID_ROLE' } }));
          return socket.close(4003, 'Invalid role');
        }
        const requestedEntityId = String(message.payload?.entityId ?? '');
        const entityId = claims.entityId ?? (claims.role === 'COMMAND_CENTER' || claims.role === 'ADMIN' ? requestedEntityId : claims.sub);
        client = { socket, userId: claims.sub, role: claims.role, entityId, rooms: new Set(), windowStartedAt: Date.now(), eventCount: 0 };
        clients.add(client);
        clearTimeout(authTimeout);
        send(client, { type: 'auth.ok', requestId: message.requestId, payload: { userId: client.userId, entityId: client.entityId, role: client.role } });
        broadcastPresence(client, true);
        return;
      }
      if (!allowEvent(client)) return sendError(client, message.requestId, 'RATE_LIMITED', 'Terlalu banyak event; coba lagi sebentar');
      handle(client, message);
    } catch (error) {
      if (!client) {
        try { socket.send(JSON.stringify({ type: 'auth.error', payload: { code: 'INVALID_AUTH' } })); } catch { /* socket already closed */ }
        socket.close(4003, 'Invalid authentication');
      } else sendError(client, undefined, 'INVALID_EVENT', (error as Error).message);
    }
  });
  socket.on('close', () => { clearTimeout(authTimeout); if (client) { broadcastPresence(client, false); clients.delete(client); } });
});

server.on('upgrade', (request, socket, head) => {
  if (request.url?.split('?')[0] !== '/ws') { socket.destroy(); return; }
  wss.handleUpgrade(request, socket, head, (webSocket) => wss.emit('connection', webSocket, request));
});

server.listen(PORT, () => console.log(`[realtime-service] listening on ${PORT}`));
