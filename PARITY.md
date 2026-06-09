# Plates — iOS → Web parity checklist

Audit of `plates-web` (`src/` + `packages/`) vs `IOS_FEATURES.md`.
Legend: ✅ done · 🟡 partial · ⬜ todo · ➖ N/A on web (platform).

---

## ✅ Done (shipped on web)
| Area | Web |
|---|---|
| App shell — 4-tab (Workout/Exercises/Analytics/Profile) + routing | `App.tsx`, `IronTabBar` |
| PWA install + offline | `useInstallPrompt`, vite-plugin-pwa |
| i18n EN + CS, runtime switch | `i18n.ts`, cs/en.raw.json |
| Exercise library — list, muscle/equipment filters, search | `ExercisesTab`, `ExercisePicker` |
| Routines — list, detail, editor | `WorkoutTab`, `RoutineDetail`, `RoutineEditor` |
| **Supersets** — grouping + A1/B1 badges | `superset.ts`, RoutineEditor/Detail/Active |
| Active workout — set logging, **ghosts**, warmup, live volume/sets | `ActiveWorkout.tsx`, `mutations.ts` |
| Rest timer (+ vibrate + web notification) | `useRestTimer.ts` |
| PR detection (weight/reps/e1RM/volume) | `prFlags` in `types.ts`/`mutations.ts` |
| Session summary — PRs, plateau, deload note | `SessionSummary.tsx` |
| History — list + session detail | `History.tsx`, `SessionDetail.tsx` |
| Analytics — stats/overview, exercise e1RM, weekly volume (MEV/MAV/MRV), PR timeline, consistency heatmap | `AnalyticsTab` + segments, `ConsistencyHeatmap` |
| Recovery — status grid (+ **Mark as Ready**), check-in, trends (7d avg + per-muscle history), insights, recommendation, deload | `Recovery.tsx`, `db/recovery.ts`, `calc/recovery.ts` |
| **Recovery settings screen** — 4 monotonic thresholds, secondary-muscle impact, per-muscle custom recovery times, deload window | `RecoverySettings.tsx`, `getOrCreateRecoverySettings` |
| **Volume cap warning** in active workout (recovery-scaled set cap, orange banner) | `ActiveWorkout.tsx`, `Recovery.recommendedSetCap` |
| **Recovery-aware progression hold** — autotype suggestion stops advancing when the muscle is under the partially-recovered threshold | `suggestNextSet({ holdProgress })`, `ActiveWorkout.tsx` |
| Daily **check-in nudge** on the Workout tab | `WorkoutTab.tsx` |

> **Formula divergence (deliberate):** the web recovery model is no longer a 1:1 port of
> `RecoveryCalculator.swift`. It uses exponential fatigue decay with multi-session
> superposition, secondary-muscle dose credit, logged-RPE intensity, smooth (lerp)
> multipliers and check-in staleness decay — calibrated so a baseline session is still
> "ready" exactly at the iOS base recovery time. See `RECOVERY_PLAN.md`.
| Programs — list, detail (calendar, activate), deload, progression engine | `ProgramsList`, `ProgramDetail`, `db/programs` |
| Volume targets editor (MEV/MAV/MRV) | `VolumeTargets.tsx` |
| Plate calculator (standalone) | `PlateCalculator.tsx`, `calc/plate.ts` |
| Body weight log + add | `BodyWeight.tsx` |
| Backup/restore JSON + **CSV export** | `BackupRestore.tsx`, `db/backup.ts` |
| Onboarding gate | `Onboarding.tsx` |
| Calculators — 1RM, performance/plateau, plate, recovery, volume | `packages/core/calc/*` |
| 6 built-in programs seeded | `programs.json`, `seed.ts` |
| **Exercise detail** (`/exercises/:id`) + list nav | `ExerciseDetail.tsx`, `ExercisesTab.tsx` |
| **Form cues** (`userNotes`) — detail textarea autosave + active-workout lightbulb + list badge | `ExerciseDetail.tsx`, `ActiveWorkout.tsx`, `mutations.ts` |
| Delete custom exercise (cascades routine refs) | `deleteExercise` in `mutations.ts` |
| **Custom exercise editor** (`/exercises/new`, `/exercises/:id/edit`) — name EN/CS, primary/secondary, equipment, mechanic, rest, instructions | `CustomExerciseEditor.tsx`, `createCustomExercise`/`updateCustomExercise` |
| **Custom program editor** (`/programs/new` + `/programs/:id/edit`) — name, notes, weeks, deload week, progression rule, day list w/ routine picker; create, **edit**, delete | `CustomProgramEditor.tsx`, `createCustomProgram`/`updateCustomProgram`/`deleteProgram` |
| **Recovery swaps + fatigue guard** on RoutineDetail — fresher-alternative swaps (recovery→equipment→mechanic, 15pp gate, 1/muscle), tap re-points in place; Start tints by verdict + confirm when not recommended | `getSwapSuggestions`, `RoutineDetail.tsx` |
| **Compare exercises** analytics — two-exercise e1RM overlay chart (color-coded pickers, stat tiles) | `CompareSegment.tsx` |
| **Confetti** on workout summary — dependency-free canvas burst, reduced-motion aware, bigger on PRs | `Confetti.tsx`, `SessionSummary.tsx` |
| Workout **stopwatch** — running elapsed timer in active workout header | `ActiveWorkout.tsx` (already present) |

## 🟡 Partial
| Feature | iOS | Web gap |
|---|---|---|
| New-routine flow | dedicated `/workout/new` | editor exists, no distinct `new` route — confirm create path |
| Set **stopwatch** | per-set stopwatch service | only workout-elapsed timer; i18n strings exist, no impl |
| Workout recommender | today + routine + **swaps** | recommendation done; **swap suggestions missing** |
| Summary celebration | trophy + **confetti** | stats/PRs done; **no confetti** (no ConfettiView equiv) |

## ⬜ Todo (real screens missing)
| Feature | iOS source |
|---|---|
| Routine **share/import** link | iOS `plates://routine` (web: share link + import sheet) — _deferred by request_ |

> ~~Exercise detail + form cues + list nav~~, ~~Custom exercise editor~~, ~~Custom program editor (create + **edit** + delete)~~, ~~Recovery swaps + fatigue guard~~, ~~Compare exercises~~, ~~Confetti~~ (+ stopwatch already present) — **shipped** (see Done).
>
> Only **routine share/import** remains, deferred for now.

## ➖ N/A on web (platform — needs replacement, not port)
| iOS | Web stance |
|---|---|
| Home-screen widgets (Streak, Weekly Volume) | no PWA widgets — surface on a dashboard instead |
| Live Activities / Dynamic Island rest timer | web notification + in-tab timer only |
| App Intents / Siri "start workout" | none — optional deep-link `/active?routine=:id` |
| Routine share via `plates://` URL | replace w/ share link + import sheet (not yet built) |
| Haptics | `navigator.vibrate` (Android/Chrome; iOS Safari ignores) |

---

## Suggested next build order
1. ~~Exercise detail + form cues~~ — ✅ done.
2. ~~Custom exercise editor~~ — ✅ done.
3. ~~Custom program editor (create + delete)~~ — ✅ done.
4. ~~Recovery swaps + pre-start fatigue guard~~ — ✅ done.
5. ~~Compare exercises analytics segment~~ — ✅ done.
6. ~~Confetti~~ — ✅ done. (Set stopwatch already covered by the active-workout elapsed timer.)
7. Routine **share/import** link flow.
