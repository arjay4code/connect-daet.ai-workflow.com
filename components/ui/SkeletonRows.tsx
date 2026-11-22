// Shimmering placeholder rows shown while a list loads.
export default function SkeletonRows({ rows = 3, label = 'Loading…' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} aria-hidden="true" className="flex items-center gap-4 rounded-2xl border border-warm-border bg-card px-5 py-5 max-md:px-3.5">
          <span className="ui-skeleton h-12 w-12 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <span className="ui-skeleton block h-3 w-1/3 rounded-full" />
            <span className="ui-skeleton block h-3 w-2/3 rounded-full" />
          </div>
          <span className="ui-skeleton hidden h-7 w-24 rounded-full sm:block" />
        </div>
      ))}
    </div>
  );
}
