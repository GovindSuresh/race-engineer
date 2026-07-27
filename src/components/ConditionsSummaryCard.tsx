import type { ConditionsSummary } from "@/core";
import { Tag } from "@/components/Controls";

function wetness(maxTrackWetnessPct: number): { label: string; tone: "neutral" | "wet" } {
  if (maxTrackWetnessPct === 0) return { label: "Dry", tone: "neutral" };
  if (maxTrackWetnessPct < 30) return { label: "Damp", tone: "wet" };
  return { label: "Wet", tone: "wet" };
}

/** Presentational-only conditions readout, built from Garage61's real
 *  per-lap weather columns — not a stand-in for track/car metadata, which
 *  Garage61 exports simply don't carry. */
export function ConditionsSummaryCard({ conditions }: { conditions: ConditionsSummary }) {
  const wet = wetness(conditions.maxTrackWetnessPct);
  const stats = [
    { label: "Track", value: `${conditions.trackTempMinC.toFixed(1)}–${conditions.trackTempMaxC.toFixed(1)}°C` },
    { label: "Air", value: `${conditions.airTempMinC.toFixed(1)}–${conditions.airTempMaxC.toFixed(1)}°C` },
    { label: "Wind", value: `${conditions.avgWindVelocityMs.toFixed(1)} m/s` },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
      {stats.map((s) => (
        <span key={s.label} className="flex items-baseline gap-1.5">
          <span className="font-display text-[11px] uppercase tracking-[0.1em] text-faint">
            {s.label}
          </span>
          <span className="font-mono text-[11px] tabular-nums text-muted">{s.value}</span>
        </span>
      ))}
      <Tag tone={wet.tone}>{wet.label}</Tag>
    </div>
  );
}
