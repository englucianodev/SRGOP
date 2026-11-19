import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

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

const SERVICE_CPU = { day: '2026-11-18', officer: { _id: 'o9', name: 'Marcos Costa', rank: '1º Ten', phone: '99981234567' } };

const MAP_POINTS = {
  items: [
    { _id: 'o1', protocol: '00001-18112026', crimeType: 'Furto', priority: 'Alta', status: 'Em aberto', latitude: -4.2, longitude: -44.7 },
    { _id: 'o2', protocol: '00002-18112026', crimeType: 'Roubo', priority: 'Baixa', status: 'Encerrada', latitude: -4.3, longitude: -44.8 },
  ],
  total: 3,
  withoutCoordinates: 1,
};
let mapProps = null;
vi.mock('../services/api', () => ({
  api: {
    get: vi.fn((path) => {
      if (path === '/dashboard') return Promise.resolve({ data: DASHBOARD });
      if (path === '/service-cpu') return Promise.resolve({ data: SERVICE_CPU });
      if (path.startsWith('/occurrences/map')) return Promise.resolve({ data: MAP_POINTS });
      return Promise.resolve({ data: [] });
    }),
  },
}));
vi.mock('../context/AppContext', () => ({
  useApp: () => ({ now: NOW, revision: 0, chatRevision: 0, notificationRevision: 0 }),
}));
vi.mock('../components/operation/SituationMap', () => ({
  default: (props) => {
    mapProps = props;
    return <div>mapa</div>;
  },
}));
vi.mock('../components/operation/OccurrenceMap', () => ({
  default: ({ occurrences }) => <div>{occurrences.length} pontos no mapa</div>,
}));

const { default: OperationPage } = await import('../pages/Operation');
const renderAt = (url = '/operacao') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <OperationPage />
    </MemoryRouter>,
  );

describe('Operation page', () => {
  beforeEach(() => localStorage.clear());

  it('shows the attendance cards with protocol and elapsed time', async () => {
    renderAt();
    expect(await screen.findByText('00009-18112026')).toBeInTheDocument();
    expect(screen.getByText('00:30:00')).toBeInTheDocument();
    expect(screen.getAllByText('Em atendimento').length).toBeGreaterThan(0);
    expect(screen.getByText(/CPU atual/)).toBeInTheDocument();
    expect(screen.getAllByText('Ten Costa').length).toBeGreaterThan(0);
  });

  it('lists crews by city with commander, driver and expired shift on the staff tab', async () => {
    renderAt();
    await userEvent.click(await screen.findByRole('tab', { name: 'Efetivo' }));
    expect(screen.getByText('Pedreiras')).toBeInTheDocument();
    expect(screen.getAllByText(/Comandante/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Motorista/).length).toBeGreaterThan(0);
    expect(screen.getByText('Turno encerrado')).toBeInTheDocument();
    expect(screen.getByText('Entradas recentes')).toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem('srgop-operacao-aba')).toBe('efetivo'));
  });

  it('shows the CPU do dia name for officers and administrators on every tab', async () => {
    renderAt();
    const banner = await screen.findByRole('region', { name: 'CPU do serviço' });
    await waitFor(() => expect(banner).toHaveTextContent('Marcos Costa'));
    await userEvent.click(screen.getByRole('tab', { name: 'Efetivo' }));
    expect(screen.getByRole('region', { name: 'CPU do serviço' })).toHaveTextContent('Marcos Costa');
  });

  it('shows the filtered occurrences on the Ocorrências tab', async () => {
    renderAt();
    await userEvent.click(await screen.findByRole('tab', { name: 'Ocorrências' }));
    expect(await screen.findByText('2 pontos no mapa')).toBeInTheDocument();
    expect(screen.getByText('filtradas')).toBeInTheDocument();
    expect(screen.getByText('sem coordenadas')).toBeInTheDocument();
    expect(screen.getByLabelText('Município')).toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem('srgop-operacao-aba')).toBe('ocorrencias'));
  });

  it('opens the operation map focused on the crew from "Ver localização"', async () => {
    localStorage.setItem('srgop-operacao-aba', 'efetivo');
    renderAt('/operacao?crew=6a1b2c3d4e5f60718293a4b5');
    expect(await screen.findByText('mapa')).toBeInTheDocument();
    expect(mapProps.focusCrew).toBe('6a1b2c3d4e5f60718293a4b5');
  });
});
