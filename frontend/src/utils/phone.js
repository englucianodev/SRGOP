export function formatPhone(value = '') {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  const local = digits.slice(2);
  return `(${digits.slice(0, 2)})${local.slice(0, 5)}${local.length > 5 ? `-${local.slice(5)}` : ''}`;
}
