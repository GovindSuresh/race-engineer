export interface SectionHeadingProps {
  as?: "h1" | "h2";
  /** Short uppercase label above the title, e.g. "01 · SESSION" — the
   *  motorsport-timing-screen touch. Numbering the sections is deliberate:
   *  it makes a long scrolling dashboard feel like a structured document
   *  rather than a pile of panels. Omit where there's nothing to number. */
  eyebrow?: string;
  title: string;
  /** Short phrase set inline beside the title, e.g. "every lap against the
   *  field" — the one-line gloss on what the section is for. */
  tagline?: string;
  /** Longer explanatory note below, for the "how to read this chart"
   *  paragraphs. Rendered in the prose font, not the display font. */
  note?: React.ReactNode;
}

/** Presentational-only section heading. Centralizes the
 *  eyebrow/title/tagline/note treatment so every section across both pages
 *  reads consistently instead of each page inventing its own markup. */
export function SectionHeading({
  as: Tag = "h2",
  eyebrow,
  title,
  tagline,
  note,
}: SectionHeadingProps) {
  return (
    <div className="flex flex-col">
      {eyebrow && (
        <div className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.28em] text-amber">
          {eyebrow}
        </div>
      )}
      <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
        <Tag
          className={
            Tag === "h1"
              ? "font-display text-[34px] font-bold uppercase leading-none tracking-[0.03em] text-text"
              : "font-display text-[29px] font-bold uppercase leading-none tracking-[0.03em] text-text"
          }
        >
          {title}
        </Tag>
        {tagline && <span className="text-[13px] text-muted">{tagline}</span>}
      </div>
      {note && <p className="mt-2.5 max-w-[104ch] text-xs leading-relaxed text-faint">{note}</p>}
    </div>
  );
}
