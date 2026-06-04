import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Brain, ChevronLeft, Flame, Moon, Utensils, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { saveRecoveryCheckIn } from "@core/db/mutations";
import { factorTrends, muscleRecovery, recoveryScoreHistory, todayFactors } from "@core/db/recovery";
import { overallRecoveryScore } from "@core/calc/recovery";
import { MUSCLE_I18N_KEY } from "@core/models/enums";
import type { RecoveryVerdict } from "@core/calc/recovery";
import { IronTopBar, IronToolbarButton } from "@ui/components/IronTopBar";
import { IronSegmented } from "@ui/components/IronSegmented";
import { IronEmptyState } from "@ui/components/IronEmptyState";

const DAY = 86_400_000;
const dayStart = (ts: number) => Math.floor(ts / DAY) * DAY;

// Verdict → Iron status colors. `bar` doubles as the card stripe / progress fill / dot.
const VERDICT: Record<RecoveryVerdict, { key: string; bar: string; text: string }> = {
  ready: { key: "READY", bar: "bg-ok", text: "text-ok" },
  acceptable: { key: "ALMOST", bar: "bg-info", text: "text-info" },
  caution: { key: "RECOVERING", bar: "bg-warn", text: "text-warn" },
  notRecommended: { key: "NEEDS REST", bar: "bg-fade", text: "text-fade" },
  avoid: { key: "JUST TRAINED", bar: "bg-bad", text: "text-bad" },
};

type Segment = "status" | "checkin" | "trends";

export function Recovery() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [seg, setSeg] = useState<Segment>("status");

  return (
    <div className="flex h-[100dvh] flex-col bg-bg">
      <IronTopBar
        title={t("Recovery")}
        leading={
          <IronToolbarButton onClick={() => navigate(-1)} label={t("Back")}>
            <ChevronLeft size={18} strokeWidth={2.5} />
          </IronToolbarButton>
        }
      />
      <IronSegmented<Segment>
        value={seg}
        onChange={setSeg}
        options={[
          { value: "status", label: t("Status") },
          { value: "checkin", label: t("Check-in") },
          { value: "trends", label: t("Trends") },
        ]}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {seg === "status" && <RecoveryStatus />}
        {seg === "checkin" && <RecoveryCheckIn onSaved={() => setSeg("status")} />}
        {seg === "trends" && <RecoveryTrends />}
      </div>
    </div>
  );
}

