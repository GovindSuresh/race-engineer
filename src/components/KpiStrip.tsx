export interface KpiCardData {
  label: string;
  value: string;
  sublabel?: string;
}

/** Presentational-only headline-numbers strip — typed data in, JSX out.
 *  Any derivation (what a "value"/"sublabel" should say) happens before
 *  this component is called, not inside it. */
export function KpiStrip({ items }: { items: KpiCardData[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
            {item.label}
          </div>
          <div className="mt-1 font-mono text-xl font-semibold">{item.value}</div>
          {item.sublabel && (
            <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {item.sublabel}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
