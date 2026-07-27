export interface KpiCardData {
  label: string;
  value: string;
  sublabel?: string;
  /** Optional emphasis on the value. Reserved semantic roles from the design
   *  tokens, not free-form color: "hero" (purple) marks the headline result,
   *  "good" (green) a positive outcome, "warn" (amber) missing/degraded data.
   *  Left undefined, the value renders in plain text ink. */
  tone?: "hero" | "good" | "warn";
}

const TONE_CLASS: Record<NonNullable<KpiCardData["tone"]>, string> = {
  hero: "text-purple",
  good: "text-pgreen",
  warn: "text-amber",
};

/** Presentational-only headline-numbers strip — typed data in, JSX out.
 *  Any derivation (what a "value"/"sublabel" should say) happens before
 *  this component is called, not inside it. */
export function KpiStrip({ items }: { items: KpiCardData[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(142px,1fr))] gap-2.5">
      {items.map((item) => (
        <div key={item.label} className="rounded-md border border-line bg-panel px-4 py-3">
          <div className="font-display text-[13px] uppercase tracking-[0.1em] text-muted">
            {item.label}
          </div>
          <div
            className={`mt-0.5 font-mono text-[21px] font-semibold tabular-nums ${
              item.tone ? TONE_CLASS[item.tone] : "text-text"
            }`}
          >
            {item.value}
          </div>
          {item.sublabel && <div className="mt-0.5 text-[11px] text-faint">{item.sublabel}</div>}
        </div>
      ))}
    </div>
  );
}
