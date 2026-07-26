export interface SectionHeadingProps {
  as?: "h1" | "h2";
  /** Short uppercase label above the title (e.g. "PACE", "STRATEGY") — the
   *  motorsport-timing-screen touch, purely decorative/categorical. Omit
   *  for headings that don't need one (e.g. a page's h1). */
  eyebrow?: string;
  title: string;
  subtitle?: string;
}

/** Presentational-only heading — typed data in, JSX out. Centralizes the
 *  display-font/eyebrow treatment so every section across both pages reads
 *  consistently instead of each page inventing its own heading markup. */
export function SectionHeading({ as: Tag = "h2", eyebrow, title, subtitle }: SectionHeadingProps) {
  return (
    <div className="flex flex-col gap-1">
      {eyebrow && (
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-amber-600 dark:text-amber-400">
          {eyebrow}
        </span>
      )}
      <Tag
        className={
          Tag === "h1"
            ? "font-display text-3xl font-semibold uppercase tracking-wide text-zinc-900 dark:text-zinc-50"
            : "font-display text-xl font-semibold uppercase tracking-wide text-zinc-900 dark:text-zinc-50"
        }
      >
        {title}
      </Tag>
      {subtitle && (
        <p className="max-w-3xl text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>
      )}
    </div>
  );
}
