interface Option {
  key: string;
  text: string;
}

/** Radio list for an MCQ. `correctKey` (after checking) colours the right and wrong choices. */
export function OptionList({
  name,
  options,
  value,
  onChange,
  disabled,
  correctKey,
}: {
  name: string;
  options: Option[];
  value: string | undefined;
  onChange: (key: string) => void;
  disabled?: boolean;
  correctKey?: string;
}) {
  return (
    <div className="mt-3 space-y-2">
      {options.map((o) => {
        const chosen = value === o.key;
        let tone = chosen ? "border-brand-600 bg-brand-50" : "border-slate-200 hover:border-slate-300";
        if (correctKey) {
          if (o.key === correctKey) tone = "border-emerald-500 bg-emerald-50";
          else if (chosen) tone = "border-red-400 bg-red-50";
        }
        return (
          <label
            key={o.key}
            className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm ${tone} ${disabled ? "cursor-default" : ""}`}
          >
            <input
              type="radio"
              name={name}
              value={o.key}
              checked={chosen}
              disabled={disabled}
              onChange={() => onChange(o.key)}
              className="mt-0.5 accent-brand-700"
            />
            <span>
              <span className="font-medium">{o.key}.</span> {o.text}
            </span>
          </label>
        );
      })}
    </div>
  );
}
