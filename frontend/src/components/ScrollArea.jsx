/** Bounded area with its own scrollbar (65vh); print CSS lifts the limit. */
export default function ScrollArea({ children, label }) {
  return (
    // tabIndex lets keyboard users scroll the area.
    <div className="sr-scroll" tabIndex={0} role="region" aria-label={label}>
      {children}
    </div>
  );
}
