import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const { get, post, patch, del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}));
const app = vi.hoisted(() => ({
  user: { _id: 'u2', role: 'Oficial', name: 'Maria' },
  settings: {},
  now: Date.parse('2026-11-18T12:00:00Z'),
  remaining: 3600,
  theme: 'light',
  setTheme: () => {},
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
vi.mock('../services/api', () => ({ api: { get, post, patch, delete: del } }));
vi.mock('../context/AppContext', () => ({ useApp: () => app }));
for (const name of [
  'GpsControl',
  'PushControl',
  'ProfileMenu',
  'ServiceCpu',
  'DayOperations',
  'OperationalSafety',
  'ConnectionStatus',
  'InstitutionLogo',
]) {
  vi.mock(`../components/${name}`, () => ({ default: () => null }));
}

const { default: Layout } = await import('../components/Layout');
const { default: ShiftExpiredBanner } = await import('../components/ShiftExpiredBanner');

const respond = (routes) =>
  get.mockImplementation((path) =>
    path in routes ? Promise.resolve({ data: routes[path] }) : Promise.reject(new Error(path)),
  );
const renderLayout = () =>
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Layout />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});

describe('CPU shift screens', () => {
  it('mostra a tela de fechamento a partir de notificação não lida, também após recarregar', async () => {
    respond({
      '/notifications': [
        { _id: 'n1', kind: 'turno-cpu', read: false, cpuShift: 's1', title: 'Turno', message: 'Fechou' },
      ],
      '/cpu': null,
    });
    renderLayout();
    const synthetic = await screen.findByRole('link', { name: 'Relatório sintético' });
    expect(synthetic.getAttribute('href')).toBe('/relatorios/turno-cpu/s1?modo=sintetico');
    expect(screen.getByRole('link', { name: 'Relatório analítico' }).getAttribute('href')).toBe(
      '/relatorios/turno-cpu/s1?modo=analitico',
    );
    patch.mockResolvedValue({ data: {} });
    await userEvent.click(screen.getByRole('button', { name: 'Depois' }));
    expect(patch).toHaveBeenCalledWith('/notifications/n1/read');
  });

  it('destinatário vê aceitar/recusar e envia a resposta', async () => {
    respond({
      '/notifications': [],
      '/cpu': {
        _id: 's1',
        officer: { _id: 'u1', name: 'João' },
        transfer: { _id: 't1', to: 'u2', status: 'Pendente', reason: 'Saúde' },
        pending: null,
      },
    });
    post.mockResolvedValue({ data: {} });
    renderLayout();
    await userEvent.click(await screen.findByRole('button', { name: 'Aceitar' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/cpu/transfer/answer', { accept: true }),
    );
  });

  it('não mostra a passagem a quem não é o destinatário', async () => {
    respond({
      '/notifications': [],
      '/cpu': { _id: 's1', officer: 'u1', transfer: { _id: 't1', to: 'u9', status: 'Pendente' } },
    });
    renderLayout();
    await waitFor(() => expect(get).toHaveBeenCalledWith('/cpu'));
    expect(screen.queryByRole('button', { name: 'Aceitar' })).toBeNull();
  });

  it('banner de turno encerrado para guarnição em atendimento além do horário', () => {
    const crew = { status: 'Em atendimento', shiftEnd: '2026-11-18T11:00:00Z' };
    render(<ShiftExpiredBanner crew={crew} now={app.now} />);
    expect(
      screen.getByText(
        'Seu turno encerrou. Finalize o atendimento o mais rápido possível para a próxima equipe assumir.',
      ),
    ).toBeTruthy();
  });

  it('banner não aparece dentro do horário nem fora de atendimento', () => {
    const { container, rerender } = render(
      <ShiftExpiredBanner
        crew={{ status: 'Em atendimento', shiftEnd: '2026-11-18T13:00:00Z' }}
        now={app.now}
      />,
    );
    expect(container.textContent).toBe('');
    rerender(
      <ShiftExpiredBanner
        crew={{ status: 'Disponível', shiftEnd: '2026-11-18T11:00:00Z' }}
        now={app.now}
      />,
    );
    expect(container.textContent).toBe('');
  });
});
