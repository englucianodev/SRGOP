import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Plus,
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
import { PageTitle, Panel, Badge, Loading, Button, Empty } from '../components/UI';
import OperationalMap from '../components/OperationalMap';
import FieldDashboard from './FieldDashboard';
export default function Dashboard() {
  const app = useApp();
  const { data, loading } = useData('/dashboard');
  const { data: cities } = useData('/cities', []);
  if (loading && !data) return <Loading />;
  if (!data) return <Empty text="Não foi possível carregar o Dashboard." />;
  if (app.user.role === 'Praça') return <FieldDashboard data={data} />;
  const total = data.counts.reduce((s, r) => s + r.count, 0);
  const closed = data.counts.find((r) => r._id === 'Encerrada')?.count || 0;
  const inService = data.crews.filter(
    (c) => c.status !== 'Fora de serviço' && +new Date(c.shiftEnd) > app.now,
  );
  const myCrew = data.crews.find((c) => c.members.some((m) => m._id === app.user._id));
  const modules = app.settings?.modules || [];
  const first = app.user.name.split(' ')[0];
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
      note: 'Atendimentos encerrados hoje',
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
      <PageTitle
        title={app.user.role === 'Praça' ? `Bom serviço, ${first}.` : 'Visão geral da operação'}
        description={new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(app.now)}
      >
        <span className="live-label">
          <i className={`live-dot ${app.online ? '' : 'offline'}`} />
          {app.online ? 'Atualização em tempo real' : 'Conectando'}
        </span>
        <Link className="button primary" to="/ocorrencias?nova=1">
          <Plus size={17} />
          Nova ocorrência
        </Link>
      </PageTitle>
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
                ? `${myCrew.city?.name} · ${myCrew.vehicle?.prefix || 'Sem viatura'} · ${duration((+new Date(myCrew.shiftEnd) - app.now) / 1000)} restantes`
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
          </span>
          <span>
            <MapPin size={15} />
            <b>{cities.filter((c) => c.active).length}</b> municípios
          </span>
          <span>
            <UsersRound size={16} />
            <b>{inService.length}</b> guarnições em serviço
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
          subtitle="Distribuição das ocorrências de hoje"
          actions={<span className="period-pill">Hoje</span>}
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
              <h2>{data.cpu?.officer?.name || 'Aguardando responsável'}</h2>
              <p>
                {data.cpu
                  ? `${fmtDate(data.cpu.assumedAt)} · Assumiu às ${fmtTime(data.cpu.assumedAt)}`
                  : 'Nenhum Oficial assumiu o serviço de hoje.'}
              </p>
              {app.user.role === 'Oficial' && !data.cpu && (
                <Button
                  variant="light"
                  onClick={() => app.run(() => api.post('/cpu'), 'Você assumiu o CPU de hoje.')}
                >
                  Assumir CPU <ArrowUpRight size={16} />
                </Button>
              )}
              {data.cpu && (
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
            title="Área de cobertura"
            actions={
              <Link className="panel-link" to="/mapa">
                Ampliar <ArrowUpRight size={16} />
              </Link>
            }
          >
            <OperationalMap cities={cities} occurrences={data.recent} compact />
            <div className="map-legend">
              <span>
                <i className="legend-dot red" />
                Alta
              </span>
              <span>
                <i className="legend-dot amber" />
                Média
              </span>
              <span>
                <i className="legend-dot blue" />
                Baixa
              </span>
              <span>{cities.filter((c) => c.active).length} cidades</span>
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
                <span className="tabular">
                  {duration((+new Date(c.shiftEnd) - app.now) / 1000)}
                </span>
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
    </>
  );
}
