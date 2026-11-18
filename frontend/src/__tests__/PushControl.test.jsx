import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  pushSupport: vi.fn(),
  syncPush: vi.fn(),
  enablePush: vi.fn(),
  disablePush: vi.fn(),
}));
vi.mock('../services/api', () => ({ api: { get: mocks.get } }));
vi.mock('../context/AppContext', () => ({ useApp: () => ({ user: { _id: 'u1' } }) }));
vi.mock('../services/push', () => ({
  pushSupport: mocks.pushSupport,
  syncPush: mocks.syncPush,
  enablePush: mocks.enablePush,
  disablePush: mocks.disablePush,
}));

const { default: PushControl } = await import('../components/PushControl');
const show = (path = '/dashboard') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <PushControl />
    </MemoryRouter>,
  );
const settled = () => waitFor(() => expect(mocks.get).toHaveBeenCalled());

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.pushSupport.mockReturnValue('supported');
  mocks.get.mockResolvedValue({ data: { enabled: true, publicKey: 'chave-publica' } });
  mocks.syncPush.mockResolvedValue('off');
});

describe('PushControl', () => {
  it('stays hidden and asks nothing when the browser has no push support', () => {
    mocks.pushSupport.mockReturnValue('unsupported');
    const { container } = show();
    expect(container).toBeEmptyDOMElement();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('stays hidden when the server has push turned off', async () => {
    mocks.get.mockResolvedValue({ data: { enabled: false, publicKey: null } });
    const { container } = show();
    await settled();
    expect(mocks.get).toHaveBeenCalledWith('/push/config', { quiet: true });
    expect(container).toBeEmptyDOMElement();
    expect(mocks.syncPush).not.toHaveBeenCalled();
  });

  it('offers activation and turns notifications on with the server key', async () => {
    mocks.enablePush.mockResolvedValue('on');
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Ativar notificações' }));
    expect(mocks.enablePush).toHaveBeenCalledWith('chave-publica');
    expect(await screen.findByText('Notificações ativadas neste aparelho')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desativar' })).toBeInTheDocument();
  });

  it('shows the active state after the silent sync and allows turning it off', async () => {
    mocks.syncPush.mockResolvedValue('on');
    mocks.disablePush.mockResolvedValue('off');
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Desativar' }));
    expect(mocks.syncPush).toHaveBeenCalledWith('chave-publica');
    expect(mocks.disablePush).toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Ativar notificações' })).toBeInTheDocument();
  });

  it('explains a blocked permission without offering a button', async () => {
    mocks.syncPush.mockResolvedValue('denied');
    show();
    expect(await screen.findByText(/Notificações bloqueadas/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('tells iPhone users to install the app on the home screen', async () => {
    mocks.pushSupport.mockReturnValue('ios-install');
    show();
    expect(await screen.findByText(/instalado na tela inicial/)).toBeInTheDocument();
    expect(mocks.syncPush).not.toHaveBeenCalled();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('reports the server message when activation is refused', async () => {
    mocks.enablePush.mockRejectedValue({ response: { data: { message: 'Endereço recusado.' } } });
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Ativar notificações' }));
    expect(await screen.findByText('Endereço recusado.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ativar notificações' })).toBeEnabled();
  });

  it('syncs on every page but is only displayed on the dashboard', async () => {
    mocks.syncPush.mockResolvedValue('on');
    const { container } = show('/ocorrencias');
    await waitFor(() => expect(mocks.syncPush).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
