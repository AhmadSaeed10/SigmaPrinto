// Server-only. Signed session cookie: base64url(payload) + "." + HMAC-SHA256(payload, SESSION_SECRET).
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AstroCookies } from 'astro';
import { authConfig } from './config';

export const COOKIE = 'sp_admin';
const MAX_AGE = 8 * 60 * 60; // 8 hours

const sign = (data: string, secret: string) => createHmac('sha256', secret).update(data).digest('base64url');

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Direct comparison of the submitted credentials with the env values, in constant time. */
export function credentialsMatch(email: string, password: string) {
  const cfg = authConfig();
  if (cfg.missing.length) return false;
  // Compare both, always, so timing does not reveal which one was wrong.
  const e = safeEqual(email.trim().toLowerCase(), cfg.email.trim().toLowerCase());
  const p = safeEqual(password, cfg.password);
  return e && p;
}

export function createSession(cookies: AstroCookies) {
  const { secret, email } = authConfig();
  const payload = Buffer.from(JSON.stringify({ sub: email, exp: Date.now() + MAX_AGE * 1000 })).toString('base64url');
  cookies.set(COOKIE, `${payload}.${sign(payload, secret)}`, {
    httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: MAX_AGE,
  });
}

export function readSession(cookies: AstroCookies): { sub: string } | null {
  const { secret, missing } = authConfig();
  const raw = cookies.get(COOKIE)?.value;
  if (!raw || missing.length) return null;
  const [payload, mac] = raw.split('.');
  if (!payload || !mac || !safeEqual(mac, sign(payload, secret))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof data.exp === 'number' && data.exp > Date.now() ? { sub: data.sub } : null;
  } catch {
    return null;
  }
}

export function clearSession(cookies: AstroCookies) {
  cookies.delete(COOKIE, { path: '/' });
}
