# Plates iOS — Complete Feature Inventory

Source of truth: `~/Documents/Plates` (SwiftUI + SwiftData, local-only build).
Extracted from `README.md`, `FEATURE_PLAN.md`, and `App/Views` + `Packages` source.
Purpose: parity checklist for the `plates-web` port.

---

## 1. App shell & navigation
- 5-tab `TabView`: **Workout / History / Exercises / Progress / Profile**.
- Theme picker — `AppearanceMode` = system / light / dark (`@AppStorage plates.appearance`).
- Bilingual UI: **English + Czech**, locale-driven, runtime switch (string catalog `Localizable.xcstrings`).
- `plates://` URL scheme (routine import deep-link).
- Local-only store (CloudKit/Push/App Groups stripped for free-team build; toggle code retained).

## 2. Exercise library
- ~55 seeded bilingual exercises (`exercises.json`, first-launch seed, per-`nameKey` idempotent install).
- Exercises tab: sectioned-by-muscle list, searchable text, muscle + equipment filter chips.
- Exercise detail: primary/secondary muscle, equipment, mechanic, default rest, instructions (EN/CS).
- **Form cues** — user `userNotes` field (vertical TextField, autosave), distinct from stock instructions.
- Custom exercise editor: bilingual names, muscle/equipment/mechanic pickers, rest stepper, instructions.
- Edit + delete for custom exercises (stock are read-only).
- Localized enums: MuscleGroup, Equipment, Mechanic.

## 3. Routines
- Workout tab: routines list sorted by `lastUsed`, swipe-to-delete, empty-state CTA.
- **Quick Start** free/ad-hoc workout.
- Routine editor: name + notes; add/reorder/delete exercises via picker; per-exercise target sets / rep range / RIR / rest stepper.
- **Supersets** — first-class in schema; grouping in editor + A1/B1 badges (recent work).
- Routine detail: exercise preview w/ target metadata, Edit shortcut, prominent Start button.
  - Recovery verdict banner + Start-button tint by readiness (green/accent/orange/red).
  - Pre-start **fatigue guard** confirmation dialog when `notRecommended`.
  - **Suggested swaps** — fresher alternative exercises for fatigued ones (recovery→equipment→mechanic ranked, 15pp gate).
- Share routine via `plates://routine?data=…` (base64 codec) → `UIActivityViewController`.
- Import routine via `onOpenURL` → preview sheet (exercise count/notes, override name, save).

## 4. Active workout (core loop) — `ActiveWorkoutModel` (`@Observable`)
- Header stats: elapsed, live volume, sets done.
- Exercise sections w/ set rows; add exercise mid-workout; ad-hoc add set.
- **Set row**: weight + reps + RIR inputs; **last-session "ghost" numbers** below each input; big complete button (bounce haptic); double-tap weight → plate calculator.
- Set kinds (warmup / working / etc. via `SetKind`).
- **Rest timer banner**: countdown ring (`RestTimerService`), +30s extend, Skip.
- Stopwatch service.
- Mid-workout **smart exercise picker**: Recent (8 unique, 30d) when empty; ranked flat list when searching (prefix 100 / word-start 50 / substring 10 + shorter-name tiebreak; searches EN/CS/locale names); muscle+equipment chips.
- Per-exercise form-cue lightbulb toggle (yellow cue row).
- **Volume cap warning** — inline orange banner when logging at/past recovery-scaled set cap for a fatigued muscle.
- **PR detection** on finish (weight / reps / e1RM / per-session volume) → `prFlags`, trophy badge.
- Recovery-aware progression prefill (holds load advance when muscle <50% recovered).
- Drops empty unused sets; builds last-session lookup.
- Resume-in-progress session.
- **WorkoutSummaryView** — full-screen celebration: trophy hero (symbol bounce), **confetti**, 4-tile grid (Volume/Duration/Sets/PRs), per-exercise PR list.

