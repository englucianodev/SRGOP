import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const NOW = new Date('2026-11-18T12:00:00.000Z').getTime();
const person = (id, name) => ({ _id: id, name, rank: 'Sd', warName: name });
const DASHBOARD = {
  crews: [
    {
      _id: 'c1',
      name: 'Guarnição Alfa',
      status: 'Em atendimento',
      city: { name: 'Bacabal' },
      members: [person('u1', 'Souza'), person('u2', 'Lima')],
      driver: 'u1',
      motorcycleSeats: [],
      shiftStart: '2026-11-18T08:00:00.000Z',
      shiftEnd: '2026-11-18T20:00:00.000Z',
    },
    {
      _id: 'c2',
      name: 'Guarnição Bravo',
      status: 'Disponível',
      city: { name: 'Pedreiras' },
      members: [person('u3', 'Alves'), person('u4', 'Rocha')],
      driver: { _id: 'u3' },
      motorcycleSeats: [],
      shiftStart: '2026-11-17T20:00:00.000Z',
      shiftEnd: '2026-11-18T08:00:00.000Z',
    },
  ],
  open: [
    {
      protocol: '00009-18112026',
      status: 'Em atendimento',
      crew: { name: 'Guarnição Alfa' },
      startedAt: '2026-11-18T11:30:00.000Z',
    },
  ],
  events: [
    { at: '2026-11-18T11:00:00.000Z', action: 'Ingresso na guarnição', actor: 'Cb Lima', label: 'Guarnição Alfa' },
    { at: '2026-11-18T10:00:00.000Z', action: 'Despacho', actor: 'Ten Costa', label: '' },
  ],
  cpu: { officer: { name: 'Ten Costa' }, assumedAt: '2026-11-18T08:00:00.000Z' },
};

vi.mock('../services/api', () => ({
  api: {
    get: vi.fn((path) => Promise.resolve({ data: path === '/dashboard' ? DASHBOARD : [] })),
  },
}));
vi.mock('../context/AppContext', () => ({
  useApp: () => ({ now: NOW, revision: 0, chatRevision: 0, notificationRevision: 0 }),
}));
vi.mock('../components/OperationalMap', () => ({ default: () => <div>mapa</div> }));

const { default: Operation } = await import('../pages/Operation');

describe('Operation page', () => {
  beforeEach(() => localStorage.clear());

  it('shows the attendance cards with protocol and elapsed time', async () => {
    render(<Operation />);
    expect(await screen.findByText('00009-18112026')).toBeInTheDocument();
    expect(screen.getByText('00:30:00')).toBeInTheDocument();
    expect(screen.getAllByText('Em atendimento').length).toBeGreaterThan(0);
    expect(screen.getByText(/CPU atual/)).toBeInTheDocument();
    expect(screen.getAllByText('Ten Costa').length).toBeGreaterThan(0);
  });

  it('lists crews by city with commander, driver and expired shift on the staff tab', async () => {
    render(<Operation />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Efetivo' }));
    expect(screen.getByText('Pedreiras')).toBeInTheDocument();
    expect(screen.getAllByText(/Comandante/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Motorista/).length).toBeGreaterThan(0);
    expect(screen.getByText('Turno encerrado')).toBeInTheDocument();
    expect(screen.getByText('Entradas recentes')).toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem('srgop-operacao-aba')).toBe('efetivo'));
  });
});
