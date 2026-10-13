# SigmaPrinto

Astro site for SigmaPrinto, deployed on Vercel. Public pages are prerendered static HTML.
A small content admin lives at `/admin`; it and `/api/admin/*` are the only routes that run on the server.

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # static pages + one Vercel function for the admin, in .vercel/output
```

## Content admin (`/admin`)

Edit content without touching code. Every save is a commit to GitHub, and Vercel redeploys
automatically, so changes are live in about 1 to 2 minutes. There is no database and no third-party CMS.

| Section | Stored in | Notes |
|---|---|---|
| Services | `src/content/services/*.md` | Optional main image and gallery (image + alt text) |
| Guides | `src/content/guides/*.md` | Drafts are hidden from the site |
| FAQs | `src/data/faqs.json` | Shown on the homepage, in order |
| Site settings | `src/data/site.json` | Business name, contact details, WhatsApp, GA4 ID |
| Media | `src/assets/*.webp` + `src/data/media.json` (alt text) | Uploads are converted to WebP, max 2000px wide |

Field rules (lengths, required fields, formats) live in `src/lib/schemas.ts`. The site build and the
admin both use them, so the admin cannot save content that would break the build. To add a field,
add it to the schema; the admin form picks it up automatically. To add a content type, add it to
`src/admin/registry.ts` (and to `WRITABLE` in `src/admin/server/paths.ts`).

### Environment variables

Set these in Vercel: **Project → Settings → Environment Variables**. Add each one for the
**Production** environment (and Preview if you want the admin on preview deployments), then
**redeploy** (Deployments → ⋯ → Redeploy) so the function picks them up. For local work, copy
`.env.example` to `.env` (it is git-ignored).

| Variable | What it is |
|---|---|
| `ADMIN_EMAIL` | Email used to log in to `/admin` |
| `ADMIN_PASSWORD` | Password for `/admin`. Use a long passphrase. |
| `SESSION_SECRET` | Random string, 32+ characters, used to sign the login cookie. Generate with `openssl rand -base64 48`. Changing it logs everyone out. |
| `GITHUB_TOKEN` | Fine-grained personal access token (see below) |
| `GITHUB_REPO` | `AhmadSaeed10/SigmaPrinto` |
| `GITHUB_BRANCH` | `main` (must be the branch Vercel deploys to production) |

**Creating the GitHub token:** GitHub → Settings → Developer settings → Personal access tokens →
Fine-grained tokens → Generate new token.

- Repository access: **Only select repositories** → `AhmadSaeed10/SigmaPrinto`
- Repository permissions: **Contents → Read and write** (nothing else)
- Set an expiry and put a reminder to rotate it. When it expires, saving fails with a clear message
  until you paste a new token into Vercel and redeploy.

Never commit real values. Secrets are read at runtime on the server (`astro:env/server`) and are
not bundled into any client or server build output.

### How it is protected

- Login compares `ADMIN_EMAIL` and `ADMIN_PASSWORD` directly (constant-time). Errors are always the
  generic "Invalid email or password".
- 5 failed logins from one IP lock that IP out for 15 minutes. This is kept in the function's memory,
  so a cold start resets it; it slows guessing but is not a substitute for a strong password.
- On success a signed, httpOnly, Secure, SameSite=Strict cookie is set for 8 hours.
- `src/middleware.ts` blocks every `/admin/*` page and `/api/admin/*` route without a valid session,
  rejects API writes from other origins, and sends `X-Robots-Tag: noindex`.
- `robots.txt` disallows `/admin/`, and the sitemap excludes it.
- Writes are only allowed to the exact paths listed in `src/admin/server/paths.ts`. Slugs and file
  names are restricted to `a-z`, `0-9` and dashes.
- Uploads: JPG, PNG or WebP only (checked by file signature, not the name), up to 4 MB
  (Vercel's request limit is 4.5 MB), alt text required.
- If a file changed on GitHub after you opened it, the save is refused and you are asked to reload,
  so nobody's work is overwritten.
- Images still used by a service or guide cannot be deleted, and saves that reference a missing
  image are refused, so the admin cannot break the build.

### Limits worth knowing

- Each save is a separate commit and a separate Vercel build. On the free plan builds queue one at a
  time, so many quick saves in a row take a little longer to all go live.
- A service's URL slug is fixed once created. To change it, duplicate the service with the new slug
  and delete the old one.
- Work done directly in the repo should be pulled from `main` first, since the admin commits there.

### Test checklist

After adding the environment variables and redeploying:

- [ ] **Wrong login:** `/admin/login/` with a wrong password shows "Invalid email or password".
- [ ] **Lockout:** 5 wrong attempts show "Too many attempts. Try again in 15 minutes."
      (use a different network or wait 15 minutes before the next step).
- [ ] **Correct login** opens the dashboard with counts for Services, Guides and Media.
- [ ] **Blocked without login:** in a private window, `/admin/services/` redirects to login and
      `/api/admin/media/` returns 401.
- [ ] **Edit a service:** change a summary and Save. The toast says "Saved. Live in about 1 to 2
      minutes." On GitHub, a new commit `admin: update service "…"` is on `main`; in Vercel a new
      deployment starts; after it finishes, the change is on the live page.
- [ ] **Validation:** clear a required field and Save; the field is outlined with a message, nothing
      is committed.
- [ ] **Conflict:** open the same service in two tabs, save in one, then save in the other. The second
      is refused with a Reload button.
- [ ] **Upload an image** in Media with alt text. One commit adds the `.webp` and updates
      `media.json`. Pick it as a service's main image (alt text fills in), Save, and check the live page.
- [ ] **Delete an entry:** delete a test guide; a confirmation appears, then it disappears from the
      list and, after the deploy, from the site.
- [ ] **Unsaved changes:** edit a field and click another section; the browser asks before leaving.
- [ ] **Mobile:** on a phone, the menu button opens the sidebar and Save sits at the bottom.
- [ ] **Log out** returns to the login page, and `/admin/` requires login again.
