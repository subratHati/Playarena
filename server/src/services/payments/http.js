// Small JSON-over-HTTPS helper for gateway APIs (Node 18+ fetch), with a timeout and readable errors.
export class GatewayError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function request(url, { method = 'GET', headers = {}, body, form, timeoutMs = 15000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json',
        ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: form ? new URLSearchParams(form).toString() : body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const msg = data?.error?.description || data?.message || data?.error || text || res.statusText;
      throw new GatewayError(`${res.status} ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`, res.status, data);
    }
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new GatewayError('Gateway did not respond in time', 504);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Constant-time string compare (for signatures).
import crypto from 'node:crypto';
export function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
