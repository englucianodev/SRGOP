import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const NOW = Date.now();
const CREW = {
  _id: 'c1',
  name: 'Equipe Alfa',
  status: 'Disponível',
  city: { name: 'Caxias' },
  shiftStart: new Date(NOW - 3600000).toISOString(),
  shiftEnd: new Date(NOW + 3600000).toISOString(),
  members: [
    { _id: 'p1', name: 'Ana', rank: 'Soldado' },
    { _id: 'p2', name: 'Bruno', rank: 'Cabo' },
  ],
};
const state = vi.hoisted(() => ({ cpuOfficer: 'o1' }));
const post = vi.hoisted(() => vi.fn(async () => ({ data: {} })));

vi.mock('../hooks/useData', () => ({
  useData: (url, initial = null) => ({
    data:
      url === '/crews' ? [CREW] : url === '/cpu' ? { officer: { _id: state.cpuOfficer } } : initial,
  }),
}));
vi.mock('../services/api', () => ({ api: { get: vi.fn(async () => ({ data: {} })), post } }));
vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    run: async (fn) => fn(),
    hydrate: vi.fn(),
    user: { _id: 'o1', role: 'Oficial' },
    now: NOW,
  }),
}));

const { default: Crews } = await import('../pages/Crews');
const renderPage = () =>
  render(
    <MemoryRouter>
      <Crews />
    </MemoryRouter>,
  );

describe('encerramento antecipado pelo CPU do dia', () => {
  beforeEach(() => {
    post.mockClear();
    state.cpuOfficer = 'o1';
    // jsdom has no <dialog> API; same polyfill as cpuDashboard.test.jsx.
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute('open');
    };
  });

  it('o CPU vê o encerramento da guarnição e de cada policial', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Encerrar turno' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Encerrar turno de / })).toHaveLength(2);
  });

  it('o CPU encerra o turno de apenas um policial', async () => {
    renderPage();
    const [first] = screen.getAllByRole('button', { name: /^Encerrar turno de / });
    await userEvent.click(first);
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox'), 'Dispensa médica autorizada.');
    await userEvent.click(within(dialog).getByRole('button', { name: /encerrar/i }));
    expect(post).toHaveBeenCalledWith('/crews/c1/members', {
      member: 'p1',
      action: 'Saída',
      reason: 'Dispensa médica autorizada.',
    });
  });

  it('oficial que não é o CPU do dia não vê os botões de encerramento', () => {
    state.cpuOfficer = 'outro';
    renderPage();
    expect(screen.queryByRole('button', { name: /^Encerrar turno/ })).toBeNull();
    expect(screen.getByText(/depende de autorização do CPU do dia/)).toBeInTheDocument();
  });
});
