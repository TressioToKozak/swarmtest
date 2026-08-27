'use strict';

function requestIp(request, trustProxy = false) {
  if (trustProxy) {
    const forwarded = String(request.headers['x-forwarded-for'] || '')
      .split(',')[0]
      .trim();
    if (forwarded) return forwarded;
  }
  return request.socket.remoteAddress || 'unknown';
}

function originAllowed(request, configuredOrigins = process.env.WS_ALLOWED_ORIGINS || '') {
  const origin = request.headers.origin;
  if (!origin) return true; // Non-browser clients and the test harness do not send Origin.
  const allowed = new Set(
    String(configuredOrigins)
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  if (allowed.has(origin)) return true;
  try {
    const url = new URL(origin);
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

class SlidingWindowLimiter {
  constructor({ limit, windowMs, now = Date.now }) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
    this.events = new Map();
  }
  take(key) {
    const now = this.now();
    const recent = (this.events.get(key) || []).filter((time) => now - time < this.windowMs);
    if (recent.length >= this.limit) return false;
    recent.push(now);
    this.events.set(key, recent);
    return true;
  }
}

class ConnectionAdmission {
  constructor({
    maxPerIp = 8,
    reconnectLimit = 20,
    reconnectWindowMs = 60_000,
    now = Date.now,
  } = {}) {
    this.maxPerIp = maxPerIp;
    this.active = new Map();
    this.reconnects = new SlidingWindowLimiter({
      limit: reconnectLimit,
      windowMs: reconnectWindowMs,
      now,
    });
  }
  acquire(ip) {
    if ((this.active.get(ip) || 0) >= this.maxPerIp || !this.reconnects.take(ip)) return false;
    this.active.set(ip, (this.active.get(ip) || 0) + 1);
    return true;
  }
  release(ip) {
    const count = this.active.get(ip) || 0;
    if (count <= 1) this.active.delete(ip);
    else this.active.set(ip, count - 1);
  }
}

module.exports = { ConnectionAdmission, SlidingWindowLimiter, originAllowed, requestIp };
