import { useState } from 'react';
import { MapPin, Car } from 'lucide-react';
import { useData } from '../hooks/useData';
import { useApp } from '../context/AppContext';
import { params } from '../utils/format';
import { PageTitle, Panel, Select, Badge } from '../components/UI';
import OperationalMap from '../components/OperationalMap';
export default function MapPage() {
  const app = useApp();
  const [filter, setFilter] = useState({});
  const { data: cities } = useData('/cities', []);
  const { data: crews } = useData('/crews', []);
  const { data: vehicles } = useData('/vehicles', []);
  const { data: occurrences } = useData(`/occurrences?${params({ ...filter, limit: 100 })}`, {
    items: [],
    total: 0,
  });
  const set = (k, v) => setFilter((f) => ({ ...f, [k]: v }));
  const filteredVehicles = vehicles.filter(
    (v) =>
      (!filter.city || v.city?._id === filter.city) &&
      (!filter.crew || v.crew?._id === filter.crew),
  );
  return (
    <>
      <PageTitle
        title="Mapa operacional"
        description="Ocorrências e últimas posições cadastradas das viaturas."
      >
        <span className="live-label">
          <i className={`live-dot ${app.online ? '' : 'offline'}`} />
          Sincronização operacional
        </span>
      </PageTitle>
      <Panel>
        <div className="filter-fields padded">
          <Select
            label="Município"
            value={filter.city || ''}
            onChange={(e) => set('city', e.target.value)}
          >
            <option value="">Todos os municípios</option>
            {cities.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            label="Guarnição"
            value={filter.crew || ''}
            onChange={(e) => set('crew', e.target.value)}
          >
            <option value="">Todas as guarnições</option>
            {crews.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            label="Tipo de ocorrência"
            value={filter.crimeType || ''}
            onChange={(e) => set('crimeType', e.target.value)}
          >
            <option value="">Todos os tipos</option>
            {app.settings?.crimeTypes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
          <Select
            label="Prioridade"
            value={filter.priority || ''}
            onChange={(e) => set('priority', e.target.value)}
          >
            <option value="">Todas</option>
            {['Alta', 'Média', 'Baixa'].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        </div>
        <OperationalMap
          cities={cities.filter((c) => !filter.city || c._id === filter.city)}
          occurrences={occurrences.items}
          vehicles={filteredVehicles}
        />
        <div className="map-legend">
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
          <span>
            <Car size={15} />
            Viaturas
          </span>
          <span>
            <MapPin size={15} />
            Municípios
          </span>
        </div>
      </Panel>
      <p className="form-note">
        Exibindo até 100 ocorrências por filtro ({occurrences.total} encontradas). Registros sem
        coordenadas não aparecem no mapa. Posições de viaturas são atualizadas por API ou pelo
        integrante em serviço; não há rastreamento GPS contínuo.
      </p>
      <div className="map-vehicles">
        {filteredVehicles.map((v) => (
          <div key={v._id}>
            <Car size={18} />
            <strong>{v.prefix}</strong>
            <span>{v.city?.name}</span>
            <Badge>{v.status}</Badge>
          </div>
        ))}
      </div>
    </>
  );
}
