import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { serviceDayKey } from '../utils/format';

// The CPU shift list is empty; every other panel keeps its initial value.
const { useData } = vi.hoisted(() => ({
  useData: vi.fn((url, initial = null) => ({
    data: url?.startsWith('/reports/cpu-shifts') ? [] : initial,
  })),
}));
vi.mock('../hooks/useData', () => ({ useData }));
vi.mock('../services/api', () => ({
  downloadFile: vi.fn(),
  api: { get: vi.fn(() => new Promise(() => {})) },
}));
vi.mock('../context/AppContext', () => ({
  useApp: () => ({ run: async (fn) => fn(), user: { role: 'Oficial' } }),
}));

const { default: Reports } = await import('../pages/Reports');

describe('dia de serviço (08h→08h, America/Fortaleza)', () => {
  afterEach(() => vi.useRealTimers());

  it('antes das 08h locais ainda é o dia de serviço anterior', () => {
    expect(serviceDayKey(new Date('2026-11-18T10:59:00Z'))).toBe('2026-11-17');
    expect(serviceDayKey(new Date('2026-11-18T11:00:00Z'))).toBe('2026-11-18');
    expect(serviceDayKey(new Date('2026-11-19T02:30:00Z'))).toBe('2026-11-18');
  });

  it('o seletor dos turnos do CPU começa no dia de serviço atual', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-18T08:00:00Z')); // 05:00 in Fortaleza
    render(
      <MemoryRouter>
        <Reports />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Indicadores gerais' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Turnos CPU' }));
    expect(await screen.findByLabelText('Dia de serviço')).toHaveValue('2026-11-17');
    expect(screen.getByRole('link', { name: 'Relatório do dia' })).toHaveAttribute(
      'href',
      '/relatorios/dia/2026-11-17?modo=sintetico',
    );
  });
});
