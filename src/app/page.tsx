import Link from "next/link";

const ENTRY_POINTS = [
  {
    href: "/stint-planner",
    index: "01",
    title: "Stint Planner",
    tagline: "before the race",
    body: "Compare up to four Garage61 practice exports side by side — pace, fuel burn, stint length, and whether a different fuel strategy actually paid off.",
  },
  {
    href: "/race-analysis",
    index: "02",
    title: "Race Analysis",
    tagline: "after the race",
    body: "Drop in an iRacing lap chart for full-field pace, track position, stint timelines, and how your pace read against the field at every point of the race.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 py-16">
      <div className="w-full max-w-[860px]">
        <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.3em] text-amber">
          {"/// Chaps Motorsport"}
        </div>
        <h1 className="font-display text-[clamp(44px,9vw,76px)] font-bold uppercase leading-[0.92] tracking-[0.02em] text-text">
          Race
          <br />
          Engineer
        </h1>
        <p className="mt-5 max-w-[56ch] text-muted">
          A pit-wall tool for iRacing endurance teams. Upload a session, get the pace, fuel and
          strategy picture back. Everything is processed in your browser — nothing is uploaded.
        </p>

        <div className="mt-11 grid gap-3 sm:grid-cols-2">
          {ENTRY_POINTS.map((entry) => (
            <Link
              key={entry.href}
              href={entry.href}
              className="group flex flex-col rounded-md border border-line bg-panel p-6 transition-colors hover:border-amber hover:bg-panel2"
            >
              <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.28em] text-faint transition-colors group-hover:text-amber">
                {entry.index} · {entry.tagline}
              </div>
              <span className="font-display text-[26px] font-bold uppercase leading-none tracking-[0.03em] text-text">
                {entry.title}
              </span>
              <span className="mt-2.5 text-[13px] leading-relaxed text-muted">{entry.body}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
