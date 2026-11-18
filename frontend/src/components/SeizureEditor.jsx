import { Plus, Trash2 } from 'lucide-react';
import { Button, Input, Select } from './UI';
import { SEIZURE_KINDS, MAX_SEIZURES, newSeizure } from '../utils/occurrenceDetails';
import './detailEditors.css';
// Repeatable group of seized material. `value` is a list built with editableSeizures();
// convert it with seizuresPayload() before sending it to the API.
export default function SeizureEditor({ value, onChange }) {
  const change = (key, field, content) =>
    onChange(
      value.map((seizure) => (seizure.key === key ? { ...seizure, [field]: content } : seizure)),
    );
  return (
    <fieldset className="detail-editor">
      <legend>Material apreendido</legend>
      <p className="form-note">
        Drogas, dinheiro, munição e outros materiais. Armas e veículos continuam nos contadores
        acima.
      </p>
      {value.map((seizure, index) => (
        <div
          className="detail-editor-row"
          key={seizure.key}
          role="group"
          aria-label={`Apreensão ${index + 1}`}
        >
          <div className="form-grid">
            <Select
              label="Tipo"
              value={seizure.kind}
              onChange={(e) => change(seizure.key, 'kind', e.target.value)}
            >
              {SEIZURE_KINDS.map((kind) => (
                <option key={kind}>{kind}</option>
              ))}
            </Select>
            <Input
              label="Descrição"
              required={seizure.kind === 'Outro'}
              minLength={seizure.kind === 'Outro' ? 2 : undefined}
              maxLength={200}
              value={seizure.description}
              onChange={(e) => change(seizure.key, 'description', e.target.value)}
            />
            <Input
              label="Quantidade"
              type="number"
              inputMode="decimal"
              required
              min="0"
              max="1000000000"
              step="any"
              value={seizure.quantity}
              onChange={(e) => change(seizure.key, 'quantity', e.target.value)}
            />
            <Input
              label="Unidade"
              maxLength={20}
              hint="Exemplos: kg, g, R$, un"
              value={seizure.unit}
              onChange={(e) => change(seizure.key, 'unit', e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="danger-ghost"
            aria-label={`Remover apreensão ${index + 1}`}
            onClick={() => onChange(value.filter((other) => other.key !== seizure.key))}
          >
            <Trash2 size={15} />
            Remover
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        disabled={value.length >= MAX_SEIZURES}
        onClick={() => onChange([...value, newSeizure()])}
      >
        <Plus size={16} />
        Adicionar apreensão
      </Button>
    </fieldset>
  );
}
