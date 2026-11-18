// Imperative Leaflet pieces of the situation-room map: pins, popups, trails and gliding.
import L from 'leaflet';
import { militaryLabel } from '../PersonalFields';
import { crewSituation, SITUATION_STYLE } from '../../utils/operation';
import { objectId } from '../../utils/format';

export const GLIDE_MS = 1800; // markers slide between GPS fixes instead of jumping
export const TRAIL_POINTS = 14;
const LIVE_GPS_MS = 60000;

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const crewIcon = (tone, stale) =>
  L.divIcon({
    className: '',
    html: `<div class="crew-pin ${tone}${stale ? ' stale' : ''}"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

export const targetIcon = (priority) =>
  L.divIcon({
    className: '',
    html: `<div class="pulse${priority === 'Alta' ? ' alta' : ''}"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

const PRIORITY_TONE = { Alta: 'alta', Média: 'media', Baixa: 'baixa' };
export const FINISHED_STATUSES = ['Encerrada', 'Cancelada'];

/** Occurrence bead colored by priority; still-open ones carry a pulsing ring. */
export const occurrenceIcon = (o) =>
  L.divIcon({
    className: '',
    html: `<div class="occ-pin ${PRIORITY_TONE[o.priority] || 'baixa'}${FINISHED_STATUSES.includes(o.status) ? ' done' : ''}"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

export const emergencyIcon = () =>
  L.divIcon({ className: '', html: '<div class="sr-emergency"></div>', iconSize: [30, 30], iconAnchor: [15, 15] });

/** Small DOM builder: text always goes through textContent, never through HTML. */
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function lines(title, rows, foot) {
  const box = el('div');
  box.append(el('b', title));
  for (const row of rows.filter(Boolean)) box.append(el('br'), document.createTextNode(row));
  if (foot) box.append(el('br'), el('span', foot, 'popup-gps'));
  return box;
}

export const gpsAge = (crew, now) =>
  crew.location?.locatedAt
    ? Math.max(0, Math.round((now - +new Date(crew.location.locatedAt)) / 1000))
    : null;
export const gpsLive = (crew, now) =>
  Boolean(crew.location?.sharing) && (gpsAge(crew, now) ?? Infinity) * 1000 < LIVE_GPS_MS;

export function crewPeople(crew) {
  const driverId = objectId(crew.driver);
  const members = crew.members || [];
  const driver = members.find((m) => m._id === driverId);
  const commander = members.find((m) => m._id !== driverId);
  return { commander, driver };
}

export function crewPopup(crew, now) {
  const { commander, driver } = crewPeople(crew);
  const age = gpsAge(crew, now);
  const where = [crew.city?.name, crew.type !== 'Motocicleta' && (crew.vehicle?.prefix || 'Sem viatura')];
  return lines(
    crew.name,
    [
      where.filter(Boolean).join(' · '),
      `Comandante: ${commander ? militaryLabel(commander) : '—'}`,
      `Motorista: ${driver ? militaryLabel(driver) : '—'}`,
      `Situação: ${SITUATION_STYLE[crewSituation(crew, now)].label}`,
    ],
    age == null ? 'GPS: sem sinal registrado' : `GPS: último sinal há ${age} s`,
  );
}

export const emergencyPopup = (e) =>
  lines(`URGÊNCIA UU · ${e.actorName}`, [
    `${e.crewName} · ${e.cityName}`,
    `Posição registrada: ${new Date(e.locatedAt).toLocaleString('pt-BR')}`,
  ]);

export const occurrencePopup = (o) =>
  lines(o.protocol, [
    o.crimeType,
    [o.address || o.city?.name, o.crew?.name].filter(Boolean).join(' · '),
    `Prioridade ${o.priority || '—'} · ${o.status}`,
  ]);

/** Slides a marker (and the tip of its trail) to the new GPS fix. */
export function glide(entry, to) {
  cancelAnimationFrame(entry.glide);
  const from = entry.marker.getLatLng();
  if (reducedMotion() || from.distanceTo(to) < 1) {
    entry.marker.setLatLng(to);
    entry.trail.setLatLngs(entry.path);
    return;
  }
  const start = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - start) / GLIDE_MS);
    const e = 1 - (1 - k) ** 3;
    const at = L.latLng(from.lat + (to.lat - from.lat) * e, from.lng + (to.lng - from.lng) * e);
    entry.marker.setLatLng(at);
    entry.trail.setLatLngs([...entry.path.slice(0, -1), at]);
    if (k < 1) entry.glide = requestAnimationFrame(step);
  };
  entry.glide = requestAnimationFrame(step);
}

/** Removes entries whose key is no longer alive. */
export function prune(store, alive, remove) {
  for (const [key, entry] of store)
    if (!alive.has(key)) {
      remove(entry);
      store.delete(key);
    }
}
