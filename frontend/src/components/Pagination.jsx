import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './UI';

const WINDOW = 1; // pages shown on each side of the current one
const SHOW_ALL_UP_TO = 5;

/** Page numbers to show: first, last and a window around the current page; null marks a gap. */
export function pageWindow(page, pageCount) {
  const shown = [];
  for (let n = 1; n <= pageCount; n += 1) {
    const keep =
      pageCount <= SHOW_ALL_UP_TO || n === 1 || n === pageCount || Math.abs(n - page) <= WINDOW;
    if (keep) shown.push(n);
    else if (shown[shown.length - 1] !== null) shown.push(null);
  }
  return shown;
}

/** "Mostrando 1–12 de 40" plus Anterior / page numbers / Próxima (only when there is more than one page). */
export default function Pagination({ page, pageCount, from, to, total, onChange }) {
  return (
    <nav className="pagination" aria-label="Paginação">
      <span className="pagination-count">
        Mostrando {from}–{to} de {total}
      </span>
      {pageCount > 1 && (
        <div className="pagination-pages">
          <Button variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
            <ChevronLeft size={16} aria-hidden="true" />
            Anterior
          </Button>
          <span className="pagination-numbers">
            {pageWindow(page, pageCount).map((n, index) =>
              n === null ? (
                <span key={`gap-${index}`} className="pagination-gap" aria-hidden="true">
                  …
                </span>
              ) : (
                <button
                  key={n}
                  type="button"
                  className="pagination-number"
                  aria-label={`Página ${n}`}
                  aria-current={n === page ? 'page' : undefined}
                  onClick={() => onChange(n)}
                >
                  {n}
                </button>
              ),
            )}
          </span>
          <Button
            variant="secondary"
            disabled={page >= pageCount}
            onClick={() => onChange(page + 1)}
          >
            Próxima
            <ChevronRight size={16} aria-hidden="true" />
          </Button>
        </div>
      )}
    </nav>
  );
}