## 5. History
- Session list grouped by month (localized, e.g. "duben 2026"); per-row sets/duration/volume; trophy badge on PR; swipe-to-delete.
- `.searchable` — routine / exercise / notes (case-insensitive, EN/CS/locale names).
- Per-session **recovery snapshot** ("65% rec" stat) + **Deload** capsule.
- SessionDetailView: date/duration/volume/sets header; per-exercise sections w/ every set (weight×reps + RIR), PR badges; "Recovery at start" row + "Deload week" indicator.

## 6. Progress / Analytics (`ProgressTab`, segmented)
- **Exercise progress chart** — e1RM (Epley) line+point per exercise; current/best/Δ tiles; empty states.
- **Weekly volume chart** — completed working sets per muscle/7d; bars color-coded by MEV/MAV/MRV status; RuleMark overlays + legend; zero-set targets show as red.
- **Workout stats** — streak hero (consecutive days); tiles: this-week / this-month / all-time / total volume / avg duration.
- **Compare exercises** (`CompareExercisesView`).
- **PR timeline** (`PRTimelineView`).
- **Consistency heatmap** (`ConsistencyHeatmap`).

## 7. Recovery (`RecoveryTabView`)
- Per-muscle recovery status grid (threshold-aware colors/labels; "Mark as Ready").
- **Check-in** — sleep/stress/soreness/energy → recompute; shows per-muscle deltas.
- **Today's recommendation** card (`WorkoutRecommender`); "Next up" closest-to-ready muscle hint.
- **Trends** segment — `RecoveryInsights` (5 factor insights + recommendations); trend chart (gap-aware daily + 7d moving avg); muscle recovery history chart (threshold overlay).
- **Deload weeks** — start/end dates + multiplier (0.7 default); "Deload week active" badge; atomic start/stop ("Start a 7-day deload now" / "End deload now"); auto-suggest banner (7d soreness>7 & energy<5, ≥3 check-ins; snooze 7d).
- Age prompt banner (engages age multiplier).
- **RecoverySettingsView** (gear): notification toggle, 4 status thresholds (monotonic-validated), secondary-muscle impact slider, per-muscle custom recovery times, deload window.

## 8. Programs / periodization (`Program → Mesocycle → Microcycle → ProgramDay → Routine`)
- Programs list: Built-in / Custom sections.
- **6 built-in programs**: PPL (6-day, double-prog, 75% deload), Upper/Lower (RIR-based, 70%), 5/3/1 BBB (%1RM, 65%), Lyle GBR (double-prog, 75%), GZCLP (3-tier LP, 70%), Greyskull LP (A/B alternating + AMRAP, 80%).
- ProgramDetailView: mesocycle calendar grid (rule header, week rows w/ deload tag, 3-col day grid); Activate/Deactivate (mutually exclusive).
- **CustomProgramEditor**: name+notes; weeks 1–12; deload-week picker; deload intensity/volume sliders; progression-rule picker; linear-step + target-RIR steppers; per-day routine list (reorder/delete).
- **ProgressionEngine** — 4 rules: linear, double-progression, %1RM, RIR-based + deload overlay.
- Active program → "Today's workout" CTA on Workout tab → `startSession(programDay:)` prefilled via engine.

## 9. Body weight (Profile)
- Body weight log: monthly-grouped list, swipe-delete, stats header (current / 7d avg / total change).
- Add sheet: large input + kg/lb segmented picker, date+time, optional notes, "last entry" reference.

## 10. Volume targets (Profile)
- **MuscleVolumeTarget** — per-muscle MEV/MAV/MRV bands; `classify(weeklySets:)` → untrained/underMEV/productive/overreaching/overMRV.
- RP-style defaults seeded (10 muscle groups).
- VolumeTargetsEditor: 3 interlocked steppers per muscle (MEV ≤ MAV ≤ MRV).

