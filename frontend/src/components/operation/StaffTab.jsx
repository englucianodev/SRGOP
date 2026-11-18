import { crewPeople } from './situationLayers';
import { useArrivals } from './useArrivals';
import { militaryLabel } from '../PersonalFields';
import { crewSituation, SITUATION_STYLE } from '../../utils/operation';
import { fmtTime } from '../../utils/format';

const JOIN_ACTION = 'Ingresso na guarnição';
const NO_CITY = 'Sem município';

function groupByCity(crews) {
  const groups = new Map();
  for (const crew of crews) {
    const city = crew.city?.name || NO_CITY;
    groups.set(city, [...(groups.get(city) || []), crew]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
}

function Person({ role, person }) {
  return (
    <div className="people">
      {role}: <strong>{person ? militaryLabel(person) : '—'}</strong>
    </div>
  );
}

function CrewStaff({ crew, now }) {
  const style = SITUATION_STYLE[crewSituation(crew, now)];
  const { commander, driver } = crewPeople(crew);
  return (
    <article className={`sr-entry ${style.tone}`}>
      <div className="sr-card-head">
        <b>{crew.name}</b>
        <span className={`chip ${style.tone}`}>{style.label}</span>
      </div>
      <Person role="Comandante" person={commander} />
      <Person role="Motorista" person={driver} />
      {(crew.motorcycleSeats || []).map((s) => (
        <Person key={s.member?._id} role={s.role} person={s.member} />
      ))}
      {crew.shiftEnd && <div className="sr-muted">Turno até {fmtTime(crew.shiftEnd)}</div>}
    </article>
  );
}

export default function StaffTab({ data, now }) {
  const crews = (data.crews || []).filter((c) => c.members?.length);
  const joins = (data.events || []).filter((e) => e.action === JOIN_ACTION);
  const joinKey = (e) => `${e.at}|${e.actor}|${e.label}`;
  const fresh = useArrivals(joins.map(joinKey));
  const people = crews.reduce((total, c) => total + c.members.length, 0);
  const groups = groupByCity(crews);
  return (
    <section className="sr-staff">
      <div className="kpis three">
        <div className="kpi">
          <b>{people}</b>
          <span>policiais em serviço</span>
        </div>
        <div className="kpi ok">
          <b>{crews.length}</b>
          <span>guarnições</span>
        </div>
        <div className="kpi">
          <b>{groups.length}</b>
          <span>municípios</span>
        </div>
      </div>
      <div className="sr-staff-grid">
        <div>
          <h2 className="sr-heading">Guarnições por cidade</h2>
          {crews.length ? (
            <div className="sr-cities">
              {groups.map(([city, list]) => (
                <section key={city} className="sr-city">
                  <div className="sr-city-head">
                    <b>{city}</b>
                    <span className="chip">
                      {list.length} guarnição(ões)
                    </span>
                  </div>
                  <div className="sr-entries">
                    {list.map((crew) => (
                      <CrewStaff key={crew._id} crew={crew} now={now} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <p className="sr-muted">Nenhuma guarnição com efetivo no turno.</p>
          )}
        </div>
        <div>
          <h2 className="sr-heading">Entradas recentes</h2>
          {joins.length ? (
            <ol className="sr-events">
              {joins.map((e, i) => (
                <li key={`${joinKey(e)}-${i}`} className={fresh.has(joinKey(e)) ? 'novo' : ''}>
                  <time className="tabular">{fmtTime(e.at)}</time>
                  <span className="tag brand-2">ENTRADA</span>
                  <span>
                    {e.actor}
                    {e.label ? ` · ${e.label}` : ''}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="sr-muted">Nenhuma entrada neste turno.</p>
          )}
        </div>
      </div>
    </section>
  );
}
