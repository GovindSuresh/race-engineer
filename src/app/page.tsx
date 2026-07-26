import Link from "next/link";
import { SectionHeading } from "@/components/SectionHeading";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="flex flex-col items-center gap-1">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-amber-600 dark:text-amber-400">
          Chaps Motorsport
        </span>
        <SectionHeading as="h1" title="Race Engineer" />
      </div>
      <div className="flex flex-col gap-4 sm:flex-row">
        <Link
          href="/stint-planner"
          className="flex w-64 flex-col gap-1 rounded-lg border border-zinc-200 bg-white p-6 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
        >
          <span className="font-display text-lg font-semibold uppercase tracking-wide">
            Stint Planner
          </span>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            Upload a Garage61 practice export to see pace, fuel, and stint
            data.
          </span>
        </Link>
        <Link
          href="/race-analysis"
          className="flex w-64 flex-col gap-1 rounded-lg border border-zinc-200 bg-white p-6 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
        >
          <span className="font-display text-lg font-semibold uppercase tracking-wide">
            Race Analysis
          </span>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            Upload an iRacing race export for full-field pace, gap trends,
            and driver report cards.
          </span>
        </Link>
      </div>
    </div>
  );
}
