import { isOnDuty, dutyClock } from '../utils/duty';
import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import { Badge } from './UI';
function FocusCrew({ crew, zoom = 16 }) {
  const map = useMap();
  const latitude = crew?.location?.latitude;
  const longitude = crew?.location?.longitude;
  useEffect(() => {
    if (Number.isFinite(latitude) && Number.isFinite(longitude))
      map.setView([latitude, longitude], zoom);
  }, [map, crew?._id, latitude, longitude, zoom]);
  return null;
}
function CrewMarker({ crew: c, focused }) {
  const marker = useRef(null);
  const live =
    c.members.length > 0 &&
    isOnDuty(c) &&
    c.location.sharing &&
    Date.now() - +new Date(c.location.locatedAt) < 60000;
  useEffect(() => {
    if (focused) marker.current?.openPopup();
  }, [focused]);
  return (
    <CircleMarker
      ref={marker}
      center={[c.location.latitude, c.location.longitude]}
      radius={10}
      pathOptions={{
        color: live ? '#098b62' : '#68788a',
        weight: 3,
        fillColor: live ? '#26c995' : '#aeb8c1',
        fillOpacity: 0.85,
      }}
    >
      <Popup>
        <strong>{c.name}</strong>
        <p>
          {c.city?.name} · {c.vehicle?.prefix || 'Sem viatura'}
        </p>
        <p>{live ? 'GPS ativo' : 'Última posição · GPS sem atualização'}</p>
        <p>
          Precisão:{' '}
          {Number.isFinite(c.location.accuracy)
            ? `${Math.round(c.location.accuracy)} m`
            : 'Não informada'}
          <br />
          Atualizado: {new Date(c.location.locatedAt).toLocaleString('pt-BR')}
        </p>
      </Popup>
    </CircleMarker>
  );
}
export default function OperationalMap({
  cities = [],
  occurrences = [],
  vehicles = [],
  crews = [],
  focusCrew = '',
  emergency = null,
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
      <FocusCrew
        zoom={emergency && !Number.isFinite(emergency.latitude) ? 10 : 16}
        crew={
          emergency
            ? {
                _id: emergency._id,
                location: Number.isFinite(emergency.latitude)
                  ? emergency
                  : cities.find((c) => c._id === emergency.city),
              }
            : crews.find((c) => c._id === focusCrew)
        }
      />
      {emergency && Number.isFinite(emergency.latitude) && Number.isFinite(emergency.longitude) && (
        <CircleMarker
          center={[emergency.latitude, emergency.longitude]}
          radius={17}
          pathOptions={{ color: '#a90000', fillColor: '#ff1515', fillOpacity: 1, weight: 5 }}
        >
          <Popup>
            <strong>URGÊNCIA UU · {emergency.actorName}</strong>
            <p>
              {emergency.crewName} · {emergency.cityName}
            </p>
            <p>Posição registrada: {new Date(emergency.locatedAt).toLocaleString('pt-BR')}</p>
          </Popup>
        </CircleMarker>
      )}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url={`https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${encodeURIComponent(import.meta.env.VITE_CARTO_API_KEY || 'cb1_4u0a_1_93cf66948d960a7d71de1c27')}`}
        maxZoom={20}
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
      {crews
        .filter(
          (c) =>
            ((c.members.length && isOnDuty(c)) || c._id === focusCrew) &&
            Number.isFinite(c.location?.latitude) &&
            Number.isFinite(c.location?.longitude),
        )
        .map((c) => (
          <CrewMarker key={`crew-${c._id}`} crew={c} focused={c._id === focusCrew} />
        ))}
    </MapContainer>
  );
}
