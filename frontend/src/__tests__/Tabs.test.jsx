import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, renderHook, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Tabs, { useStoredChoice } from '../components/Tabs';
import ScrollArea from '../components/ScrollArea';

const TABS = [
  ['a', 'Alfa'],
  ['b', 'Beta'],
];

describe('Tabs', () => {
  afterEach(() => localStorage.clear());

  it('marca a aba ativa e chama onChange', async () => {
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} value="a" onChange={onChange} label="Seções" idPrefix="t" />);
    expect(screen.getByRole('tablist', { name: 'Seções' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Alfa' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Beta' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Alfa' })).toHaveAttribute('id', 't-tab-a');
    expect(screen.getByRole('tab', { name: 'Alfa' })).toHaveAttribute('aria-controls', 't-panel');
    await userEvent.click(screen.getByRole('tab', { name: 'Beta' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('setas mudam a aba selecionada', async () => {
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} value="a" onChange={onChange} label="Seções" idPrefix="t" />);
    screen.getByRole('tab', { name: 'Alfa' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('b');
    onChange.mockClear();
    await userEvent.keyboard('{ArrowLeft}');
    // value is still 'a' (controlled), so left wraps to the last tab
    expect(onChange).toHaveBeenLastCalledWith('b');
  });

  it('useStoredChoice ignora valor inválido salvo e grava a escolha', () => {
    localStorage.setItem('k', 'zzz');
    const { result } = renderHook(() => useStoredChoice('k', ['a', 'b'], 'a'));
    expect(result.current[0]).toBe('a');
    act(() => result.current[1]('b'));
    expect(result.current[0]).toBe('b');
    expect(localStorage.getItem('k')).toBe('b');
  });

  it('useStoredChoice recupera valor válido salvo', () => {
    localStorage.setItem('k', 'b');
    const { result } = renderHook(() => useStoredChoice('k', ['a', 'b'], 'a'));
    expect(result.current[0]).toBe('b');
  });
});

describe('ScrollArea', () => {
  it('expõe região rotulada e rolável', () => {
    render(
      <ScrollArea label="Ocorrências">
        <p>linha</p>
      </ScrollArea>,
    );
    const region = screen.getByRole('region', { name: 'Ocorrências' });
    expect(region).toHaveClass('sr-scroll');
    expect(region).toHaveAttribute('tabindex', '0');
  });
});
