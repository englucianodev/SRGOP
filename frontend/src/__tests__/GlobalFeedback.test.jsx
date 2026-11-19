import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const app = vi.hoisted(() => ({ user: null, acknowledgeError: vi.fn() }));

vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    error: { origin: 'Login', message: 'Cadastro aguardando aprovação ou desativado.' },
    toast: '',
    user: app.user,
    acknowledgeError: app.acknowledgeError,
  }),
}));

const { GlobalFeedback } = await import('../components/UI');

describe('janela de erro global', () => {
  beforeEach(() => {
    app.acknowledgeError.mockReset();
    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute('open');
    };
  });

  it('em tela pública não promete o Dashboard e mantém a pessoa na mesma tela', async () => {
    app.user = null;
    render(<GlobalFeedback />);

    expect(screen.queryByText(/Dashboard/)).toBeNull();
    expect(screen.getByText(/confira os dados e tente novamente/i)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: /Entendi/ }));
    expect(app.acknowledgeError).toHaveBeenCalledWith({ stay: true });
  });

  it('com sessão aberta avisa que volta ao Dashboard', async () => {
    app.user = { _id: 'u1', role: 'Praça' };
    render(<GlobalFeedback />);

    expect(screen.getByText(/direcionado ao Dashboard/)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: /Entendi/ }));
    expect(app.acknowledgeError).toHaveBeenCalledWith({ stay: false });
  });
});
