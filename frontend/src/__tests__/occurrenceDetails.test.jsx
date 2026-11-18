import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InvolvedEditor from '../components/InvolvedEditor';
import SeizureEditor from '../components/SeizureEditor';
import OccurrenceExtras from '../components/OccurrenceExtras';
import {
  editablePeople,
  editableSeizures,
  elapsedSeconds,
  involvedPayload,
  seizureLabel,
  seizuresPayload,
} from '../utils/occurrenceDetails';

function Harness({ Editor, initial = [], onChange = () => {} }) {
  const [value, setValue] = useState(initial);
  return (
    <Editor
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe('occurrence detail helpers', () => {
  it('builds the involved payload without local keys or empty optional fields', () => {
    const [person] = editablePeople([{ role: 'Autor', name: '  João  ', phone: '98 99999-0000' }]);
    expect(person).toMatchObject({ role: 'Autor', document: '', notes: '' });
    expect(person.key).toBeTruthy();
    expect(involvedPayload([person])).toEqual([
      { role: 'Autor', name: 'João', phone: '98 99999-0000' },
    ]);
    expect(editablePeople(undefined)).toEqual([]);
  });

  it('builds the seizure payload with a numeric quantity', () => {
    const [seizure] = editableSeizures([{ kind: 'Droga', description: 'Crack', quantity: 3 }]);
    expect(seizuresPayload([{ ...seizure, quantity: '2.5', unit: ' g ' }])).toEqual([
      { kind: 'Droga', description: 'Crack', quantity: 2.5, unit: 'g' },
    ]);
    expect(editableSeizures(undefined)).toEqual([]);
  });

  it('measures elapsed time only when both moments exist', () => {
    expect(elapsedSeconds('2026-01-01T10:00:00Z', '2026-01-01T10:02:05Z')).toBe(125);
    expect(elapsedSeconds('2026-01-01T10:00:00Z', undefined)).toBeNull();
    expect(elapsedSeconds('2026-01-01T10:02:00Z', '2026-01-01T10:00:00Z')).toBe(0);
  });

  it('describes a seizure in one line', () => {
    expect(seizureLabel({ kind: 'Dinheiro', description: '', quantity: 350.5, unit: 'R$' })).toBe(
      'Dinheiro (350,5 R$)',
    );
    expect(seizureLabel({ kind: 'Outro', description: 'Celular', quantity: 1, unit: '' })).toBe(
      'Outro: Celular (1)',
    );
  });
});

describe('InvolvedEditor', () => {
  it('adds, edits and removes rows with labelled groups', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness Editor={InvolvedEditor} onChange={onChange} />);
    expect(screen.getByRole('group', { name: 'Envolvidos' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /adicionar envolvido/i }));
    await user.click(screen.getByRole('button', { name: /adicionar envolvido/i }));
    const second = screen.getByRole('group', { name: 'Envolvido 2' });
    await user.selectOptions(within(second).getByLabelText(/papel/i), 'Testemunha');
    await user.type(within(second).getByLabelText(/nome/i), 'Maria');
    expect(involvedPayload(onChange.mock.lastCall[0])).toEqual([
      { role: 'Vítima', name: '' },
      { role: 'Testemunha', name: 'Maria' },
    ]);
    await user.click(screen.getByRole('button', { name: 'Remover envolvido 1' }));
    expect(screen.queryByRole('group', { name: 'Envolvido 2' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Envolvido 1' })).getByLabelText(/nome/i)).toHaveValue(
      'Maria',
    );
  });

  it('stops adding at the limit of twenty people', () => {
    const full = editablePeople(Array.from({ length: 20 }, () => ({ role: 'Autor', name: 'Nome' })));
    render(<Harness Editor={InvolvedEditor} initial={full} />);
    expect(screen.getByRole('button', { name: /adicionar envolvido/i })).toBeDisabled();
  });
});

describe('SeizureEditor', () => {
  it('requires a description only for the "Outro" kind', async () => {
    const user = userEvent.setup();
    render(<Harness Editor={SeizureEditor} />);
    await user.click(screen.getByRole('button', { name: /adicionar apreensão/i }));
    const row = screen.getByRole('group', { name: 'Apreensão 1' });
    expect(within(row).getByLabelText(/descrição/i)).not.toBeRequired();
    await user.selectOptions(within(row).getByLabelText(/tipo/i), 'Outro');
    expect(within(row).getByLabelText(/descrição/i)).toBeRequired();
    expect(within(row).getByLabelText(/quantidade/i)).toBeRequired();
    await user.click(screen.getByRole('button', { name: 'Remover apreensão 1' }));
    expect(screen.queryByRole('group', { name: 'Apreensão 1' })).not.toBeInTheDocument();
  });
});

describe('OccurrenceExtras', () => {
  it('renders nothing for an occurrence without the new data', () => {
    const { container } = render(<OccurrenceExtras o={{ involved: [], seizures: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows response times, involved people, seizures and the police station', () => {
    render(
      <OccurrenceExtras
        o={{
          startedAt: '2026-01-01T10:00:00Z',
          arrivedAt: '2026-01-01T10:02:00Z',
          endedAt: '2026-01-01T10:07:00Z',
          involved: [{ role: 'Vítima', name: 'Ana', document: '111', phone: '222', notes: 'Obs' }],
          seizures: [{ kind: 'Munição', description: 'Calibre .38', quantity: 12, unit: 'un' }],
          policeStation: '2ª Delegacia Regional',
        }}
      />,
    );
    expect(screen.getByText('00:02:00')).toBeInTheDocument();
    expect(screen.getByText('00:05:00')).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText(/Documento: 111/)).toBeInTheDocument();
    expect(screen.getByText('Munição: Calibre .38 (12 un)')).toBeInTheDocument();
    expect(screen.getByText('2ª Delegacia Regional')).toBeInTheDocument();
  });

  it('omits the on-scene time while the attendance is open', () => {
    render(
      <OccurrenceExtras
        o={{ startedAt: '2026-01-01T10:00:00Z', arrivedAt: '2026-01-01T10:02:00Z' }}
      />,
    );
    expect(screen.getByText('00:02:00')).toBeInTheDocument();
    expect(screen.queryByText(/No local/)).not.toBeInTheDocument();
  });
});
