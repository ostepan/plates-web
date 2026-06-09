# Recovery feature — improvement plan

> **Status: implemented.** All three phases below shipped (formula overhaul in
> `packages/core/calc/recovery.ts` + `packages/core/db/recovery.ts`, settings screen at
> `/recovery/settings`, Mark-as-Ready, set-cap warning, recovery-aware progression hold,
> trends upgrades, check-in nudge). The two deviations from the plan as written:
> notification toggle was skipped (nothing on web fires recovery notifications yet, a
> dead toggle is worse than none) and the per-muscle history chart is retro-computed
> from sessions rather than persisted (`muscleRecoveryDailyHistory`), so it needs no
> new table or write path.

Audit of the recovery stack (`packages/core/calc/recovery.ts`, `packages/core/db/recovery.ts`,
`src/routes/Recovery.tsx` + consumers in `WorkoutTab`, `RoutineDetail`, `ActiveWorkout`) with a
phased plan: a better formula first, then wiring up the dead settings model, then surfacing
recovery in more places (iOS parity).

---

## 1. What's there today

- **Formula** (`calc/recovery.ts`): linear recovery — `pct = min(100, timeSince / total × 100)`
  where `total = base × volumeMult × intensityMult × factorsMult × ageMult × deloadMult`.
  All multipliers are step functions.
- **Derivation** (`db/recovery.ts → muscleRecovery()`): per muscle, only the **single most
  recent** session counts; volume = completed working sets of exercises whose **primary**
  muscle matches; verdicts hardcoded at 90/70/50.
- **UI**: Status grid + recommendation banner, daily check-in (5 factors), Trends
  (28d sparkline, weekly averages, factor insights, deload nudge). Swap suggestions and the
  Start-button fatigue guard on `RoutineDetail`; worst-muscle chip on `WorkoutTab`; per-muscle
  recovery % rows in `ActiveWorkout`.

## 2. Problems found (ordered by impact)

| # | Problem | Where |
|---|---|---|
| P1 | **No fatigue accumulation.** Training chest 3 days in a row reads identically to training it once yesterday — only the latest session is considered. | `muscleRecovery()` walk: "first session to train a muscle wins" |
| P2 | **Linear recovery curve.** Physiological recovery is fast early, slow tail (exponential decay of fatigue). Linear under-reports early recovery and snaps to 100% abruptly. | `calculateRecovery()` |
| P3 | **Secondary muscles ignored.** `Exercise.secondary: MuscleGroup[]` and `RecoverySettings.secondaryMuscleImpact` exist but are never used — rows/pulldowns add zero biceps fatigue; `fullBody` work touches nothing else. | `muscleRecovery()` |
| P4 | **Logged intensity ignored.** `WorkoutSet.rpe`/`rir` are recorded but `trainingIntensity` is never passed, so it always defaults to 7 ⇒ intensity multiplier is permanently 1.0. | `muscleRecovery()` → `calculateRecovery()` |
| P5 | **Stale check-ins poison the multiplier.** `latestFactors()` returns the most recent check-in *regardless of age* — one bad day logged two weeks ago still inflates every recovery time by up to 2×. | `latestFactors()` |
| P6 | **`RecoverySettings` is dead code.** The table exists (thresholds, `secondaryMuscleImpact`, `customRecoveryTimes`, deload window) but nothing ever writes it and `verdict()`/`isReady` hardcode 90/70/50. iOS has a full `RecoverySettingsView`. | `db.ts`, `calc/recovery.ts`, no route |
| P7 | **`recommendedSetCap()` is dead code.** Implemented + tested, but the iOS "volume cap warning" in the active workout was never wired up. | `ActiveWorkout.tsx` |
| P8 | **Step-function cliffs.** Factors score 59.9 ⇒ 1.3× but 60.0 ⇒ 1.0×; RPE 9.0 ⇒ 1.2× but 9.1 ⇒ 1.4×. Tiny input changes swing ready-time by many hours. | multipliers in `calc/recovery.ts` |
| P9 | **Unbounded queries.** `muscleRecovery()` loads *every* session/sessionExercise/set ever logged on each live-query tick; `latestFactors()`/`todayFactors()` full-scan + sort despite the `date` index. | `db/recovery.ts` |
| P10 | No "Mark as Ready" override, no muscle-recovery history chart, no 7d moving average on the trend chart, no recovery-aware progression prefill (all present on iOS). | `Recovery.tsx`, progression engine |

---

## 3. Phase 1 — better formula (`packages/core/calc/recovery.ts`, `packages/core/db/recovery.ts`)

### 3.1 Exponential recovery curve (fixes P2)

Replace the linear ramp with first-order exponential decay of fatigue:

```
recovery%(t) = 100 × (1 − e^(−λ · t / T))      λ = ln(10) ≈ 2.303
```

- `T` is the same adjusted total recovery time as today, so all multipliers keep working.
- Calibration `λ = ln(10)` means **exactly 90% ("ready") at t = T** — the existing semantics
  "chest is ready 48h after training" are preserved, while the curve now shows realistic
  fast early recovery (24h of a 48h window ⇒ ~68% instead of 50%).
- Clamp to 100 at `t ≥ 1.5T` so the UI doesn't sit at 99% forever.
- `estimatedReadyAt`/`hoursUntilReady` now solve for the *ready threshold* rather than 100%:
  `t_ready = T` by construction (or `−T/λ · ln(1 − thr/100)` once thresholds are settings-driven).

### 3.2 Multi-session fatigue superposition (fixes P1)

Stop picking one session; sum residual fatigue impulses over a trailing window (~10 days):

