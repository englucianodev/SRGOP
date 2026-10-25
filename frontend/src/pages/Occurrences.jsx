import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Eye, Pencil, Trash2, Printer, Paperclip, Save, XCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { api } from '../services/api';
import { fmtDateTime, localInput, params, objectId } from '../utils/format';
import {
  PageTitle,
  Panel,
  Button,
  Badge,
  Modal,
  Input,
  Select,
  Textarea,
  Loading,
  Empty,
  Confirm,
} from '../components/UI';
import OccurrenceDetail from '../components/OccurrenceDetail';
import OccurrenceFilters from '../components/OccurrenceFilters';
const fresh = () => ({
  occurredAt: localInput(),
  city: '',
  crimeType: '',
  address: '',
  description: '',
  priority: 'Média',
  latitude: '',
  longitude: '',
});
export default function Occurrences() {
  const app = useApp();
  const [query, setQuery] = useSearchParams();
  const [filter, setFilter] = useState({});
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(fresh);
  const [detail, setDetail] = useState(query.get('ver'));
  const [remove, setRemove] = useState(null);
  const [cancel, setCancel] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);
  const { data, loading } = useData(`/occurrences?${params({ ...filter, page })}`, {
    items: [],
    total: 0,
    pages: 0,
  });
  const { data: cities } = useData('/cities', []);
  const { data: recent } = useData('/occurrences?limit=4', { items: [] });
  useEffect(() => {
    if (query.get('nova')) {
      setForm({ ...fresh(), city: app.user.city?._id || '' });
      setEditing('new');
      setQuery({}, { replace: true });
    }
    if (query.get('ver')) setDetail(query.get('ver'));
  }, [query]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const manager = app.user.role !== 'Praça';
  function edit(row) {
    setForm(
      row
        ? {
            occurredAt: localInput(row.occurredAt),
            city: objectId(row.city),
            crimeType: row.crimeType,
            address: row.address,
            description: row.description,
            priority: row.priority,
            latitude: row.latitude ?? '',
            longitude: row.longitude ?? '',
          }
        : { ...fresh(), city: app.user.city?._id || '' },
    );
    setFile(null);
    setEditing(row?._id || 'new');
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    await app.run(async () => {
      const body = { ...form, occurredAt: new Date(form.occurredAt).toISOString() };
      for (const k of ['latitude', 'longitude'])
        if (body[k] === '') delete body[k];
        else body[k] = Number(body[k]);
      const r =
        editing === 'new'
          ? await api.post('/occurrences', body)
          : await api.put(`/occurrences/${editing}`, body);
      setEditing(r.data._id);
      if (file) {
        const data = new FormData();
        data.append('file', file);
        await api.post(`/occurrences/${r.data._id}/attachments`, data);
      }
      setEditing(null);
      setFile(null);
    }, 'Ocorrência salva com sucesso.');
    setBusy(false);
  }
  return (
    <>
      <PageTitle title="Ocorrências" description="Registre, consulte e acompanhe cada ocorrência.">
        <Button onClick={() => edit()}>
          <Plus size={17} />
          Nova ocorrência
        </Button>
      </PageTitle>
      <div className="occurrence-layout">
        <Panel>
          <OccurrenceFilters
            value={filter}
            onChange={(v) => {
              setFilter(v);
              setPage(1);
            }}
          />
          {loading && !data.items.length ? (
            <Loading />
          ) : !data.items.length ? (
            <Empty />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Protocolo / ocorrência</th>
                    <th>Município</th>
                    <th>Prioridade</th>
                    <th>Status</th>
                    <th>Data / hora</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((o) => (
                    <tr key={o._id}>
                      <td>
                        <strong className="cell-title">{o.crimeType}</strong>
                        <span className="cell-sub">{o.protocol}</span>
                      </td>
                      <td>{o.city?.name}</td>
                      <td>
                        <Badge>{o.priority}</Badge>
                      </td>
                      <td>
                        <Badge>{o.status}</Badge>
                      </td>
                      <td>{fmtDateTime(o.occurredAt)}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="icon-button"
                            title="Visualizar e imprimir"
                            aria-label={`Visualizar ${o.protocol}`}
                            onClick={() => setDetail(o._id)}
                          >
                            <Eye size={17} />
                          </button>
                          {!['Encerrada', 'Cancelada'].includes(o.status) &&
                            (manager || objectId(o.createdBy) === app.user._id) && (
                              <button
                                className="icon-button"
                                title="Alterar"
                                aria-label={`Alterar ${o.protocol}`}
                                onClick={() => edit(o)}
                              >
                                <Pencil size={16} />
                              </button>
                            )}
                          {manager && ['Em aberto', 'Cancelada'].includes(o.status) && (
                            <button
                              className="icon-button danger-text"
                              title="Excluir"
                              aria-label={`Excluir ${o.protocol}`}
                              onClick={() => setRemove(o)}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                          {manager && o.status === 'Em aberto' && (
                            <button
                              className="icon-button"
                              title="Cancelar ocorrência"
                              aria-label={`Cancelar ${o.protocol}`}
                              onClick={() => {
                                setReason('');
                                setCancel(o);
                              }}
                            >
                              <XCircle size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="pagination">
            <span>{data.total} registro(s)</span>
            <div>
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Anterior
              </Button>
              <span>
                {page} / {Math.max(1, data.pages)}
              </span>
              <Button
                variant="secondary"
                disabled={page >= data.pages}
                onClick={() => setPage(page + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </Panel>
        <Panel title="Últimos registros" subtitle="Recebidos pela central" className="recent-panel">
          {recent.items.map((o) => (
            <div className="recent-item" key={o._id}>
              <div>
                <Badge>{o.priority}</Badge>
                <small>{fmtDateTime(o.createdAt)}</small>
              </div>
              <h3>{o.crimeType}</h3>
              <p>{o.city?.name}</p>
              <Badge>{o.status}</Badge>
              <div className="row-actions">
                <Button variant="ghost" onClick={() => setDetail(o._id)}>
                  <Eye size={15} />
                  Visualizar
                </Button>
                <Button variant="ghost" onClick={() => setDetail(o._id)}>
                  <Printer size={15} />
                  Imprimir
                </Button>
              </div>
            </div>
          ))}
        </Panel>
      </div>
      {editing && (
        <Modal
          title={editing === 'new' ? 'Registrar ocorrência' : 'Alterar ocorrência'}
          onClose={() => setEditing(null)}
          wide
        >
          <form onSubmit={save}>
            <p className="form-note">
              O protocolo é gerado automaticamente ao registrar. Campos com * são obrigatórios.
            </p>
            <div className="form-grid">
              <Input
                label="Data e hora"
                type="datetime-local"
                required
                value={form.occurredAt}
                onChange={(e) => set('occurredAt', e.target.value)}
              />
              <Select
                label="Município"
                required
                value={form.city}
                onChange={(e) => set('city', e.target.value)}
              >
                <option value="">Selecione</option>
                {cities
                  .filter((c) => c.active)
                  .map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
              <Select
                label="Tipo de crime"
                required
                value={form.crimeType}
                onChange={(e) => set('crimeType', e.target.value)}
              >
                <option value="">Selecione</option>
                {app.settings?.crimeTypes.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
              <Select
                label="Prioridade"
                value={form.priority}
                onChange={(e) => set('priority', e.target.value)}
              >
                {['Alta', 'Média', 'Baixa'].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Select>
            </div>
            <Input
              label="Endereço / localização"
              required
              minLength={3}
              maxLength={300}
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
            />
            <div className="form-grid">
              <Input
                label="Latitude (opcional)"
                type="number"
                step="any"
                min="-90"
                max="90"
                value={form.latitude}
                onChange={(e) => set('latitude', e.target.value)}
              />
              <Input
                label="Longitude (opcional)"
                type="number"
                step="any"
                min="-180"
                max="180"
                value={form.longitude}
                onChange={(e) => set('longitude', e.target.value)}
              />
            </div>
            <Textarea
              label="Descrição detalhada"
              required
              minLength={10}
              maxLength={10000}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
            <Input
              label="Anexar arquivo"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              hint="PDF, PNG ou JPEG · até 5 MB por arquivo · até 10 anexos por ocorrência"
              onChange={(e) => setFile(e.target.files[0] || null)}
            />
            {file && (
              <small>
                <Paperclip size={13} />
                {file.name}
              </small>
            )}
            <div className="form-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setForm(fresh());
                  setFile(null);
                }}
              >
                Limpar
              </Button>
              <Button type="submit" busy={busy}>
                <Save size={16} />
                {editing === 'new' ? 'Registrar' : 'Salvar alterações'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {detail && (
        <OccurrenceDetail
          id={detail}
          onClose={() => {
            setDetail(null);
            setQuery({}, { replace: true });
          }}
        />
      )}{' '}
      {remove && (
        <Confirm
          title="Excluir ocorrência"
          message={`Excluir ${remove.protocol}? O histórico será preservado para auditoria.`}
          onClose={() => setRemove(null)}
          onConfirm={() =>
            app.run(async () => {
              await api.delete(`/occurrences/${remove._id}`);
              setRemove(null);
            }, 'Ocorrência excluída.')
          }
        />
      )}
      {cancel && (
        <Modal title="Cancelar ocorrência" onClose={() => setCancel(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              app.run(async () => {
                await api.post(`/occurrences/${cancel._id}/cancel`, { reason });
                setCancel(null);
              }, 'Ocorrência cancelada.');
            }}
          >
            <Textarea
              label="Motivo do cancelamento"
              required
              minLength={5}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button type="submit" variant="danger">
              Cancelar ocorrência
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
}
