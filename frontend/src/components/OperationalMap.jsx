import { isOnDuty } from '../utils/duty';
import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import { Badge } from './UI';
function FitPoints({ points, fallback, fitKey }) {
  const map = useMap();
  const signature = JSON.stringify(points);
  const fallbackSignature = JSON.stringify(fallback);
  useEffect(() => {
    map.invalidateSize();
    const fit = () => {
      if (points.length) map.fitBounds(points, { padding: [42, 42], maxZoom: 18, animate: false });
      else if (fallback.length)
        map.fitBounds(fallback, { padding: [42, 42], maxZoom: 11, animate: false });
      else map.setView([-5.28, -44.46], 9, { animate: false });
    };
    fit();
    map.on('resize', fit);
    return () => map.off('resize', fit);
  }, [map, signature, fallbackSignature, fitKey]);
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
          {c.city?.name}
          {c.type !== 'Motocicleta' && ` · ${c.vehicle?.prefix || 'Sem viatura'}`}
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
  crews = [],
  focusCrew = '',
  emergency = null,
  compact = false,
  mode = 'occurrences',
  fitKey = '',
}) {
  const shownCrews =
    mode === 'crews'
      ? crews.filter(
          (c) => Number.isFinite(c.location?.latitude) && Number.isFinite(c.location?.longitude),
        )
      : [];
  const shownOccurrences =
    mode === 'occurrences'
      ? occurrences.filter((o) => Number.isFinite(o.latitude) && Number.isFinite(o.longitude))
      : [];
  const points = [
    ...shownCrews.map((c) => [c.location.latitude, c.location.longitude]),
    ...shownOccurrences.map((o) => [o.latitude, o.longitude]),
  ];
  if (
    mode === 'crews' &&
    emergency &&
    Number.isFinite(emergency.latitude) &&
    Number.isFinite(emergency.longitude)
  )
    points.push([emergency.latitude, emergency.longitude]);
  const fallback =
    emergency && !Number.isFinite(emergency.latitude)
      ? cities.filter((c) => c._id === emergency.city)
      : cities;
  return (
    <MapContainer
      center={[-5.28, -44.46]}
      zoom={compact ? 9 : 10}
      scrollWheelZoom={!compact}
      className={`operational-map ${compact ? 'compact' : ''}`}
      aria-label="Mapa operacional dos municípios"
    >
      <FitPoints
        points={points}
        fallback={fallback
          .filter((c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude))
          .map((c) => [c.latitude, c.longitude])}
        fitKey={`${mode}-${fitKey}`}
      />
      {mode === 'crews' &&
        emergency &&
        Number.isFinite(emergency.latitude) &&
        Number.isFinite(emergency.longitude) && (
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
      {shownOccurrences
        .filter((o) => Number.isFinite(o.latitude) && Number.isFinite(o.longitude))
        .map((o) => (
          <CircleMarker
            key={o._id}
            center={[o.latitude, o.longitude]}
            radius={8}
            pathOptions={{
              color:
                o.priority === 'Alta' ? '#b82f2b' : o.priority === 'Média' ? '#a56a08' : '#245f9b',
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
      {shownCrews.map((c) => (
        <CrewMarker key={`crew-${c._id}`} crew={c} focused={c._id === focusCrew} />
      ))}
    </MapContainer>
  );
}
