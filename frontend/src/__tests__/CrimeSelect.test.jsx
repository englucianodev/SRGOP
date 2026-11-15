import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CrimeSelect from '../components/CrimeSelect';

const CRIMES = ['Furto', 'Roubo', 'Lesão corporal', 'Homicídio', 'Ameaça'];

function Harness({ options = CRIMES, onChange = () => {} }) {
  const [value, setValue] = useState('');
  return (
    <CrimeSelect
      value={value}
      options={options}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
    />
  );
}

describe('CrimeSelect', () => {
  it('filters options without requiring accents', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole('combobox', { name: /tipo de crime/i }), 'lesao');
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Lesão corporal']);
  });

  it('selects with the keyboard and closes the list', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByRole('combobox');
    await user.type(input, 'o');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(input).toHaveValue('Roubo');
    expect(onChange).toHaveBeenLastCalledWith('Roubo');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('selects with the mouse', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.click(screen.getByRole('option', { name: 'Ameaça' }));
    expect(input).toHaveValue('Ameaça');
  });

  it('closes on Escape and reports free text as invalid', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole('combobox');
    await user.type(input, 'xyz');
    expect(screen.getByText(/nenhum crime encontrado/i)).toBeInTheDocument();
    expect(input.validationMessage).toBe('Selecione um crime cadastrado na lista.');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('caps the list at 50 items and asks to refine', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 60 }, (_, i) => `Crime ${i}`);
    render(<Harness options={many} />);
    await user.click(screen.getByRole('combobox'));
    expect(screen.getAllByRole('option')).toHaveLength(50);
    expect(screen.getByText(/60 resultados/)).toBeInTheDocument();
  });
});
