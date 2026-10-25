import { useState } from 'react';
import {
  Radio,
  Check,
  X,
  UsersRound,
  Clock3,
  FileCheck,
  VolumeX,
  Eye,
  Navigation,
  Send,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { api } from '../services/api';
import { duration, fmtDateTime, objectId } from '../utils/format';
import {
  PageTitle,
  Panel,
  Button,
  Badge,
  Modal,
  Input,
  Select,
  Textarea,
  Empty,
  Loading,
} from '../components/UI';
import OccurrenceDetail from '../components/OccurrenceDetail';
export default function Attendance() {
  const app = useApp();
  const { data: rows, loading } = useData('/attendances', []);
  const { data: crews } = useData('/crews', []);
  const { data: supports } = useData('/attendances/support/requests', []);
  const [action, setAction] = useState(null);
  const [detail, setDetail] = useState(null);
  const [text, setText] = useState('');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState({
    weapons: 0,
    recoveredVehicles: 0,
    detained: 0,
    approaches: 0,
  });
  const manager = app.user.role !== 'Praça';
  const open = (kind, row) => {
    setAction({ kind, row });
    setText('');
    setTarget('');
    setCounts({ weapons: 0, recoveredVehicles: 0, detained: 0, approaches: 0 });
  };
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    await app.run(async () => {
      const { kind, row } = action;
      if (kind === 'close')
        await api.post(`/attendances/${row._id}/close`, { summary: text, ...counts });
      if (kind === 'reject') await api.post(`/attendances/${row._id}/reject`, { reason: text });
      if (kind === 'notes') await api.post(`/attendances/${row._id}/notes`, { text });
      if (kind === 'support' || kind === 'accept-support') {
        if (kind === 'accept-support') await api.post(`/attendances/${row._id}/accept`);
        await api.post(`/attendances/${row._id}/support`, { targetCrew: target, reason: text });
      }
      if (kind === 'forward')
        await api.post('/dispatches', { occurrence: row._id, crew: target, reason: text });
      setAction(null);
      app.setRinging(false);
    }, 'Ação registrada com sucesso.');
    setBusy(false);
  }
  const titles = {
    close: 'Encerrar atendimento',
    reject: 'Rejeitar ocorrência',
    notes: 'Registrar observação',
    support: 'Solicitar apoio',
    'accept-support': 'Aceitar e solicitar apoio',
    forward: 'Encaminhar para outra guarnição',
  };
  return (
    <>
      <PageTitle
        title="Atendimento operacional"
        description="Receba o despacho, registre as ações e conclua o atendimento."
      >
        {app.ringing && (
          <Button variant="secondary" onClick={() => app.setRinging(false)}>
            <VolumeX size={17} />
            Silenciar neste dispositivo
          </Button>
        )}
      </PageTitle>
      {loading && !rows.length ? (
        <Loading />
      ) : !rows.length ? (
        <Panel>
          <Empty text="Nenhum atendimento pendente.">
            <p>Ocorrências destinadas à sua guarnição aparecerão aqui automaticamente.</p>
          </Empty>
        </Panel>
      ) : (
        <div className="attendance-grid">
          {rows.map((o) => {
            const isOwn = objectId(o.crew) === objectId(app.user.crew);
            const canAct = manager || isOwn || objectId(o.acceptedBy) === app.user._id;
            return (
              <Panel
                className={`attendance-card ${o.status === 'Despachada' ? 'pending' : ''}`}
                key={o._id}
              >
                <div className="card-top">
                  <span className="protocol">{o.protocol}</span>
                  <Badge>{o.priority}</Badge>
                </div>
                <h2>{o.crimeType}</h2>
                <div className="attendance-location">
                  <Navigation size={17} />
                  <span>
                    {o.city?.name} · {o.address}
                  </span>
                </div>
                <p className="preserve-text">{o.description}</p>
                <div className="detail-grid">
                  <div>
                    <span>Guarnição</span>
                    <strong>{o.crew?.name}</strong>
                  </div>
                  <div>
                    <span>Despacho recebido</span>
                    <strong>{fmtDateTime(o.dispatchedAt)}</strong>
                  </div>
                </div>
                <div className="attendance-status">
                  <Badge>{o.status}</Badge>
                  {o.startedAt && (
                    <span className="timer">
                      <Clock3 size={18} />
                      {duration((app.now - +new Date(o.startedAt)) / 1000)}
                    </span>
                  )}
                </div>
                {o.acceptedBy && (
                  <p className="muted">
                    Responsável: <strong>{o.acceptedBy.name}</strong>
                  </p>
                )}
                {!canAct && (
                  <p className="form-note">
                    Sua guarnição está prestando apoio. O atendimento principal permanece com{' '}
                    {o.crew?.name}.
                  </p>
                )}
                <div className="attendance-actions">
                  {canAct && o.status === 'Despachada' && (
                    <>
                      <Button
                        onClick={() =>
                          app.run(
                            () => api.post(`/attendances/${o._id}/accept`),
                            'Ocorrência aceita. Atendimento iniciado.',
                          )
                        }
                      >
                        <Check size={17} />
                        Aceitar ocorrência
                      </Button>
                      <Button variant="secondary" onClick={() => open('accept-support', o)}>
                        <UsersRound size={16} />
                        Aceitar e pedir apoio
                      </Button>
                      <Button variant="danger-ghost" onClick={() => open('reject', o)}>
                        <X size={16} />
                        Rejeitar
                      </Button>
                      {manager && (
                        <Button variant="secondary" onClick={() => open('forward', o)}>
                          <Send size={16} />
                          Encaminhar
                        </Button>
                      )}
                    </>
                  )}
                  {canAct && o.status === 'Em atendimento' && (
                    <>
                      <Button variant="secondary" onClick={() => open('notes', o)}>
                        Registrar observação
                      </Button>
                      <Button variant="secondary" onClick={() => open('support', o)}>
                        <UsersRound size={16} />
                        Solicitar apoio
                      </Button>
                      {(manager || objectId(o.acceptedBy) === app.user._id) && (
                        <Button onClick={() => open('close', o)}>
                          <FileCheck size={17} />
                          Encerrar atendimento
                        </Button>
                      )}
                    </>
                  )}
                  <Button variant="ghost" onClick={() => setDetail(o._id)}>
                    <Eye size={16} />
                    Histórico e detalhes
                  </Button>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
      <Panel
        title="Solicitações de apoio"
        subtitle={
          manager
            ? 'Analise e autorize o emprego das guarnições disponíveis.'
            : 'Acompanhe o andamento das suas solicitações.'
        }
      >
        {!supports.length ? (
          <Empty text="Nenhuma solicitação de apoio." />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Ocorrência</th>
                  <th>Guarnição solicitada</th>
                  <th>Motivo</th>
                  <th>Status</th>
                  {manager && <th>Decisão</th>}
                </tr>
              </thead>
              <tbody>
                {supports.map((s) => (
                  <tr key={s._id}>
                    <td>{s.occurrence?.protocol}</td>
                    <td>{s.targetCrew?.name}</td>
                    <td>{s.reason}</td>
                    <td>
                      <Badge>{s.status}</Badge>
                    </td>
                    {manager && (
                      <td>
                        {s.status === 'Pendente' && (
                          <div className="row-actions">
                            <Button
                              onClick={() =>
                                app.run(
                                  () => api.post(`/attendances/support/${s._id}/authorize`),
                                  'Apoio autorizado.',
                                )
                              }
                            >
                              Autorizar
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() =>
                                app.run(
                                  () => api.post(`/attendances/support/${s._id}/reject`),
                                  'Apoio recusado.',
                                )
                              }
                            >
                              Recusar
                            </Button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {action && (
        <Modal title={titles[action.kind]} onClose={() => setAction(null)}>
          <form onSubmit={submit}>
            <p>
              <strong>{action.row.protocol}</strong> · {action.row.crimeType}
            </p>
            {['support', 'accept-support', 'forward'].includes(action.kind) && (
              <Select
                label="Guarnição disponível"
                required
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="">Selecione a guarnição de apoio</option>
                {crews
                  .filter(
                    (c) =>
                      c.status === 'Disponível' &&
                      c._id !== objectId(action.row.crew) &&
                      +new Date(c.shiftEnd) > app.now,
                  )
                  .sort((a, b) => distance(a, action.row) - distance(b, action.row))
                  .map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name} · {c.city?.name}
                      {Number.isFinite(distance(c, action.row))
                        ? ` · aprox. ${distance(c, action.row).toFixed(1)} km`
                        : ''}
                    </option>
                  ))}
              </Select>
            )}
            <Textarea
              label={
                action.kind === 'close'
                  ? 'Resumo do atendimento'
                  : action.kind === 'notes'
                    ? 'Observações e ações tomadas'
                    : 'Motivo / orientações'
              }
              required
              minLength={action.kind === 'close' ? 10 : 5}
              maxLength={action.kind === 'close' ? 10000 : 1000}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            {action.kind === 'close' && (
              <div className="form-grid">
                {[
                  ['weapons', 'Armas apreendidas'],
                  ['recoveredVehicles', 'Veículos recuperados'],
                  ['detained', 'Conduzidos'],
                  ['approaches', 'Abordagens'],
                ].map(([key, label]) => (
                  <Input
                    key={key}
                    label={label}
                    type="number"
                    required
                    min="0"
                    max="100000"
                    value={counts[key]}
                    onChange={(e) => setCounts({ ...counts, [key]: Number(e.target.value) })}
                  />
                ))}
              </div>
            )}
            <p className="form-note">
              {['support', 'accept-support'].includes(action.kind)
                ? 'Distâncias em linha reta usam a posição cadastrada da viatura ou o centro do município. O apoio depende de autorização do Oficial ou Administrativo.'
                : 'Esta ação será registrada no histórico da ocorrência.'}
            </p>
            <Button type="submit" busy={busy}>
              Confirmar
            </Button>
          </form>
        </Modal>
      )}
      {detail && <OccurrenceDetail id={detail} onClose={() => setDetail(null)} />}
    </>
  );
}
function distance(crew, row) {
  const lat = crew.vehicle?.latitude ?? crew.city?.latitude;
  const lon = crew.vehicle?.longitude ?? crew.city?.longitude;
  if (![lat, lon, row.latitude, row.longitude].every(Number.isFinite)) return Infinity;
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat - row.latitude) * rad) / 2) ** 2 +
    Math.cos(lat * rad) *
      Math.cos(row.latitude * rad) *
      Math.sin(((lon - row.longitude) * rad) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
