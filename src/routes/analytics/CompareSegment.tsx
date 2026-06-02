import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { db } from "@core/db/db";
import { exerciseE1RMSeries } from "@core/db/analytics";
import type { Exercise } from "@core/models/types";
import { localizedExerciseName, weightUnit } from "@app/lib/format";

const COLOR_A = "#171614"; // ink
const COLOR_B = "#C64D2A"; // accent

export function CompareSegment() {
  const { t, i18n } = useTranslation();
  const unit = weightUnit();
  const [a, setA] = useState("");
  const [b, setB] = useState("");

  const exercises = useLiveQuery(
    async (): Promise<Exercise[]> => {
      const finished = await db.sessions.where("durationSeconds").above(0).toArray();
      const sxs = await db.sessionExercises.where("sessionId").anyOf(finished.map((s) => s.id)).toArray();
      const ids = [...new Set(sxs.map((s) => s.exerciseId).filter((x): x is string => !!x))];
      const list = (await db.exercises.bulkGet(ids)).filter((e): e is Exercise => !!e);
      return list.sort((x, y) =>
        localizedExerciseName(x, i18n.language).localeCompare(localizedExerciseName(y, i18n.language)),
      );
    },
    [i18n.language],
    [] as Exercise[],
  );

  const aId = a || exercises[0]?.id || "";
  const bId = b || exercises[1]?.id || "";

  const seriesA = useLiveQuery(() => (aId ? exerciseE1RMSeries(aId) : Promise.resolve([])), [aId], []);
  const seriesB = useLiveQuery(() => (bId ? exerciseE1RMSeries(bId) : Promise.resolve([])), [bId], []);

  // Union the two series by timestamp; connectNulls bridges non-overlapping dates.
  const byDate = new Map<number, { t: number; a?: number; b?: number }>();
  for (const p of seriesA) byDate.set(p.date, { ...(byDate.get(p.date) ?? { t: p.date }), t: p.date, a: p.value });
  for (const p of seriesB) byDate.set(p.date, { ...(byDate.get(p.date) ?? { t: p.date }), t: p.date, b: p.value });
  const data = [...byDate.values()].sort((x, y) => x.t - y.t);

  const lastA = seriesA.at(-1)?.value;
  const lastB = seriesB.at(-1)?.value;

  if (exercises.length < 2) {
    return (
      <p className="px-[22px] py-10 text-center text-[13px] text-ink2">
        {t("Log working sets in two exercises to compare their trends.")}
      </p>
    );
  }

  return (
    <div className="px-[22px] py-5">
      <div className="mb-5 space-y-2">
        <Picker color={COLOR_A} value={aId} exclude={bId} onChange={setA} exercises={exercises} lang={i18n.language} />
        <Picker color={COLOR_B} value={bId} exclude={aId} onChange={setB} exercises={exercises} lang={i18n.language} />
      </div>

      <div className="flex items-end gap-8">
        <Stat color={COLOR_A} label={t("e1RM")} value={lastA} unit={unit} />
        <Stat color={COLOR_B} label={t("e1RM")} value={lastB} unit={unit} />
      </div>

      <div className="mt-4 h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="rgba(23,22,20,0.07)" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={["dataMin", "dataMax"]}
              scale="time"
              tickFormatter={(ts) => new Date(ts).toLocaleDateString(i18n.language, { month: "short", day: "numeric" })}
              tick={{ fontSize: 10, fill: "#A8A299", fontFamily: "Geist Mono" }}
              stroke="rgba(23,22,20,0.1)"
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#A8A299", fontFamily: "Geist Mono" }}
              stroke="rgba(23,22,20,0.1)"
              width={38}
              domain={["auto", "auto"]}
            />
            <Line type="monotone" dataKey="a" stroke={COLOR_A} strokeWidth={2} dot={{ r: 2.5, fill: COLOR_A }} connectNulls />
            <Line type="monotone" dataKey="b" stroke={COLOR_B} strokeWidth={2} dot={{ r: 2.5, fill: COLOR_B }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Picker({
  color, value, exclude, onChange, exercises, lang,
}: {
  color: string;
  value: string;
  exclude: string;
  onChange: (v: string) => void;
  exercises: Exercise[];
  lang: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-3 w-3 shrink-0" style={{ backgroundColor: color }} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-rule bg-card px-3 py-2.5 font-display font-semibold text-ink outline-none"
      >
        {exercises.map((e) => (
          <option key={e.id} value={e.id} disabled={e.id === exclude}>
            {localizedExerciseName(e, lang)}
          </option>
        ))}
      </select>
    </div>
  );
}

function Stat({ color, label, value, unit }: { color: string; label: string; value?: number; unit: string }) {
  return (
    <div>
      <p className="eyebrow text-[9px]" style={{ color }}>{label}</p>
      <p className="mono-num text-[22px] font-black text-ink">
        {value != null ? Math.round(value) : "—"}
        <span className="ml-1 text-[12px] font-normal text-ink3">{unit}</span>
      </p>
    </div>
  );
}
