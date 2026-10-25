import { useState } from 'react';
import { Plus, Pencil, Trash2, Eye, Wrench, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { api } from '../services/api';
import { objectId, fmtDate, fmtDateTime, localInput } from '../utils/format';
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
export default function Resources({ type }) {
  const app = useApp();
  const admin = app.user.role === 'Administrativo';
  const isUser = type === 'users';
  const { data: rows } = useData(`/${type}`, []);
  const { data: cities } = useData('/cities', []);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [detail, setDetail] = useState(null);
  const [remove, setRemove] = useState(null);
  const [busy, setBusy] = useState(false);
  const filtered = rows.filter((r) =>
    `${r.name || r.prefix} ${r.email || r.plate} ${r.city?.name}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  function edit(r) {
    setForm(
      isUser
        ? {
            name: r?.name || '',
            email: r?.email || '',
            city: objectId(r?.city),
            role: r?.role || 'Praça',
            active: r?.active ?? true,
            password: '',
          }
        : {
            prefix: r?.prefix || '',
            plate: r?.plate || '',
            city: objectId(r?.city),
            mileage: r?.mileage || 0,
            lastMaintenance: r?.lastMaintenance ? localInput(r.lastMaintenance).slice(0, 10) : '',
            nextMaintenance: r?.nextMaintenance ? localInput(r.nextMaintenance).slice(0, 10) : '',
            status: r?.status || 'Disponível',
            notes: r?.notes || '',
            latitude: r?.latitude ?? '',
            longitude: r?.longitude ?? '',
          },
    );
    setEditing(r?._id || 'new');
  }
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    await app.run(
      async () => {
        const body = { ...form };
        if (isUser && !body.password) delete body.password;
        if (!isUser) {
          for (const k of ['lastMaintenance', 'nextMaintenance'])
            body[k] = body[k] ? new Date(`${body[k]}T12:00:00-03:00`).toISOString() : null;
          for (const k of ['latitude', 'longitude'])
            if (body[k] === '') delete body[k];
            else body[k] = Number(body[k]);
        }
        if (editing === 'new') await api.post(`/${type}`, body);
        else await api.put(`/${type}/${editing}`, body);
        setEditing(null);
      },
      `${isUser ? 'Usuário' : 'Viatura'} salvo com sucesso.`,
    );
    setBusy(false);
  }
  return (
    <>
      <PageTitle
        title={isUser ? 'Usuários' : 'Viaturas'}
        description={
          isUser
            ? 'Pessoas, perfis de acesso e vínculos operacionais.'
            : 'Disponibilidade, manutenção e controle da frota.'
        }
      >
        {admin && (
          <Button onClick={() => edit()}>
            <Plus size={17} />
            {isUser ? 'Cadastrar usuário' : 'Cadastrar viatura'}
          </Button>
        )}
      </PageTitle>
      {!isUser && (
        <div className="small-metrics">
          {['Disponível', 'Em operação', 'Em manutenção', 'Indisponível'].map((s) => (
            <Panel key={s}>
              <Badge>{s}</Badge>
              <strong>{rows.filter((r) => r.status === s).length}</strong>
            </Panel>
          ))}
        </div>
      )}
      {isUser && rows.some((r) => !r.active) && (
        <div className="info-banner">
          <ShieldCheck size={19} />
          {rows.filter((r) => !r.active).length} usuário(s) inativo(s) ou aguardando aprovação.
          {admin
            ? ' Use Alterar para verificar o perfil solicitado e ativar o acesso.'
            : ' A ativação é realizada pelo Administrativo.'}
        </div>
      )}
      <Panel>
        <div className="list-toolbar padded">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder={
              isUser
                ? 'Pesquisar nome, e-mail ou município'
                : 'Pesquisar prefixo, placa ou município'
            }
          />
          <span className="muted">{filtered.length} registros</span>
        </div>
        {!filtered.length ? (
          <Empty />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {(isUser
                    ? ['Nome / e-mail', 'Município', 'Perfil', 'Guarnição', 'Acesso', 'Ações']
                    : [
                        'Prefixo / placa',
                        'Município',
                        'Quilometragem',
                        'Próxima revisão',
                        'Status',
                        'Ações',
                      ]
                  ).map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r._id}>
                    <td>
                      <strong className="cell-title">{isUser ? r.name : r.prefix}</strong>
                      <span className="cell-sub">{isUser ? r.email : r.plate}</span>
                    </td>
                    <td>{r.city?.name}</td>
                    <td>
                      {isUser ? <Badge>{r.role}</Badge> : `${r.mileage.toLocaleString('pt-BR')} km`}
                    </td>
                    <td>
                      {isUser ? (
                        r.crew?.name || 'Sem guarnição'
                      ) : (
                        <>
                          <span>{fmtDate(r.nextMaintenance)}</span>
                          {r.nextMaintenance &&
                            +new Date(r.nextMaintenance) <= app.now + 7 * 86400000 && (
                              <small
                                className={`cell-sub ${+new Date(r.nextMaintenance) < app.now ? 'danger-text' : 'warning-text'}`}
                              >
                                <Wrench size={12} />{' '}
                                {+new Date(r.nextMaintenance) < app.now
                                  ? 'Revisão atrasada'
                                  : 'Revisão próxima'}
                              </small>
                            )}
                        </>
                      )}
                    </td>
                    <td>
                      <Badge>{isUser ? (r.active ? 'Ativo' : 'Inativo') : r.status}</Badge>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          aria-label={`Visualizar ${r.name || r.prefix}`}
                          onClick={() => setDetail(r)}
                        >
                          <Eye size={17} />
                        </button>
                        {admin && (
                          <>
                            <button
                              className="icon-button"
                              aria-label={`Alterar ${r.name || r.prefix}`}
                              onClick={() => edit(r)}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              className="icon-button danger-text"
                              aria-label={`Excluir ${r.name || r.prefix}`}
                              onClick={() => setRemove(r)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {editing && (
        <Modal
          title={`${editing === 'new' ? 'Cadastrar' : 'Alterar'} ${isUser ? 'usuário' : 'viatura'}`}
          onClose={() => setEditing(null)}
          wide
        >
          <form onSubmit={save}>
            <div className="form-grid">
              {isUser ? (
                <>
                  <Input
                    label="Nome completo"
                    required
                    minLength={3}
                    maxLength={120}
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                  />
                  <Input
                    label="E-mail"
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => set('email', e.target.value)}
                  />
                  <Select
                    label="Tipo de acesso"
                    value={form.role}
                    onChange={(e) => set('role', e.target.value)}
                  >
                    {['Administrativo', 'Oficial', 'Praça'].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </Select>
                  <Select
                    label="Situação do acesso"
                    value={String(form.active)}
                    onChange={(e) => set('active', e.target.value === 'true')}
                  >
                    <option value="true">Ativo</option>
                    <option value="false">Inativo / pendente</option>
                  </Select>
                </>
              ) : (
                <>
                  <Input
                    label="Prefixo"
                    required
                    minLength={2}
                    maxLength={40}
                    value={form.prefix}
                    onChange={(e) => set('prefix', e.target.value)}
                  />
                  <Input
                    label="Placa"
                    required
                    minLength={7}
                    maxLength={10}
                    value={form.plate}
                    onChange={(e) => set('plate', e.target.value.toUpperCase())}
                  />
                  <Input
                    label="Quilometragem"
                    required
                    type="number"
                    min="0"
                    value={form.mileage}
                    onChange={(e) => set('mileage', Number(e.target.value))}
                  />
                  <Select
                    label="Status"
                    value={form.status}
                    onChange={(e) => set('status', e.target.value)}
                  >
                    {['Disponível', 'Em operação', 'Em manutenção', 'Indisponível'].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </Select>
                  <Input
                    label="Última revisão"
                    type="date"
                    value={form.lastMaintenance}
                    onChange={(e) => set('lastMaintenance', e.target.value)}
                  />
                  <Input
                    label="Próxima revisão"
                    type="date"
                    value={form.nextMaintenance}
                    onChange={(e) => set('nextMaintenance', e.target.value)}
                  />
                </>
              )}
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
              {isUser && (
                <Input
                  label={editing === 'new' ? 'Senha inicial' : 'Redefinir senha (opcional)'}
                  type="password"
                  autoComplete="new-password"
                  required={editing === 'new'}
                  minLength={10}
                  maxLength={72}
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  hint="Mínimo de dez caracteres. Deixe vazio para manter a senha atual."
                />
              )}
              {!isUser && (
                <>
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
                </>
              )}
            </div>
            {isUser && editing !== 'new' && (
              <p className="form-note">
                Perfil solicitado no cadastro:{' '}
                <b>{rows.find((r) => r._id === editing)?.requestedRole}</b>. Alterações encerram as
                sessões existentes deste usuário.
              </p>
            )}
            {!isUser && (
              <Textarea
                label="Observações"
                maxLength={3000}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
              />
            )}
            <div className="form-actions">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button type="submit" busy={busy}>
                Salvar alterações
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {detail && (
        <Modal title={detail.name || detail.prefix} onClose={() => setDetail(null)} wide>
          <div className="detail-grid">
            {Object.entries(
              isUser
                ? {
                    'E-mail': detail.email,
                    Município: detail.city?.name,
                    'Perfil atual': detail.role,
                    'Perfil solicitado': detail.requestedRole,
                    Guarnição: detail.crew?.name || 'Sem guarnição',
                    Situação: detail.active ? 'Ativo' : 'Inativo / pendente',
                    Cadastro: fmtDateTime(detail.createdAt),
                  }
                : {
                    Placa: detail.plate,
                    Município: detail.city?.name,
                    Status: detail.status,
                    Quilometragem: `${detail.mileage} km`,
                    Guarnição: detail.crew?.name || 'Sem vínculo',
                    'Último motorista': detail.lastDriver?.name || 'Não informado',
                    'Última revisão': fmtDate(detail.lastMaintenance),
                    'Próxima revisão': fmtDate(detail.nextMaintenance),
                    Observações: detail.notes || 'Sem observações',
                  },
            ).map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          {isUser && admin && <UserAudit id={detail._id} />}
        </Modal>
      )}
      {remove && (
        <Confirm
          title={isUser ? 'Excluir acesso do usuário' : 'Excluir viatura'}
          message={
            isUser
              ? `Desativar ${remove.name}? O histórico será preservado e as sessões serão encerradas.`
              : `Excluir ${remove.prefix}? Viaturas com histórico operacional devem ser mantidas como indisponíveis.`
          }
          onClose={() => setRemove(null)}
          onConfirm={() =>
            app.run(async () => {
              await api.delete(`/${type}/${remove._id}`);
              setRemove(null);
            }, 'Registro atualizado.')
          }
        />
      )}
    </>
  );
}
function UserAudit({ id }) {
  const { data: logs } = useData(`/audit-logs?user=${id}`, []);
  return (
    <>
      <h3>Últimas ações</h3>
      <ol className="timeline">
        {logs.slice(0, 20).map((l) => (
          <li key={l._id}>
            <strong>{l.action}</strong>
            <span>
              {fmtDateTime(l.createdAt)} · {l.entity}
            </span>
          </li>
        ))}
      </ol>
      {!logs.length && <Empty text="Nenhuma ação registrada." />}
    </>
  );
}
