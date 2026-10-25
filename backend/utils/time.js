export const dayKey = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Fortaleza',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
export function dayRange(day = dayKey()) {
  const start = new Date(`${day}T00:00:00-03:00`);
  return { $gte: start, $lt: new Date(+start + 86400000) };
}
