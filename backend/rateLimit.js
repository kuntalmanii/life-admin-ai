/**
 * Lightweight in-memory sliding-window rate limiter per client IP.
 */
export function createRateLimiter({ windowMs = 60_000, max = 60 } = {}) {
  const hits = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket?.remoteAddress || "unknown";

    if (hits.size > 2000) {
      for (const [k, timestamps] of hits.entries()) {
        const recent = timestamps.filter((ts) => now - ts < windowMs);
        if (recent.length === 0) hits.delete(k);
        else hits.set(k, recent);
      }
    }

    const recent = (hits.get(key) || []).filter((ts) => now - ts < windowMs);
    res.setHeader("X-RateLimit-Limit", String(max));

    if (recent.length >= max) {
      const oldest = recent[0] ?? now;
      const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
      res.setHeader("X-RateLimit-Remaining", "0");
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({
        error: "Too many requests. Please wait a moment and try again.",
      });
    }

    recent.push(now);
    hits.set(key, recent);
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - recent.length)));
    next();
  };
}