// ─── Status — recommendation banner + per-muscle grid ─────────────────────────
function RecoveryStatus() {
  const { t } = useTranslation();
  const rows = useLiveQuery(() => muscleRecovery(), [], undefined);

  if (rows === undefined) return null;
  if (rows.length === 0) {
    return (
      <IronEmptyState
        eyebrow={t("RECOVERY · 00")}
        title={t("No recovery\ndata yet")}
        body={t("Complete a workout that trains this muscle, then check back over the next few days.")}
      />
    );
  }

  const freshest = [...rows].sort((a, b) => b.recoveryPercentage - a.recoveryPercentage)[0];
  const fatigued = rows.filter((r) => r.recoveryPercentage < 50);
  const skipNames = fatigued.map((r) => t(MUSCLE_I18N_KEY[r.muscleGroup]));

  return (
    <div className="pb-6">
      {/* Recommendation banner */}
      <div className="mx-[22px] mt-3.5 bg-ink px-4 py-3.5 text-white">
        <p className="eyebrow flex items-center gap-2 text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          {t("Today's recommendation")}
        </p>
        <p className="mt-1.5 font-display text-[20px] font-extrabold leading-tight text-white [font-variant-numeric:tabular-nums]">
          {t("Train {{muscle}}", { muscle: t(MUSCLE_I18N_KEY[freshest.muscleGroup]) })} — {Math.round(freshest.recoveryPercentage)}% {t("recovered")}.
        </p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-white/65">
          {skipNames.length
            ? t("Skip {{muscles}} today — still under 50%.", { muscles: skipNames.join(", ") })
            : t("Everything's recovered enough to train hard today.")}
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 px-[22px] pb-1 pt-3.5">
        {(Object.keys(VERDICT) as RecoveryVerdict[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 ${VERDICT[k].bar}`} />
            <span className="font-mono text-[9px] tracking-wide text-ink2">{t(VERDICT[k].key)}</span>
          </span>
        ))}
      </div>

      {/* Per-muscle grid */}
      <div className="grid grid-cols-2 gap-2 px-[22px] pt-2">
        {rows.map((r) => {
          const v = VERDICT[r.verdict];
          return (
            <div key={r.muscleGroup} className="relative border border-rule bg-card px-3.5 py-3">
              <span className={`absolute bottom-0 left-0 top-0 w-[3px] ${v.bar}`} />
              <div className="flex items-baseline justify-between">
                <span className="font-display text-[14px] font-bold text-ink">{t(MUSCLE_I18N_KEY[r.muscleGroup])}</span>
                <span className={`mono-num text-[20px] font-extrabold ${v.text}`}>
                  {Math.round(r.recoveryPercentage)}
                  <span className="text-[10px] font-semibold text-ink3">%</span>
                </span>
              </div>
              <div className="mt-1.5 h-1 bg-chip">
                <div className={`h-full ${v.bar}`} style={{ width: `${r.recoveryPercentage}%` }} />
              </div>
              <div className="mt-1.5 flex items-baseline justify-between">
                <span className={`eyebrow text-[9px] ${v.text}`}>{t(v.key)}</span>
                <span className="mono-num text-[9px] text-ink3">
                  {r.isReady ? t("ready") : r.daysUntilReady <= 1 ? t("~1 day") : `~${r.daysUntilReady} ${t("days")}`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Check-in — score hero + tick-mark sliders ────────────────────────────────
const FACTORS = [
  { key: "sleepQuality", titleKey: "Sleep Quality", subKey: "How was your sleep last night?", icon: Moon, invert: false },
  { key: "nutritionQuality", titleKey: "Nutrition Quality", subKey: "How was your nutrition today?", icon: Utensils, invert: false },
  { key: "stressLevel", titleKey: "Stress Level", subKey: "How stressed are you feeling?", icon: Brain, invert: true },
  { key: "energyLevel", titleKey: "Energy Level", subKey: "How is your energy right now?", icon: Zap, invert: false },
  { key: "sorenessLevel", titleKey: "Soreness Level", subKey: "How sore are your muscles?", icon: Flame, invert: true },
] as const;

// RIR-style 5-stop scale (redlined → fresh), matching the Iron set-row colors.
const BAND_BG = ["bg-bad", "bg-fade", "bg-warn", "bg-[#9ba85a]", "bg-ok"];
const BAND_TEXT = ["text-bad", "text-fade", "text-warn", "text-[#9ba85a]", "text-ok"];
const bandIdx = (v: number) => Math.min(4, Math.max(0, Math.floor(v / 2.5)));
/** Value-display tone: higher is better, inverted for stress/soreness. */
const valueTone = (v: number, invert: boolean) => (invert ? 4 - bandIdx(v) : bandIdx(v));
/** Per-cell tone for a tick at index n (0–10). */
const cellTone = (n: number, invert: boolean) => bandIdx(invert ? 10 - n : n);

type FactorKey = (typeof FACTORS)[number]["key"];
const DEFAULT_VALS: Record<FactorKey, number> = {
  sleepQuality: 5, nutritionQuality: 5, stressLevel: 5, energyLevel: 5, sorenessLevel: 5,
};

function RecoveryCheckIn({ onSaved }: { onSaved: () => void }) {
  const { t } = useTranslation();
  const existing = useLiveQuery(() => todayFactors(), []);
  const sevenDay = useLiveQuery(() => recoveryScoreHistory(7), [], undefined);
  const [vals, setVals] = useState<Record<FactorKey, number>>(DEFAULT_VALS);
  const [notes, setNotes] = useState("");

  // hydrate once from today's check-in
  const [hydrated, setHydrated] = useState(false);
  if (existing && !hydrated) {
    setHydrated(true);
    setVals({
      sleepQuality: existing.sleepQuality, nutritionQuality: existing.nutritionQuality,
      stressLevel: existing.stressLevel, energyLevel: existing.energyLevel, sorenessLevel: existing.sorenessLevel,
    });
    setNotes(existing.notes ?? "");
  }

  const liveScore = Math.round(overallRecoveryScore(vals));
  const avg7 = sevenDay && sevenDay.length ? Math.round(sevenDay.reduce((s, p) => s + p.score, 0) / sevenDay.length) : null;
  const delta = avg7 != null ? liveScore - avg7 : null;

  async function save() {
    await saveRecoveryCheckIn({ ...vals, notes });
    onSaved();
  }

  return (
    <div className="pb-8">
      {/* Score hero */}
      <div className="mx-[22px] mt-3.5 bg-ink px-4 py-4 text-white">
        <div className="flex items-end justify-between">
          <div>
            <p className="eyebrow text-accent">{t("Today's score")}</p>
            <p className="mono-num mt-1 text-[44px] font-black leading-none">
              {liveScore}
              <span className="ml-1 text-[14px] font-bold text-white/50">/100</span>
            </p>
          </div>
          {delta != null && (
            <div className="text-right">
              <p className="text-[10px] text-white/50">{t("vs 7d avg")}</p>
              <p className="mono-num mt-0.5 text-[14px] font-bold text-accent">
                {delta >= 0 ? "↗ +" : "↘ "}
                {delta}
              </p>
            </div>
          )}
        </div>
        <div className="mt-3 h-1.5 bg-white/15">
          <div className="h-full bg-accent" style={{ width: `${liveScore}%` }} />
        </div>
      </div>

      {/* Tick-mark sliders */}
      <div className="px-[22px] pt-4">
        <p className="eyebrow text-ink3 mb-1">{t("Daily factors")}</p>
        {FACTORS.map((f) => {
          const v = vals[f.key];
          return (
            <div key={f.key} className="border-b border-hairline py-3.5 last:border-0">
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="font-display text-[15px] font-bold text-ink">{t(f.titleKey)}</p>
                  <p className="mt-0.5 text-[11px] text-ink2">{t(f.subKey)}</p>
                </div>
                <span className={`mono-num text-[22px] font-black ${BAND_TEXT[valueTone(v, f.invert)]}`}>
                  {v}
                  <span className="text-[10px] font-semibold text-ink3">/10</span>
                </span>
              </div>
              <div className="mt-2 flex gap-[3px]" role="group" aria-label={t(f.titleKey)}>
                {Array.from({ length: 11 }, (_, n) => (
                  <button
                    key={n}
                    type="button"
                    aria-label={`${t(f.titleKey)} ${n}`}
                    aria-pressed={n === v}
                    onClick={() => setVals((s) => ({ ...s, [f.key]: n }))}
                    className={`h-6 flex-1 ${n <= v ? BAND_BG[cellTone(n, f.invert)] : "bg-chip"}`}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Notes */}
      <div className="px-[22px] pt-4">
        <p className="eyebrow text-ink3 mb-2">{t("Notes")}</p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t("Anything affecting recovery today?")}
          className="min-h-[60px] w-full resize-none border border-rule bg-card px-3.5 py-3 text-[13px] text-ink placeholder:text-ink3 focus:border-ink focus:outline-none"
        />
      </div>

      <div className="px-[22px] pt-5">
        <button type="button" onClick={() => void save()} className="w-full bg-accent py-4 text-white">
          <span className="eyebrow text-[13px]">{t("Save check-in")}</span>
        </button>
      </div>
    </div>
  );
}

// ─── Trends — 14-day score chart + per-factor insights + deload card ──────────
function RecoveryTrends() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const data = useLiveQuery(async () => {
    const hist = await recoveryScoreHistory(28);
    const ft = await factorTrends(7);
    return { hist, ft };
  }, [], undefined);

  if (data === undefined) return null;

  const today = dayStart(Date.now());
  const avg = (arr: { score: number }[]) =>
    arr.length ? Math.round(arr.reduce((s, p) => s + p.score, 0) / arr.length) : null;

  const last14 = data.hist.filter((p) => p.date >= today - 13 * DAY);
  const prior14 = data.hist.filter((p) => p.date < today - 13 * DAY);
  const last7 = data.hist.filter((p) => p.date >= today - 6 * DAY);
  const prior7 = data.hist.filter((p) => p.date >= today - 13 * DAY && p.date < today - 6 * DAY);

  const avg14 = avg(last14);
  const avgPrior14 = avg(prior14);
  const delta14 = avg14 != null && avgPrior14 != null ? avg14 - avgPrior14 : null;
  const avg7 = avg(last7);
  const avgPrior7 = avg(prior7);

  if (data.hist.length === 0) {
    return (
      <div className="px-[22px] py-16 text-center">
        <p className="eyebrow text-ink3 mb-2">{t("Recovery Trends")}</p>
        <p className="mx-auto max-w-[260px] text-[13px] leading-relaxed text-ink2">
          {t("Log a daily check-in to start tracking your recovery score over time.")}
        </p>
      </div>
    );
  }

  const showDeload = avg14 != null && (avg14 < 60 || (delta14 != null && delta14 <= -5));

  return (
    <div className="pb-8">
      {/* Hero score + sparkline */}
      <div className="mx-[22px] mt-3.5 border border-rule px-4 py-3.5">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="eyebrow text-ink3">{t("Recovery score · 14d")}</p>
            <p className="mono-num mt-0.5 text-[30px] font-black leading-none text-ink">
              {avg14 ?? "—"}
              <span className="ml-1 text-[13px] font-bold text-ink3">{t("avg")}</span>
            </p>
          </div>
          {delta14 != null && (
            <div className="text-right">
              <p className={`mono-num text-[14px] font-bold ${delta14 >= 0 ? "text-ok" : "text-fade"}`}>
                {delta14 >= 0 ? "↗ +" : "↘ "}
                {delta14}
              </p>
              <p className="text-[10px] text-ink3">{t("vs prior 14d")}</p>
            </div>
          )}
        </div>
        {last14.length >= 2 ? (
          <>
            <Sparkline points={last14.map((p) => p.score)} />
            <div className="mt-1 flex justify-between font-mono text-[9px] text-ink3">
              <span>{t("14d ago")}</span>
              <span>{t("Today")}</span>
            </div>
          </>
        ) : (
          <p className="py-5 text-center text-[12px] text-ink3">{t("Not enough check-ins yet")}</p>
        )}
      </div>

      {/* This week / last week */}
      <div className="mx-[22px] mt-3 grid grid-cols-2 gap-2">
        {([["This week", avg7], ["Last week", avgPrior7]] as const).map(([label, value]) => (
          <div key={label} className="border border-rule px-3.5 py-3">
            <p className="eyebrow text-ink3 text-[9px]">{t(label)}</p>
            <p className="mono-num mt-0.5 text-[24px] font-black text-ink">{value ?? "—"}</p>
          </div>
        ))}
      </div>

      {/* Per-factor insights */}
      {data.ft && (
        <div className="px-[22px] pt-6">
          <p className="eyebrow text-ink3 mb-1">{t("Insights")}</p>
          {FACTORS.map((f) => (
            <FactorInsight
              key={f.key}
              label={f.titleKey}
              icon={f.icon}
              invert={f.invert}
              current={data.ft!.current[f.key]}
              previous={data.ft!.previousCount ? data.ft!.previous[f.key] : null}
            />
          ))}
        </div>
      )}

      {/* Deload recommendation (heuristic) */}
      {showDeload && (
        <div className="mx-[22px] mt-5 bg-accentSoft px-4 py-3.5">
          <p className="eyebrow text-accentInk mb-1">{t("Recommendation")}</p>
          <p className="text-[13px] leading-relaxed text-ink">
            {t("Your recovery is trending down. Consider a deload — drop volume to ~70% and keep intensity moderate.")}
          </p>
          <button
            type="button"
            onClick={() => navigate("/profile/volume-targets")}
            className="mt-2.5 bg-ink px-3.5 py-2.5 text-white"
          >
            <span className="eyebrow text-[11px]">{t("Adjust volume targets")}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function FactorInsight({
  label,
  icon: Icon,
  invert,
  current,
  previous,
}: {
  label: string;
  icon: LucideIcon;
  invert: boolean;
  current: number;
  previous: number | null;
}) {
  const { t } = useTranslation();
  const effective = invert ? 10 - current : current; // higher = better
  const level = effective >= 7 ? "good" : effective >= 4.5 ? "moderate" : "poor";
  const tone = level === "good" ? { bg: "bg-ok", text: "text-ok", key: "GOOD" } : level === "moderate" ? { bg: "bg-warn", text: "text-warn", key: "MODERATE" } : { bg: "bg-bad", text: "text-bad", key: "POOR" };
  const delta = previous != null ? current - previous : null;
  const trend = delta == null || Math.abs(delta) < 0.3 ? "" : delta > 0 ? ` · ↑ ${t("from last week")}` : ` · ↓ ${t("from last week")}`;

  return (
    <div className="flex items-start gap-3 border-t border-hairline py-3.5">
      <div className={`grid h-8 w-8 shrink-0 place-items-center text-white ${tone.bg}`}>
        <Icon size={16} strokeWidth={2.25} />
      </div>
      <div className="flex-1">
        <div className="flex items-baseline gap-2.5">
          <span className="font-display text-[14px] font-bold text-ink">{t(label)}</span>
          <span className={`eyebrow text-[9px] ${tone.text}`}>{t(tone.key)}</span>
        </div>
        <p className="mt-1 text-[12px] leading-snug text-ink2">
          {current.toFixed(1)}/10 {t("avg this week")}
          {trend}
        </p>
      </div>
    </div>
  );
}

// Lightweight inline sparkline (scores 0–100). Kept inline so Recovery stays out
// of the Recharts code-split bundle (Recharts only loads behind the lazy Analytics tab).
function Sparkline({ points }: { points: number[] }) {
  const w = 320;
  const h = 64;
  const pad = 4;
  const stepX = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const xy = points.map((p, i) => [pad + i * stepX, pad + (1 - p / 100) * (h - pad * 2)] as const);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${xy[xy.length - 1][0].toFixed(1)} ${h} L${xy[0][0].toFixed(1)} ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 w-full" role="img" aria-label="Recovery trend">
      <path d={area} className="fill-accentSoft" />
      <path d={line} className="fill-none stroke-ink" strokeWidth={2} />
      {xy.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2.5} className="fill-ink" />
      ))}
    </svg>
  );
}
