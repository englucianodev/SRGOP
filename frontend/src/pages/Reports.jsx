import { useState } from 'react';
import { Download, Printer, FileChartColumn } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { downloadFile } from '../services/api';
import { params, duration, fmtDateTime } from '../utils/format';
import { PageTitle, Panel, Button, Badge, Loading, Select } from '../components/UI';
import OccurrenceFilters from '../components/OccurrenceFilters';
export default function Reports() {
  const app = useApp();
  const [filters, setFilters] = useState({});
  const [group, setGroup] = useState('city');
  const { data, loading } = useData(`/reports?${params(filters)}`);
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
      {loading && !data ? (
        <Loading />
      ) : (
        data && (
          <div className="report-content printable">
            <div className="small-metrics">
              {[
                ['Ocorrências', data.totals.total],
                ['Encerradas', data.totals.closed],
                ['Em aberto / andamento', data.totals.open],
                ['Tempo médio', duration(data.totals.averageSeconds)],
                ['Armas apreendidas', data.totals.weapons],
                ['Veículos recuperados', data.totals.recoveredVehicles],
                ['Conduzidos', data.totals.detained],
                ['Abordagens', data.totals.approaches],
              ].map(([label, value]) => (
                <Panel key={label}>
                  <span className="muted">{label}</span>
                  <strong>{value}</strong>
                </Panel>
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
            <Panel
              title="Ocorrências por período"
              subtitle={`${data.rows.length} registros encontrados`}
            >
              <div className="table-scroll">
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
              </div>
            </Panel>
            <div className="two-columns">
              <Panel title="Usuários ativos" subtitle={`${data.users.length} usuários`}>
                <div className="table-scroll">
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
                </div>
              </Panel>
              <Panel title="Viaturas em manutenção" subtitle={`${data.vehicles.length} viaturas`}>
                <div className="table-scroll">
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
                </div>
              </Panel>
            </div>
            <Panel title="Turnos das guarnições">
              <div className="table-scroll">
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
              </div>
            </Panel>
            <p className="form-note">
              O período considera a data da ocorrência; turnos consideram o início do serviço.
              Usuários ativos e viaturas em manutenção representam a situação atual. Exportação CSV
              contém as ocorrências; a impressão / PDF inclui todo o relatório.
            </p>
          </div>
        )
      )}
    </>
  );
}
