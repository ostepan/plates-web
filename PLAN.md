# Plates → Web App — Rebuild Plan

Porting the **Plates** iOS app (SwiftUI + SwiftData, local-first) to a **local-first
Progressive Web App**. This plan is grounded in the actual iOS codebase (the Swift
source sits next to this `web/` folder on the `plates-web` branch as a living reference).

---

## 1. Goal & guiding principles

- **Feature parity** with the iOS app, same editorial "Iron" look, same Czech/English copy.
- **Local-first**: works fully offline, no account required — mirrors the current app
  (CloudKit is disabled on iOS; the app is single-device local). Cloud sync is an
  explicit, optional later phase, not a foundation.
- **Installable PWA**: home-screen install, offline, rest-timer notifications.
- **Pure logic is shared, not rewritten**: the 8 calculators are framework-agnostic math
  and port 1:1 to TypeScript, validated against the existing Swift unit tests.
- **One deliberate upgrade over the iOS app**: real accessibility (ARIA/semantic HTML).
  We stripped a11y from iOS on request; on the web it's cheap and expected, so we add it
  back properly.

---

## 2. What carries over directly (already copied into this project)

| Asset | iOS source | Web location | Reuse |
|---|---|---|---|
| Exercise seed (≈hundreds) | `Resources/exercises.json` | `packages/core/seed/exercises.json` | **as-is** |
| Program seed (6 programs) | `Resources/programs.json` | `packages/core/seed/programs.json` | **as-is** |
| Czech translations (763 keys) | compiled `cs.lproj` | `packages/core/i18n/cs.raw.json` | reshape → i18next |
| English translations | compiled `en.lproj` | `packages/core/i18n/en.raw.json` | reshape → i18next |
| **Geist + Geist Mono fonts** | `Resources/Fonts/*.ttf` | `packages/ui/fonts/` | **exact same typeface** |
| Design tokens (colors/spacing/kerning) | `PlatesUI/DesignTokens.swift` | → Tailwind preset | transcribe |
| Calculator math + test fixtures | `PlatesCore/Calculators/*`, `PlatesCoreTests/*` | → `packages/core/calc` + Vitest | port 1:1 |
| Domain copy / microcopy | catalog | i18n | reuse |

The single biggest win: the iOS app uses **Geist**, which is a free open web font — the
web app can look pixel-identical, not "close enough."

---

## 3. Recommended stack

| Concern | Choice | Why |
|---|---|---|
| Language | **TypeScript** (strict) | the calculators + model are typed domain logic |
| Build / shell | **Vite + React 18 (SPA)** | rich stateful client (live workout timers, charts, offline). SSR adds nothing for a local-first app. |
| PWA | **vite-plugin-pwa (Workbox)** | offline shell, install, SW for notifications |
| Persistence | **IndexedDB via Dexie.js** + `dexie-react-hooks` | the web analog of SwiftData's local store; reactive live queries |
| Styling | **Tailwind CSS** + custom Iron preset | the flat/sharp/hairline Iron system maps cleanly to utilities |
| Charts | **Recharts** (line/bar) + **visx/d3** (consistency heatmap) | replaces Swift Charts |
| Client state | **Zustand** (active-workout machine, ephemeral UI) | Dexie owns persisted state; Zustand owns the in-progress session |
| Routing | **React Router** (or TanStack Router) | tab + stack navigation |
| i18n | **i18next + react-i18next** | reuse cs/en, runtime language switch like the swizzle |
| Forms | **react-hook-form** (light use) | routine/program/exercise editors |
| Tests | **Vitest** (unit, port Swift test cases) + **Playwright** (e2e) | guarantee calculator parity |

**Alternatives considered:** SvelteKit (smaller/faster, great DX — viable if you prefer
Svelte); Next.js (rejected — SSR/server focus is wrong for local-first); raw SQLite-wasm
(rejected vs Dexie — more plumbing for no benefit at this scale); Supabase from day one
(deferred — adds auth/network deps the iOS app deliberately avoids).

---

## 4. Project structure (mirrors the Swift packages)

