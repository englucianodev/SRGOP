import { Plus, Trash2 } from 'lucide-react';
import { Button, Input, Select } from './UI';
import { INVOLVED_ROLES, MAX_INVOLVED, newPerson } from '../utils/occurrenceDetails';
import './detailEditors.css';
// Repeatable group of victims, authors and witnesses. `value` is a list built with
// editablePeople(); convert it with involvedPayload() before sending it to the API.
export default function InvolvedEditor({ value, onChange }) {
  const change = (key, field, content) =>
    onChange(value.map((person) => (person.key === key ? { ...person, [field]: content } : person)));
  return (
    <fieldset className="detail-editor">
      <legend>Envolvidos</legend>
      <p className="form-note">
        Vítimas, autores e testemunhas. Os dados pessoais ficam no registro da ocorrência e não
        são copiados para o histórico.
      </p>
      {value.map((person, index) => (
        <div
          className="detail-editor-row"
          key={person.key}
          role="group"
          aria-label={`Envolvido ${index + 1}`}
        >
          <div className="form-grid">
            <Select
              label="Papel"
              value={person.role}
              onChange={(e) => change(person.key, 'role', e.target.value)}
            >
              {INVOLVED_ROLES.map((role) => (
                <option key={role}>{role}</option>
              ))}
            </Select>
            <Input
              label="Nome"
              required
              minLength={2}
              maxLength={120}
              autoComplete="off"
              value={person.name}
              onChange={(e) => change(person.key, 'name', e.target.value)}
            />
            <Input
              label="Documento (opcional)"
              maxLength={40}
              autoComplete="off"
              value={person.document}
              onChange={(e) => change(person.key, 'document', e.target.value)}
            />
            <Input
              label="Telefone (opcional)"
              type="tel"
              maxLength={30}
              autoComplete="off"
              value={person.phone}
              onChange={(e) => change(person.key, 'phone', e.target.value)}
            />
          </div>
          <Input
            label="Observações (opcional)"
            maxLength={300}
            value={person.notes}
            onChange={(e) => change(person.key, 'notes', e.target.value)}
          />
          <Button
            type="button"
            variant="danger-ghost"
            aria-label={`Remover envolvido ${index + 1}`}
            onClick={() => onChange(value.filter((other) => other.key !== person.key))}
          >
            <Trash2 size={15} />
            Remover
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        disabled={value.length >= MAX_INVOLVED}
        onClick={() => onChange([...value, newPerson()])}
      >
        <Plus size={16} />
        Adicionar envolvido
      </Button>
    </fieldset>
  );
}
