/** GitHub-style consistency grid: columns = weeks, rows = weekday. */
export function ConsistencyHeatmap({ data }: { data: { date: number; count: number }[] }) {
  // group into weeks of 7 (data is oldest→newest, length divisible by 7)
  const weeks: { date: number; count: number }[][] = [];
  for (let i = 0; i < data.length; i += 7) weeks.push(data.slice(i, i + 7));

  const color = (c: number) =>
    c <= 0 ? "bg-chip" : c === 1 ? "bg-accentSoft" : c === 2 ? "bg-fade" : "bg-accent";

  return (
    <div className="flex gap-[3px] overflow-x-auto">
      {weeks.map((week, wi) => (
        <div key={wi} className="flex flex-col gap-[3px]">
          {week.map((d) => (
            <div
              key={d.date}
              title={new Date(d.date).toISOString().slice(0, 10) + ` · ${d.count}`}
              className={`h-3 w-3 ${color(d.count)}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
