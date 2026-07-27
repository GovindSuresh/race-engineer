import Link from "next/link";

/** Sticky branded header. Blurred translucent background so content scrolling
 *  under it stays faintly visible rather than being cut off by a hard bar.
 *
 *  `children` is the right-hand control area — team selector, driver filter
 *  chips, toggles. Keeping filters up here rather than beside each chart means
 *  one set of controls governs the whole dashboard, and they stay reachable
 *  however far down you've scrolled. */
export function AppHeader({
  /** Page name, e.g. "Race Analysis". */
  title,
  /** Context line beside the title, e.g. the event or file name. */
  context,
  children,
}: {
  title: string;
  context?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/[0.93] backdrop-blur-md">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-4 px-5 py-[11px]">
        <div className="flex items-baseline gap-2.5">
          <Link
            href="/"
            className="whitespace-nowrap font-display text-[23px] font-bold uppercase tracking-[0.04em] text-text transition-colors hover:text-amber"
          >
            {title}
          </Link>
          {context && (
            <span className="whitespace-nowrap font-display text-[15px] uppercase tracking-[0.1em] text-muted">
              {context}
            </span>
          )}
        </div>
        <div className="flex-1" />
        {children}
      </div>
    </header>
  );
}
