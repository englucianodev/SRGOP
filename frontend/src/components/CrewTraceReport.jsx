import { useEffect, useState } from 'react';
import { Download, Printer, Search } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { api, downloadFile } from '../services/api';
import { dateKey, params } from '../utils/format';
import { PageTitle, Panel, Input, Select, Button, Badge, Loading, Empty } from './UI';
import Collapsible from './Collapsible';
import FactList from './FactList';
import ScrollArea from './ScrollArea';

const dateTime = (value) =>
  value
    ? new Date(value).toLocaleString('pt-BR', {
        timeZone: 'America/Fortaleza',
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : '—';
const dayLabel = (value) => value.split('-').reverse().join('/');
const initial = () => ({ from: `${dateKey().slice(0, 7)}-01`, to: dateKey(), crews: [] });
function Attendances({ rows }) {
  if (!rows.length)
    return <p className="trace-note">Nenhum atendimento registrado para este turno no período.</p>;
  return (
    <ScrollArea label="Ocorrências atendidas">
      <table>
        <thead>
          <tr>
            <th>Ocorrência / tipo</th>
            <th>Participação</th>
            <th>Início do atendimento</th>
            <th>Fim do atendimento</th>
            <th>Situação</th>
            <th>Responsável / autorizador</th>
            <th>Integrantes no início</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a._id}>
              <td>
                <strong>{a.protocol}</strong>
                <br />
                {a.crimeType}
              </td>
              <td>{a.type}</td>
              <td>
                {dateTime(a.startedAt)}
                {a.estimated && <small className="cell-sub">Histórico parcial / estimado</small>}
              </td>
              <td>{dateTime(a.endedAt)}</td>
              <td>
                <Badge>{a.status}</Badge>
              </td>
              <td>{a.responsible}</td>
              <td>
                {a.members.length
                  ? a.members.map((m) => m.name).join(', ')
                  : 'Não registrado no histórico disponível'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollArea>
  );
}
export default function CrewTraceReport() {
  const app = useApp();
  const { data: crews } = useData('/crews', []);
  const [draft, setDraft] = useState(initial);
  const [filters, setFilters] = useState(initial);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [emission, setEmission] = useState(0);
  const query = params({ ...filters, crews: filters.crews.join(',') });
  useEffect(() => {
    let states = [];
    const expand = () => {
      states = [...document.querySelectorAll('.trace-changes')].map((node) => [node, node.open]);
      states.forEach(([node]) => {
        node.open = true;
      });
    };
    const restore = () =>
      states.forEach(([node, open]) => {
        node.open = open;
      });
    window.addEventListener('beforeprint', expand);
    window.addEventListener('afterprint', restore);
    return () => {
      restore();
      window.removeEventListener('beforeprint', expand);
      window.removeEventListener('afterprint', restore);
    };
  }, []);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setData(null);
    setError('');
    api
      .get(`/reports/crews?${query}`, { quiet: true })
      .then((r) => {
        if (current) setData(r.data);
      })
      .catch((e) => {
        if (current) setError(e.response?.data?.message || 'Não foi possível gerar o relatório.');
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
        title="Rastreabilidade das guarnições"
        description="Turnos, integrantes e ocorrências atendidas no período selecionado."
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
                `/reports/crews?${query}&format=csv`,
                'srgop-rastreabilidade-guarnicoes.csv',
              ),
            )
          }
        >
          <Download size={16} />
          Exportar rastreabilidade CSV
        </Button>
      </PageTitle>
      <Panel className="no-print">
        <form
          className="trace-filters"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters({ ...draft, crews: [...draft.crews] });
            setEmission((value) => value + 1);
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
              label="Guarnições para o relatório"
              multiple
              size={Math.min(6, Math.max(3, crews.length))}
              value={draft.crews}
              onChange={(e) =>
                setDraft({ ...draft, crews: Array.from(e.target.selectedOptions, (o) => o.value) })
              }
              hint="Sem seleção, todas as guarnições serão incluídas. No computador, use Ctrl para selecionar várias."
            >
              {crews.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name} · {c.city?.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="form-actions">
            <Button type="submit" busy={loading}>
              <Search size={16} />
              Gerar relatório
            </Button>
            <Button type="button" variant="ghost" onClick={() => setDraft({ ...draft, crews: [] })}>
              Selecionar todas as guarnições
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
                  `${dayLabel(data.from)} a ${dayLabel(data.to)} (dias completos, horário de Fortaleza)`,
                ],
                ['Guarnições', data.crews.map((c) => c.name).join(', ') || 'Nenhuma cadastrada'],
                ['Emitido em', dateTime(data.generatedAt)],
              ]}
            />
          </Panel>
          {!data.crews.length && <Empty text="Nenhuma guarnição cadastrada." />}
          {data.crews.map((crew) => (
            <Collapsible
              key={crew._id}
              className="trace-crew"
              title={crew.name}
              subtitle={`${crew.city || 'Município não informado'} (cadastro atual)`}
              chips={[
                `${crew.shifts.length} turnos`,
                `${crew.workedDays.length} dias trabalhados`,
                `${crew.occurrenceCount} ocorrências distintas`,
              ]}
              defaultOpen={data.crews.length === 1}
            >
              <FactList
                items={[
                  [
                    'Dias trabalhados no período',
                    crew.workedDays.length
                      ? crew.workedDays.map(dayLabel).join(', ')
                      : 'Nenhum turno com serviço neste período.',
                  ],
                ]}
              />
              {!crew.shifts.length && !crew.unmatchedAttendances.length && (
                <p className="trace-note">
                  Nenhum turno ou atendimento registrado para esta guarnição no período.
                </p>
              )}
              {crew.shifts.map((shift) => (
                <article key={shift._id} className="trace-shift">
                  <h3>Turno de {dateTime(shift.start)}</h3>
                  {shift.shiftMode === 'Motocicleta' && (
                    <p>
                      <strong>Motocicleta · {shift.dutyPeriod}</strong>
                      <br />
                      Entrada arredondada: {dateTime(shift.roundedStart)} · Saída arredondada:{' '}
                      {dateTime(shift.roundedEnd)}. Os demais horários abaixo são os registros
                      reais.
                    </p>
                  )}
                  <FactList
                    items={[
                      [
                        'Equipe no turno',
                        `${shift.crewName} · ${shift.city || 'Município do turno não registrado'}${shift.vehicle ? ` · ${shift.vehicle}` : ''}`,
                      ],
                      ['Fim previsto', dateTime(shift.plannedEnd)],
                      ['Fim efetivo', shift.end ? dateTime(shift.end) : 'Não registrado'],
                      ['Serviço observado até', dateTime(shift.effectiveEnd)],
                      [
                        'Dias no período',
                        shift.workedDays.map(dayLabel).join(', ') ||
                          'Atendimento continuado; turno fora do período',
                      ],
                    ]}
                  />
                  <h4>Integrantes e períodos de participação</h4>
                  {shift.members.length ? (
                    <ScrollArea label="Integrantes do turno">
                      <table>
                        <thead>
                          <tr>
                            <th>Integrante</th>
                            <th>Ingresso</th>
                            <th>Saída / limite observado</th>
                            <th>Origem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {shift.members.map((m, index) => (
                            <tr key={`${m.memberId}-${index}`}>
                              <td>{m.name}</td>
                              <td>
                                {dateTime(m.roundedJoinedAt || m.joinedAt)}
                                {m.roundedJoinedAt && <small>Real: {dateTime(m.joinedAt)}</small>}
                              </td>
                              <td>
                                {dateTime(m.roundedLeftAt || m.leftAt)}
                                {m.roundedLeftAt && <small>Real: {dateTime(m.leftAt)}</small>}
                              </td>
                              <td>
                                {m.estimated
                                  ? 'Intervalo estimado; registro antigo sem ingresso'
                                  : 'Histórico de movimentações'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </ScrollArea>
                  ) : (
                    <p>Nenhum integrante com participação registrada neste período.</p>
                  )}
                  <h4>Ocorrências atendidas pela guarnição</h4>
                  <Attendances rows={shift.attendances} />
                  {!!shift.changes.length && (
                    <details className="trace-changes">
                      <summary>Movimentações dos integrantes ({shift.changes.length})</summary>
                      <ScrollArea label="Movimentações dos integrantes">
                        <table>
                          <thead>
                            <tr>
                              <th>Data</th>
                              <th>Integrante</th>
                              <th>Movimentação</th>
                              <th>Registrado por</th>
                              <th>Justificativa</th>
                            </tr>
                          </thead>
                          <tbody>
                            {shift.changes.map((c, index) => (
                              <tr key={index}>
                                <td>{dateTime(c.at)}</td>
                                <td>{c.member}</td>
                                <td>
                                  {c.action}
                                  {c.motorcycleRole && (
                                    <small>
                                      {c.motorcycleRole} · {c.vehiclePrefix || 'Motocicleta'}
                                    </small>
                                  )}
                                </td>
                                <td>{c.actor}</td>
                                <td>{c.reason || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </ScrollArea>
                    </details>
                  )}
                </article>
              ))}
              {!!crew.unmatchedAttendances.length && (
                <div className="trace-shift">
                  <h3>Atendimentos sem vínculo histórico de turno</h3>
                  <p>
                    O atendimento existe, mas não foi possível identificar seu turno nos registros
                    disponíveis.
                  </p>
                  <Attendances rows={crew.unmatchedAttendances} />
                </div>
              )}
            </Collapsible>
          ))}
          <p className="form-note">
            Os dias trabalhados são os dias civis com serviço dentro do período, sem contar duas
            vezes o mesmo dia. Turnos e atendimentos que atravessam os limites do filtro são
            incluídos por sobreposição; a data do fato pode ser anterior. Integrantes vêm do
            histórico de ingressos e saídas, sem usar a composição atual da equipe. Registros
            antigos sem horários completos são identificados como estimados. Apoios aparecem
            separadamente. Um turno sem encerramento usa como limite a data prevista ou o instante
            de emissão, o que ocorrer primeiro.
          </p>
        </div>
      )}
    </>
  );
}