```
web/
├─ packages/
│  ├─ core/                 # ≙ PlatesCore — zero UI deps, fully unit-tested
│  │  ├─ models/            #   TS types for the 18 entities + enums
│  │  ├─ db/                #   Dexie schema, migrations, seed loaders
│  │  ├─ calc/              #   8 calculators (ported)
│  │  ├─ backup/            #   JSON/CSV export+import (port BackupExporter/Importer/CSVExporter)
│  │  ├─ seed/              #   exercises.json, programs.json  (copied ✓)
│  │  └─ i18n/              #   cs/en strings  (copied ✓)
│  └─ ui/                   # ≙ PlatesUI — Iron design system
│     ├─ tokens/            #   colors, type scale, spacing (→ tailwind preset)
│     ├─ fonts/             #   Geist + Geist Mono  (copied ✓)
│     └─ components/        #   IronTopBar, IronTabBar, IronAlert, IronToast,
│                          #   IronEmptyState, IronButton, IronCard, Stepper, …
└─ app/                     # the SPA: routes, screens, stores, providers
   ├─ routes/
   ├─ stores/               #   activeWorkout (Zustand) ≙ PlatesWorkout/ActiveWorkoutModel
   └─ main.tsx
```

Start as a **single Vite app with path aliases** (`@core`, `@ui`) to avoid monorepo
tooling overhead; promote to pnpm workspaces only if a second app (e.g. an admin tool)
ever appears.

---

## 5. Data model → IndexedDB (Dexie) schema

SwiftData `@Model` classes become Dexie tables keyed by string `id` (UUID). IndexedDB has
**no joins or cascade deletes**, so relationships are stored as foreign-key ids and
cascades are enforced in code inside transactions.

**18 entities → tables:**

```
exercises            id, *muscleGroup, *equipment, isCustom
routines             id, lastUsed, createdAt
routineExercises     id, routineId, order            (→ exercise by exerciseId)
supersetGroups       id, routineId
programs             id, isBuiltIn, isActive, name
mesocycles           id, programId, order
microcycles          id, mesocycleId, weekIndex, isDeload
programDays          id, microcycleId, dayIndex      (→ routine by routineId)
sessions             id, date, programDayID
sessionExercises     id, sessionId, order            (→ exercise by exerciseId)
workoutSets          id, sessionExerciseId, order
bodyWeightEntries    id, date
userProfile          id                              (singleton)
recoverySettings     id                              (singleton)
muscleVolumeTargets  id, &muscleGroupRaw
muscleRecoveryStatus id, &muscleGroupRaw
recoveryFactors      id, date
muscleRecoveryHistoryPoints  id, muscleGroupRaw, date
```

Notes:
- Enums (`WeightUnit`, `SetKind`, `MuscleGroup`, `Equipment`, `Mechanic`,
  `ProgressionRule`, `SupersetKind`, `Gender`, `TrainingExperience`) → TS string-union
  types; the iOS app already stores them as `…Raw: String`, so the on-disk shape matches.
- `PRFlags` is a bitmask `Int` (`prFlagsRaw`) — port as a small bitflag helper.
- **Cascade deletes** to replicate: Routine→RoutineExercise/SupersetGroup,
  Session→SessionExercise→WorkoutSet, Program→Mesocycle→Microcycle→ProgramDay. Wrap each
  delete in a Dexie transaction that removes children first.
- **Seeding** (port `SeedDataLoader`, `ProgramSeedLoader`, `MuscleVolumeTargetSeedLoader`,
  `RecoverySettings`/`UserProfile` seeders): on first run, bulk-insert from the copied JSON;
  guard by "name already exists" exactly like `ProgramSeedLoader.seedIfNeeded`.

---

## 6. Business logic → TypeScript (the 8 calculators)

All are **pure functions over plain data** — clean 1:1 ports. Port the matching Swift
test suites to Vitest so the math is provably identical.

| Calculator | Key API | Web test source |
|---|---|---|
| `OneRMCalculator` | epley / brzycki / lombardi / wathan, `percentage(of:percent:)` | new fixtures |
| `VolumeCalculator` | `totalVolume`, `setsPerMuscleGroup`, `weeklySetsPerMuscleGroup` | new fixtures |
| `PerformanceAnalytics` | `detectPlateau`, `velocity`, `predict1RM`, projection | new fixtures |
| `ProgressionEngine` | `suggest(...)` next weight/reps per `ProgressionRule` | new fixtures |
| `PlateCalculator` | `plates(target, bar, available)` | new fixtures |
| `RecoveryCalculator` | `calculateRecovery`, `recommendedSetCap`, `getTrainingRecommendation` | **port `RecoveryCalculatorTests`** |
| `RecoveryInsights` | `analyze(...)` | **port `RecoveryInsightsTests`** |
| `WorkoutRecommender` | `getRecommendation`, `getRoutineRecommendation`, `getSwapSuggestions` | **port `RecoveryIntegrationTests`** |

