import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Settings, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { api } from '../services/api';
import { fmtDateTime } from '../utils/format';
import {
  PageTitle,
  Panel,
  Button,
  Badge,
  Modal,
  Input,
  Select,
  Textarea,
  SearchBox,
} from '../components/UI';
export default function Administration() {
  const app = useApp();
  const { data: cities } = useData('/cities', []);
  const { data: logs } = useData('/audit-logs', []);
  const { data: cpu } = useData('/cpu');
  const { data: users } = useData('/users', []);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [officer, setOfficer] = useState('');
  const [reason, setReason] = useState('');
  const [cpuOpen, setCpuOpen] = useState(false);
  const [search, setSearch] = useState('');
  function edit(c) {
    setForm({
      name: c?.name || '',
      latitude: c?.latitude ?? '',
      longitude: c?.longitude ?? '',
      active: c?.active ?? true,
    });
    setEditing(c?._id || 'new');
  }
  return (
    <>
      <PageTitle
        title="Administrativo"
        description="Cadastros institucionais, controle de acesso e auditoria."
      >
        <Link to="/configuracoes" className="button primary">
          <Settings size={17} />
          Configurações gerais
        </Link>
      </PageTitle>
      <div className="two-columns">
        <Panel title="CPU do dia">
          <div className="padded">
            <h3>{cpu?.officer?.name || 'Responsável não definido'}</h3>
            <p className="muted">
              {cpu ? fmtDateTime(cpu.assumedAt) : 'Aguardando um Oficial assumir o serviço.'}
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                setOfficer(cpu?.officer?._id || '');
                setReason('');
                setCpuOpen(true);
              }}
            >
              Administrar responsável
            </Button>
          </div>
        </Panel>
        <Panel title="Gestão de acesso">
          <div className="padded">
            <p>
              <b>{users.filter((u) => !u.active).length}</b> usuários inativos ou aguardando
              aprovação.
            </p>
            <p className="muted">Perfis e permissões são aplicados também no servidor.</p>
            <Link className="button secondary" to="/usuarios">
              <ShieldCheck size={17} />
              Gerenciar usuários e perfis
            </Link>
          </div>
        </Panel>
      </div>
      <Panel
        title="Municípios atendidos"
        subtitle={`${cities.length} municípios cadastrados · base configurável`}
        actions={
          <Button onClick={() => edit()}>
            <Plus size={16} />
            Cadastrar cidade
          </Button>
        }
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Município</th>
                <th>Latitude</th>
                <th>Longitude</th>
                <th>Situação</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {cities.map((c) => (
                <tr key={c._id}>
                  <td>{c.name}</td>
                  <td>{c.latitude}</td>
                  <td>{c.longitude}</td>
                  <td>
                    <Badge>{c.active ? 'Ativo' : 'Inativo'}</Badge>
                  </td>
                  <td>
                    <Button variant="ghost" onClick={() => edit(c)}>
                      <Pencil size={15} />
                      Alterar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="form-note padded">
          O seed contém 14 municípios demonstrativos. Valide a circunscrição com o batalhão e ajuste
          esta lista antes do uso institucional.
        </p>
      </Panel>
      <Panel title="Matriz de permissões">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Função</th>
                <th>Administrativo</th>
                <th>Oficial</th>
                <th>Praça</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Cadastrar e consultar ocorrências', 'Sim', 'Sim', 'Sim'],
                ['Editar ocorrências', 'Todas em aberto', 'Todas em aberto', 'Próprias em aberto'],
                ['Despachar e autorizar apoio', 'Sim', 'Sim', 'Não'],
                ['Assumir CPU', 'Administra a indicação', 'Sim', 'Não'],
                ['Encerrar turno antecipadamente', 'Sim, com motivo', 'Sim, com motivo', 'Não'],
                [
                  'Usuários, frota e guarnições',
                  'Gerencia',
                  'Consulta',
                  'Ingressa na própria guarnição',
                ],
                ['Configurações e auditoria', 'Sim', 'Preferências locais', 'Não'],
              ].map((row) => (
                <tr key={row[0]}>
                  {row.map((v, i) => (
                    <td key={i}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel
        title="Logs de auditoria"
        subtitle="Últimas 200 ações relevantes"
        actions={
          <SearchBox value={search} onChange={setSearch} placeholder="Pesquisar ação ou usuário" />
        }
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Data / hora</th>
                <th>Usuário</th>
                <th>Ação</th>
                <th>Entidade</th>
                <th>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {logs
                .filter((l) =>
                  `${l.action} ${l.actor?.name}`.toLowerCase().includes(search.toLowerCase()),
                )
                .map((l) => (
                  <tr key={l._id}>
                    <td>{fmtDateTime(l.createdAt)}</td>
                    <td>{l.actor?.name || 'Sistema'}</td>
                    <td>{l.action}</td>
                    <td>{l.entity}</td>
                    <td className="log-detail">{l.detail || '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Panel>
      {editing && (
        <Modal
          title={editing === 'new' ? 'Cadastrar município' : 'Alterar município'}
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              app.run(async () => {
                const body = {
                  ...form,
                  latitude: Number(form.latitude),
                  longitude: Number(form.longitude),
                };
                if (editing === 'new') await api.post('/cities', body);
                else await api.put(`/cities/${editing}`, body);
                setEditing(null);
              }, 'Município salvo.');
            }}
          >
            <Input
              label="Nome do município"
              required
              minLength={2}
              maxLength={100}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <div className="form-grid">
              <Input
                label="Latitude"
                type="number"
                step="any"
                min="-90"
                max="90"
                required
                value={form.latitude}
                onChange={(e) => setForm({ ...form, latitude: e.target.value })}
              />
              <Input
                label="Longitude"
                type="number"
                step="any"
                min="-180"
                max="180"
                required
                value={form.longitude}
                onChange={(e) => setForm({ ...form, longitude: e.target.value })}
              />
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              Município ativo
            </label>
            <div className="form-actions">
              <Button type="submit">Salvar município</Button>
            </div>
          </form>
        </Modal>
      )}
      {cpuOpen && (
        <Modal title="Administrar CPU do dia" onClose={() => setCpuOpen(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              app.run(async () => {
                await api.put('/cpu', { officer, reason });
                setCpuOpen(false);
              }, 'CPU atualizado com registro de auditoria.');
            }}
          >
            <Select
              label="Oficial responsável"
              required
              value={officer}
              onChange={(e) => setOfficer(e.target.value)}
            >
              <option value="">Selecione</option>
              {users
                .filter((u) => u.active && u.role === 'Oficial')
                .map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name}
                  </option>
                ))}
            </Select>
            <Textarea
              label="Justificativa da alteração"
              required
              minLength={5}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button type="submit">Salvar responsável</Button>
          </form>
        </Modal>
      )}
    </>
  );
}
