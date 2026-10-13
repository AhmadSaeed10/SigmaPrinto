import type { APIRoute } from 'astro';
import { clearSession } from '../../../admin/server/session';

export const prerender = false;

export const POST: APIRoute = async ({ cookies, redirect }) => {
  clearSession(cookies);
  return redirect('/admin/login/', 303);
};
