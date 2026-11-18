import { useParams, useSearchParams } from 'react-router-dom';
import { Download, Printer } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { downloadFile } from '../services/api';
import { fmtDateTime } from '../utils/format';
import { PageTitle, Panel, Button, Loading, Empty } from '../components/UI';

const minutes = (value) => (value == null ? '—' : `${String(value).replace('.', ',')} min`);
const text = (value) => value || '—';

const SYNTHETIC_COUNTS = [
  ['Ocorrências registradas', 'registered'],
  ['Atendidas', 'attended'],
  ['Em atendimento', 'inProgress'],
  ['Aguardando', 'waiting'],
  ['Canceladas', 'cancelled'],
];
const SYNTHETIC_RESULTS = [
  ['Conduções à delegacia', 'policeStation'],
  ['Conduzidos', 'detained'],
  ['Veículos recuperados', 'recoveredVehicles'],
  ['Armas apreendidas', 'weapons'],
  ['Abordagens', 'approaches'],
];

function Metrics({ items }) {
  return (
    <div className="small-metrics">
      {items.map(([label, value]) => (
        <Panel key={label}>
          <span className="muted">{label}</span>
          <strong>{value}</strong>
        </Panel>
      ))}
    </div>
  );
}

function Distribution({ title, values }) {
  const entries = Object.entries(values || {});
  const max = Math.max(1, ...entries.map(([, value]) => value));
  return (
    <Panel title={title}>
      {entries.length ? (
        <div className="bar-chart">
          {entries.map(([label, value]) => (
            <div className="bar-row" key={label}>
              <span>{label}</span>
              <div>
                <i style={{ width: `${(value / max) * 100}%` }} />
              </div>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">Sem registros.</p>
      )}
    </Panel>
  );
}

function Synthetic({ data }) {
  const { occurrences, staff, results, byCity, byCrimeType } = data;
  const seizures = Object.entries(results.seizures || {});
  return (
    <>
      <Metrics
        items={[
          ...SYNTHETIC_COUNTS.map(([label, key]) => [label, occurrences[key]]),
          ['Tempo médio de atendimento', minutes(occurrences.averageMinutes)],
          ['Policiais empregados', staff.officers],
          ['Guarnições', staff.crews],
        ]}
      />
      <Metrics items={SYNTHETIC_RESULTS.map(([label, key]) => [label, results[key]])} />
      {seizures.length > 0 && (
        <Panel title="Material apreendido">
          <ul>
            {seizures.map(([kind, total]) => (
              <li key={kind}>
                {kind}: {total}
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <div className="two-columns">
        <Distribution title="Por município" values={byCity} />
        <Distribution title="Por tipo de crime" values={byCrimeType} />
      </div>
    </>
  );
}

function Table({ title, head, rows, empty }) {
  return (
    <Panel title={title}>
      {rows.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {head.map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((cells, index) => (
                <tr key={index}>
                  {cells.map((cell, position) => (
                    <td key={position}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">{empty}</p>
      )}
    </Panel>
  );
}

function Analytic({ data }) {
  const { occurrences, crews, transfers, events } = data;
  return (
    <>
      <Table
        title="Ocorrências"
        empty="Nenhuma ocorrência no período."
        head={[
          'Protocolo',
          'Registrada em',
          'Cidade',
          'Tipo',
          'Status',
          'Guarnição',
          'Resposta',
          'Duração',
          'Conduzidos',
          'Delegacia',
          'Material apreendido',
        ]}
        rows={occurrences.map((o) => [
          o.protocol,
          fmtDateTime(o.registeredAt),
          text(o.city),
          o.crimeType,
          o.status,
          text(o.crew),
          minutes(o.responseMinutes),
          minutes(o.durationMinutes),
          o.detained,
          text(o.policeStation),
          text(o.seizures),
        ])}
      />
      <Table
        title="Guarnições"
        empty="Nenhuma guarnição no período."
        head={['Guarnição', 'Cidade', 'Início', 'Fim', 'Integrantes', 'Atendimentos']}
        rows={crews.map((c) => [
          c.name,
          text(c.city),
          fmtDateTime(c.start),
          fmtDateTime(c.end),
          c.members.join(', ') || '—',
          c.attendances,
        ])}
      />
      <Table
        title="Passagens de turno"
        empty="Nenhuma passagem de turno."
        head={['Em', 'De', 'Para', 'Situação', 'Motivo']}
        rows={transfers.map((t) => [
          fmtDateTime(t.at),
          text(t.from),
          text(t.to),
          t.status,
          text(t.reason),
        ])}
      />
      <Table
        title="Eventos"
        empty="Nenhuma urgência ou apoio no período."
        head={['Em', 'Tipo', 'Descrição']}
        rows={events.map((e) => [fmtDateTime(e.at), e.kind, e.label])}
      />
    </>
  );
}

/** Report of one CPU shift (`/relatorios/turno-cpu/:id`) or of a whole duty day (`/relatorios/dia/:day`). */
export default function CpuShiftReport() {
  const app = useApp();
  const { id, day } = useParams();
  const [query, setQuery] = useSearchParams();
  const mode = query.get('modo') === 'analitico' ? 'analitico' : 'sintetico';
  const base = id ? `/reports/cpu-shifts/${id}` : `/reports/duty-days/${day}`;
  const { data, loading } = useData(base);
  const select = (next) => setQuery({ modo: next }, { replace: true });
  const header = data?.header;
  return (
    <>
      <PageTitle
        title={id ? 'Relatório do turno do CPU' : 'Relatório do dia de serviço'}
        description={
          header
            ? `Dia de serviço ${header.day} · ${header.officer || 'Todos os turnos'}`
            : undefined
        }
      >
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer size={16} />
          Imprimir / PDF
        </Button>
        {data && mode === 'analitico' && (
          <Button
            onClick={() =>
              app.run(() => downloadFile(`${base}?format=csv`, `srgop-turno-${header.day}.csv`))
            }
          >
            <Download size={17} />
            Baixar CSV
          </Button>
        )}
      </PageTitle>
      {loading && !data ? (
        <Loading />
      ) : !data ? (
        <Empty text="Não foi possível carregar o relatório." />
      ) : (
        <div className="report-content printable">
          <div className="report-tabs no-print" aria-label="Tipo de relatório">
            <Button
              variant={mode === 'sintetico' ? 'primary' : 'secondary'}
              aria-pressed={mode === 'sintetico'}
              onClick={() => select('sintetico')}
            >
              Sintético
            </Button>
            <Button
              variant={mode === 'analitico' ? 'primary' : 'secondary'}
              aria-pressed={mode === 'analitico'}
              onClick={() => select('analitico')}
            >
              Analítico
            </Button>
          </div>
          <Panel title="Período">
            <p>
              {fmtDateTime(header.start)} até {header.end ? fmtDateTime(header.end) : 'em andamento'}
              {header.closeReason ? ` · ${header.closeReason}` : ''}
            </p>
          </Panel>
          {mode === 'analitico' ? (
            <Analytic data={data.analytic} />
          ) : (
            <Synthetic data={data.synthetic} />
          )}
        </div>
      )}
    </>
  );
}
