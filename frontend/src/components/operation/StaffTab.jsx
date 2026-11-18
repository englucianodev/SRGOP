import { Panel, Empty } from '../UI';
import { militaryLabel } from '../PersonalFields';
import { crewSituation, SITUATION_STYLE } from '../../utils/operation';
import { fmtTime, objectId } from '../../utils/format';

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

function CrewStaff({ crew, now }) {
  const style = SITUATION_STYLE[crewSituation(crew, now)];
  const driverId = objectId(crew.driver);
  const commander = crew.members.find((m) => m._id !== driverId);
  const driver = crew.members.find((m) => m._id === driverId);
  return (
    <article className="staff-crew">
      <header>
        <strong>{crew.name}</strong>
        <span style={{ color: style.color }}>{style.label}</span>
      </header>
      <p>Comandante: {commander ? militaryLabel(commander) : '—'}</p>
      <p>Motorista: {driver ? militaryLabel(driver) : '—'}</p>
      {(crew.motorcycleSeats || []).map((s) => (
        <p key={s.member?._id}>
          {s.role}: {militaryLabel(s.member)}
        </p>
      ))}
    </article>
  );
}

export default function StaffTab({ data, now }) {
  const crews = (data.crews || []).filter((c) => c.members?.length);
  const joins = (data.events || []).filter((e) => e.action === JOIN_ACTION);
  return (
    <div className="operation-page">
      {crews.length ? (
        groupByCity(crews).map(([city, list]) => (
          <Panel key={city} title={city}>
            <div className="staff-grid">
              {list.map((crew) => (
                <CrewStaff key={crew._id} crew={crew} now={now} />
              ))}
            </div>
          </Panel>
        ))
      ) : (
        <Empty text="Nenhuma guarnição com efetivo no turno." />
      )}
      <Panel title="Entradas recentes">
        {joins.length ? (
          <ul className="operation-timeline">
            {joins.map((e, i) => (
              <li key={`${e.at}-${i}`}>
                <time className="tabular">{fmtTime(e.at)}</time>
                <span>
                  {e.actor}
                  {e.label ? ` · ${e.label}` : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty text="Nenhuma entrada neste turno." />
        )}
      </Panel>
    </div>
  );
}
