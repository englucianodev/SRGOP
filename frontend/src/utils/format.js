export const fmtDate = (value) => (value ? new Date(value).toLocaleDateString('pt-BR') : '—');
export const fmtTime = (value) =>
  value ? new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
export const fmtDateTime = (value) => (value ? `${fmtDate(value)} às ${fmtTime(value)}` : '—');
export const duration = (seconds) => {
  const n = Math.max(0, Math.floor(seconds || 0));
  return `${String(Math.floor(n / 3600)).padStart(2, '0')}:${String(Math.floor((n % 3600) / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
};
export const localInput = (value = new Date()) => {
  const d = new Date(value);
  return new Date(+d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
export const dateKey = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Fortaleza',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
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
