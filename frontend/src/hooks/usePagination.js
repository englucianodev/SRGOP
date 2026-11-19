import { useState } from 'react';

/**
 * Client-side pages of `items`. A new `resetKey` (e.g. the search text) goes back to page 1;
 * when the list shrinks below the current page, the last existing page is shown.
 * `from`/`to` are 1-based positions on screen (0 when the list is empty).
 */
export default function usePagination(items, pageSize = 12, resetKey) {
  const [page, setPage] = useState(1);
  const [key, setKey] = useState(resetKey);
  const keyChanged = key !== resetKey;
  if (keyChanged) {
    // Adjusting state while rendering: React re-renders right away with page 1.
    setKey(resetKey);
    setPage(1);
  }
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(keyChanged ? 1 : page, pageCount);
  const start = (current - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);
  return {
    page: current,
    pageCount,
    pageItems,
    setPage,
    total,
    from: total ? start + 1 : 0,
    to: start + pageItems.length,
  };
}
