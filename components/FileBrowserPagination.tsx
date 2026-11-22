'use client';

export default function FileBrowserPagination({
  start,
  end,
  totalItems,
  page,
  totalPages,
  onPageChange,
}: {
  start: number;
  end: number;
  totalItems: number;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <nav aria-label="Document pages" className="mt-5 flex flex-wrap items-center justify-between gap-3">
      <span className="text-[11px] text-muted-text">
        Showing {start}–{end} of {totalItems} · Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="rounded-full border border-warm-border px-4 py-2 text-xs font-medium text-warm-text transition-colors hover:bg-sidebar disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="rounded-full border border-warm-border px-4 py-2 text-xs font-medium text-warm-text transition-colors hover:bg-sidebar disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </nav>
  );
}
