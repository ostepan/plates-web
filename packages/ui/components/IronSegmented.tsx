/** Flat underline segmented control. */
export function IronSegmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
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
