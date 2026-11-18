import { useEffect, useRef } from 'react';

const ARRIVAL_MS = 1500;

/**
 * Keys that showed up after the first render, for ARRIVAL_MS; items already on screen when the
 * page opened are drawn quietly, like the simulator panel.
 */
export function useArrivals(keys) {
  const seen = useRef(null);
  const now = Date.now();
  const fresh = new Set(
    seen.current ? keys.filter((k) => !seen.current.has(k) || now - seen.current.get(k) < ARRIVAL_MS) : [],
  );
  useEffect(() => {
    const first = !seen.current;
    const next = new Map(seen.current || []);
    for (const k of keys) if (!next.has(k)) next.set(k, first ? 0 : Date.now());
    seen.current = next;
  });
  return fresh;
}
