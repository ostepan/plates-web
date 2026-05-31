# Deploying Plates (web)

It's a static, local-first PWA — any static host works. Three ready-to-go paths,
pick one. All build with `npm run build` (output: `web/dist`).

## 1. GitHub Pages (zero accounts — uses this repo)
A workflow is already committed: `.github/workflows/deploy-web.yml`.

1. Push `plates-web` (done) → repo **Settings → Pages → Source: GitHub Actions**.
2. The workflow builds with `PAGES_BASE=/Plates/` and deploys on every push to
   `web/**`. Trigger it now from the **Actions** tab → "Deploy web" → *Run workflow*.
3. App goes live at **https://ostepan.github.io/Plates/**

> If the `github-pages` environment is restricted to the default branch, either
> merge `plates-web` → `main`, or add `plates-web` under
> *Settings → Environments → github-pages → Deployment branches*.

## 2. Vercel (nicest for a PWA, free)
1. Import the repo at vercel.com → **Root Directory: `web`**.
2. Framework preset **Vite** (or leave auto — `web/vercel.json` sets build/output
   + SPA rewrites). Deploy. Served at root, so no base-path config needed.

## 3. Netlify (free)
`netlify.toml` (repo root) already sets `base = web`, build, publish, and the SPA
redirect. Import the repo → deploy.

---

### Notes
- **Local-first:** all data lives in the browser's IndexedDB. No backend, no
  account. Each device/browser is independent (no sync — see `PLAN.md §12`).
- **Install it:** open the deployed URL on a phone → "Add to Home Screen". It
  runs offline and full-screen like a native app.
- **HTTPS required** for the service worker / install / notifications (all three
  hosts above provide it).
