import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const { get, post, del } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), del: vi.fn() }));
const app = vi.hoisted(() => ({
  user: { _id: 'u1', role: 'Oficial', name: 'João' },
  settings: { modules: ['CPU'] },
  now: Date.parse('2026-11-18T12:00:00Z'),
  online: true,
  revision: 0,
  chatRevision: 0,
  notificationRevision: 0,
  run: async (fn) => {
    try {
      return await fn();
    } catch {
      return null;
    }
  },
}));
vi.mock('../services/api', () => ({ api: { get, post, delete: del } }));
vi.mock('../context/AppContext', () => ({ useApp: () => app }));
vi.mock('../components/operation/SituationMap', () => ({ default: () => null }));
vi.mock('../components/HandoverSummary', () => ({ default: () => null }));
vi.mock('../components/ConnectionStatus', () => ({ useConnectionState: () => 'conectado' }));

const { default: Dashboard } = await import('../pages/Dashboard');

const DASHBOARD = {
  counts: [],
  crews: [],
  ongoing: [],
  recent: [],
  operations: [],
  alerts: 0,
  results: {},
  cpu: null,
};
const cpuRow = (extra = {}) => ({
  _id: 's1',
  officer: { _id: 'u1', name: 'João' },
  assumedAt: '2026-11-18T11:00:00Z',
  plannedEnd: '2026-11-18T11:00:00Z',
  transfer: null,
  pending: null,
  ...extra,
});
const USERS = [
  { _id: 'u1', name: 'João', role: 'Oficial', active: true },
  { _id: 'u2', name: 'Maria', role: 'Oficial', active: true },
  { _id: 'u3', name: 'Inativo', role: 'Oficial', active: false },
  { _id: 'u4', name: 'Soldado', role: 'Praça', active: true },
];
const load = (cpu) => {
  const routes = { '/dashboard': { ...DASHBOARD, cpu }, '/cities': [], '/cpu': cpu, '/users': USERS };
  get.mockImplementation((path) => Promise.resolve({ data: routes[path] }));
};
const show = () =>
  render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  app.user = { _id: 'u1', role: 'Oficial', name: 'João' };
  app.now = Date.parse('2026-11-18T12:00:00Z');
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});

describe('Dashboard CPU card', () => {
  it('current CPU sees "Passar serviço" and no pending transfer', async () => {
    load(cpuRow());
    show();
    expect(await screen.findByRole('button', { name: 'Passar serviço' })).toBeTruthy();
    expect(screen.queryByText(/aguardando aceite/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull();
  });

  it('an Oficial who is not the CPU sees neither "Passar serviço" nor "Cancelar"', async () => {
    app.user = { _id: 'u2', role: 'Oficial', name: 'Maria' };
    load(cpuRow({ transfer: { _id: 't1', to: 'u9', status: 'Pendente' } }));
    show();
    await screen.findByText(/aguardando aceite/);
    expect(screen.queryByRole('button', { name: 'Passar serviço' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull();
  });

  it('sender cancels a pending transfer with DELETE /cpu/transfer', async () => {
    load(cpuRow({ transfer: { _id: 't1', to: 'u2', status: 'Pendente' } }));
    del.mockResolvedValue({ data: {} });
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    expect(del).toHaveBeenCalledWith('/cpu/transfer');
    expect(screen.queryByRole('button', { name: 'Passar serviço' })).toBeNull();
  });

  it('shows the pending list after plannedEnd to a non-CPU Oficial', async () => {
    app.user = { _id: 'u2', role: 'Oficial', name: 'Maria' };
    load(
      cpuRow({
        pending: {
          attending: [{ protocol: '00001-18112026', crew: 'Alfa' }],
          onDuty: [{ crew: 'Bravo', members: 2 }],
        },
      }),
    );
    show();
    expect(await screen.findByText(/Atendimento 00001-18112026/)).toBeTruthy();
    expect(screen.getByText(/Guarnição em serviço: Bravo/)).toBeTruthy();
  });

  it('hides the pending list before plannedEnd', async () => {
    load(
      cpuRow({
        plannedEnd: '2026-11-18T20:00:00Z',
        pending: { attending: [{ protocol: '00001-18112026', crew: 'Alfa' }], onDuty: [] },
      }),
    );
    show();
    await screen.findByRole('button', { name: 'Passar serviço' });
    expect(screen.queryByText(/Atendimento 00001-18112026/)).toBeNull();
  });
});

describe('CpuTransferDialog', () => {
  const openDialog = async () => {
    load(cpuRow());
    post.mockResolvedValue({ data: {} });
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Passar serviço' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getAllByRole('option').length).toBeGreaterThan(1));
    return dialog;
  };

  it('lists only active Oficiais other than the user', async () => {
    const dialog = await openDialog();
    const names = within(dialog)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(names).toEqual(['Selecione…', 'Maria']);
  });

  it('sends { to } when there is no reason', async () => {
    const dialog = await openDialog();
    await userEvent.selectOptions(within(dialog).getByRole('combobox'), 'u2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar passagem' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/cpu/transfer', { to: 'u2' }));
  });

  it('sends { to, reason } when a reason is typed', async () => {
    const dialog = await openDialog();
    await userEvent.selectOptions(within(dialog).getByRole('combobox'), 'u2');
    await userEvent.type(within(dialog).getByRole('textbox'), 'Saúde');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar passagem' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/cpu/transfer', { to: 'u2', reason: 'Saúde' }),
    );
  });
});
