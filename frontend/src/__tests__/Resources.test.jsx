import { describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import usePagination from '../hooks/usePagination';

const pad = (n) => String(n).padStart(2, '0');
const USERS = Array.from({ length: 30 }, (_, i) => ({
  _id: `u${i + 1}`,
  name: `Usuário ${pad(i + 1)}`,
  email: `pessoa${i + 1}@exemplo.test`,
  role: 'Praça',
  active: true,
  city: { name: 'Caxias' },
}));

vi.mock('../hooks/useData', () => ({
  useData: (url, initial = null) => ({ data: url === '/users' ? USERS : initial }),
}));
vi.mock('../services/api', () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock('../context/AppContext', () => ({
  useApp: () => ({ run: async (fn) => fn(), user: { role: 'Administrativo' }, now: Date.now() }),
}));

const { default: Resources } = await import('../pages/Resources');

describe('Usuários paginados', () => {
  it('mostra 12 por página e avança', async () => {
    render(<Resources type="users" />);
    expect(screen.getByText('Usuário 01')).toBeInTheDocument();
    expect(screen.getByText('Usuário 12')).toBeInTheDocument();
    expect(screen.queryByText('Usuário 13')).toBeNull();
    expect(screen.getByText('Mostrando 1–12 de 30')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    expect(screen.getByText('Usuário 13')).toBeInTheDocument();
    expect(screen.queryByText('Usuário 01')).toBeNull();
    expect(screen.getByText('Mostrando 13–24 de 30')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Página 2' })).toHaveAttribute('aria-current', 'page');
  });

  it('buscar volta para a página 1', async () => {
    render(<Resources type="users" />);
    await userEvent.click(screen.getByRole('button', { name: 'Página 3' }));
    expect(screen.getByText('Mostrando 25–30 de 30')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox'), 'Usuário 2');
    expect(screen.getByText('Mostrando 1–10 de 10')).toBeInTheDocument();
    expect(screen.getByText('Usuário 20')).toBeInTheDocument();
  });

  it('células carregam data-label para o cartão do celular', () => {
    render(<Resources type="users" />);
    const row = screen.getByText('Usuário 01').closest('tr');
    expect(row.closest('table')).toHaveClass('record-table');
    expect(row.querySelector('[data-label="Perfil"]')).toHaveTextContent('Praça');
    expect(row.querySelector('[data-label="Município"]')).toHaveTextContent('Caxias');
    expect(row.querySelector('[data-label="Ações"]')).not.toBeNull();
  });
});

describe('usePagination', () => {
  it('recua quando a lista encolhe abaixo da página atual', () => {
    const { result, rerender } = renderHook(({ items }) => usePagination(items, 12, ''), {
      initialProps: { items: USERS },
    });
    act(() => result.current.setPage(3));
    expect(result.current.page).toBe(3);
    rerender({ items: USERS.slice(0, 5) });
    expect(result.current.page).toBe(1);
    expect(result.current.pageItems).toHaveLength(5);
    expect([result.current.from, result.current.to, result.current.total]).toEqual([1, 5, 5]);
  });

  it('lista vazia mostra 0–0', () => {
    const { result } = renderHook(() => usePagination([], 12, ''));
    expect([result.current.from, result.current.to, result.current.pageCount]).toEqual([0, 0, 1]);
  });
});
