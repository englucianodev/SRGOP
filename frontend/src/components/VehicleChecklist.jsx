import { Input, Select, Textarea } from './UI';
import { useApp } from '../context/AppContext';
export const inspectionParts = [
  ['body', 'Lataria'],
  ['electrical', 'Elétrica'],
  ['suspension', 'Suspensão'],
  ['tires', 'Pneus'],
  ['brakes', 'Freios'],
  ['engine', 'Motor'],
];
export const blankInspection = (mileage = '') => ({
  mileage: String(mileage),
  ...Object.fromEntries(inspectionParts.map(([key]) => [key, { state: 'S/A', observation: '' }])),
});
export const inspectionBody = (value) => ({ ...value, mileage: Number(value.mileage) });
export default function VehicleChecklist({ value, onChange, minimum = 0 }) {
  const admin = useApp().user.role === 'Administrativo';
  return (
    <div className="vehicle-checklist">
      <p className="form-note">
        S/A: sem alteração · C/A: com alteração. As seleções retomam o último checklist ou começam
        em S/A. Confira as condições atuais antes de confirmar.
      </p>
      {inspectionParts.map(([key, label]) => (
        <div key={key}>
          <Select
            label={label}
            required
            value={value[key].state}
            onChange={(e) =>
              onChange({ ...value, [key]: { state: e.target.value, observation: '' } })
            }
          >
            <option value="">Selecione</option>
            <option value="S/A">S/A — Sem alteração</option>
            <option value="C/A">C/A — Com alteração</option>
          </Select>
          {value[key].state === 'C/A' && (
            <Textarea
              label={`Observação — ${label}`}
              required
              minLength={3}
              maxLength={1000}
              value={value[key].observation}
              onChange={(e) =>
                onChange({ ...value, [key]: { ...value[key], observation: e.target.value } })
              }
            />
          )}
        </div>
      ))}
      <Input
        label="KM Atual"
        type="number"
        required
        min={admin ? 0 : minimum}
        max={100000000}
        step="1"
        value={value.mileage}
        onChange={(e) => onChange({ ...value, mileage: e.target.value })}
        hint={`Último KM registrado: ${minimum.toLocaleString('pt-BR')} km. ${admin ? 'O Administrativo pode corrigir este valor.' : 'O valor não pode diminuir.'}`}
      />
    </div>
  );
}
