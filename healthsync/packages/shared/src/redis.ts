import Redis from 'ioredis';

// ─────────────────────────────────────────────────────────────────────────────
// Redis client — singleton per process
// ─────────────────────────────────────────────────────────────────────────────

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    const url = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    redis.on('error', (err: Error) => {
      console.error('[redis] Connection error:', err.message);
    });

    redis.on('connect', () => {
      console.log('[redis] Connected');
    });
  }
  return redis;
}

// ─────────────────────────────────────────────────────────────────────────────
// Refresh token helpers (token rotation pattern)
// ─────────────────────────────────────────────────────────────────────────────

const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const REFRESH_KEY_PREFIX = 'refresh:';

export async function storeRefreshToken(
  tokenHash: string,
  payload: { userId: string; role: string },
): Promise<void> {
  const r = getRedis();
  await r.setex(
    `${REFRESH_KEY_PREFIX}${tokenHash}`,
    REFRESH_TTL_SECONDS,
    JSON.stringify(payload),
  );
}

export async function getRefreshToken(
  tokenHash: string,
): Promise<{ userId: string; role: string } | null> {
  const r = getRedis();
  const raw = await r.get(`${REFRESH_KEY_PREFIX}${tokenHash}`);
  if (!raw) return null;
  return JSON.parse(raw) as { userId: string; role: string };
}

export async function deleteRefreshToken(tokenHash: string): Promise<void> {
  const r = getRedis();
  await r.del(`${REFRESH_KEY_PREFIX}${tokenHash}`);
}

/** Delete all refresh tokens for a user (logout all devices) */
export async function deleteAllUserRefreshTokens(userId: string): Promise<void> {
  const r = getRedis();
  const keys = await r.keys(`${REFRESH_KEY_PREFIX}*`);
  const pipeline = r.pipeline();
  for (const key of keys) {
    const raw = await r.get(key);
    if (raw) {
      try {
        const data = JSON.parse(raw) as { userId: string };
        if (data.userId === userId) pipeline.del(key);
      } catch { /* skip malformed */ }
    }
  }
  await pipeline.exec();
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiting helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Increment a counter with TTL. Returns the current count.
 * Usage: const count = await incrementRateLimit('login:user_id', 60)
 */
export async function incrementRateLimit(key: string, ttlSeconds: number): Promise<number> {
  const r = getRedis();
  const fullKey = `rl:${key}`;
  const count = await r.incr(fullKey);
  if (count === 1) {
    await r.expire(fullKey, ttlSeconds);
  }
  return count;
}

/** Check DB connectivity */
export async function checkRedisHealth(): Promise<boolean> {
  try {
    await getRedis().ping();
    return true;
  } catch {
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