```
dose_i      = workingSets_i × intensityMult(rpe_i)        // one per session that hit the muscle
fatigue(t)  = Σ dose_i × e^(−λ (t − t_i) / T_i)           // T_i = adjusted base time for that session
recovery%   = 100 × max(0, 1 − fatigue(t) / DOSE_REF)     // DOSE_REF = 5 sets @ RPE ≤ 7 (the current baseline)
```

- A 5-set session decays exactly like the single-session curve in 3.1 (back-compatible).
- Back-to-back sessions stack: chest Mon + Tue is measurably worse than Tue alone.
- This *replaces* `volumeMultiplier` (volume now scales the dose, linearly up to a cap,
  rather than stretching the window) — one mechanism instead of two.
- `lastTrainedAt`/`daysSinceTrained` still come from the most recent contributing session.

### 3.3 Secondary-muscle contribution (fixes P3)

When tallying per-session working sets, credit each exercise's `secondary` muscles at
`secondaryMuscleImpact` weight (default **0.5**, later editable in settings):

```
dose[primary]   += sets
dose[secondary] += sets × secondaryMuscleImpact   // for each listed secondary muscle
```

This also makes `fullBody` exercises (which list real secondaries in the seed) propagate
fatigue into legs/back/etc. instead of a separate phantom "Full body" muscle row.

### 3.4 Use logged RPE/RIR (fixes P4)

Per session × muscle, compute set-weighted mean RPE from completed working sets
(`rpe`, else `10 − rir`, else default 7) and feed it into `intensityMult` for that dose.

### 3.5 Smooth, continuous multipliers (fixes P8)

Replace step functions with piecewise-linear interpolation over the same anchor points so
existing test fixtures stay close:

- `intensityMult`: 1.0 at RPE ≤ 7 → 1.2 at 9 → 1.4 at 10 (lerp between anchors).
- `factorsMult`: lerp 2.0 at score 0 → 0.8 at score 100 (anchors 0/20/40/60/80 map to
  2.0/1.6/1.3/1.0/0.8 as today, interpolated between).
- `ageMult`: lerp 0.9 at 22 → 1.6 at 60, clamped.

### 3.6 Check-in staleness decay (fixes P5)

Blend `factorsMult` toward neutral 1.0 as the check-in ages:

```
w = max(0, 1 − ageHours / 48)          // full weight today, zero after 2 days
mult = 1 + (factorsMult(score) − 1) × w
```

### 3.7 Hygiene

- `calculateRecovery` takes an optional `now` parameter (defaults `Date.now()`) — makes the
  calculator pure and the tests deterministic.
- Bound `muscleRecovery()` to sessions within the trailing window (`date ≥ now − 10d`) and
  use the `date` index for `latestFactors`/`todayFactors` (`orderBy("date").last()`) (P9).

### 3.8 Tests

- Rewrite `calc/recovery.test.ts` fixtures for the exponential curve (50%/90%/100% points,
  λ calibration, clamp), superposition (two sessions stack, 5-set baseline equivalence),
  smooth multipliers (anchor + midpoint values), staleness decay.
- Extend `db/recovery.test.ts`: secondary-muscle credit, RPE-weighted dose, multi-session
  accumulation, window bound.
- Note in `PARITY.md`: the formula deliberately diverges from `RecoveryCalculator.swift`
  (the Swift port comment in `calc/recovery.ts` gets updated accordingly).

## 4. Phase 2 — settings & control (wire up the dead model, fixes P6)

1. **Recovery Settings screen** (`/recovery/settings`, gear button on the Recovery top bar —
   iOS `RecoverySettingsView` parity):
   - 4 status thresholds with monotonic validation (ready > mostly > partially > recovering).
   - Secondary-muscle impact slider (0–100%).
   - Per-muscle custom recovery times (hours stepper per muscle, reset-to-default).
   - Deload window (start/end date + multiplier).
   - Mutations: `getOrCreateRecoverySettings()` singleton + `updateRecoverySettings()` in
     `mutations.ts`; seed defaults matching today's hardcoded values.
2. **Thresholds drive the math**: `verdict()` and `isReady` take thresholds from settings
   instead of hardcoded 90/70/50; `Recovery.tsx`'s `<50%` "skip" line and `WorkoutTab`'s
   worst-muscle chip use the same source.
3. **"Mark as Ready"** per-muscle override on the Status grid (iOS parity): stores an
   override timestamp (reuse the existing `muscleRecoveryStatus` table); cleared
   automatically the next time the muscle is trained.

## 5. Phase 3 — surfacing (iOS parity, fixes P7/P10)

1. **Volume cap warning in `ActiveWorkout`** — when logging working sets for a fatigued
   muscle at/past `Recovery.recommendedSetCap(planned, recovery%)`, show the inline orange
   banner ("muscle at N%, consider stopping at M sets"). The calculator already exists.
2. **Recovery-aware progression prefill** — hold the load advance in the progression engine
   when the exercise's primary muscle is below the partially-recovered threshold (iOS
   behavior: "holds load advance when muscle <50% recovered").
3. **Trends upgrades** — 7-day moving average overlay on the score sparkline (gap-aware),
   plus a per-muscle recovery history mini-chart (iOS `muscleRecoveryHistoryPoints`).
4. **Check-in nudge** — small banner on `WorkoutTab` when no check-in exists today and the
   user has checked in before (keeps the factors multiplier fresh, complements 3.6).

## 6. Sequencing & risk

- Phase 1 is pure `packages/core` work, fully unit-testable, no schema changes; ship first.
- Phase 2 adds one route + two mutations; the only migration is seeding the settings
  singleton (idempotent, same pattern as `userProfile`).
- Phase 3 items are independent of each other; the set-cap banner is the cheapest win.
- Copy: every new UI string lands in `en.raw.json` + `cs.raw.json` (Czech parity is a
  project rule).
