/** Flat underline segmented control. `dense` is the secondary tier (smaller, chip-filled). */
export function IronSegmented<T extends string>({
  value,
  options,
  onChange,
  dense = false,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  dense?: boolean;
}) {
  if (dense) {
    return (
      <div className="mx-[22px] mt-2.5 flex border border-rule">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={`flex-1 py-2 ${active ? "bg-ink text-white" : "text-ink2"}`}
            >
              <span className="text-[10px] font-bold uppercase tracking-[0.08em]">{o.label}</span>
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div className="flex border-b border-hairline">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`flex-1 py-3 ${active ? "-mb-px border-b-2 border-ink text-ink" : "text-ink3"}`}
          >
            <span className="eyebrow text-[11px]">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
