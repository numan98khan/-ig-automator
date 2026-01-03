# SEO Implementation Notes

Last updated: 2026-01-02

## Goals
- Make the public landing page crawlable and readable without JavaScript.
- Keep authenticated app routes non-indexable.
- Provide canonical metadata, social previews, and sitemap/robots.
- Move the app under `/app` so the root `/` can be a marketing surface.

## What Was Implemented

### 1) Public landing at `/` with static HTML fallback
- Added static HTML content in `frontend/index.html` so crawlers get readable text even if JS is disabled.
- This is the content shown in `view-source:https://sendfx.ai/`.

### 2) App routes moved under `/app`
- The authenticated UI now lives under `/app/*`.
- Public routes are `/` and `/privacy-policy`.
- Related updates across routing, redirects, and navigation:
  - `frontend/src/App.tsx`
  - `frontend/src/components/Layout.tsx`
  - `frontend/src/components/GlobalSearchModal.tsx`
  - `frontend/src/components/PrivateRoute.tsx`
  - `frontend/src/components/ProvisionalUserBanner.tsx`
  - `frontend/src/pages/Landing.tsx`
  - `frontend/src/pages/VerifyEmail.tsx`
  - `frontend/src/pages/AcceptInvite.tsx`
  - `frontend/src/pages/RequestPasswordReset.tsx`
  - `frontend/src/pages/ResetPassword.tsx`
  - `frontend/src/pages/CRM.tsx`

### 3) SEO metadata helper
- Added `frontend/src/components/Seo.tsx` to manage:
  - title, description
  - canonical link
  - Open Graph + Twitter tags
  - JSON-LD (when provided)
- Used in:
  - `frontend/src/pages/Landing.tsx`
  - `frontend/src/pages/PrivacyPolicy.tsx`
  - `frontend/src/components/Layout.tsx` (noindex for app pages)
  - Auth-related pages (noindex)

### 4) Robots + sitemap generation
- Script: `frontend/scripts/generate-seo-files.cjs`
- Generates:
  - `frontend/public/robots.txt`
  - `frontend/public/sitemap.xml`
- Run during build via `frontend/package.json`:
  - `"build": "tsc && node scripts/generate-seo-files.cjs && vite build"`
- Environment variables:
  - `SITE_URL` (preferred)
  - `VITE_SITE_URL` (fallback)

### 5) Robots rules
- Robots now block the app and auth routes, but allow `/` and `/privacy-policy`.
- Current disallows include:
  - `/app`, `/landing`, `/login`, `/inbox`, `/dashboard`, `/crm`, `/automations`, `/settings`, `/support`, `/accept-invite`, `/verify-email`, `/request-password-reset`, `/reset-password`
- `Sitemap:` points to `https://sendfx.ai/sitemap.xml`.

### 6) Sitemap served correctly (not HTML)
- Explicitly serve sitemap and robots from the backend to avoid SPA fallback:
  - `backend/src/index.ts`
  - `GET /sitemap.xml` returns XML
  - `GET /robots.txt` returns plain text

### 7) PWA start URL
- `frontend/public/manifest.json` updated:
  - `start_url: "/app"`

### 8) Landing page messaging updates
- Instagram-first SMB positioning.
- Updated hero, CTA text, “How it works”, use cases, pricing tiers, and FAQ in:
  - `frontend/src/pages/Landing.tsx`
  - `frontend/index.html` (static fallback)

## Deployment Notes

### Required environment variables (Frontend)
- `SITE_URL=https://sendfx.ai`
- `VITE_SITE_URL=https://sendfx.ai`

### Rebuild sequence
1) `cd frontend && npm run build`
2) Deploy via Railway

### Validation checklist
- `view-source:https://sendfx.ai/` contains the static `<main>` content.
- `https://sendfx.ai/sitemap.xml` returns XML (not HTML).
- `https://sendfx.ai/robots.txt` returns plain text.
- Search Console sitemap status shows parsed URLs.

## Optional Next Steps
- Add Loom video embed to both:
  - `frontend/src/pages/Landing.tsx`
  - `frontend/index.html`
- Add more public pages to the sitemap and robots allow list.
- Add Organization/SoftwareApplication JSON-LD to the static HTML if needed.
