// ── In-memory rate limiter (per-IP, sliding window) ──────────────────────
// Suitable for single-function instances on Vercel.
// For multi-instance production, use Upstash Redis.

const windows = new Map(); // ip → [timestamp, ...]

export function rateLimit(ip, limit = 30, windowMs = 60_000) {
  const now   = Date.now();
  const times = (windows.get(ip) || []).filter(t => now - t < windowMs);
  times.push(now);
  windows.set(ip, times);

  // Prune map periodically to avoid memory leak
  if (windows.size > 5000) {
    for (const [key, val] of windows) {
      if (val.every(t => now - t >= windowMs)) windows.delete(key);
    }
  }

  return {
    allowed:   times.length <= limit,
    remaining: Math.max(0, limit - times.length),
    reset:     times[0] + windowMs,
  };
}

// ── Simple in-memory cache ────────────────────────────────────────────────
const cache = new Map(); // key → { data, expiresAt }

export function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null; }
  return entry.data;
}

export function setCached(key, data, ttlMs = 120_000) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  // Prune old entries
  if (cache.size > 500) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now > v.expiresAt) cache.delete(k);
    }
  }
}
