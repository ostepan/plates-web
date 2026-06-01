# Plates — Web

A local-first **Progressive Web App** for serious lifters — routines, programs,
workout logging, progress analytics, and recovery. A from-scratch web rebuild of
the Plates iOS app, sharing its calculators, seed data, Czech/English copy, and
the editorial **"Iron"** look (Geist type, cream + ink, flat/hairline).

Everything runs in the browser (IndexedDB) — **no account, works offline,
installable**. See [`PLAN.md`](./PLAN.md) for the full design, and
[`DEPLOY.md`](./DEPLOY.md) to ship it.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build → dist/
npm run test       # Vitest: calculator parity + IndexedDB integration tests
npm run e2e        # Playwright smoke tests (needs `npx playwright install chromium`)
```

## Stack
React + Vite + TypeScript · Tailwind (Iron preset) · **Dexie/IndexedDB** (local-first)
· Zustand · **Recharts** (code-split) · i18next (cs/en) · vite-plugin-pwa.

## Structure
```
packages/
  core/   # framework-free: TS models, Dexie schema + mutations, the ported
          # calculators (1RM, plate, volume, plateau/velocity, recovery),
          # backup, seed JSON, i18n bundles
  ui/     # the Iron design system: Tailwind tokens, Geist fonts, components
src/      # the SPA: routes, hooks, app shell
tests/    # Playwright e2e
```

## Status — complete (M0–M6)
Logging loop, programs, analytics, recovery, profile/backup, onboarding, and PWA
polish are all built. **33 unit/integration tests + 2 e2e green.**

> Local-first by design (matches the iOS app — single device, no sync). Optional
> cloud sync is a documented later phase (`PLAN.md §12`). Background push and
> haptics are best-effort on the web (`PLAN.md §9`).
