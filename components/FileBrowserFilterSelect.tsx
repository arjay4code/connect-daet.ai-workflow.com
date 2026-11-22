'use client';

import {
  FILE_BROWSER_FILTERS,
  isFileBrowserFilter,
  type FileBrowserFilter,
} from '@/lib/workflow/file-browser';

export default function FileBrowserFilterSelect({
  value,
  onChange,
}: {
  value: FileBrowserFilter;
  onChange: (value: FileBrowserFilter) => void;
}) {
  return (
    <label className="flex h-12 w-full items-center gap-3 rounded-full border border-warm-border bg-card px-4 transition-colors focus-within:border-clay">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-text">
        Status
      </span>
      <select
        aria-label="Filter files by status"
        value={value}
        onChange={(event) => {
          const nextFilter = event.currentTarget.value;
          if (isFileBrowserFilter(nextFilter)) onChange(nextFilter);
        }}
        className="min-w-0 flex-1 appearance-none bg-transparent text-sm text-warm-text outline-none"
      >
        {FILE_BROWSER_FILTERS.map((filter) => (
          <option key={filter.value} value={filter.value}>
            {filter.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        className="h-4 w-4 shrink-0 text-muted-text"
        viewBox="0 0 20 20"
        fill="none"
      >
        <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}
