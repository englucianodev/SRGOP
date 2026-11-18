import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { Crosshair, Expand } from 'lucide-react';
import { crewSituation, SITUATION_STYLE } from '../../utils/operation';
import { DEFAULT_CENTER, TILE_ATTRIBUTION, TILE_URL } from '../mapTiles';
import {
  TRAIL_POINTS,
  crewIcon,
  crewPopup,
  glide,
  gpsAge,
  gpsLive,
  occurrencePopup,
  prune,
  targetIcon,
} from './situationLayers';

const FOLLOW_MAX_ZOOM = 16;
const MIN_SPAN = 0.02; // degrees; keeps a lone crew from producing a zero-size area
const LEGEND = ['livre', 'atendimento', 'entrando', 'expirado'];

const boundsOf = (points) => {
  const bounds = L.latLngBounds(points);
  const c = bounds.getCenter();
  return bounds
    .extend([c.lat - MIN_SPAN / 2, c.lng - MIN_SPAN / 2])
    .extend([c.lat + MIN_SPAN / 2, c.lng + MIN_SPAN / 2]);
};
const located = (p) => Number.isFinite(p?.latitude) && Number.isFinite(p?.longitude);

/** Keeps the Leaflet layers in step with the crews and occurrences, like the simulator panel. */
function SituationLayers({ crews, occurrences, cities, now, follow, onManual, padding, overviewKey }) {
  const map = useMap();
  const followRef = useRef(follow);
  const store = useRef(null);
  if (!store.current)
    store.current = {
      groups: ['trails', 'links', 'crews', 'targets'].reduce(
        (all, name) => ({ ...all, [name]: L.layerGroup() }),
        {},
      ),
      crews: new Map(),
      targets: new Map(),
      framed: false,
      all: [],
      active: [],
    };

  useEffect(() => {
    const { groups } = store.current;
    Object.values(groups).forEach((g) => g.addTo(map));
    const manual = () => onManual();
    const zoomClick = (e) => e.target.closest?.('.leaflet-control-zoom') && onManual();
    const box = map.getContainer();
    map.on('dragstart', manual);
    ['wheel', 'dblclick', 'touchstart'].forEach((t) => box.addEventListener(t, manual, { passive: true }));
    box.addEventListener('click', zoomClick);
    return () => {
      map.off('dragstart', manual);
      ['wheel', 'dblclick', 'touchstart'].forEach((t) => box.removeEventListener(t, manual));
      box.removeEventListener('click', zoomClick);
      store.current.crews.forEach((e) => cancelAnimationFrame(e.glide));
      Object.values(groups).forEach((g) => g.remove());
    };
  }, [map, onManual]);

  const frame = (points, force) => {
    const s = store.current;
    map.invalidateSize({ pan: false }); // the container may have been sized after the map mounted
    if (!points.length) {
      const fallback = cities.filter(located).map((c) => [c.latitude, c.longitude]);
      if (!s.framed && fallback.length) map.fitBounds(fallback, { padding, maxZoom: 11, animate: false });
      else if (!s.framed) map.setView(DEFAULT_CENTER, 9, { animate: false });
      s.framed = true;
      return;
    }
    const bounds = boundsOf(points);
    const zoom = Math.min(FOLLOW_MAX_ZOOM, map.getBoundsZoom(bounds, false, L.point(padding[0] * 2, padding[1] * 2)));
    if (!force && map.getBounds().contains(bounds) && Math.abs(zoom - map.getZoom()) < 0.75) return;
    const options = { padding, maxZoom: FOLLOW_MAX_ZOOM };
    // The first framing is instant; later ones fly smoothly.
    if (!s.framed) map.fitBounds(bounds, { ...options, animate: false });
    else map.flyToBounds(bounds, { ...options, duration: 1.1 });
    s.framed = true;
  };

  // Crew pins, trails, occurrence pulses and the dashed link to the crew attending each one.
  useEffect(() => {
    const s = store.current;
    const alive = new Set();
    const where = new Map();
    s.all = [];
    s.active = [];
    for (const crew of crews) {
      const situation = crewSituation(crew, now);
      if (situation === 'fora' || !located(crew.location)) continue;
      const at = L.latLng(crew.location.latitude, crew.location.longitude);
      const tone = SITUATION_STYLE[situation].tone;
      const stale = !gpsLive(crew, now);
      let entry = s.crews.get(crew._id);
      if (!entry) {
        entry = { path: [at], crew };
        entry.marker = L.marker(at, { icon: crewIcon(tone, stale), riseOnHover: true, keyboard: false })
          .bindTooltip(crew.name, { permanent: true, direction: 'right', offset: [12, 0], className: 'crew-label' })
          .bindPopup(() => crewPopup(entry.crew, Date.now()));
        entry.trail = L.polyline([at], { className: 'sr-trail', weight: 2.5, dashArray: '2 7', lineCap: 'round' });
        s.groups.crews.addLayer(entry.marker);
        s.groups.trails.addLayer(entry.trail);
        s.crews.set(crew._id, entry);
      }
      entry.crew = crew;
      const look = `${tone}${stale}`;
      if (entry.look !== look) entry.marker.setIcon(crewIcon(tone, stale));
      entry.look = look;
      if (!entry.path.at(-1).equals(at)) {
        entry.path = [...entry.path, at].slice(-TRAIL_POINTS);
        glide(entry, at);
      }
      alive.add(crew._id);
      where.set(crew._id, at);
      s.all.push(at);
      if (situation !== 'expirado') s.active.push(at);
    }
    prune(s.crews, alive, (e) => {
      cancelAnimationFrame(e.glide);
      s.groups.crews.removeLayer(e.marker);
      s.groups.trails.removeLayer(e.trail);
    });

    const protocols = new Set();
    for (const o of occurrences) {
      if (!located(o)) continue;
      const at = L.latLng(o.latitude, o.longitude);
      let entry = s.targets.get(o.protocol);
      if (!entry) {
        entry = {
          marker: L.marker(at, { icon: targetIcon(o.priority), keyboard: false })
            .bindTooltip(`${o.protocol} · ${o.crimeType}`, { direction: 'top', offset: [0, -12], className: 'crew-label' }),
          link: L.polyline([], { className: 'sr-link', weight: 2.5, dashArray: '8 8' }),
        };
        s.groups.targets.addLayer(entry.marker);
        s.groups.links.addLayer(entry.link);
        s.targets.set(o.protocol, entry);
      }
      entry.marker.setLatLng(at).bindPopup(occurrencePopup(o));
      const from = where.get(o.crew?._id);
      entry.link.setLatLngs(from ? [from, at] : []);
      protocols.add(o.protocol);
      s.all.push(at);
      s.active.push(at);
    }
    prune(s.targets, protocols, (e) => {
      s.groups.targets.removeLayer(e.marker);
      s.groups.links.removeLayer(e.link);
    });
    if (followRef.current) frame(s.active.length ? s.active : s.all, false);
    // `now` is left out on purpose: the layers only change when the data does.
  }, [crews, occurrences]);

  // Pressing "Seguir guarnições" frames the active area right away.
  useEffect(() => {
    followRef.current = follow;
    const s = store.current;
    if (follow && s.framed) frame(s.active.length ? s.active : s.all, true);
  }, [follow]);

  // "Área toda": every crew and occurrence in view.
  useEffect(() => {
    if (overviewKey) frame(store.current.all, true);
  }, [overviewKey]);

  return null;
}

