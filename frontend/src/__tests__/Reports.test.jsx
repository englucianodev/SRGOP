import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const REPORT = {
  totals: {
    total: 7,
    closed: 4,
    open: 3,
    averageSeconds: 600,
    averageTravelSeconds: null,
    averageOnSceneSeconds: null,
    weapons: 1,
    recoveredVehicles: 0,
    detained: 2,
    approaches: 5,
  },
  grouped: { city: { Caxias: 7 }, crimeType: {}, priority: {}, status: {}, crew: {}, vehicle: {} },
  rows: [],
  users: [],
  vehicles: [],
  shifts: [],
};

// `reports` decides what the /reports call returns in each test; the CPU shift list is empty.
const state = vi.hoisted(() => ({ reports: { data: null } }));
vi.mock('../hooks/useData', () => ({
  useData: (url, initial = null) => {
    if (url?.startsWith('/reports/cpu-shifts')) return { data: [] };
    if (url?.startsWith('/reports?')) return state.reports;
    return { data: initial };
  },
}));
vi.mock('../services/api', () => ({
  downloadFile: vi.fn(),
  api: { get: vi.fn(() => new Promise(() => {})) },
}));
vi.mock('../context/AppContext', () => ({
  useApp: () => ({ run: async (fn) => fn(), user: { role: 'Oficial' }, settings: {} }),
}));

const { default: Reports } = await import('../pages/Reports');

const renderReports = () =>
  render(
    <MemoryRouter>
      <Reports />
    </MemoryRouter>,
  );

describe('Relatórios em abas', () => {
  beforeEach(() => {
    state.reports = { data: REPORT };
  });
  afterEach(() => localStorage.clear());

  it('modos aparecem como abas e o modo escolhido é lembrado', async () => {
    renderReports();
    expect(screen.getByRole('tab', { name: 'Guarnições' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Viaturas' }));
    expect(screen.getByRole('tab', { name: 'Viaturas' })).toHaveAttribute('aria-selected', 'true');
    expect(localStorage.getItem('srgop-relatorios-modo')).toBe('vehicles');
  });

  it('sub-aba Ocorrências fica ativa e as demais ficam no DOM como inativas', async () => {
    const { container } = renderReports();
    await userEvent.click(screen.getByRole('tab', { name: 'Indicadores gerais' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Ocorrências' }));
    const section = (id) => container.querySelector(`[data-section="${id}"]`);
    for (const id of ['resumo', 'ocorrencias', 'cpu', 'guarnicoes', 'cadastros'])
      expect(section(id)).not.toBeNull();
    expect(section('ocorrencias')).not.toHaveClass('is-inactive');
    expect(section('resumo')).toHaveClass('is-inactive');
    expect(localStorage.getItem('srgop-relatorios-secao')).toBe('ocorrencias');
  });

  it('valor inválido salvo abre o Resumo com os indicadores em destaque', () => {
    localStorage.setItem('srgop-relatorios-modo', 'general');
    localStorage.setItem('srgop-relatorios-secao', 'zzz');
    const { container } = renderReports();
    expect(screen.getByRole('tab', { name: 'Resumo' })).toHaveAttribute('aria-selected', 'true');
    expect(container.querySelector('[data-section="resumo"]')).not.toHaveClass('is-inactive');
    expect(screen.getByText('Em aberto / andamento').closest('.kpi')).toHaveClass('hot');
  });

  it('Turnos CPU funciona enquanto /reports ainda carrega', async () => {
    state.reports = { data: null, loading: true };
    renderReports();
    await userEvent.click(screen.getByRole('tab', { name: 'Indicadores gerais' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Turnos CPU' }));
    expect(screen.getByLabelText('Dia de serviço')).toBeInTheDocument();
  });
});
