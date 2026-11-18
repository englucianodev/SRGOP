import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const { useData, downloadFile } = vi.hoisted(() => ({ useData: vi.fn(), downloadFile: vi.fn() }));
vi.mock('../hooks/useData', () => ({ useData }));
vi.mock('../services/api', () => ({ downloadFile }));
vi.mock('../context/AppContext', () => ({
  useApp: () => ({ run: async (fn) => fn() }),
}));

const { default: CpuShiftReport } = await import('../pages/CpuShiftReport');

const report = {
  header: {
    day: '2026-11-18',
    officer: 'Maria',
    start: '2026-11-18T11:00:00.000Z',
    end: '2026-11-18T19:00:00.000Z',
    closeReason: 'Encerrado pelo oficial',
  },
  synthetic: {
    occurrences: { registered: 4, attended: 3, inProgress: 0, waiting: 1, cancelled: 0, averageMinutes: 12.5 },
    staff: { officers: 5, crews: 2 },
    results: {
      policeStation: 2,
      detained: 3,
      recoveredVehicles: 0,
      weapons: 1,
      approaches: 4,
      seizures: {},
    },
    byCity: { 'São Luís': 4 },
    byCrimeType: { Roubo: 2 },
  },
  analytic: {
    occurrences: [
      {
        protocol: 'P-2026-0001',
        registeredAt: '2026-11-18T12:00:00.000Z',
        city: 'São Luís',
        crimeType: 'Roubo',
        status: 'Encerrada',
        crew: 'GU-01',
        responseMinutes: null,
        durationMinutes: 30,
        detained: 1,
        policeStation: '1º DP',
        seizures: '',
      },
    ],
    crews: [],
    transfers: [],
    events: [],
  },
};

const renderAt = (url) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/relatorios/turno-cpu/:id" element={<CpuShiftReport />} />
        <Route path="/relatorios/dia/:day" element={<CpuShiftReport />} />
      </Routes>
    </MemoryRouter>,
  );

describe('CpuShiftReport', () => {
  beforeEach(() => {
    useData.mockReset();
    downloadFile.mockReset();
    useData.mockReturnValue({ data: report, loading: false });
  });

  it('shows the synthetic report with the police station count', () => {
    renderAt('/relatorios/turno-cpu/s1?modo=sintetico');
    expect(useData).toHaveBeenCalledWith('/reports/cpu-shifts/s1');
    expect(screen.getByText('Conduções à delegacia')).toBeTruthy();
    expect(screen.getByText('12,5 min')).toBeTruthy();
  });

  it('opens the analytic table from the modo query', () => {
    renderAt('/relatorios/turno-cpu/s1?modo=analitico');
    expect(screen.getByText('P-2026-0001')).toBeTruthy();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('downloads the shift CSV', async () => {
    renderAt('/relatorios/turno-cpu/s1?modo=analitico');
    await userEvent.click(screen.getByRole('button', { name: /Baixar CSV/ }));
    expect(downloadFile).toHaveBeenCalledWith(
      '/reports/cpu-shifts/s1?format=csv',
      'srgop-turno-2026-11-18.csv',
    );
  });

  it('serves the duty-day report', async () => {
    renderAt('/relatorios/dia/2026-11-18?modo=analitico');
    expect(useData).toHaveBeenCalledWith('/reports/duty-days/2026-11-18');
    await userEvent.click(screen.getByRole('button', { name: /Baixar CSV/ }));
    expect(downloadFile).toHaveBeenCalledWith(
      '/reports/duty-days/2026-11-18?format=csv',
      'srgop-turno-2026-11-18.csv',
    );
  });

  it('shows a message when the report is unavailable', () => {
    useData.mockReturnValue({ data: null, loading: false });
    renderAt('/relatorios/turno-cpu/s1');
    expect(screen.getByText(/Não foi possível carregar/)).toBeTruthy();
  });
});
