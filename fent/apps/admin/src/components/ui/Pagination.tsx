import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Simple prev/next control over a `limit`/`offset` page, matching what every list endpoint in this API actually supports. */
export function Pagination({
  offset,
  limit,
  itemCount,
  onOffsetChange,
}: {
  offset: number;
  limit: number;
  /** Number of items returned in the current page — used to infer whether a next page might exist (a full page suggests more; a short page means we're at the end). */
  itemCount: number;
  onOffsetChange: (nextOffset: number) => void;
}) {
  const hasPrevious = offset > 0;
  const hasNext = itemCount === limit;

  if (!hasPrevious && !hasNext) return null;

  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <button
        type="button"
        disabled={!hasPrevious}
        onClick={() => onOffsetChange(Math.max(0, offset - limit))}
        className="flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Previous
      </button>
      <button
        type="button"
        disabled={!hasNext}
        onClick={() => onOffsetChange(offset + limit)}
        className="flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
