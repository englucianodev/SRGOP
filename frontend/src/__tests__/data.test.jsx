import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../services/api', () => ({ api: { get } }));
vi.mock('../context/AppContext', () => ({
  useApp: () => ({ revision: 0, chatRevision: 0, notificationRevision: 0 }),
}));

const { useData } = await import('../hooks/useData');
const { default: OccurrenceFilters } = await import('../components/OccurrenceFilters');

beforeEach(() => {
  get.mockReset();
});

describe('useData', () => {
  it('loads data from the API path', async () => {
    get.mockResolvedValue({ data: [{ _id: '1' }] });
    const { result } = renderHook(() => useData('/cities', []));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(get).toHaveBeenCalledWith('/cities');
    expect(result.current.data).toEqual([{ _id: '1' }]);
  });

  it('skips the request without a path', () => {
    const { result } = renderHook(() => useData(null, 'fallback'));
    expect(result.current).toMatchObject({ data: 'fallback', loading: false });
    expect(get).not.toHaveBeenCalled();
  });

  it('keeps the fallback when the request fails', async () => {
    get.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useData('/crews', []));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([]);
  });

  it('applies live crew location events to /crews and /dashboard', async () => {
    get.mockResolvedValueOnce({ data: [{ _id: 'c1' }, { _id: 'c2' }] });
    get.mockResolvedValueOnce({ data: { crews: [{ _id: 'c1' }] } });
    const crews = renderHook(() => useData('/crews', []));
    const dashboard = renderHook(() => useData('/dashboard', null));
    await waitFor(() => expect(dashboard.result.current.loading).toBe(false));

    const detail = {
      crewId: 'c1',
      location: { latitude: 1 },
      shiftEnd: 'x',
      status: 'Em atendimento',
    };
    act(() => window.dispatchEvent(new CustomEvent('srgop:crew-location', { detail })));

    expect(crews.result.current.data[0]).toMatchObject({ _id: 'c1', status: 'Em atendimento' });
    expect(crews.result.current.data[1]).toEqual({ _id: 'c2' });
    expect(dashboard.result.current.data.crews[0].location).toEqual({ latitude: 1 });
  });
});

describe('OccurrenceFilters', () => {
  it('loads only cities by default and emits filter changes', async () => {
    const user = userEvent.setup();
    get.mockResolvedValue({ data: [{ _id: 'city1', name: 'São Luís' }] });
    const onChange = vi.fn();
    render(<OccurrenceFilters value={{ search: 'abc' }} onChange={onChange} />);

    await screen.findByRole('option', { name: 'São Luís' });
    expect(get).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Guarnição')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Status'), 'Encerrada');
    expect(onChange).toHaveBeenLastCalledWith({ search: 'abc', status: 'Encerrada' });

    await user.click(screen.getByRole('button', { name: /limpar/i }));
    expect(onChange).toHaveBeenLastCalledWith({});
  });

  it('shows crew, vehicle and author filters in report mode', async () => {
    get.mockImplementation((path) =>
      Promise.resolve({
        data: {
          '/cities': [],
          '/crews': [{ _id: 'c1', name: 'Alfa' }],
          '/vehicles': [{ _id: 'v1', prefix: 'VTR-01' }],
          '/users': [{ _id: 'u1', name: 'Maria' }],
        }[path],
      }),
    );
    render(<OccurrenceFilters value={{}} onChange={() => {}} reports />);
    expect(await screen.findByRole('option', { name: 'Alfa' })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'VTR-01' })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'Maria' })).toBeInTheDocument();
  });
});
