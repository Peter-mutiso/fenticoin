export interface FilterOption {
  value: string;
  label: string;
}

/** A row of selectable filter chips — used for status/type filters on Bet History and Transactions. `value === null` renders as "All". */
export function FilterBar({
  options,
  value,
  onChange,
}: {
  options: FilterOption[];
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filters">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
          value === null ? 'bg-brand-500 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
        }`}
      >
        All
      </button>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
            value === option.value ? 'bg-brand-500 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
