import type { APIRoute } from 'astro';
import { json, readJson } from '../../../admin/server/api';
import { authConfig } from '../../../admin/server/config';
import { lockedFor, recordFailure, recordSuccess } from '../../../admin/server/rateLimit';
import { createSession, credentialsMatch } from '../../../admin/server/session';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  const cfg = authConfig();
  if (cfg.missing.length) return json({ error: `Admin login is not set up yet. Missing environment variables: ${cfg.missing.join(', ')}.` }, 500);

  const ip = clientAddress || 'unknown';
  const wait = lockedFor(ip);
  if (wait) return json({ error: `Too many attempts. Try again in ${wait} minute${wait === 1 ? '' : 's'}.` }, 429);

  const body = await readJson(request);
  const email = typeof body?.email === 'string' ? body.email.slice(0, 200) : '';
  const password = typeof body?.password === 'string' ? body.password.slice(0, 200) : '';

  if (!credentialsMatch(email, password)) {
    recordFailure(ip);
    const left = lockedFor(ip);
    return json({ error: left ? `Too many attempts. Try again in ${left} minutes.` : 'Invalid email or password' }, left ? 429 : 401);
  }
  recordSuccess(ip);
  createSession(cookies);
  const next = typeof body?.next === 'string' && /^\/admin\/[\w\-/?=&.%]*$/.test(body.next) ? body.next : '/admin/';
  return json({ ok: true, next });
};
