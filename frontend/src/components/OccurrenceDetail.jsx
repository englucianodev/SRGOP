import { Printer, Download, MapPin, Clock3 } from 'lucide-react';
import { useData } from '../hooks/useData';
import { useApp } from '../context/AppContext';
import { Button, Modal, Badge, Loading } from './UI';
import { fmtDateTime, duration } from '../utils/format';
import { downloadFile } from '../services/api';
export default function OccurrenceDetail({ id, onClose }) {
  const { data: o, loading } = useData(`/occurrences/${id}`);
  const app = useApp();
  return (
    <Modal title={o?.protocol || 'Detalhes da ocorrência'} onClose={onClose} wide>
      {loading && !o ? (
        <Loading />
      ) : (
        o && (
          <div className="printable">
            <div className="detail-heading">
              <div>
                <span className="eyebrow">REGISTRO DE OCORRÊNCIA · 18º BPM</span>
                <h2>{o.crimeType}</h2>
                <Badge>{o.priority}</Badge> <Badge>{o.status}</Badge>
              </div>
              <Button variant="secondary" className="no-print" onClick={() => window.print()}>
                <Printer size={16} />
                Imprimir / PDF
              </Button>
            </div>
            <div className="detail-grid">
              <div>
                <span>Município e local</span>
                <strong>
                  <MapPin size={15} />
                  {o.city?.name}
                </strong>
                <p>{o.address}</p>
                {Number.isFinite(o.latitude) && (
                  <small>
                    {o.latitude}, {o.longitude}
                  </small>
                )}
              </div>
              <div>
                <span>Data e hora</span>
                <strong>
                  <Clock3 size={15} />
                  {fmtDateTime(o.occurredAt)}
                </strong>
                <p>Registro: {o.createdBy?.name}</p>
              </div>
              <div>
                <span>Guarnição / viatura</span>
                <strong>{o.crew?.name || 'Aguardando despacho'}</strong>
                <p>{o.vehicle?.prefix || '—'}</p>
              </div>
              <div>
                <span>Responsável pelo atendimento</span>
                <strong>{o.acceptedBy?.name || 'Aguardando aceite'}</strong>
                <p>Duração: {duration(o.durationSeconds)}</p>
              </div>
            </div>
            <h3>Descrição da ocorrência</h3>
            <p className="preserve-text">{o.description}</p>
            {o.summary && (
              <>
                <h3>Resumo do atendimento</h3>
                <p className="preserve-text">{o.summary}</p>
                <p>
                  Início: {fmtDateTime(o.startedAt)} · Término: {fmtDateTime(o.endedAt)}
                </p>
                <div className="results-strip">
                  <span>
                    Armas: <b>{o.weapons}</b>
                  </span>
                  <span>
                    Veículos recuperados: <b>{o.recoveredVehicles}</b>
                  </span>
                  <span>
                    Conduzidos: <b>{o.detained}</b>
                  </span>
                  <span>
                    Abordagens: <b>{o.approaches}</b>
                  </span>
                </div>
              </>
            )}
            {o.attachments?.length > 0 && (
              <>
                <h3>Anexos</h3>
                <div className="attachment-list">
                  {o.attachments.map((a) => (
                    <Button
                      key={a._id}
                      variant="secondary"
                      onClick={() => app.run(() => downloadFile(`/attachments/${a._id}`, a.name))}
                    >
                      <Download size={15} />
                      {a.name}
                    </Button>
                  ))}
                </div>
              </>
            )}
            <h3>Histórico de alterações</h3>
            <ol className="timeline">
              {o.history.map((h) => (
                <li key={h._id}>
                  <strong>{h.action}</strong>
                  <span>
                    {h.actor?.name || 'Sistema'} · {fmtDateTime(h.at)}
                  </span>
                  {h.detail && <p className="preserve-text">{h.detail}</p>}
                </li>
              ))}
            </ol>
            {o.supports?.length > 0 && (
              <>
                <h3>Pedidos de apoio</h3>
                {o.supports.map((s) => (
                  <p key={s._id}>
                    {s.targetCrew?.name} · {s.reason} <Badge>{s.status}</Badge>
                  </p>
                ))}
              </>
            )}
          </div>
        )
      )}
    </Modal>
  );
}