## 11. Plate calculator
- In-workout sheet + standalone tool (Profile → Tools).
- kg/lb-aware bar picker (Olympic 20kg / Women's / no bar; 45lb), greedy breakdown, per-side + total loaded, "couldn't match" warning.
- Color-coded capsule stack, IWF kg colors (red25/blue20/yellow15/green10/white5/gray2.5/orange1.25) + lb palette.

## 12. Profile / settings / data
- Weight unit picker kg/lb (`@AppStorage`).
- Appearance picker (system/light/dark).
- Language preference.
- Version + build display; "Show onboarding again".
- Tools: Plate calculator, CSV export.
- **Backup & restore** — `.platesbackup` JSON (versioned v1, per-entity snapshots; stock exercises re-seeded, refs by `nameKey`). Export via temp file/share. Import: document picker → validate → **Merge vs Replace** alert → per-entity summary.
- **CSV export** — one row per completed set (RFC-4180 escaped), timestamped temp file.

## 13. Onboarding
- 3-page first-launch gate (Welcome → weight unit → notifications). `@AppStorage plates.hasCompletedOnboarding`. (Was 4 pages incl. iCloud before strip.)

## 14. Widgets & Live Activities (`Targets/PlatesWidgets`)
- **StreakWidget** — small (streak #) / medium (+ last workout). Lock-screen: rectangular/circular(flame)/inline.
- **WeeklyVolumeWidget** — small (set count) / medium (+ 30-set/wk bar). Lock-screen: circular Gauge.
- Data via `SharedSnapshot` (App Group `UserDefaults`); rebuilt on workout finish/discard; `WidgetCenter.reloadAllTimelines`. Falls back to placeholder w/o App Group.
- **RestTimer Live Activity** — Dynamic Island (compact/expanded/minimal) + lock-screen banner; self-ticking `Text(timerInterval:)`.

## 15. App Intents / Siri / deep-links
- **StartWorkoutIntent** w/ `RoutineEntity` param (Spotlight/Shortcuts queryable).
- `PlatesAppShortcuts` — natural-language phrases.
- `PendingWorkoutLaunch` side-channel → spins up active workout.
- `plates://routine?data=…` import.

## 16. The 8 calculators (pure, unit-tested — `PlatesCore/Calculators`)
1. **OneRMCalculator** — Epley / Brzycki / Lombardi / Wathan + %-of.
2. **VolumeCalculator** — total volume, sets/muscle, weekly sets/muscle.
3. **PerformanceAnalytics** — plateau detect, velocity, predict 1RM, projection.
4. **ProgressionEngine** — next weight/reps per rule.
5. **PlateCalculator** — greedy plate breakdown.
6. **RecoveryCalculator** — recovery %, recommended set cap, training recommendation (+ deload multiplier).
7. **RecoveryInsights** — factor analysis, deload suggestion.
8. **WorkoutRecommender** — today/routine recommendation, swap suggestions.

## 17. Data model — 18 SwiftData entities
exercises, routines, routineExercises, supersetGroups, programs, mesocycles, microcycles, programDays, sessions, sessionExercises, workoutSets, bodyWeightEntries, userProfile(singleton), recoverySettings(singleton), muscleVolumeTargets, muscleRecoveryStatus, recoveryFactors, muscleRecoveryHistoryPoints.
Enums: WeightUnit, SetKind, MuscleGroup, Equipment, Mechanic, ProgressionRule, SupersetKind, Gender, TrainingExperience. `PRFlags` = Int bitmask.

## 18. Design system — "Iron"
- Geist + Geist Mono fonts; tabular nums for stats/weights/timers.
- Flat/sharp (radius 0–4px), hairline borders, cream canvas.
- Tokens: bg #F5F3EE, card #FFF, ink #171614, accent #C64D2A, ok/warn/fade/bad/info.
- Components: IronTopBar, IronTabBar, IronAlert, IronToast, IronEmptyState, IronButton, IronCard, Stepper, SearchField, InfoBanner, ConfettiView.

## 19. Platform notes
- Haptics (`HapticManager`).
- Rest-timer notifications (UNUserNotifications, foreground).
- DEBUG seed (`SIMCTL_CHILD_PLATES_DEBUG_SEED=1`) — sample Push Day routine + prior session.
- Explicitly skipped: HealthKit (M7). Stubbed/removed: CloudKit sync, Push, Apple Watch.

---
*~37 SwiftUI views across 10 feature areas; 8 calculators; 18 entities; 6 built-in programs; EN+CS.*
