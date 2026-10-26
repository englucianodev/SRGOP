import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../hooks/useData';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { params, statuses } from '../utils/format';
import { filterCrews } from '../utils/crewFilters';
import { PageTitle, Panel, Select, Button, Input, Loading } from '../components/UI';
import OperationalMap from '../components/OperationalMap';
import CrimeSelect from '../components/CrimeSelect';
export default function MapPage() {
  const app = useApp();
  const [query] = useSearchParams();
  const requestedCrew = /^[a-f\d]{24}$/i.test(query.get('crew') || '') ? query.get('crew') : '';
  const emergencyId = /^[a-f\d]{24}$/i.test(query.get('emergency') || '')
    ? query.get('emergency')
    : '';
  const { data: emergency } = useData(emergencyId ? `/emergencies/${emergencyId}` : null);
  const { data: cities } = useData('/cities', []),
    { data: crews } = useData('/crews', []);
  const [mode, setMode] = useState('crews');
  const [crewFilters, setCrewFilters] = useState({
    crew: requestedCrew,
    duty: requestedCrew ? '' : 'on',
  });
  const [occFilters, setOccFilters] = useState({});
  const [crimeSearch, setCrimeSearch] = useState('');
  const [occurrences, setOccurrences] = useState({ items: [], total: 0, withoutCoordinates: 0 });
  const [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const occQuery = params(occFilters);
  useEffect(() => {
    setCrewFilters({ crew: requestedCrew, duty: requestedCrew ? '' : 'on' });
    if (requestedCrew || emergencyId) setMode('crews');
  }, [requestedCrew, emergencyId]);
  useEffect(() => {
    if (emergencyId && emergency) {
      setMode('crews');
      setCrewFilters({ crew: emergency.crew, city: emergency.city, duty: '' });
    }
  }, [emergencyId, emergency?._id]);
  useEffect(() => {
    if (mode !== 'occurrences') return;
    let current = true;
    setLoading(true);
    setError('');
    setOccurrences({ items: [], total: 0, withoutCoordinates: 0 });
    const timer = setTimeout(
      () =>
        api
          .get(`/occurrences/map?${occQuery}`, { quiet: true })
          .then((r) => {
            if (current) setOccurrences(r.data);
          })
          .catch((e) => {
            if (current)
              setError(
                e.response?.data?.message || 'Não foi possível carregar as ocorrências no mapa.',
              );
          })
          .finally(() => {
            if (current) setLoading(false);
          }),
      250,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [mode, occQuery, app.revision]);
  const setCrew = (key, value) => setCrewFilters((f) => ({ ...f, [key]: value }));
  const setOcc = (key, value) => setOccFilters((f) => ({ ...f, [key]: value }));
  const visibleCrews = filterCrews(crews, crewFilters, app.now);
  const locatedCrews = visibleCrews.filter(
    (c) => Number.isFinite(c.location?.latitude) && Number.isFinite(c.location?.longitude),
  );
  const cityFilter = mode === 'crews' ? crewFilters.city : occFilters.city;
  return (
    <>
      <PageTitle
        title="Mapa operacional"
        description="Escolha uma visualização e filtre os pontos para aproximar a área de interesse."
      >
        <span className="live-label">
          <i className={`live-dot ${app.online ? '' : 'offline'}`} />
          Sincronização operacional
        </span>
      </PageTitle>
      <Panel>
        <div className="map-mode-controls padded" aria-label="Visualização do mapa">
          <Button
            aria-pressed={mode === 'crews'}
            variant={mode === 'crews' ? 'primary' : 'secondary'}
            onClick={() => setMode('crews')}
          >
            Guarnições em tempo real
          </Button>
          <Button
            aria-pressed={mode === 'occurrences'}
            variant={mode === 'occurrences' ? 'primary' : 'secondary'}
            onClick={() => setMode('occurrences')}
          >
            Ocorrências
          </Button>
        </div>
        {mode === 'crews' && emergencyId && emergency && (
          <div className="urgency-map-note">
            <strong>Urgência UU: {emergency.actorName}</strong> · {emergency.crewName} ·{' '}
            {emergency.cityName}
            <p>
              {Number.isFinite(emergency.latitude)
                ? `Última posição disponível, registrada em ${new Date(emergency.locatedAt).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })}.`
                : 'GPS indisponível: consulte o município informado e mantenha contato com a central.'}
            </p>
          </div>
        )}
        <div className="filter-fields padded map-filters">
          <Select
            label="Município"
            value={cityFilter || ''}
            onChange={(e) =>
              mode === 'crews' ? setCrew('city', e.target.value) : setOcc('city', e.target.value)
            }
          >
            <option value="">Todos os municípios</option>
            {cities.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </Select>
          {mode === 'crews' ? (
            <>
              <Select
                label="Guarnição no mapa"
                value={crewFilters.crew || ''}
                onChange={(e) => setCrew('crew', e.target.value)}
              >
                <option value="">Todas</option>
                {crews.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Select
                label="Serviço"
                value={crewFilters.duty || ''}
                onChange={(e) => setCrew('duty', e.target.value)}
              >
                <option value="">Todos</option>
                <option value="on">Em serviço</option>
                <option value="off">Fora de serviço</option>
              </Select>
              <Select
                label="Tipo de guarnição"
                value={crewFilters.type || ''}
                onChange={(e) => setCrew('type', e.target.value)}
              >
                <option value="">Todos</option>
                <option>Viatura Convencional</option>
                <option>Motocicleta</option>
              </Select>
              <Select
                label="Situação da guarnição"
                value={crewFilters.status || ''}
                onChange={(e) => setCrew('status', e.target.value)}
              >
                <option value="">Todas</option>
                {['Disponível', 'Em atendimento', 'Indisponível', 'Fora de serviço'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
              <Select
                label="Posição GPS"
                value={crewFilters.gps || ''}
                onChange={(e) => setCrew('gps', e.target.value)}
              >
                <option value="">Todas as posições</option>
                <option value="live">Somente GPS ativo</option>
                <option value="stale">Última posição conhecida</option>
              </Select>
            </>
          ) : (
            <>
              <CrimeSelect
                value={crimeSearch}
                label="Tipo de ocorrência"
                options={app.settings?.crimeTypes || []}
                onChange={(value) => {
                  setCrimeSearch(value);
                  if (!value || app.settings?.crimeTypes.includes(value))
                    setOcc('crimeType', value);
                }}
              />
              <Select
                label="Prioridade da ocorrência"
                value={occFilters.priority || ''}
                onChange={(e) => setOcc('priority', e.target.value)}
              >
                <option value="">Todas</option>
                {['Alta', 'Média', 'Baixa'].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Select>
              <Select
                label="Situação da ocorrência"
                value={occFilters.status || ''}
                onChange={(e) => setOcc('status', e.target.value)}
              >
                <option value="">Todas</option>
                {statuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
              <Select
                label="Guarnição responsável"
                value={occFilters.crew || ''}
                onChange={(e) => setOcc('crew', e.target.value)}
              >
                <option value="">Todas</option>
                {crews.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Input
                label="Data inicial"
                type="date"
                value={occFilters.from || ''}
                onChange={(e) => setOcc('from', e.target.value)}
              />
              <Input
                label="Data final"
                type="date"
                value={occFilters.to || ''}
                onChange={(e) => setOcc('to', e.target.value)}
              />
            </>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              if (mode === 'crews') setCrewFilters({ duty: 'on' });
              else {
                setOccFilters({});
                setCrimeSearch('');
              }
            }}
          >
            Limpar filtros do mapa
          </Button>
        </div>
        {mode === 'occurrences' && loading && <Loading />}
        {mode === 'occurrences' && error && (
          <p role="alert" className="padded">
            {error}
          </p>
        )}
        <OperationalMap
          mode={mode}
          cities={cities.filter((c) => !cityFilter || c._id === cityFilter)}
          crews={visibleCrews}
          occurrences={occurrences.items}
          focusCrew={mode === 'crews' ? crewFilters.crew : ''}
          emergency={mode === 'crews' && emergencyId ? emergency : null}
          fitKey={JSON.stringify(mode === 'crews' ? crewFilters : occFilters)}
        />
        <div className="map-legend">
          {mode === 'crews' ? (
            <>
              <span>
                <i className="legend-dot green" />
                GPS ativo
              </span>
              <span>
                <i className="legend-dot gray" />
                Última posição conhecida
              </span>
            </>
          ) : (
            <>
              <span>
                <i className="legend-dot red" />
                Alta prioridade
              </span>
              <span>
                <i className="legend-dot amber" />
                Média prioridade
              </span>
              <span>
                <i className="legend-dot blue" />
                Baixa prioridade
              </span>
            </>
          )}
        </div>
      </Panel>
      <p className="form-note">
        {mode === 'crews'
          ? `${locatedCrews.length} guarnição(ões) com posição entre ${visibleCrews.length} filtradas. Atualização em tempo real quando o GPS está ligado; após um minuto sem atualização, a posição é identificada como última conhecida.`
          : `${occurrences.items.length} ocorrência(s) com coordenadas entre ${occurrences.total} filtradas; ${occurrences.withoutCoordinates} sem coordenadas. Todas as posições retornadas pelo filtro são enquadradas no mapa. Consultas acima de 5.000 pontos exigem mais filtros.`}{' '}
        Registros sem coordenadas não geram marcadores.
      </p>
    </>
  );
}
