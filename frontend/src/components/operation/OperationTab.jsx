import { Panel, Empty } from '../UI';
import OperationalMap from '../OperationalMap';
import OperationLegend from '../OperationLegend';
import { operationCounters } from '../../utils/operation';
import { duration, fmtTime } from '../../utils/format';

const COUNTERS = [
  ['emServico', 'Em serviço'],
  ['emAtendimento', 'Em atendimento'],
  ['livres', 'Livres'],
  ['expirados', 'Turno encerrado'],
];

export default function OperationTab({ data, cities, now }) {
  const counters = operationCounters(data.crews, now);
  const attending = (data.open || []).filter((o) => o.status === 'Em atendimento');
  const events = data.events || [];
  return (
    <div className="operation-page">
      <div className="operation-counters">
        {COUNTERS.map(([key, label]) => (
          <div key={key}>
            <b>{counters[key]}</b>
            <span>{label}</span>
          </div>
        ))}
        <div className="operation-cpu">
          <b>{data.cpu?.officer?.name || '—'}</b>
          <span>CPU atual{data.cpu?.assumedAt ? ` desde ${fmtTime(data.cpu.assumedAt)}` : ''}</span>
        </div>
      </div>
      <Panel title="Mapa da operação">
        <OperationalMap
          mode="operation"
          cities={cities}
          occurrences={data.open || []}
          crews={data.crews}
          now={now}
        />
        <OperationLegend />
      </Panel>
      <Panel title="Em atendimento">
        {attending.length ? (
          <div className="operation-cards">
            {attending.map((o) => (
              <article key={o.protocol} className="operation-card">
                <strong>{o.crew?.name || 'Sem guarnição'}</strong>
                <span>{o.protocol}</span>
                <b className="tabular">{duration((now - +new Date(o.startedAt)) / 1000)}</b>
              </article>
            ))}
          </div>
        ) : (
          <Empty text="Nenhum atendimento em andamento." />
        )}
      </Panel>
      <Panel title="Linha do tempo">
        {events.length ? (
          <ul className="operation-timeline">
            {events.map((e, i) => (
              <li key={`${e.at}-${i}`}>
                <time className="tabular">{fmtTime(e.at)}</time>
                <span>
                  {e.action}
                  {e.label ? ` · ${e.label}` : ''}
                </span>
                <small>{e.actor}</small>
              </li>
            ))}
          </ul>
        ) : (
          <Empty text="Sem eventos neste turno." />
        )}
      </Panel>
    </div>
  );
}
