import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../services/api', () => ({ api: { get: vi.fn() } }));
vi.mock('../context/AppContext', () => ({
  useApp: () => ({ revision: 0, chatRevision: 0, notificationRevision: 0 }),
}));

const { HandoverSummary, waitLabel } = await import('../components/HandoverSummary');

const EMPTY = {
  generatedAt: '2026-11-16T12:00:00.000Z',
  occurrences: { total: 0, items: [] },
  attendances: [],
  supportRequests: [],
  emergencies: [],
  crews: [],
  vehicleChecklists: [],
  totals: {
    occurrences: 0,
    open: 0,
    dispatched: 0,
    attendances: 0,
    supportRequests: 0,
    emergencies: 0,
    crews: 0,
    vehicleChecklists: 0,
  },
};
const FILLED = {
  ...EMPTY,
  occurrences: {
    total: 58,
    items: [
      {
        protocol: '00012-16112026',
        city: 'Bacabal',
        crimeType: 'Furto',
        priority: 'Alta',
        status: 'Em aberto',
        waitingMinutes: 45,
      },
    ],
  },
  attendances: [
    {
      protocol: '00009-16112026',
      city: 'Pedreiras',
      crew: 'Guarnição Alfa',
      startedAt: '2026-11-16T11:30:00.000Z',
    },
  ],
  supportRequests: [
    {
      protocol: '00009-16112026',
      targetCrew: 'Guarnição Bravo',
      requestedAt: '2026-11-16T11:40:00.000Z',
    },
  ],
  emergencies: [
    {
      requester: 'Cabo Silva',
      crew: 'Guarnição Alfa',
      city: 'Pedreiras',
      triggeredAt: '2026-11-16T11:50:00.000Z',
    },
  ],
  crews: [{ name: 'Guarnição Charlie', city: 'Bacabal', status: 'Disponível', members: 3 }],
  vehicleChecklists: [{ vehicle: 'VTR-0101', driver: 'Soldado Souza', kind: 'Entrega' }],
  totals: {
    occurrences: 58,
    open: 57,
    dispatched: 1,
    attendances: 1,
    supportRequests: 1,
    emergencies: 1,
    crews: 1,
    vehicleChecklists: 1,
  },
};
const PREVIOUS = {
  day: '2026-11-15',
  officer: { name: 'Capitão Lima' },
  assumedAt: '2026-11-15T11:05:00.000Z',
};

describe('waitLabel', () => {
  it('formats minutes, hours and days of waiting', () => {
    expect(waitLabel(0)).toBe('menos de 1 min');
    expect(waitLabel(45)).toBe('45 min');
    expect(waitLabel(125)).toBe('2 h 05 min');
    expect(waitLabel(1500)).toBe('1 d 1 h');
  });
});

describe('HandoverSummary', () => {
  it('lists every pending item with who hands the service over', () => {
    render(<HandoverSummary summary={FILLED} previous={PREVIOUS} current={null} />);
    expect(screen.getByText('Capitão Lima')).toBeInTheDocument();
    expect(screen.getByText(/00012-16112026 · Furto/)).toBeInTheDocument();
    expect(screen.getByText(/aguardando há 45 min/)).toBeInTheDocument();
    expect(screen.getByText(/Exibindo as 1 mais antigas de 58/)).toBeInTheDocument();
    expect(screen.getByText(/Guarnição Bravo/)).toBeInTheDocument();
    expect(screen.getByText(/Cabo Silva/)).toBeInTheDocument();
    expect(screen.getByText(/Guarnição Charlie/)).toBeInTheDocument();
    expect(screen.getByText(/3 integrantes/)).toBeInTheDocument();
    expect(screen.getByText(/VTR-0101/)).toBeInTheDocument();
    expect(screen.getByText(/Entrega pendente · Soldado Souza/)).toBeInTheDocument();
  });

  it('says there is nothing pending in every empty section', () => {
    render(<HandoverSummary summary={EMPTY} previous={null} current={null} />);
    expect(screen.getByText('Sem registro no serviço anterior')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma ocorrência aguardando despacho ou aceite.')).toBeInTheDocument();
    expect(screen.getByText('Nenhum atendimento em andamento.')).toBeInTheDocument();
    expect(screen.getByText('Nenhum pedido de apoio pendente.')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma Urgência UU em aberto.')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma guarnição em serviço.')).toBeInTheDocument();
    expect(screen.getByText('Nenhum checklist de viatura pendente.')).toBeInTheDocument();
  });
});
