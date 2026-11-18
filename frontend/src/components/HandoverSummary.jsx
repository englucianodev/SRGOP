import { useState } from 'react';
import { Printer } from 'lucide-react';
import { useData } from '../hooks/useData';
import { Button, Modal, Loading, Empty } from './UI';
import { fmtDateTime, fmtTime } from '../utils/format';
const HOUR_MINUTES = 60;
const DAY_MINUTES = 24 * HOUR_MINUTES;
export const waitLabel = (minutes) => {
  const total = Math.max(0, Math.floor(minutes || 0));
  if (total < 1) return 'menos de 1 min';
  if (total < HOUR_MINUTES) return `${total} min`;
  if (total < DAY_MINUTES)
    return `${Math.floor(total / HOUR_MINUTES)} h ${String(total % HOUR_MINUTES).padStart(2, '0')} min`;
  return `${Math.floor(total / DAY_MINUTES)} d ${Math.floor((total % DAY_MINUTES) / HOUR_MINUTES)} h`;
};
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
// Each section maps one list of the summary to a title line and a detail line.
const SECTIONS = [
  {
    title: 'Ocorrências aguardando',
    empty: 'Nenhuma ocorrência aguardando despacho ou aceite.',
    items: (s) => s.occurrences.items,
    total: (s) => s.totals.occurrences,
    line: (o) => `${o.protocol} · ${o.crimeType}`,
    detail: (o) =>
      `${o.priority} · ${o.status} · ${o.city} · aguardando há ${waitLabel(o.waitingMinutes)}`,
  },
  {
    title: 'Atendimentos em andamento',
    empty: 'Nenhum atendimento em andamento.',
    items: (s) => s.attendances,
    total: (s) => s.totals.attendances,
    line: (a) => `${a.protocol} · ${a.crew || 'Guarnição não informada'}`,
    detail: (a) => `${a.city} · em atendimento desde ${fmtDateTime(a.startedAt)}`,
  },
  {
    title: 'Pedidos de apoio pendentes',
    empty: 'Nenhum pedido de apoio pendente.',
    items: (s) => s.supportRequests,
    total: (s) => s.totals.supportRequests,
    line: (r) => `${r.protocol} · apoio de ${r.targetCrew}`,
    detail: (r) => `Solicitado em ${fmtDateTime(r.requestedAt)} · aguardando autorização`,
  },
  {
    title: 'Urgências UU em aberto',
    empty: 'Nenhuma Urgência UU em aberto.',
    items: (s) => s.emergencies,
    total: (s) => s.totals.emergencies,
    line: (e) => `${e.requester} · ${e.crew}`,
    detail: (e) =>
      `${e.city || 'Município não informado'} · acionada em ${fmtDateTime(e.triggeredAt)}`,
  },
  {
    title: 'Guarnições em serviço',
    empty: 'Nenhuma guarnição em serviço.',
    items: (s) => s.crews,
    total: (s) => s.totals.crews,
    line: (c) => c.name,
    detail: (c) => `${c.city} · ${c.status} · ${plural(c.members, 'integrante', 'integrantes')}`,
  },
  {
    title: 'Checklists de viatura pendentes',
    empty: 'Nenhum checklist de viatura pendente.',
    items: (s) => s.vehicleChecklists,
    total: (s) => s.totals.vehicleChecklists,
    line: (v) => v.vehicle || 'Viatura não informada',
    detail: (v) => `${v.kind} pendente · ${v.driver}`,
  },
];
function Section({ section, summary }) {
  const items = section.items(summary);
  const total = section.total(summary);
  return (
    <>
      <h3>
        {section.title} ({total})
      </h3>
      {items.length ? (
        <ol className="timeline">
          {items.map((item, index) => (
            <li key={`${section.line(item)}-${index}`}>
              <strong>{section.line(item)}</strong>
              <span>{section.detail(item)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">{section.empty}</p>
      )}
      {total > items.length && (
        <p className="muted">{`Exibindo as ${items.length} mais antigas de ${total}.`}</p>
      )}
    </>
  );
}
function Officer({ label, entry, missing, note }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{entry?.officer?.name || missing}</strong>
      <p>{entry ? `Assumiu em ${fmtDateTime(entry.assumedAt)}` : note}</p>
    </div>
  );
}
/** Printable view of one handover summary (live or the snapshot saved on assumption). */
export function HandoverSummary({ summary, previous, current, actions }) {
  const { totals } = summary;
  return (
    <div className="printable">
      <div className="detail-heading">
        <div>
          <span className="eyebrow">PASSAGEM DE SERVIÇO · CPU</span>
          <h2>Pendências do serviço</h2>
          <p className="muted">{`Situação em ${fmtDateTime(summary.generatedAt)}`}</p>
        </div>
        {actions}
      </div>
      <div className="detail-grid">
        <Officer
          label="Quem passa o serviço"
          entry={previous}
          missing="Sem registro no serviço anterior"
          note="Nenhum Oficial assumiu o CPU no serviço anterior."
        />
        <Officer
          label="Quem assume"
          entry={current}
          missing="Aguardando responsável"
          note="Nenhum Oficial assumiu o serviço de hoje."
        />
      </div>
      <div className="results-strip">
        <span>
          Em aberto: <b>{totals.open}</b>
        </span>
        <span>
          Despachadas: <b>{totals.dispatched}</b>
        </span>
        <span>
          Em atendimento: <b>{totals.attendances}</b>
        </span>
        <span>
          Apoios: <b>{totals.supportRequests}</b>
        </span>
        <span>
          Urgências UU: <b>{totals.emergencies}</b>
        </span>
        <span>
          Checklists: <b>{totals.vehicleChecklists}</b>
        </span>
      </div>
      {SECTIONS.map((section) => (
        <Section key={section.title} section={section} summary={summary} />
      ))}
    </div>
  );
}
/** Modal with the live handover; switches to the snapshot stored when the CPU was assumed. */
export default function HandoverDialog({ onClose }) {
  const { data, loading } = useData('/cpu/handover');
  const [fromSnapshot, setFromSnapshot] = useState(false);
  const snapshot = data?.snapshot;
  const actions = (
    <div className="title-actions">
      {snapshot && (
        <div className="segmented" role="group" aria-label="Momento do resumo">
          <button
            className={fromSnapshot ? '' : 'selected'}
            aria-pressed={!fromSnapshot}
            onClick={() => setFromSnapshot(false)}
          >
            Situação atual
          </button>
          <button
            className={fromSnapshot ? 'selected' : ''}
            aria-pressed={fromSnapshot}
            onClick={() => setFromSnapshot(true)}
          >
            Ao assumir · {fmtTime(snapshot.generatedAt)}
          </button>
        </div>
      )}
      <Button variant="secondary" onClick={() => window.print()}>
        <Printer size={16} />
        Imprimir / PDF
      </Button>
    </div>
  );
  return (
    <Modal title="Passagem de serviço" onClose={onClose} wide>
      {loading && !data ? (
        <Loading />
      ) : data ? (
        <HandoverSummary
          summary={fromSnapshot && snapshot ? snapshot : data.summary}
          previous={data.previous}
          current={data.current}
          actions={actions}
        />
      ) : (
        <Empty text="Não foi possível carregar a passagem de serviço." />
      )}
    </Modal>
  );
}
