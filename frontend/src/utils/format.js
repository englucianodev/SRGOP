export const fmtDate = (value) =>
  value ? new Date(value).toLocaleDateString('pt-BR', { timeZone: 'America/Fortaleza' }) : '—';
export const fmtTime = (value) =>
  value
    ? new Date(value).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Fortaleza',
      })
    : '—';
export const fmtDateTime = (value) => (value ? `${fmtDate(value)} às ${fmtTime(value)}` : '—');
export const duration = (seconds) => {
  const n = Math.max(0, Math.floor(seconds || 0));
  return `${String(Math.floor(n / 3600)).padStart(2, '0')}:${String(Math.floor((n % 3600) / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
};
export const localInput = (value = new Date()) => {
  const d = new Date(value);
  return new Date(+d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
export const dateKey = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Fortaleza',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
const SERVICE_DAY_START_MS = 8 * 3600000;
// Service day runs 08h→08h in Fortaleza: before 08h it is still the previous day.
export const serviceDayKey = (date = new Date()) => dateKey(new Date(+date - SERVICE_DAY_START_MS));
export const params = (obj) =>
  new URLSearchParams(
    Object.entries(obj).filter(([, v]) => v !== '' && v !== undefined && v !== null),
  ).toString();
export const objectId = (v) => v?._id || v || '';
export const initials = (name) =>
  (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase();
export const statuses = ['Em aberto', 'Despachada', 'Em atendimento', 'Encerrada', 'Cancelada'];
