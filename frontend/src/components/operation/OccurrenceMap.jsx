import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { DEFAULT_CENTER, TILE_ATTRIBUTION, TILE_URL } from '../mapTiles';
import { occurrenceIcon, occurrencePopup } from './situationLayers';

const MAX_ZOOM = 16;
const PADDING = [60, 60];
const located = (p) => Number.isFinite(p?.latitude) && Number.isFinite(p?.longitude);

/** Draws the filtered occurrences and frames every one of them (or the cities, when none). */
function OccurrenceLayers({ occurrences, cities }) {
  const map = useMap();
  const group = useRef(null);
  useEffect(() => {
    group.current = L.layerGroup().addTo(map);
    return () => group.current.remove();
  }, [map]);
  useEffect(() => {
    const layer = group.current;
    layer.clearLayers();
    const points = [];
    for (const o of occurrences) {
      if (!located(o)) continue;
      const at = [o.latitude, o.longitude];
      L.marker(at, { icon: occurrenceIcon(o), keyboard: false })
        .bindTooltip(`${o.protocol} · ${o.crimeType}`, { direction: 'top', offset: [0, -10], className: 'crew-label' })
        .bindPopup(() => occurrencePopup(o))
        .addTo(layer);
      points.push(at);
    }
    map.invalidateSize({ pan: false });
    const fallback = cities.filter(located).map((c) => [c.latitude, c.longitude]);
    if (points.length) map.fitBounds(points, { padding: PADDING, maxZoom: MAX_ZOOM, animate: false });
    else if (fallback.length) map.fitBounds(fallback, { padding: PADDING, maxZoom: 11, animate: false });
    else map.setView(DEFAULT_CENTER, 9, { animate: false });
  }, [map, occurrences, cities]);
  return null;
}

export default function OccurrenceMap({ occurrences = [], cities = [] }) {
  return (
    <div className="sr-map-wrap">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={9}
        zoomSnap={0.25}
        maxZoom={18}
        className="sr-map"
        aria-label="Mapa das ocorrências filtradas"
      >
        <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} maxZoom={20} />
        <OccurrenceLayers occurrences={occurrences} cities={cities} />
      </MapContainer>
      <div className="sr-legend" aria-label="Legenda do mapa">
        <span>
          <i className="dot occ-alta" />
          Alta prioridade
        </span>
        <span>
          <i className="dot occ-media" />
          Média
        </span>
        <span>
          <i className="dot occ-baixa" />
          Baixa
        </span>
        <span>
          <i className="ring-key" />
          Em andamento
        </span>
        <span>
          <i className="dot occ-done" />
          Encerrada ou cancelada
        </span>
      </div>
    </div>
  );
}
