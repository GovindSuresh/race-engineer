export function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-md border border-line bg-panel p-4 ${className ?? ""}`}>
      {children}
    </div>
  );
}

/** Optional in-panel heading — a smaller, quieter tier than SectionHeading,
 *  for when one section holds several panels that each need naming (the
 *  prototype's `.panel h3` + `.ph` pair). */
export function PanelHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3">
      <h3 className="font-display text-lg font-semibold uppercase tracking-[0.06em] text-text">
        {title}
      </h3>
      {hint && <p className="mt-0.5 text-xs text-faint">{hint}</p>}
    </div>
  );
}
