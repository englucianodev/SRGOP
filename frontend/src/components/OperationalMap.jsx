import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { Badge } from './UI';
export default function OperationalMap({
  cities = [],
  occurrences = [],
  vehicles = [],
  compact = false,
}) {
  return (
    <MapContainer
      center={[-5.28, -44.46]}
      zoom={compact ? 9 : 10}
      scrollWheelZoom={!compact}
      className={`operational-map ${compact ? 'compact' : ''}`}
      aria-label="Mapa operacional dos municípios"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      {cities
        .filter((c) => c.active !== false)
        .map((c) => (
          <CircleMarker
            key={c._id}
            center={[c.latitude, c.longitude]}
            radius={4}
            pathOptions={{ color: '#466989', weight: 1, fillOpacity: 0.5 }}
          >
            <Popup>
              <strong>{c.name}</strong>
              <p>Município cadastrado</p>
            </Popup>
          </CircleMarker>
        ))}
      {occurrences
        .filter((o) => Number.isFinite(o.latitude) && Number.isFinite(o.longitude))
        .map((o) => (
          <CircleMarker
            key={o._id}
            center={[o.latitude, o.longitude]}
            radius={8}
            pathOptions={{
              color: '#fff',
              weight: 3,
              fillColor:
                o.priority === 'Alta' ? '#de524e' : o.priority === 'Média' ? '#edaa38' : '#3a81c3',
              fillOpacity: 1,
            }}
          >
            <Popup>
              <strong>{o.protocol}</strong>
              <p>
                {o.crimeType}
                <br />
                {o.address}
              </p>
              <Badge>{o.priority}</Badge> <Badge>{o.status}</Badge>
            </Popup>
          </CircleMarker>
        ))}
      {vehicles
        .filter((v) => Number.isFinite(v.latitude) && Number.isFinite(v.longitude))
        .map((v) => (
          <CircleMarker
            key={v._id}
            center={[v.latitude, v.longitude]}
            radius={6}
            pathOptions={{ color: '#14304d', weight: 2, fillColor: '#fff', fillOpacity: 1 }}
          >
            <Popup>
              <strong>{v.prefix}</strong>
              <p>{v.city?.name}</p>
              <Badge>{v.status}</Badge>
              <p>
                Última posição:{' '}
                {v.locatedAt ? new Date(v.locatedAt).toLocaleString('pt-BR') : 'Cadastro inicial'}
              </p>
            </Popup>
          </CircleMarker>
        ))}
    </MapContainer>
  );
}
