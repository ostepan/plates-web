import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { db } from "@core/db/db";
import { exerciseE1RMSeries } from "@core/db/analytics";
import { Performance } from "@core/calc/performance";
import type { Exercise } from "@core/models/types";
import { localizedExerciseName, weightUnit } from "@app/lib/format";

export function ExerciseSegment() {
  const { t, i18n } = useTranslation();
  const unit = weightUnit();
  const [selected, setSelected] = useState<string>("");

  const exercises = useLiveQuery(
    async (): Promise<Exercise[]> => {
      const finished = await db.sessions.where("durationSeconds").above(0).toArray();
      const sxs = await db.sessionExercises.where("sessionId").anyOf(finished.map((s) => s.id)).toArray();
      const ids = [...new Set(sxs.map((s) => s.exerciseId).filter((x): x is string => !!x))];
      const list = (await db.exercises.bulkGet(ids)).filter((e): e is Exercise => !!e);
      return list.sort((a, b) => localizedExerciseName(a, i18n.language).localeCompare(localizedExerciseName(b, i18n.language)));
    },
    [i18n.language],
    [] as Exercise[],
  );

  const exId = selected || exercises[0]?.id || "";
  const series = useLiveQuery(() => (exId ? exerciseE1RMSeries(exId) : Promise.resolve([])), [exId], []);

  const velocity = Performance.velocity(series);
  const plateau = Performance.detectPlateau(series);
  const proj = series.length ? Performance.predict1RM(series, 30) : null;

  const data: { t: number; e1rm?: number; proj?: number }[] = series.map((p) => ({ t: p.date, e1rm: p.value }));
  if (proj && data.length) {
    data[data.length - 1] = { ...data[data.length - 1], proj: data[data.length - 1].e1rm };
    data.push({ t: proj.date, proj: Math.round(proj.value * 10) / 10 });
  }

  return (
    <div className="px-[22px] py-5">
      {exercises.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-ink2">
          {t("Complete a working set in this exercise to see the trend appear.")}
        </p>
      ) : (
        <>
          <select
            value={exId}
            onChange={(e) => setSelected(e.target.value)}
            className="mb-5 w-full border border-rule bg-card px-3 py-2.5 font-display font-semibold text-ink outline-none"
          >
            {exercises.map((e) => (
              <option key={e.id} value={e.id}>
                {localizedExerciseName(e, i18n.language)}
              </option>
            ))}
          </select>

          <div className="flex items-end gap-6">
            <div>
              <p className="eyebrow text-ink3 text-[9px]">{t("e1RM")}</p>
              <p className="mono-num text-[24px] font-black text-ink">
                {series.length ? Math.round(series[series.length - 1].value) : "—"}
                <span className="ml-1 text-[13px] font-normal text-ink3">{unit}</span>
              </p>
            </div>
            {velocity && (
              <div>
                <p className="eyebrow text-ink3 text-[9px]">{t("PER MONTH")}</p>
                <p className={`mono-num text-[17px] font-bold ${velocity.unitsPerMonth >= 0 ? "text-ok" : "text-bad"}`}>
                  {velocity.unitsPerMonth >= 0 ? "+" : ""}
                  {velocity.unitsPerMonth.toFixed(1)}
                </p>
              </div>
            )}
            {plateau && <span className="eyebrow ml-auto border border-warn px-1.5 py-0.5 text-warn">{t("PLATEAU")}</span>}
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
                <Line type="monotone" dataKey="e1rm" stroke="#171614" strokeWidth={2} dot={{ r: 2.5, fill: "#171614" }} connectNulls />
                <Line type="monotone" dataKey="proj" stroke="#C64D2A" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {proj && (
            <p className="mono-num mt-2 text-[11px] text-ink3">
              {t("PROJECTED")} · {Math.round(proj.value)} {unit} · +30d
            </p>
          )}
        </>
      )}
    </div>
  );
}
