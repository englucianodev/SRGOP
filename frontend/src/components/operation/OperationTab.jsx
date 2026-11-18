import Kpi from './Kpi';
import SituationMap from './SituationMap';
import { crewPeople } from './situationLayers';
import { useArrivals } from './useArrivals';
import { militaryLabel } from '../PersonalFields';
import { eventTag, operationCounters } from '../../utils/operation';
import { duration, fmtTime } from '../../utils/format';

const COUNTERS = [
  ['emServico', 'em serviço', ''],
  ['emAtendimento', 'em atendimento', 'hot'],
  ['livres', 'livres', 'ok'],
  ['expirados', 'turno encerrado', 'warn'],
];

function AttendanceCard({ occurrence: o, crew, now, fresh }) {
  const { commander, driver } = crew ? crewPeople(crew) : {};
  return (
    <article className={`sr-card ${fresh ? 'novo' : ''}`}>
      <div className="sr-card-head">
        <b>
          <span>{o.protocol}</span>
          {o.city?.name && <span className="sr-card-city"> · {o.city.name}</span>}
        </b>
        <span className="tabular sr-elapsed">{duration((now - +new Date(o.startedAt)) / 1000)}</span>
      </div>
      {o.crimeType && <div className="crime">{o.crimeType}</div>}
      <div className="people">
        {o.crew?.name || 'Sem guarnição'}
        {commander && (
          <>
            {' · Cmt '}
            <strong>{militaryLabel(commander)}</strong>
          </>
        )}
        {driver && (
          <>
            {' · Mot '}
            <strong>{militaryLabel(driver)}</strong>
          </>
        )}
      </div>
    </article>
  );
}

export default function OperationTab({ data, cities, now, focusCrew = '', emergency = null }) {
  const crews = data.crews || [];
  const counters = operationCounters(crews, now);
  const attending = (data.open || []).filter((o) => o.status === 'Em atendimento');
  const events = data.events || [];
  const eventKey = (e) => `${e.at}|${e.action}|${e.label}`;
  const fresh = useArrivals([...attending.map((o) => `a|${o.protocol}`), ...events.map(eventKey)]);
  const crewById = new Map(crews.map((c) => [c._id, c]));
  return (
    <section className="sr-operation">
      <SituationMap
        crews={crews}
        occurrences={data.open || []}
        cities={cities}
        now={now}
        focusCrew={focusCrew}
        emergency={emergency}
      />
      <aside className="sr-side">
        <div className="kpis">
          {COUNTERS.map(([key, label, tone]) => (
            <Kpi key={key} value={counters[key]} label={label} tone={tone} />
          ))}
        </div>
        <div className="sr-cpu">
          <span>CPU atual{data.cpu?.assumedAt ? ` desde ${fmtTime(data.cpu.assumedAt)}` : ''}</span>
          <b>{data.cpu?.officer?.name || '—'}</b>
        </div>
        <h2 className="sr-heading">Em atendimento</h2>
        {attending.length ? (
          <div className="sr-cards">
            {attending.map((o) => (
              <AttendanceCard
                key={o.protocol}
                occurrence={o}
                crew={crewById.get(o.crew?._id)}
                now={now}
                fresh={fresh.has(`a|${o.protocol}`)}
              />
            ))}
          </div>
        ) : (
          <p className="sr-muted">Nenhum atendimento em andamento.</p>
        )}
        <h2 className="sr-heading">Linha do tempo</h2>
        {events.length ? (
          <ol className="sr-events">
            {events.map((e, i) => {
              const [tag, tone] = eventTag(e.action);
              return (
                <li key={`${eventKey(e)}-${i}`} className={fresh.has(eventKey(e)) ? 'novo' : ''}>
                  <time className="tabular">{fmtTime(e.at)}</time>
                  <span className={`tag ${tone}`}>{tag}</span>
                  <span>
                    {e.action}
                    {e.label ? ` · ${e.label}` : ''}
                    {e.actor && <small> — {e.actor}</small>}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="sr-muted">Sem eventos neste turno.</p>
        )}
      </aside>
    </section>
  );
}
