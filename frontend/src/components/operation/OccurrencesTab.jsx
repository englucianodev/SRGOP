import { useEffect, useState } from 'react';
import Kpi from './Kpi';
import OccurrenceMap from './OccurrenceMap';
import { FINISHED_STATUSES } from './situationLayers';
import CrimeSelect from '../CrimeSelect';
import { Button, Input, Select } from '../UI';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { params, statuses } from '../../utils/format';

const EMPTY = { items: [], total: 0, withoutCoordinates: 0 };
const PRIORITIES = ['Alta', 'Média', 'Baixa'];
const QUERY_DELAY_MS = 250;

/** Occurrences matching the filters, refreshed when the operation changes (app.revision). */
function useOccurrencePoints(filters, revision) {
  const [result, setResult] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const query = params(filters);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    const timer = setTimeout(
      () =>
        api
          .get(`/occurrences/map?${query}`, { quiet: true })
          .then((r) => current && setResult(r.data))
          .catch(
            (e) =>
              current &&
              setError(e.response?.data?.message || 'Não foi possível carregar as ocorrências no mapa.'),
          )
          .finally(() => current && setLoading(false)),
      QUERY_DELAY_MS,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, revision]);
  return { result, loading, error };
}

export default function OccurrencesTab({ crews = [], cities = [] }) {
  const app = useApp();
  const [filters, setFilters] = useState({});
  const [crimeSearch, setCrimeSearch] = useState('');
  const { result, loading, error } = useOccurrencePoints(filters, app.revision);
  const set = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  const crimeTypes = app.settings?.crimeTypes || [];
  const open = result.items.filter((o) => !FINISHED_STATUSES.includes(o.status)).length;
  const shownCities = cities.filter((c) => !filters.city || c._id === filters.city);
  return (
    <section className="sr-operation">
      <OccurrenceMap occurrences={result.items} cities={shownCities} />
      <aside className="sr-side">
        <div className="kpis">
          <Kpi value={result.total} label="filtradas" />
          <Kpi value={result.items.length} label="no mapa" tone="ok" />
          <Kpi value={open} label="em andamento" tone="hot" />
          <Kpi value={result.withoutCoordinates} label="sem coordenadas" tone="warn" />
        </div>
        <h2 className="sr-heading">Filtros</h2>
        <div className="sr-filters">
          <Select label="Município" value={filters.city || ''} onChange={(e) => set('city', e.target.value)}>
            <option value="">Todos os municípios</option>
            {cities.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </Select>
          <CrimeSelect
            value={crimeSearch}
            label="Tipo de ocorrência"
            options={crimeTypes}
            onChange={(value) => {
              setCrimeSearch(value);
              if (!value || crimeTypes.includes(value)) set('crimeType', value);
            }}
          />
          <Select label="Prioridade" value={filters.priority || ''} onChange={(e) => set('priority', e.target.value)}>
            <option value="">Todas</option>
            {PRIORITIES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
          <Select label="Situação" value={filters.status || ''} onChange={(e) => set('status', e.target.value)}>
            <option value="">Todas</option>
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
          <Select
            label="Guarnição responsável"
            value={filters.crew || ''}
            onChange={(e) => set('crew', e.target.value)}
          >
            <option value="">Todas</option>
            {crews.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Input label="Data inicial" type="date" value={filters.from || ''} onChange={(e) => set('from', e.target.value)} />
          <Input label="Data final" type="date" value={filters.to || ''} onChange={(e) => set('to', e.target.value)} />
          <Button
            variant="ghost"
            onClick={() => {
              setFilters({});
              setCrimeSearch('');
            }}
          >
            Limpar filtros
          </Button>
        </div>
        {loading && <p className="sr-muted sr-loading">Atualizando o mapa…</p>}
        {error && (
          <p role="alert" className="sr-alert">
            {error}
          </p>
        )}
        <p className="sr-muted sr-note">
          {result.items.length} ocorrência(s) com coordenadas entre {result.total} filtradas;{' '}
          {result.withoutCoordinates} sem coordenadas não geram marcador. Consultas acima de 5.000
          pontos exigem mais filtros.
        </p>
      </aside>
    </section>
  );
}
