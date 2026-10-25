import { useState } from 'react';
import CrewManagement from '../components/CrewManagement';
import CrewCommunication from '../components/CrewCommunication';
import {
  Plus,
  UsersRound,
  Car,
  Clock3,
  Pencil,
  Trash2,
  LogIn,
  Shield,
  Navigation,
} from 'lucide-react';
import { useData } from '../hooks/useData';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { duration, fmtDateTime, objectId } from '../utils/format';
import {
  PageTitle,
  Panel,
  Button,
  Badge,
  SearchBox,
  Empty,
  Modal,
  Input,
  Select,
  Textarea,
  Confirm,
} from '../components/UI';
export default function Crews() {
  const app = useApp();
  const admin = app.user.role === 'Administrativo' && !app.activeAttendance;
  const manager = app.user.role !== 'Praça' && !app.activeAttendance;
  const { data: crews } = useData('/crews', []);
  const { data: cities } = useData(admin ? '/cities' : null, []);
  const { data: vehicles } = useData(admin ? '/vehicles' : null, []);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [join, setJoin] = useState(null);
  const [end, setEnd] = useState(null);
  const [reason, setReason] = useState('');
  const [remove, setRemove] = useState(null);
  const [busy, setBusy] = useState(false);
  const [location, setLocation] = useState(null);
  const [position, setPosition] = useState({ latitude: '', longitude: '', mileage: '' });
  function edit(c) {
    setForm({ name: c?.name || '', city: objectId(c?.city), vehicle: objectId(c?.vehicle) });
    setEditing(c?._id || 'new');
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    await app.run(async () => {
      const body = { ...form, vehicle: form.vehicle || null };
      if (editing === 'new') await api.post('/crews', body);
      else await api.put(`/crews/${editing}`, body);
      setEditing(null);
    }, 'Guarnição salva.');
    setBusy(false);
  }
  return (
    <>
      <PageTitle
        title={manager ? 'Guarnições' : 'Minha guarnição'}
        description="Organização das equipes e controle de turnos de 24 horas."
      >
        {admin && (
          <Button onClick={() => edit()}>
            <Plus size={17} />
            Cadastrar guarnição
          </Button>
        )}
      </PageTitle>
      <div className="list-toolbar">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Pesquisar guarnição ou município"
        />
        <span className="muted">{crews.length} guarnições cadastradas</span>
      </div>
      <div className="crew-grid">
        {crews
          .filter((c) => `${c.name} ${c.city?.name}`.toLowerCase().includes(search.toLowerCase()))
          .map((c) => {
            const mine = c.members.some((m) => m._id === app.user._id);
            const active = c.status !== 'Fora de serviço' && +new Date(c.shiftEnd) > app.now;
            return (
              <Panel className={`crew-card ${mine ? 'my-crew' : ''}`} key={c._id}>
                <div className="card-top">
                  <span className="crew-card-icon">
                    <UsersRound size={22} />
                  </span>
                  <Badge>{c.status}</Badge>
                </div>
                <h2>
                  {c.name}
                  {mine && <small> Sua guarnição</small>}
                </h2>
                <p className="muted">{c.city?.name}</p>
                <div className="crew-meta">
                  <span>
                    <Car size={17} />
                    {c.vehicle?.prefix || 'Sem viatura associada'}
                  </span>
                  <span>
                    <Shield size={17} />
                    {c.driver?.name || 'Motorista não definido'}
                  </span>
                </div>
                <div className="crew-members">
                  <span className="eyebrow">INTEGRANTES · {c.members.length}</span>
                  {c.members.length ? (
                    c.members.map((m) => (
                      <span key={m._id}>
                        {m.name}
                        {objectId(c.driver) === m._id && <small>Motorista</small>}
                      </span>
                    ))
                  ) : (
                    <p>Nenhum integrante no turno.</p>
                  )}
                </div>
                <div className="shift-timer">
                  <Clock3 size={17} />
                  <div>
                    <strong>
                      {active
                        ? duration((+new Date(c.shiftEnd) - app.now) / 1000)
                        : 'Fora de serviço'}
                    </strong>
                    <small>
                      {active
                        ? `Início: ${fmtDateTime(c.shiftStart)}`
                        : 'O turno começa no primeiro ingresso'}
                    </small>
                  </div>
                </div>
                <div className="attendance-actions">
                  <CrewManagement crew={c} />
                  {!app.activeAttendance &&
                    !app.user.crew &&
                    !c.currentOccurrence &&
                    c.status !== 'Indisponível' && (
                      <Button onClick={() => setJoin(c)}>
                        <LogIn size={16} />
                        Ingressar
                      </Button>
                    )}
                  {manager && active && (
                    <Button
                      variant="danger-ghost"
                      onClick={() => {
                        setEnd(c);
                        setReason('');
                      }}
                    >
                      Encerrar turno
                    </Button>
                  )}
                  {mine && c.vehicle && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setLocation(c.vehicle);
                        setPosition({
                          latitude: c.vehicle.latitude ?? '',
                          longitude: c.vehicle.longitude ?? '',
                          mileage: '',
                        });
                      }}
                    >
                      <Navigation size={16} />
                      Atualizar posição
                    </Button>
                  )}
                  {admin && !c.members.length && !c.currentOccurrence && (
                    <>
                      <Button variant="secondary" onClick={() => edit(c)}>
                        <Pencil size={15} />
                        Alterar
                      </Button>
                      <Button variant="ghost" onClick={() => setRemove(c)}>
                        <Trash2 size={15} />
                        Excluir
                      </Button>
                    </>
                  )}
                  {mine && !manager && (
                    <small className="muted">
                      A saída antecipada depende de autorização do Oficial ou Administrativo.
                    </small>
                  )}
                </div>
              </Panel>
            );
          })}
      </div>
      {!crews.length && <Empty text="Nenhuma guarnição cadastrada." />}
      <CrewCommunication crews={crews} />
      {editing && (
        <Modal
          title={editing === 'new' ? 'Cadastrar guarnição' : 'Alterar guarnição'}
          onClose={() => setEditing(null)}
        >
          <form onSubmit={save}>
            <Input
              label="Identificação"
              required
              minLength={2}
              maxLength={100}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Select
              label="Município"
              required
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
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
              label="Viatura"
              value={form.vehicle}
              onChange={(e) => setForm({ ...form, vehicle: e.target.value })}
            >
              <option value="">Sem viatura / desassociar</option>
              {vehicles
                .filter(
                  (v) => (!v.crew && v.status === 'Disponível') || objectId(v.crew) === editing,
                )
                .map((v) => (
                  <option key={v._id} value={v._id}>
                    {v.prefix} · {v.plate}
                  </option>
                ))}
            </Select>
            <p className="form-note">
              Cada integrante ingressa com sua própria conta. O turno começa no primeiro ingresso e
              dura 24 horas.
            </p>
            <Button type="submit" busy={busy}>
              Salvar guarnição
            </Button>
          </form>
        </Modal>
      )}
      {join && (
        <Modal title={`Ingressar em ${join.name}`} onClose={() => setJoin(null)}>
          <p>Você será o motorista da guarnição?</p>
          <div className="form-actions">
            <Button
              variant="secondary"
              onClick={() =>
                app.run(async () => {
                  await api.post(`/crews/${join._id}/join`, { driver: false });
                  const r = await api.get('/auth/me');
                  app.hydrate(r.data);
                  setJoin(null);
                }, 'Você ingressou na guarnição.')
              }
            >
              Não, sou integrante
            </Button>
            <Button
              onClick={() =>
                app.run(async () => {
                  await api.post(`/crews/${join._id}/join`, { driver: true });
                  const r = await api.get('/auth/me');
                  app.hydrate(r.data);
                  setJoin(null);
                }, 'Você ingressou como motorista.')
              }
            >
              Sim, sou motorista
            </Button>
          </div>
        </Modal>
      )}
      {end && (
        <Modal title="Autorizar encerramento antecipado" onClose={() => setEnd(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              app.run(async () => {
                await api.post(`/crews/${end._id}/end-shift`, { reason });
                const r = await api.get('/auth/me');
                app.hydrate(r.data);
                setEnd(null);
              }, 'Turno encerrado.');
            }}
          >
            <p>
              Todos os integrantes de <strong>{end.name}</strong> sairão do turno. Atendimentos já
              aceitos continuam sob responsabilidade de quem os aceitou.
            </p>
            <Textarea
              label="Motivo da autorização"
              required
              minLength={5}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button type="submit" variant="danger">
              Autorizar e encerrar
            </Button>
          </form>
        </Modal>
      )}
      {remove && (
        <Confirm
          title="Excluir guarnição"
          message={`Excluir ${remove.name}?`}
          onClose={() => setRemove(null)}
          onConfirm={() =>
            app.run(async () => {
              await api.delete(`/crews/${remove._id}`);
              setRemove(null);
            }, 'Guarnição excluída.')
          }
        />
      )}
      {location && (
        <Modal title={`Posição de ${location.prefix}`} onClose={() => setLocation(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              app.run(async () => {
                await api.patch(`/vehicles/${location._id}/location`, {
                  latitude: Number(position.latitude),
                  longitude: Number(position.longitude),
                  ...(position.mileage !== '' ? { mileage: Number(position.mileage) } : {}),
                });
                setLocation(null);
              }, 'Posição atualizada no mapa.');
            }}
          >
            <Input
              label="Latitude"
              required
              type="number"
              step="any"
              min="-90"
              max="90"
              value={position.latitude}
              onChange={(e) => setPosition({ ...position, latitude: e.target.value })}
            />
            <Input
              label="Longitude"
              required
              type="number"
              step="any"
              min="-180"
              max="180"
              value={position.longitude}
              onChange={(e) => setPosition({ ...position, longitude: e.target.value })}
            />
            <Input
              label="Quilometragem (opcional)"
              type="number"
              min="0"
              value={position.mileage}
              onChange={(e) => setPosition({ ...position, mileage: e.target.value })}
            />
            <Button type="submit">Atualizar posição</Button>
          </form>
        </Modal>
      )}
    </>
  );
}
