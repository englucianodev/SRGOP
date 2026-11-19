import { useEffect, useState } from 'react';
import { Download, Printer, Search } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { api, downloadFile } from '../services/api';
import { dateKey, params, fmtDateTime } from '../utils/format';
import { PageTitle, Panel, Input, Select, Button, Loading, Empty } from './UI';
import Collapsible from './Collapsible';
import FactList from './FactList';
import ScrollArea from './ScrollArea';
import Kpi from './operation/Kpi';

const initial = () => ({
  from: `${dateKey().slice(0, 7)}-01`,
  to: dateKey(),
  vehicles: [],
  phase: 'all',
  changesOnly: false,
});
const dateLabel = (value) => value.split('-').reverse().join('/');
const momentLabel = (phase) =>
  phase === 'intake'
    ? 'Somente recebimentos'
    : phase === 'delivery'
      ? 'Somente entregas'
      : 'Recebimentos e entregas';
export default function VehicleReport() {
  const app = useApp();
  const { data: vehicles } = useData('/vehicles', []);
  const [draft, setDraft] = useState(initial),
    [filters, setFilters] = useState(initial);
  const [data, setData] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [emission, setEmission] = useState(0);
  const query = params({ ...filters, vehicles: filters.vehicles.join(',') });
  useEffect(() => {
    let current = true;
    setLoading(true);
    setData(null);
    setError('');
    api
      .get(`/reports/vehicles?${query}`, { quiet: true })
      .then((r) => {
        if (current) setData(r.data);
      })
      .catch((e) => {
        if (current)
          setError(e.response?.data?.message || 'Não foi possível gerar o relatório de viaturas.');
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [query, emission]);
  return (
    <>
      <PageTitle
        title="Relatório de viaturas"
        description="Checklists de recebimento e entrega, condições e alterações informadas pelos policiais."
      >
        <Button variant="secondary" disabled={!data || loading} onClick={() => window.print()}>
          <Printer size={16} />
          Imprimir / PDF
        </Button>
        <Button
          disabled={!data || loading}
          onClick={() =>
            app.run(() =>
              downloadFile(
                `/reports/vehicles?${query}&format=csv`,
                'srgop-checklists-viaturas.csv',
              ),
            )
          }
        >
          <Download size={16} />
          Exportar checklists CSV
        </Button>
      </PageTitle>
      <Panel className="no-print">
        <form
          className="trace-filters vehicle-report-filters"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters({ ...draft, vehicles: [...draft.vehicles] });
            setEmission((v) => v + 1);
          }}
        >
          <div className="filter-fields">
            <Input
              label="Período inicial"
              type="date"
              required
              value={draft.from}
              max={draft.to || undefined}
              onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            />
            <Input
              label="Período final"
              type="date"
              required
              value={draft.to}
              min={draft.from || undefined}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            />
            <Select
              label="Viaturas para o relatório"
              multiple
              size={Math.min(6, Math.max(3, vehicles.length))}
              value={draft.vehicles}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  vehicles: Array.from(e.target.selectedOptions, (o) => o.value),
                })
              }
              hint="Sem seleção, todas as viaturas serão incluídas. Use Ctrl para selecionar várias no computador."
            >
              {vehicles.map((v) => (
                <option key={v._id} value={v._id}>
                  {v.prefix} · {v.city?.name}
                </option>
              ))}
            </Select>
            <Select
              label="Momento do checklist"
              value={draft.phase}
              onChange={(e) => setDraft({ ...draft, phase: e.target.value })}
            >
              <option value="all">Recebimentos e entregas</option>
              <option value="intake">Início do serviço / Recebimento</option>
              <option value="delivery">Término do serviço / Entrega</option>
            </Select>
          </div>
          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={draft.changesOnly}
              onChange={(e) => setDraft({ ...draft, changesOnly: e.target.checked })}
            />
            Somente checklists com alterações (C/A)
          </label>
          <div className="form-actions">
            <Button type="submit" busy={loading}>
              <Search size={16} />
              Gerar relatório de viaturas
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDraft({ ...draft, vehicles: [] })}
            >
              Selecionar todas as viaturas
            </Button>
          </div>
        </form>
      </Panel>
      {loading && <Loading />}
      {error && (
        <p role="alert" className="trace-note">
          {error}
        </p>
      )}
      {data && (
        <div className="report-content printable">
          <Panel title="Critérios do relatório">
            <FactList
              items={[
                [
                  'Período',
                  `${dateLabel(data.from)} a ${dateLabel(data.to)} — dias completos no horário de Fortaleza`,
                ],
                ['Viaturas', data.vehicles.map((v) => v.prefix).join(', ') || 'Nenhuma cadastrada'],
                [
                  'Checklists',
                  `${momentLabel(data.phase)} · ${data.changesOnly ? 'Somente checklists com C/A' : 'Todos os checklists registrados'}`,
                ],
                ['Emitido em', fmtDateTime(data.generatedAt)],
              ]}
            />
          </Panel>
          <div className="kpis wide">
            {[
              ['Recebimentos', data.totals.intake],
              ['Entregas', data.totals.delivery],
              ['Checklists com C/A', data.totals.withChanges],
              ['Itens com C/A', data.totals.alterations],
            ].map(([label, value]) => (
              <Kpi
                key={label}
                value={value}
                label={label}
                tone={label.includes('C/A') ? 'warn' : ''}
              />
            ))}
          </div>
          {!data.vehicles.length && <Empty text="Nenhuma viatura cadastrada para o relatório." />}
          {data.vehicles.map((v) => (
            <Collapsible
              key={v._id}
              className="trace-crew"
              title={`${v.prefix} · ${v.plate}`}
              subtitle={`${v.brand || ''} ${v.model || ''} · ${v.type} · ${v.city}`}
              chips={[`${v.checklists.length} checklists`]}
              defaultOpen={data.vehicles.length === 1}
            >
              {!v.checklists.length ? (
                <p className="trace-note">
                  Nenhum checklist corresponde aos filtros desta viatura.
                </p>
              ) : (
                v.checklists.map((c) => (
                  <section className="trace-shift" key={c._id}>
                    <h3>{c.moment}</h3>
                    <FactList
                      items={[
                        ['Data', fmtDateTime(c.at)],
                        ['KM registrado', `${c.mileage.toLocaleString('pt-BR')} km`],
                        ['Policial', c.officer],
                        ['Guarnição', `${c.crew}${c.serviceCity ? ` · ${c.serviceCity}` : ''}`],
                      ]}
                    />
                    <ScrollArea label={`Itens do checklist: ${c.moment}`}>
                      <table>
                        <thead>
                          <tr>
                            <th>Item verificado</th>
                            <th>Condição</th>
                            <th>Observação informada</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.items.map((item) => (
                            <tr key={item.key}>
                              <td>{item.label}</td>
                              <td>
                                <strong className={item.state === 'C/A' ? 'danger-text' : ''}>
                                  {item.state}
                                </strong>
                              </td>
                              <td style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                                {item.observation || 'Sem observação'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </ScrollArea>
                  </section>
                ))
              )}
            </Collapsible>
          ))}
          <p className="trace-note">
            S/A: sem alteração · C/A: com alteração. O período considera a data efetiva de cada
            recebimento ou entrega, inclusive entregas preenchidas após o encerramento automático do
            serviço. Pendências sem checklist preenchido não são apresentadas como inspeções
            concluídas. Identificação das viaturas e dos policiais conforme o cadastro atual;
            guarnição e município do serviço conforme o histórico disponível.
          </p>
        </div>
      )}
    </>
  );
}
