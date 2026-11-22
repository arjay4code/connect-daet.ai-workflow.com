'use client';

import {
  FILE_BROWSER_SORT_OPTIONS,
  isFileBrowserSort,
  type FileBrowserSort,
} from '@/lib/workflow/file-browser';

export default function FileBrowserSortSelect({
  value,
  onChange,
}: {
  value: FileBrowserSort;
  onChange: (value: FileBrowserSort) => void;
}) {
  return (
    <label className="flex h-12 w-full items-center gap-3 rounded-full border border-warm-border bg-card px-4 transition-colors focus-within:border-clay">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-text">
        Sort
      </span>
      <select
        aria-label="Sort files"
        value={value}
        onChange={(event) => {
          const nextSort = event.currentTarget.value;
          if (isFileBrowserSort(nextSort)) onChange(nextSort);
        }}
        className="min-w-0 flex-1 appearance-none bg-transparent text-sm text-warm-text outline-none"
      >
        {FILE_BROWSER_SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-text" viewBox="0 0 20 20" fill="none">
        <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}