function gpsBadge(crews, now) {
  const onDuty = crews.filter((c) => crewSituation(c, now) !== 'fora');
  const tracked = onDuty.filter((c) => gpsLive(c, now));
  if (!tracked.length)
    return { live: false, text: onDuty.length ? 'GPS: aguardando sinais' : 'GPS: sem guarnições' };
  const freshest = Math.min(...tracked.map((c) => gpsAge(c, now)));
  return {
    live: true,
    text: `GPS ativo · ${tracked.length} guarnição(ões) · último sinal há ${freshest} s`,
  };
}

export default function SituationMap({ crews = [], occurrences = [], cities = [], now = Date.now(), compact = false }) {
  const [follow, setFollow] = useState(true);
  const [overviewKey, setOverviewKey] = useState(0);
  const manual = useRef(() => setFollow(false)).current;
  const badge = gpsBadge(crews, now);
  const padding = compact ? [40, 40] : [70, 70];
  return (
    <div className={`sr-map-wrap ${compact ? 'compact' : ''}`}>
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={9}
        zoomSnap={0.25}
        maxZoom={18}
        scrollWheelZoom={!compact}
        className="sr-map"
        aria-label="Mapa das guarnições e atendimentos"
      >
        <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} maxZoom={20} />
        <SituationLayers
          crews={crews}
          occurrences={occurrences}
          cities={cities}
          now={now}
          follow={follow}
          onManual={manual}
          padding={padding}
          overviewKey={overviewKey}
        />
      </MapContainer>
      <div className="sr-map-tools">
        <button
          type="button"
          className={`chip-btn ${follow ? 'on' : ''}`}
          aria-pressed={follow}
          title="Aproxima o mapa na área onde as guarnições estão atuando"
          onClick={() => setFollow(true)}
        >
          <Crosshair size={15} aria-hidden="true" />
          <span>{follow ? 'Seguindo guarnições' : 'Seguir guarnições'}</span>
        </button>
        <button
          type="button"
          className="chip-btn"
          title="Mostra todas as guarnições e ocorrências"
          onClick={() => {
            setFollow(false);
            setOverviewKey((k) => k + 1);
          }}
        >
          <Expand size={15} aria-hidden="true" />
          <span>Área toda</span>
        </button>
      </div>
      <div className={`sr-map-badge ${badge.live ? 'live' : ''}`}>{badge.text}</div>
      <div className="sr-legend" aria-label="Legenda do mapa">
        {LEGEND.map((key) => (
          <span key={key}>
            <i className={`dot ${SITUATION_STYLE[key].tone}`} />
            {SITUATION_STYLE[key].label}
          </span>
        ))}
        <span>
          <i className="dot alvo" />
          Ocorrência
        </span>
        <span>
          <i className="dot alta" />
          Alta prioridade
        </span>
        <span>
          <i className="trail-key" />
          Rastro do GPS
        </span>
      </div>
    </div>
  );
}
