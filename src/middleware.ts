import { defineMiddleware } from 'astro:middleware';
import { readSession } from './admin/server/session';

// Public pages are prerendered and pass straight through. Only the admin is guarded.
const OPEN = new Set(['/admin/login/', '/api/admin/login/']);

export const onRequest = defineMiddleware(async (ctx, next) => {
  const path = ctx.url.pathname;
  const isApi = path.startsWith('/api/admin/');
  const isAdmin = isApi || path === '/admin/' || path.startsWith('/admin/');
  if (!isAdmin || ctx.isPrerendered) return next();

  const secure = (res: Response) => {
    res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    if (!res.headers.has('Cache-Control')) res.headers.set('Cache-Control', 'no-store');
    res.headers.set('Referrer-Policy', 'same-origin');
    res.headers.set('X-Frame-Options', 'DENY');
    res.headers.set('X-Content-Type-Options', 'nosniff');
    return res;
  };

  // Writes must come from this site (cookies are sameSite=strict as well).
  if (isApi && ctx.request.method !== 'GET') {
    const origin = ctx.request.headers.get('origin');
    if (origin !== ctx.url.origin) return secure(Response.json({ error: 'Bad origin' }, { status: 403 }));
  }

  if (!OPEN.has(path)) {
    const session = readSession(ctx.cookies);
    if (!session) {
      if (isApi) return secure(Response.json({ error: 'Your session has ended. Log in again.' }, { status: 401 }));
      const nextPath = path === '/admin/' ? '' : `?next=${encodeURIComponent(path + ctx.url.search)}`;
      return secure(ctx.redirect(`/admin/login/${nextPath}`, 302));
    }
    ctx.locals.admin = session;
  }
  return secure(await next());
});
