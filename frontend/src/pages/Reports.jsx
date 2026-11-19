import { useState, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import {
  Car,
  Clock,
  Database,
  Download,
  FileChartColumn,
  FileText,
  LayoutDashboard,
  Printer,
  Users,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { downloadFile } from '../services/api';
import { params, duration, fmtDateTime, serviceDayKey } from '../utils/format';
import { PageTitle, Panel, Button, Badge, Loading, Select, Input, Empty } from '../components/UI';
import OccurrenceFilters from '../components/OccurrenceFilters';
import Tabs, { useStoredChoice } from '../components/Tabs';
import ScrollArea from '../components/ScrollArea';
import Kpi from '../components/operation/Kpi';
const CrewTraceReport = lazy(() => import('../components/CrewTraceReport'));
const VehicleReport = lazy(() => import('../components/VehicleReport'));
// These averages exist only when some occurrence in the period has the arrival registered.
const averageTime = (seconds) => (seconds == null ? '—' : duration(seconds));
const MODES = [
  ['crews', 'Guarnições', Users],
  ['vehicles', 'Viaturas', Car],
  ['general', 'Indicadores gerais', FileChartColumn],
];
const SECTIONS = [
  ['resumo', 'Resumo', LayoutDashboard],
  ['ocorrencias', 'Ocorrências', FileText],
  ['cpu', 'Turnos CPU', Clock],
  ['guarnicoes', 'Guarnições', Users],
  ['cadastros', 'Cadastros', Database],
];
const ids = (tabs) => tabs.map(([id]) => id);
// Counters that deserve a color: what is still open, what got closed, and the times.
const KPI_TONE = {
  'Em aberto / andamento': 'hot',
  Encerradas: 'ok',
  'Tempo médio': 'warn',
  'Deslocamento médio': 'warn',
  'Tempo médio no local': 'warn',
};

export default function Reports() {
  const [mode, setMode] = useStoredChoice('srgop-relatorios-modo', ids(MODES), 'crews');
  return (
    <>
      <div className="no-print">
        <Tabs
          tabs={MODES}
          value={mode}
          onChange={setMode}
          label="Tipo de relatório"
          idPrefix="report-mode"
        />
      </div>
      <div role="tabpanel" id="report-mode-panel" aria-labelledby={`report-mode-tab-${mode}`}>
        <Suspense fallback={<Loading />}>
          {mode === 'crews' ? (
            <CrewTraceReport />
          ) : mode === 'vehicles' ? (
            <VehicleReport />
          ) : (
            <GeneralReports />
          )}
        </Suspense>
      </div>
    </>
  );
}

/** One sub-tab of the general report: always in the DOM, hidden on screen when inactive, printed. */
function ReportSection({ id, active, className = '', children }) {
  return (
    <section
      data-section={id}
      role="tabpanel"
      id={active ? 'report-section-panel' : undefined}
      aria-labelledby={`report-section-tab-${id}`}
      className={`report-section ${className}${active ? '' : ' is-inactive'}`}
    >
      {children}
    </section>
  );
}

const CLOSE_LABEL = (shift) => shift.closeReason || (shift.end ? 'Encerrado' : 'Em andamento');

/** CPU shifts of the filter period, each linking to its report, plus a duty-day report by date. */
function CpuShiftsPanel({ from, to }) {
  const [day, setDay] = useState(serviceDayKey);
  const { data, loading } = useData(`/reports/cpu-shifts?${params({ from, to })}`);
  const shifts = data || [];
  return (
    <Panel
      title="Turnos do CPU"
      subtitle="Relatório sintético e analítico de cada turno no período"
      className="no-print"
      actions={
        <div className="title-actions">
          <Input
            label="Dia de serviço"
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
          {day && (
            <Link className="button secondary" to={`/relatorios/dia/${day}?modo=sintetico`}>
              Relatório do dia
            </Link>
          )}
        </div>
      }
    >
      {loading && !data ? (
        <Loading />
      ) : shifts.length ? (
        <ScrollArea label="Turnos do CPU">
          <table>
            <thead>
              <tr>
                <th>Dia</th>
                <th>Oficial</th>
                <th>Início</th>
                <th>Fim</th>
                <th>Situação</th>
                <th>Relatório</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((shift) => (
                <tr key={shift._id}>
                  <td>{shift.day}</td>
                  <td>{shift.officer || '—'}</td>
                  <td>{fmtDateTime(shift.start)}</td>
                  <td>{fmtDateTime(shift.end)}</td>
                  <td>{CLOSE_LABEL(shift)}</td>
                  <td>
                    <Link to={`/relatorios/turno-cpu/${shift._id}?modo=sintetico`}>Sintético</Link>
                    {' · '}
                    <Link to={`/relatorios/turno-cpu/${shift._id}?modo=analitico`}>Analítico</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      ) : (
        <Empty text="Nenhum turno do CPU no período." />
      )}
    </Panel>
  );
}

function GeneralReports() {
  const app = useApp();
  const [filters, setFilters] = useState({});
  const [group, setGroup] = useState('city');
  const { data, loading } = useData(`/reports?${params(filters)}`);
  const [section, setSection] = useStoredChoice('srgop-relatorios-secao', ids(SECTIONS), 'resumo');
  const on = (id) => section === id;
  return (
    <>
      <PageTitle
        title="Relatórios e indicadores"
        description="Analise os registros e os resultados da atividade operacional."
      >
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer size={16} />
          Imprimir / PDF
        </Button>
        <Button
          onClick={() =>
            app.run(() =>
              downloadFile(
                `/reports?${params({ ...filters, format: 'csv' })}`,
                'srgop-relatorio.csv',
              ),
            )
          }
        >
          <Download size={17} />
          Exportar CSV
        </Button>
      </PageTitle>
      <Panel className="no-print">
        <OccurrenceFilters value={filters} onChange={setFilters} reports />
      </Panel>
      <div className="no-print">
        <Tabs
          tabs={SECTIONS}
          value={section}
          onChange={setSection}
          label="Seções do relatório"
          idPrefix="report-section"
        />
      </div>
      <ReportSection id="cpu" active={on('cpu')} className="no-print">
        <CpuShiftsPanel from={filters.from} to={filters.to} />
      </ReportSection>
      {loading && !data
        ? !on('cpu') && <Loading />
        : data && (
            <div className="report-content printable">
              <ReportSection id="resumo" active={on('resumo')}>
                <div className="kpis wide">
                  {[
                    ['Ocorrências', data.totals.total],
                    ['Encerradas', data.totals.closed],
                    ['Em aberto / andamento', data.totals.open],
                    ['Tempo médio', duration(data.totals.averageSeconds)],
                    ['Deslocamento médio', averageTime(data.totals.averageTravelSeconds)],
                    ['Tempo médio no local', averageTime(data.totals.averageOnSceneSeconds)],
                    ['Armas apreendidas', data.totals.weapons],
                    ['Veículos recuperados', data.totals.recoveredVehicles],
                    ['Conduzidos', data.totals.detained],
                    ['Abordagens', data.totals.approaches],
                  ].map(([label, value]) => (
                    <Kpi key={label} value={value} label={label} tone={KPI_TONE[label]} />
                  ))}
                </div>
                <Panel
                  title="Distribuição das ocorrências"
                  actions={
                    <Select
                      label="Agrupar por"
                      value={group}
                      onChange={(e) => setGroup(e.target.value)}
                    >
                      {[
                        ['city', 'Município'],
                        ['crimeType', 'Tipo de crime'],
                        ['priority', 'Prioridade'],
                        ['status', 'Status'],
                        ['crew', 'Guarnição'],
                        ['vehicle', 'Viatura'],
                      ].map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  }
                >
                  <div className="bar-chart">
                    {Object.entries(data.grouped[group]).map(([label, value]) => (
                      <div className="bar-row" key={label}>
                        <span>{label}</span>
                        <div>
                          <i
                            style={{
                              width: `${(value / Math.max(1, ...Object.values(data.grouped[group]))) * 100}%`,
                            }}
                          />
                        </div>
                        <strong>{value}</strong>
                      </div>
                    ))}
                    {!data.rows.length && (
                      <p className="muted">Nenhuma ocorrência no período selecionado.</p>
                    )}
                  </div>
                </Panel>
              </ReportSection>
              <ReportSection id="ocorrencias" active={on('ocorrencias')}>
                <Panel
                  title="Ocorrências por período"
                  subtitle={`${data.rows.length} registros encontrados`}
                >
                  <ScrollArea label="Ocorrências por período">
                    <table>
                      <thead>
                        <tr>
                          <th>Protocolo</th>
                          <th>Data</th>
                          <th>Cidade</th>
                          <th>Tipo</th>
                          <th>Status</th>
                          <th>Guarnição</th>
                          <th>Duração</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.rows.map((r) => (
                          <tr key={r._id}>
                            <td>{r.protocol}</td>
                            <td>{fmtDateTime(r.occurredAt)}</td>
                            <td>{r.city?.name}</td>
                            <td>{r.crimeType}</td>
                            <td>
                              <Badge>{r.status}</Badge>
                            </td>
                            <td>{r.crew?.name || '—'}</td>
                            <td>{duration(r.durationSeconds)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollArea>
                </Panel>
              </ReportSection>
              <ReportSection id="guarnicoes" active={on('guarnicoes')}>
                <Panel title="Turnos das guarnições">
                  <ScrollArea label="Turnos das guarnições">
                    <table>
                      <thead>
                        <tr>
                          <th>Guarnição</th>
                          <th>Início</th>
                          <th>Fim previsto</th>
                          <th>Fim efetivo</th>
                          <th>Autorizado por</th>
                          <th>Motivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.shifts.map((s) => (
                          <tr key={s._id}>
                            <td>{s.crew?.name || 'Guarnição removida'}</td>
                            <td>{fmtDateTime(s.start)}</td>
                            <td>{fmtDateTime(s.plannedEnd)}</td>
                            <td>{fmtDateTime(s.end)}</td>
                            <td>{s.endedBy?.name || 'Sistema'}</td>
                            <td>{s.reason || 'Turno em andamento'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollArea>
                </Panel>
              </ReportSection>
              <ReportSection id="cadastros" active={on('cadastros')}>
                <div className="two-columns report-cadastros">
                  <Panel title="Usuários ativos" subtitle={`${data.users.length} usuários`}>
                    <ScrollArea label="Usuários ativos">
                      <table>
                        <thead>
                          <tr>
                            <th>Nome</th>
                            <th>Perfil</th>
                            <th>Município</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.users.map((u) => (
                            <tr key={u._id}>
                              <td>{u.name}</td>
                              <td>{u.role}</td>
                              <td>{u.city?.name}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </ScrollArea>
                  </Panel>
                  <Panel
                    title="Viaturas em manutenção"
                    subtitle={`${data.vehicles.length} viaturas`}
                  >
                    <ScrollArea label="Viaturas em manutenção">
                      <table>
                        <thead>
                          <tr>
                            <th>Prefixo</th>
                            <th>Placa</th>
                            <th>Município</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.vehicles.map((v) => (
                            <tr key={v._id}>
                              <td>{v.prefix}</td>
                              <td>{v.plate}</td>
                              <td>{v.city?.name}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </ScrollArea>
                  </Panel>
                </div>
              </ReportSection>
              <p className="form-note">
                O período considera a data da ocorrência; turnos consideram o início do serviço.
                Usuários ativos e viaturas em manutenção representam a situação atual. Exportação
                CSV contém as ocorrências; a impressão / PDF inclui todo o relatório.
              </p>
            </div>
          )}
    </>
  );
}