---

## 7. Iron design system → Tailwind preset + components

**Color tokens** (transcribe to `tailwind.config` `theme.colors`):

```
bg #F5F3EE   card #FFFFFF   chip #ECE8DF
ink #171614  ink2 #5A554E   ink3 #A8A299
rule rgba(23,22,20,.10)     hairline rgba(23,22,20,.07)
accent #C64D2A  accentInk #7A2C14  accentSoft #F3DCCF
ok #3FA055  warn #D4A544  fade #D97E3E  bad #C64D2A  info #5B7FA1
```

**Type**: Geist (display/body) + Geist Mono (numbers) via `@font-face` from the copied
ttf. Recreate the scale: huge heavy display titles with negative tracking, uppercase
"eyebrows" with positive `letter-spacing` (≈`0.14em`), monospaced tabular digits for all
stats/weights/timers (`font-variant-numeric: tabular-nums`).

**Form language**: sharp rectangles (radius 0–4px), hairline borders, flat fills, cream
canvas — all native Tailwind. Build these component equivalents in `packages/ui`:

`IronTopBar`, `IronTabBar` (bottom, 4 tabs), `IronAlert` (modal — replaces the iOS custom
overlay **and** all native alerts the Recovery feature still uses), `IronToast`,
`IronEmptyState`, `IronButton`/pill, `IronCard`, `IronStepper`, `IronSearchField`,
`IronInfoBanner`, `ConfettiView` (canvas-confetti), plate-calculator visual.

> Design note: the iOS Recovery screens use stock SwiftUI (system nav/alerts/Form). On the
> web, build them in the Iron components from the start — fixing that inconsistency for free.

---

## 8. Screens → routes (≈37 iOS views)

Bottom tab bar with 4 tabs (Workout / Exercises / Analytics / Profile), matching iOS.

```
/workout                         WorkoutTabView (routines + active program CTA + empty state)
/workout/routine/:id             RoutineDetailView (recovery verdict, fatigue warning, ghosts)
/workout/routine/:id/edit        RoutineEditorView (supersets, volume distribution)
/workout/new                     RoutineEditorView
/workout/active                  ActiveWorkoutView  ★ the core loop (set logging, rest timer,
                                   stopwatch, ghosts, supersets, warmup, summary)
  └ modal: ExercisePicker, PlateCalculator, WorkoutSummary (confetti, PRs, plateau)
/programs                        ProgramsListView (built-in + custom)
/programs/:id                    ProgramDetailView (mesocycle calendar, activate)
/programs/new                    CustomProgramEditor
/exercises                       ExerciseLibraryView (muscle/equipment filters, search)
/exercises/:id                   ExerciseDetailView
/exercises/new                   CustomExerciseEditor
/analytics                       ProgressTab → segments:
   stats / weekly-volume / exercise-progress / compare / pr-timeline / consistency-heatmap
   recovery (Recovery segment: status, check-in, settings)
/profile                         ProfileView
/profile/plate-calculator        PlateCalculatorView
/profile/body-weight             BodyWeightLogView (+ AddBodyWeightSheet)
/profile/volume-targets          VolumeTargetsEditor
/profile/backup                  BackupRestoreUI (export/import JSON + CSV)
/onboarding                      OnboardingView (3 pages, gates first run)
```

The **ActiveWorkout** machine (`PlatesWorkout/ActiveWorkoutModel`, ~745 lines) is the
hardest and highest-value port → a Zustand store: in-progress session, add/edit set,
rest-timer service, stopwatch service, last-session "ghost" lookup, PR detection,
finish→summary. Resume-in-progress (the bug just fixed on iOS) is native here: persist the
open session to Dexie and rehydrate on load.

---

## 9. Platform features → web replacements

| iOS feature | Web approach | Caveat |
|---|---|---|
| Rest-timer notification | Notifications API + Service Worker | foreground/lightly-backgrounded only; **locked-screen/background ⇒ Web Push + a tiny push server** (defer; in-tab `<audio>` ping as fallback) |
| Haptics | `navigator.vibrate()` | Android/Chrome only — **iOS Safari ignores it** |
| Widgets + App-Group snapshot | none — drop; surface the same data on the dashboard | optional: an OS share/shortcut |
| App Intents (Siri "start workout") | URL deep-link `/(workout/active)?routine=:id` + optional Web Share Target | no voice |
| Backup/restore (JSON `.platesbackup`, CSV) | File System Access API / `<a download>` + file input | `Backup` is already plain JSON → direct port |
| Language switch (Bundle swizzle) | i18next `changeLanguage('cs'|'en')` | runtime, no reload — same UX |
| Keychain/secure store | n/a (no secrets) | — |

