// Server-only helpers for admin API routes.
import { ConflictError, GitHubError } from './github';

export const json = (data: unknown, status = 200) => Response.json(data, { status });

export async function readJson(request: Request): Promise<Record<string, any> | null> {
  try { return await request.json(); } catch { return null; }
}

/** Turn thrown errors into a JSON response the admin UI can show as a toast. */
export function handle(fn: () => Promise<Response>) {
  return fn().catch((e: unknown) => {
    if (e instanceof ConflictError) return json({ error: e.message, conflict: true }, 409);
    if (e instanceof GitHubError) return json({ error: e.message }, e.status);
    console.error('[admin]', e);
    return json({ error: 'Something went wrong on the server. Try again.' }, 500);
  });
}
