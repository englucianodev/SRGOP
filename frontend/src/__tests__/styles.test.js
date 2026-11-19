import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name) => readFileSync(resolve(process.cwd(), 'src', name), 'utf8');
const css = read('styles.css');
const srCss = read('situation-room.css');
const theme = read('theme.css');

describe('rebranding: regras globais de estilo', () => {
  it('não há font-size abaixo de 11px em styles.css e theme.css', () => {
    const tiny = /font-size:\s*(?:[0-9]|10)(?:\.\d+)?px/g;
    expect(css.match(tiny)).toBeNull();
    expect(theme.match(tiny)).toBeNull();
  });

  it('tokens da sala de situação estão em :root', () => {
    expect(srCss).toMatch(/:root\s*{[^}]*--sr-brand:/);
    expect(srCss).toMatch(/:root\[data-theme='dark'\]\s*{[^}]*--sr-warn:/);
  });

  it('sr-scroll limita a altura a 65vh e deixa a página rolar no fim', () => {
    expect(theme).toMatch(/\.sr-scroll\s*{[^}]*max-height:\s*65vh/);
    expect(theme).toMatch(/\.sr-scroll\s*{[^}]*overscroll-behavior:\s*auto/);
  });

  it('cores novas do tema usam tokens, sem hex solto', () => {
    // Print ink is fixed on purpose (paper is always white); everything on screen uses tokens.
    const screenRules = theme.slice(0, theme.lastIndexOf('@media print'));
    expect(screenRules.match(/#[0-9a-f]{3,8}\b/gi)).toBeNull();
  });

  it('cartão do CPU usa as cores de texto do tema sobre o fundo claro dos painéis', () => {
    // theme.css loads after styles.css and gives every .panel a light surface, so the CPU
    // card's original white-on-navy text would vanish. The card's text must follow the theme.
    expect(theme).toMatch(/\.cpu-panel\s*{[^}]*color:\s*var\(--text\)/);
    expect(theme).toMatch(/\.cpu-panel p[^{]*{[^}]*color:\s*var\(--muted\)/);
    expect(theme).toMatch(/\.cpu-active\s*{[^}]*color:\s*var\(--sr-ok\)/);
  });

  it('impressão usa tinta escura mesmo no tema escuro', () => {
    const print = theme.slice(theme.lastIndexOf('@media print'));
    expect(print).toMatch(/:root\[data-theme='dark'\][^{]*{[^}]*--text:\s*#111/);
    expect(print).toMatch(/--muted:\s*#555/);
  });

  it('impressão mantém o padding compacto das tabelas', () => {
    const print = theme.slice(theme.lastIndexOf('@media print'));
    expect(print).toMatch(/th,\s*td\s*{[^}]*padding:\s*7px 5px/);
  });
});
