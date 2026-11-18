import { fmtDateTime, duration } from '../utils/format';
import { elapsedSeconds, seizureLabel } from '../utils/occurrenceDetails';
import './detailEditors.css';
// Read-only blocks of the detail / print view: response times, involved people, seized
// material and the destination police station. Each block appears only when it has data.
export default function OccurrenceExtras({ o }) {
  const travel = elapsedSeconds(o.startedAt, o.arrivedAt);
  const onScene = elapsedSeconds(o.arrivedAt, o.endedAt);
  return (
    <>
      {o.arrivedAt && (
        <>
          <h3>Tempo de resposta</h3>
          <div className="results-strip">
            <span>
              Chegada ao local: <b>{fmtDateTime(o.arrivedAt)}</b>
            </span>
            {travel !== null && (
              <span>
                Deslocamento: <b>{duration(travel)}</b>
              </span>
            )}
            {onScene !== null && (
              <span>
                No local: <b>{duration(onScene)}</b>
              </span>
            )}
          </div>
        </>
      )}
      {o.involved?.length > 0 && (
        <>
          <h3>Envolvidos</h3>
          <ul className="detail-list">
            {o.involved.map((person, index) => (
              <li key={index}>
                <b>{person.role}</b> · <strong>{person.name}</strong>
                {(person.document || person.phone) && (
                  <span>
                    {[
                      person.document && `Documento: ${person.document}`,
                      person.phone && `Telefone: ${person.phone}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                )}
                {person.notes && <p className="preserve-text">{person.notes}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
      {o.seizures?.length > 0 && (
        <>
          <h3>Material apreendido</h3>
          <ul className="detail-list">
            {o.seizures.map((seizure, index) => (
              <li key={index}>{seizureLabel(seizure)}</li>
            ))}
          </ul>
        </>
      )}
      {o.policeStation && (
        <>
          <h3>Delegacia de destino</h3>
          <p>{o.policeStation}</p>
        </>
      )}
    </>
  );
}
