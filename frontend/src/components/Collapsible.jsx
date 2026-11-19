import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Report block that opens and closes. The body always stays in the DOM and the
 * title lives outside the toggle button, so printing shows everything expanded.
 */
export default function Collapsible({
  title,
  subtitle,
  chips = [],
  defaultOpen = true,
  className = '',
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <section className={`panel collapsible ${className}${open ? '' : ' is-collapsed'}`}>
      <div className="collapsible-head" onClick={() => setOpen((v) => !v)}>
        <div className="collapsible-title">
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
          {!!chips.length && (
            <div className="collapsible-chips">
              {chips.map((chip) => (
                <span key={chip} className="tag">
                  {chip}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          className="icon-button collapsible-toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={`${open ? 'Recolher' : 'Expandir'} ${title}`}
        >
          <ChevronDown size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="collapsible-body" id={bodyId}>
        {children}
      </div>
    </section>
  );
}
