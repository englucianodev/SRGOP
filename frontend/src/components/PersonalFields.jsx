import { Input, Select } from './UI';
export const ranks = [
  'Soldado',
  'Cabo',
  '3º Sargento',
  '2ª Sargento',
  '1º Sargento',
  'Subtenente',
  'Aspirante',
  '2º Tenente',
  '1º Tenente',
  'Capitão',
  'Major',
  'Tenente Coronel',
  'Coronel',
];
export const personalDefaults = (user = {}) =>
  Object.fromEntries(
    ['callSign', 'rank', 'serviceNumber', 'registration', 'phone'].map((key) => [
      key,
      user[key] || '',
    ]),
  );
export const militaryLabel = (user) =>
  [user?.rank, user?.callSign || user?.name].filter(Boolean).join(' ');
export default function PersonalFields({ value, onChange }) {
  return (
    <>
      <Input
        label="Nome de Guerra"
        maxLength={80}
        value={value.callSign || ''}
        onChange={(e) => onChange('callSign', e.target.value)}
      />
      <Select
        label="Posto/Graduação"
        value={value.rank || ''}
        onChange={(e) => onChange('rank', e.target.value)}
      >
        <option value="">Selecione</option>
        {ranks.map((rank) => (
          <option key={rank}>{rank}</option>
        ))}
      </Select>
      <Input
        label="Número/Barra"
        maxLength={40}
        value={value.serviceNumber || ''}
        onChange={(e) => onChange('serviceNumber', e.target.value)}
      />
      <Input
        label="Matrícula"
        maxLength={40}
        value={value.registration || ''}
        onChange={(e) => onChange('registration', e.target.value)}
      />
      <Input
        label="Telefone"
        type="tel"
        autoComplete="tel"
        maxLength={30}
        value={value.phone || ''}
        onChange={(e) => onChange('phone', e.target.value)}
      />
    </>
  );
}
