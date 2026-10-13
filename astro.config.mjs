import { defineConfig, envField } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

export default defineConfig({
  site: 'https://sigma-printo.vercel.app',
  trailingSlash: 'always',
  // Public pages are prerendered (static). Only /admin and /api/admin opt out with `prerender = false`
  // and run as Vercel functions.
  output: 'static',
  adapter: vercel(),
  integrations: [sitemap({ filter: (page) => !new URL(page).pathname.startsWith('/admin') })],
  build: { inlineStylesheets: 'auto' },
  prefetch: true,
  // Admin secrets: read at runtime on the server only, never bundled. All optional so the
  // public site still builds without them; the admin explains what is missing.
  env: {
    schema: {
      ADMIN_EMAIL: envField.string({ context: 'server', access: 'secret', optional: true }),
      ADMIN_PASSWORD: envField.string({ context: 'server', access: 'secret', optional: true }),
      SESSION_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      GITHUB_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
      GITHUB_REPO: envField.string({ context: 'server', access: 'secret', optional: true }),
      GITHUB_BRANCH: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Only for local testing against a mock API. Leave unset in production.
      GITHUB_API_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },
});
