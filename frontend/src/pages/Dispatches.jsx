import { useState } from 'react';
import { Send, Eye, Radio } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { api } from '../services/api';
import { params, fmtDateTime } from '../utils/format';
import {
  PageTitle,
  Panel,
  Button,
  Badge,
  Modal,
  Select,
  Textarea,
  Empty,
  Loading,
} from '../components/UI';
import OccurrenceFilters from '../components/OccurrenceFilters';
import OccurrenceDetail from '../components/OccurrenceDetail';
export default function Dispatches() {
  const app = useApp();
  const [filter, setFilter] = useState({ status: 'Em aberto' });
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [crew, setCrew] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, loading } = useData(`/occurrences?${params({ ...filter, limit: 100 })}`, {
    items: [],
  });
  const { data: crews } = useData('/crews', []);
  const { data: history } = useData('/dispatches', []);
  const available = crews.filter(
    (c) => c.status === 'Disponível' && +new Date(c.shiftEnd) > app.now && c.members.length,
  );
  async function send(e) {
    e.preventDefault();
    setBusy(true);
    await app.run(async () => {
      await api.post('/dispatches', {
        occurrence: selected._id,
        crew,
        ...(reason ? { reason } : {}),
      });
      setSelected(null);
    }, 'Ocorrência encaminhada. A guarnição foi notificada.');
    setBusy(false);
  }
  return (
    <>
      <PageTitle
        title="Central de despachos"
        description="Direcione cada ocorrência para uma guarnição em serviço."
      >
        <span className="availability">
          <Radio size={17} />
          {available.length} guarnições disponíveis
        </span>
      </PageTitle>
      <Panel>
        <OccurrenceFilters value={filter} onChange={setFilter} />
        {loading && !data.items.length ? (
          <Loading />
        ) : !data.items.length ? (
          <Empty text="Nenhuma ocorrência para os filtros selecionados." />
        ) : (
          <div className="dispatch-grid">
            {data.items.map((o) => (
              <article className="dispatch-card" key={o._id}>
                <div className="card-top">
                  <span className="protocol">{o.protocol}</span>
                  <Badge>{o.priority}</Badge>
                </div>
                <h3>{o.crimeType}</h3>
                <p>
                  {o.city?.name} · {o.address}
                </p>
                <p className="muted">{fmtDateTime(o.occurredAt)}</p>
                <Badge>{o.status}</Badge>
                <div className="form-actions">
                  <Button variant="secondary" onClick={() => setDetail(o._id)}>
                    <Eye size={16} />
                    Detalhes
                  </Button>
                  {['Em aberto', 'Despachada'].includes(o.status) && (
                    <Button
                      onClick={() => {
                        setSelected(o);
                        setCrew('');
                        setReason('');
                      }}
                    >
                      <Send size={16} />
                      {o.status === 'Despachada' ? 'Reencaminhar' : 'Despachar'}
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>
      <Panel title="Histórico de despachos" subtitle="Últimos 100 encaminhamentos">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Ocorrência</th>
                <th>Guarnição</th>
                <th>Despachado por</th>
                <th>Data e hora</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h._id}>
                  <td>{h.occurrence?.protocol}</td>
                  <td>{h.crew?.name}</td>
                  <td>{h.dispatchedBy?.name}</td>
                  <td>{fmtDateTime(h.dispatchedAt)}</td>
                  <td>{h.reason || 'Despacho inicial'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!history.length && <Empty />}
      </Panel>
      {selected && (
        <Modal title={`Encaminhar ${selected.protocol}`} onClose={() => setSelected(null)}>
          <form onSubmit={send}>
            <h3>{selected.crimeType}</h3>
            <p>
              {selected.city?.name} · {selected.address}
            </p>
            <Select
              label="Guarnição responsável"
              required
              value={crew}
              onChange={(e) => setCrew(e.target.value)}
            >
              <option value="">Selecione uma guarnição</option>
              {available.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name} · {c.city?.name} · {c.vehicle?.prefix || 'Sem viatura'}
                </option>
              ))}
            </Select>
            {!available.length && (
              <p className="form-note">
                Não há guarnições disponíveis. Um integrante precisa iniciar o turno.
              </p>
            )}
            <Textarea
              label={
                selected.status === 'Despachada'
                  ? 'Motivo do reencaminhamento'
                  : 'Orientações (opcional)'
              }
              required={selected.status === 'Despachada'}
              minLength={5}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button type="submit" busy={busy} disabled={!available.length}>
              <Send size={16} />
              Confirmar despacho
            </Button>
          </form>
        </Modal>
      )}
      {detail && <OccurrenceDetail id={detail} onClose={() => setDetail(null)} />}
    </>
  );
}
