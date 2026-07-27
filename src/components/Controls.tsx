"use client";

/** A toggleable filter chip carrying a series color — used for driver
 *  filters, where the dot has to match that driver's color in every chart.
 *  When off, the chip and dot go grey but the `color` prop is unchanged:
 *  color identity follows the driver, never their position in the list. */
export function Chip({
  label,
  color,
  active,
  onToggle,
}: {
  label: string;
  color: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`flex select-none items-center gap-[7px] rounded-sm border px-[11px] py-1 font-display text-sm uppercase tracking-[0.06em] transition-colors ${
        active ? "text-text" : "border-line2 text-muted hover:text-text"
      }`}
      style={active ? { borderColor: color } : undefined}
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: active ? color : "var(--faint)" }}
      />
      {label}
    </button>
  );
}

/** A binary on/off control (e.g. "Clean laps only"). Goes green when on —
 *  the reserved "active / good" role, distinct from the amber brand accent. */
export function Toggle({
  label,
  active,
  onToggle,
  disabled,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      disabled={disabled}
      className={`select-none whitespace-nowrap rounded-sm border px-2.5 py-1 font-display text-[13px] uppercase tracking-[0.06em] transition-colors ${
        disabled
          ? "cursor-not-allowed border-line text-faint"
          : active
            ? "border-pgreen text-pgreen"
            : "border-line2 text-muted hover:text-text"
      }`}
    >
      {label}
    </button>
  );
}

const TAG_TONE = {
  neutral: "border-line2 text-muted",
  wet: "border-wet text-wet",
  night: "border-[#818CF8] text-[#818CF8]",
  warn: "border-amber text-amber",
  good: "border-pgreen text-pgreen",
} as const;

/** A small inline status label for a table row — "wet", "no telemetry",
 *  "driver swap". Always carries text, never color alone. */
export function Tag({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: keyof typeof TAG_TONE;
}) {
  return (
    <span
      className={`rounded-sm border px-[7px] py-px font-display text-[11px] uppercase tracking-[0.08em] ${TAG_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

/** Native select, restyled to match the chips/toggles around it. */
export function Select({
  value,
  onChange,
  children,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className={`rounded-sm border border-line2 bg-panel2 px-2 py-1 font-display text-sm uppercase tracking-[0.05em] text-text ${className ?? ""}`}
    >
      {children}
    </select>
  );
}
