import type { APIRoute } from 'astro';
import { MEDIA_DIR } from '../../../admin/registry';
import { handle } from '../../../admin/server/api';
import { getRaw } from '../../../admin/server/github';
import { MEDIA_NAME } from '../../../admin/server/paths';

export const prerender = false;

// Image previews for the admin. Read from GitHub so new uploads show before the redeploy,
// and so this works for private repos too.
export const GET: APIRoute = ({ url }) => handle(async () => {
  const name = url.searchParams.get('name') ?? '';
  if (!MEDIA_NAME.test(name)) return new Response('Not found', { status: 404 });
  const data = await getRaw(`${MEDIA_DIR}/${name}`);
  return new Response(data, { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=600' } });
});
