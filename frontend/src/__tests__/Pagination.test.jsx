import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Pagination from '../components/Pagination';

const props = { from: 1, to: 12, total: 600, onChange: vi.fn() };

describe('Pagination com muitas páginas', () => {
  it('mostra uma janela de páginas em vez de um botão por página', () => {
    render(<Pagination {...props} page={20} pageCount={50} />);
    const numbers = screen.getAllByRole('button', { name: /^Página \d+$/ });
    expect(numbers.map((b) => b.textContent)).toEqual(['1', '19', '20', '21', '50']);
    expect(screen.getAllByText('…')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Página 20' })).toHaveAttribute('aria-current', 'page');
  });

  it('com poucas páginas mostra todas', () => {
    render(<Pagination {...props} page={1} pageCount={5} />);
    expect(screen.getAllByRole('button', { name: /^Página \d+$/ })).toHaveLength(5);
  });
});