---

## 10. Localization

- Reshape `cs.raw.json` / `en.raw.json` (763 keys) into i18next resource bundles. Most keys
  are plain English source strings → keep them as keys, or hash to ids; simplest is to keep
  the English string as the key (matches the iOS catalog model exactly).
- Format placeholders: iOS `%@`/`%lld` → i18next `{{name}}`/`{{count}}` (one transform pass).
- Default language from `navigator.language`, overridable in Profile (persist to Dexie/localStorage),
  exactly like the iOS `plates.preferredLanguage`.

---

## 11. Phased roadmap

- **M0 — Foundation.** Vite+TS+Tailwind+PWA scaffold, Iron preset + Geist, Dexie schema +
  seeders (exercises/programs), i18n wiring, app shell (tab bar, top bar, routing,
  empty states). *Exit:* app boots offline, seeded, themed, in cs/en.
- **M1 — Core logging loop (the heart).** Exercise library; routine list/detail/editor;
  **ActiveWorkout** store + screen (set logging, rest timer, stopwatch, ghosts, supersets);
  session summary (PRs, plateau, confetti); History list + session detail. *Exit:* a full
  workout can be created, logged, finished, and reviewed.
- **M2 — Programs.** List/detail (mesocycle calendar), custom program editor, activation,
  program-day workout entry.
- **M3 — Analytics.** Port calculators; stats, weekly volume (bar), exercise progress
  (line + projection), PR timeline, compare, consistency heatmap.
- **M4 — Recovery.** Port `RecoveryCalculator`/`RecoveryInsights`/`WorkoutRecommender`;
  status, check-in, settings; recovery notifications; verdict on routine detail.
- **M5 — Profile & data.** Plate calculator, body weight, volume targets, backup/restore,
  onboarding gate, language/unit/appearance settings.
- **M6 — PWA polish.** Offline hardening, install prompt, push notifications, a11y pass,
  performance budget, Playwright e2e, Vitest calculator-parity gate.

A thin **vertical slice first** is recommended: M0 + just enough of M1 to log one set
end-to-end, to validate the Dexie + Zustand + Iron stack before going wide.

---

## 12. Risks & open decisions

1. **Single-device vs. cloud sync.** iOS is local-only. Keep web local-first; if multi-device
   is wanted, add Supabase (Postgres + auth) behind a sync layer in a later phase. *Decision needed.*
2. **iOS Safari PWA limits** — no `vibrate`, restricted background push, possible storage
   eviction. Plan an explicit export/backup nudge; treat notifications as best-effort.
3. **IndexedDB has no joins/cascades** — model relationships as FK ids; centralize cascade
   logic in `core/db` transactions and cover with tests.
4. **Charts parity** — Swift Charts → Recharts/visx; the consistency heatmap and 1RM
   projection need custom work.
5. **Font licensing** — Geist is OFL/free; safe to ship.
6. **Scope of M1** — `ActiveWorkoutModel` + `ActiveWorkoutView` are the largest, most
   intricate iOS files (~745 + ~1523 lines). Budget accordingly; this is the make-or-break port.

---

## 13. Immediate next steps

1. Confirm decisions: **stack (React+Vite+Dexie+Tailwind)**, **local-first vs. add sync**,
   **M1 scope**.
2. Scaffold `web/` (Vite + TS + Tailwind + vite-plugin-pwa), wire `@core`/`@ui` aliases.
3. Transcribe Iron tokens → `tailwind.config`; register Geist via `@font-face`; build
   `IronTopBar`/`IronTabBar`/`IronEmptyState` to lock the look.
4. Author the Dexie schema + seed loaders from the copied JSON; verify a seeded, offline boot.
5. Port `OneRMCalculator` + `VolumeCalculator` with Vitest as the first proof of the
   logic-port workflow.
6. Build the vertical slice: create routine → start workout → log one set → finish → summary.

---

*Reference: the full iOS source is on this same branch (`App/`, `Packages/`) — read it
directly when porting any screen or calculator.*
