import { useState } from 'react';
import { isOnDuty, dutyClock } from '../utils/duty';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Siren,
  Shield,
  Car,
  CircleCheck,
  Radio,
  ArrowRight,
  MapPin,
  UsersRound,
  Clock3,
  Crosshair,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { api } from '../services/api';
import { duration, fmtTime, fmtDate } from '../utils/format';
import { Panel, Badge, Loading, Button, Empty } from '../components/UI';
import SituationMap from '../components/operation/SituationMap';
import HandoverDialog from '../components/HandoverSummary';
import { useConnectionState } from '../components/ConnectionStatus';
import CpuTransferDialog from '../components/cpu/CpuTransferDialog';
import CpuPendingList from '../components/cpu/CpuPendingList';
import FieldDashboard from './FieldDashboard';
export default function Dashboard() {
  const app = useApp();
  const connectionState = useConnectionState();
  const { data, loading } = useData('/dashboard');
  const { data: cities } = useData('/cities', []);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  // /dashboard carries no pending items; /cpu does, and is for managers only.
  const { data: cpuDetail } = useData(app.user.role === 'Praça' ? null : '/cpu');
  // The officer who assumes sees what is pending right away.
  const assumeCpu = async () => {
    const assumed = await app.run(() => api.post('/cpu'), 'Você assumiu o CPU de hoje.');
    if (assumed) setHandoverOpen(true);
  };
  if (loading && !data) return <Loading />;
  if (!data) return <Empty text="Não foi possível carregar o Dashboard." />;
  if (app.user.role === 'Praça') return <FieldDashboard data={data} />;
  const total = data.counts.reduce((s, r) => s + r.count, 0);
  const closed = data.counts.find((r) => r._id === 'Encerrada')?.count || 0;
  const inService = data.crews.filter(
    (c) => c.status !== 'Fora de serviço' && isOnDuty(c, app.now),
  );
  const deployedPolice = new Set(inService.flatMap((crew) => crew.members.map((m) => m._id))).size;
  const myCrew = data.crews.find((c) => c.members.some((m) => m._id === app.user._id));
  const modules = app.settings?.modules || [];
  const cpu = cpuDetail || data.cpu;
  const isMyCpu = !!cpu && String(cpu.officer?._id ?? cpu.officer) === String(app.user._id);
  const shiftOver = !!cpu?.plannedEnd && +new Date(cpu.plannedEnd) <= app.now;
  const cancelTransfer = () => app.run(() => api.delete('/cpu/transfer'), 'Passagem cancelada.');
  const metrics = [
    {
      name: 'Alertas',
      value: data.alerts,
      note: 'Ocorrências que exigem atenção',
      icon: Siren,
      tone: 'red',
    },
    {
      name: 'Ocorrências atendidas',
      value: data.results?.closed || 0,
      note: 'Encerrados neste serviço (desde 8h)',
      icon: CircleCheck,
      tone: 'green',
    },
    {
      name: 'Em andamento',
      value: data.ongoing.length,
      note: 'Despachadas e em atendimento',
      icon: Radio,
      tone: 'blue',
    },
    {
      name: 'Armas Apreendidas',
      value: data.results?.weapons || 0,
      note: 'Registradas nos atendimentos',
      icon: Crosshair,
      tone: 'amber',
    },
    {
      name: 'Veículos Recuperados',
      value: data.results?.recoveredVehicles || 0,
      note: 'Registrados nos atendimentos',
      icon: Car,
      tone: 'blue',
    },
  ];
  return (
    <>
      {app.user.role === 'Praça' ? (
        <div className="field-welcome">
          <div className="round-icon">
            <Shield size={28} />
          </div>
          <div>
            <span className="eyebrow">SEU TURNO</span>
            <h2>{myCrew ? myCrew.name : 'Pronto para iniciar o serviço?'}</h2>
            <p>
              {myCrew
                ? `${myCrew.city?.name} · ${myCrew.vehicle?.prefix || 'Sem viatura'} · ${dutyClock(myCrew, app.now)} restantes`
                : 'Ingresse em uma guarnição para receber os despachos da central.'}
            </p>
          </div>
          <Link className="button primary" to={myCrew ? '/atendimento' : '/guarnicoes'}>
            {myCrew ? 'Meus atendimentos' : 'Ingressar na guarnição'}
            <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <div className="overview-strip">
          <span>
            <Shield size={17} />
            <b>18º BPM</b> <span className="muted">Área operacional</span>
            <span className="live-label" role="status">
              <i className={`live-dot ${app.online ? '' : 'offline'}`} />
              {app.online
                ? 'Atualização em tempo real'
                : connectionState === 'reconectando'
                  ? 'Reconectando…'
                  : 'Conectando'}
            </span>
          </span>
          <span>
            <MapPin size={15} />
            <b>{cities.filter((c) => c.active).length}</b> municípios
          </span>
          <span>
            <UsersRound size={16} />
            <b>{inService.length}</b> guarnições em serviço
          </span>
          <span>
            <b>{deployedPolice}</b> Policiais
          </span>
          <span className="strip-last">
            <Clock3 size={15} />
            {fmtTime(app.now)} <span className="muted">horário local</span>
          </span>
        </div>
      )}
      <div className="metric-grid">
        {metrics
          .filter((m) => modules.includes(m.name))
          .map((m) => (
            <div key={m.name} className="metric-card">
              <div className="metric-label">
                <span>{m.name}</span>
                <span className={`metric-icon ${m.tone}`}>
                  <m.icon size={18} />
                </span>
              </div>
              <strong>{String(m.value).padStart(2, '0')}</strong>
              <small>{m.note}</small>
            </div>
          ))}
      </div>
      <div className="dashboard-upper">
        <Panel
          title="Panorama operacional"
          subtitle="Ocorrências do serviço (8h às 8h) e pendências ainda abertas"
          actions={<span className="period-pill">Serviço</span>}
        >
          <div className="panorama">
            <div
              className="donut"
              style={{ '--progress': `${total ? (closed / total) * 100 : 0}%` }}
            >
              <div>
                <strong>{String(total).padStart(2, '0')}</strong>
                <span>ocorrências</span>
              </div>
            </div>
            <div className="status-breakdown">
              {['Em aberto', 'Despachada', 'Em atendimento', 'Encerrada'].map((status, i) => (
                <div key={status}>
                  <span>
                    <i style={{ background: ['#eeb04d', '#9bb7d3', '#367fba', '#3e9d7b'][i] }} />
                    {status}
                  </span>
                  <b>
                    {String(data.counts.find((r) => r._id === status)?.count || 0).padStart(2, '0')}
                  </b>
                </div>
              ))}
            </div>
          </div>
          <div className="panel-bottom">
            <span>
              <CircleCheck size={15} />
              {total ? Math.round((closed / total) * 100) : 0}% das ocorrências concluídas
            </span>
            <Link to="/ocorrencias">
              Ver ocorrências <ArrowRight size={14} />
            </Link>
          </div>
        </Panel>
        <div className="command-cards">
          {modules.includes('CPU') && (
            <Panel className="cpu-panel">
              <div className="cpu-top">
                <span className="eyebrow">COORDENAÇÃO DO SERVIÇO</span>
                <Shield size={22} />
              </div>
              <small>CPU do dia</small>
              <h2>{cpu?.officer?.name || 'Aguardando responsável'}</h2>
              <p>
                {cpu
                  ? `${fmtDate(cpu.assumedAt)} · Assumiu às ${fmtTime(cpu.assumedAt)}`
                  : 'Nenhum Oficial assumiu o serviço de hoje.'}
              </p>
              {cpu && (
                <p className="cpu-shift-state">
                  {shiftOver
                    ? 'Turno encerrado: aguardando o fechamento.'
                    : `Turno em andamento até ${fmtTime(cpu.plannedEnd)}`}
                </p>
              )}
              {shiftOver && <CpuPendingList pending={cpu.pending} />}
              {cpu?.transfer && (
                <p className="cpu-transfer-pending">
                  Passagem enviada, aguardando aceite.
                  {isMyCpu && (
                    <Button variant="light" onClick={cancelTransfer}>
                      Cancelar
                    </Button>
                  )}
                </p>
              )}
              <div className="cpu-actions">
                {app.user.role === 'Oficial' && !cpu && (
                  <Button variant="light" onClick={assumeCpu}>
                    Assumir CPU <ArrowUpRight size={16} />
                  </Button>
                )}
                {isMyCpu && !cpu.transfer && (
                  <Button variant="light" onClick={() => setTransferOpen(true)}>
                    Passar serviço
                  </Button>
                )}
                <Button variant="light" onClick={() => setHandoverOpen(true)}>
                  Passagem de serviço
                </Button>
              </div>
              {cpu && (
                <span className="cpu-active">
                  <i className="live-dot" />
                  Responsável pelo serviço
                </span>
              )}
            </Panel>
          )}
          {modules.includes('Operações') && (
            <Panel className="operation-card">
              <div className="operation-icon">
                <Shield size={21} />
              </div>
              <div>
                <span className="eyebrow">OPERAÇÃO DO DIA</span>
                <h3>{data.operations[0]?.name || 'Nenhuma operação programada'}</h3>
                <p>{data.operations[0]?.objective || 'As operações do dia serão exibidas aqui.'}</p>
                {data.operations.slice(1).map((o) => (
                  <p key={o._id}>
                    <b>{o.name}:</b> {o.objective}
                  </p>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>
      <div className="dashboard-lower">
        <Panel
          title="Últimas ocorrências"
          subtitle="Acompanhe os registros mais recentes"
          actions={
            <Link className="panel-link" to="/ocorrencias">
              Ver todas <ArrowRight size={15} />
            </Link>
          }
        >
          {!data.recent.length ? (
            <Empty />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Ocorrência</th>
                    <th>Município</th>
                    <th>Prioridade</th>
                    <th>Status</th>
                    <th>Hora</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((o) => (
                    <tr key={o._id}>
                      <td>
                        <Link className="cell-title" to={`/ocorrencias?ver=${o._id}`}>
                          {o.crimeType}
                        </Link>
                        <small className="cell-sub">{o.protocol}</small>
                      </td>
                      <td>{o.city?.name}</td>
                      <td>
                        <Badge>{o.priority}</Badge>
                      </td>
                      <td>
                        <Badge>{o.status}</Badge>
                      </td>
                      <td className="tabular">{fmtTime(o.occurredAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        {app.user.role !== 'Praça' && (
          <Panel
            title="Mapa da operação"
            actions={
              <Link className="panel-link" to="/operacao">
                Ampliar <ArrowUpRight size={16} />
              </Link>
            }
          >
            <div className="situation-room">
              <SituationMap
                cities={cities}
                occurrences={data.open || []}
                crews={data.crews}
                now={app.now}
                compact
              />
            </div>
          </Panel>
        )}
      </div>
      <Panel
        title="Guarnições em serviço"
        subtitle="Disponibilidade e tempo restante do turno"
        actions={
          <Link className="panel-link" to="/guarnicoes">
            Ver guarnições <ArrowRight size={15} />
          </Link>
        }
      >
        {!inService.length ? (
          <Empty text="Nenhuma guarnição em serviço.">
            <Link to="/guarnicoes">Iniciar um turno →</Link>
          </Empty>
        ) : (
          <div className="crew-summary-grid">
            {inService.map((c) => (
              <div className="crew-summary" key={c._id}>
                <div className="crew-card-icon">
                  <UsersRound size={20} />
                </div>
                <div>
                  <strong>{c.name}</strong>
                  <small>
                    {c.city?.name} · {c.vehicle?.prefix || 'Sem viatura'}
                  </small>
                  <Badge>{c.status}</Badge>
                </div>
                <span className="tabular">{dutyClock(c, app.now)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
      {data.ongoing.length > 0 && (
        <Panel title="Em andamento hoje">
          <div className="ongoing-list">
            {data.ongoing.map((o) => (
              <Link key={o._id} to={`/ocorrencias?ver=${o._id}`}>
                <Badge>{o.priority}</Badge>
                <strong>{o.crimeType}</strong>
                <span>{o.city?.name}</span>
                <ArrowUpRight size={16} />
              </Link>
            ))}
          </div>
        </Panel>
      )}
      {transferOpen && <CpuTransferDialog onClose={() => setTransferOpen(false)} />}
      {handoverOpen && <HandoverDialog onClose={() => setHandoverOpen(false)} />}
    </>
  );
}
