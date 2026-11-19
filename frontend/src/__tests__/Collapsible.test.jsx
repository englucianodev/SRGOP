import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Collapsible from '../components/Collapsible';
import FactList from '../components/FactList';

describe('Collapsible', () => {
  it('corpo recolhido continua no DOM (para a impressão)', () => {
    const { container } = render(
      <Collapsible title="GU-01" chips={['3 turnos']} defaultOpen={false}>
        <p>conteúdo</p>
      </Collapsible>,
    );
    expect(screen.getByText('conteúdo')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'GU-01' })).toBeInTheDocument();
    expect(screen.getByText('3 turnos')).toHaveClass('tag');
    expect(screen.getByRole('button', { name: /GU-01/ })).toHaveAttribute('aria-expanded', 'false');
    expect(container.querySelector('.collapsible')).toHaveClass('is-collapsed');
  });

  it('clicar no cabeçalho expande e recolhe', async () => {
    const { container } = render(
      <Collapsible title="GU-01" defaultOpen={false}>
        <p>conteúdo</p>
      </Collapsible>,
    );
    await userEvent.click(screen.getByRole('button', { name: /GU-01/ }));
    expect(screen.getByRole('button', { name: /GU-01/ })).toHaveAttribute('aria-expanded', 'true');
    expect(container.querySelector('.collapsible')).not.toHaveClass('is-collapsed');
    await userEvent.click(screen.getByRole('heading', { name: 'GU-01' }));
    expect(container.querySelector('.collapsible')).toHaveClass('is-collapsed');
  });

  it('abre por padrão', () => {
    render(<Collapsible title="VTR-1">x</Collapsible>);
    expect(screen.getByRole('button', { name: /VTR-1/ })).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('FactList', () => {
  it('mostra pares rótulo/valor e omite itens sem valor', () => {
    render(
      <FactList
        items={[
          ['Período', '01/11/2026 a 18/11/2026'],
          ['Vazio', ''],
          ['Nulo', null],
          ['Zero', 0],
        ]}
      />,
    );
    expect(screen.getByText('Período').tagName).toBe('DT');
    expect(screen.getByText('01/11/2026 a 18/11/2026').tagName).toBe('DD');
    expect(screen.queryByText('Vazio')).toBeNull();
    expect(screen.queryByText('Nulo')).toBeNull();
    expect(screen.getByText('Zero')).toBeInTheDocument();
  });
});
