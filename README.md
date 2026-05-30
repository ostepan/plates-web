# Plates — Web

Web (PWA) rebuild of the Plates iOS app. **Start with [`PLAN.md`](./PLAN.md).**

The original SwiftUI/SwiftData app lives on this same branch (`../App`, `../Packages`) as a
reference — read it directly when porting a screen or calculator.

## Already here (copied from iOS, reusable as-is)
- `packages/core/seed/` — `exercises.json`, `programs.json` (seed data)
- `packages/core/i18n/` — `cs.raw.json`, `en.raw.json` (763 translation keys → reshape to i18next)
- `packages/ui/fonts/` — Geist + Geist Mono `.ttf` (the exact iOS typeface; free web font)

## Recommended stack
React + Vite + TypeScript · Tailwind (Iron preset) · Dexie/IndexedDB (local-first) ·
Zustand · Recharts/visx · i18next · vite-plugin-pwa. See `PLAN.md §3`.

## Status
Planning only — no app scaffolded yet. Next steps in `PLAN.md §13`.
