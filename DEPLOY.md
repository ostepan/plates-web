# Deploying Plates (web)

A static, local-first PWA — any static host works. Build: `npm run build` → `dist/`.
Pick one path.

## 1. Vercel (recommended — free, works with a private repo)
1. vercel.com → **Add New → Project** → import this repo.
2. Framework auto-detects **Vite** (or `vercel.json` sets build + SPA rewrites).
   Deploy. Served at root, auto-redeploys on push.

## 2. Netlify (free)
Import the repo — `netlify.toml` sets the build, publish dir, and SPA redirect.

## 3. GitHub Pages (needs a public repo on the free plan)
`.github/workflows/deploy.yml` builds with `PAGES_BASE=/<repo>/` and publishes.
1. Make the repo public (Pages on private repos requires a paid plan).
2. **Settings → Pages → Source: GitHub Actions**, then run the **Deploy** workflow.
3. Live at `https://<user>.github.io/<repo>/`.
   > If the repo name differs from `plates-web`, update `PAGES_BASE` in the workflow.

---

- **Local-first:** data lives in the browser's IndexedDB — no backend, no account,
  per-device (no sync; see `PLAN.md §12`).
- **Install:** open the URL on a phone → "Add to Home Screen" → runs offline,
  full-screen. Requires HTTPS (all hosts above provide it).
