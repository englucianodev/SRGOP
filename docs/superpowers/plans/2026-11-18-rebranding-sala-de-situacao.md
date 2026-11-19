# Rebranding Sala de Situação: plano de implementação

> **Para agentes:** use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** levar o visual da Sala de Situação ao sistema todo, dar sub-abas e áreas com rolagem própria a Relatórios, e paginação com cartões no celular a Usuários e Viaturas.

**Arquitetura:**
- Os tokens `--sr-*` saem do escopo `.situation-room` e vão para `:root`.
- Os componentes base (`UI.jsx` e CSS global) recebem o novo estilo.
- Novas peças reutilizáveis: `Tabs`, `ScrollArea`, `Collapsible`, `FactList`, `usePagination` e `Pagination`.
- Relatórios e Resources passam a usar essas peças.
- Nenhuma mudança no backend.

**Stack:** React 18, Vite, vitest, Testing Library, CSS puro (`styles.css` e `situation-room.css`), lucide-react.

**Spec:** `docs/superpowers/specs/2026-11-18-rebranding-sala-de-situacao-design.md`

## Restrições globais

- **Escopo:** só o frontend (`frontend/src`). Nenhuma dependência nova.
- **Testes e build:** os 161 testes existentes e o `npm run build` continuam passando. Uma asserção só é ajustada se o markup mudar, e o ajuste preserva o que ela verificava.
- **Cores:** valem para os temas claro e escuro. Toda cor nova usa um token (`--sr-*`, `--bg`, `--surface`, `--text`, `--muted`, `--border`…); hex solto só dentro das definições de token.
- **Tamanho de fonte:** mínimo de 13 px para conteúdo e tabelas. Só rótulos em caixa alta com `letter-spacing` podem usar 11–12 px.
- **Famílias de fonte:**
  - Sora (`--sr-font-display`): títulos e números de KPI.
  - JetBrains Mono (`--sr-font-mono`): eyebrows, protocolos, prefixos, horários e números de tabela.
  - Inter: corpo do texto.
- **Animações:** respeitam `prefers-reduced-motion`.
- **`ScrollArea`:** `max-height: 65vh` e `overscroll-behavior: auto`. Na impressão, sem `max-height`.
- **Cabeçalho fixo** (`position: sticky`): só em tabelas dentro de `ScrollArea`.
- **`localStorage`:** chaves `srgop-relatorios-modo` e `srgop-relatorios-secao`, sempre lidas e gravadas dentro de try/catch.
- **Paginação:**
  - 12 itens por página;
  - texto exato `Mostrando {de}–{até} de {total}`;
  - botões `Anterior` e `Próxima`.
- **Operação, Efetivo e Ocorrências** mantêm o visual atual. As regras `.sr-*` não são reescritas.
- **Impressão de Relatórios:** o conteúdo continua o mesmo de hoje. O que é `no-print` segue fora (filtros, abas, `CpuShiftsPanel`); todo o resto sai.
- **Sem commit nem push:** o usuário autoriza commits caso a caso. Os checkpoints só rodam os testes.

## Pontos de atenção na revisão

1. **Busca reduz os resultados com a lista na página 3.** A página recua até a última que existe e nunca mostra a lista vazia. Teste na Tarefa 5.
2. **Impressão de seções inativas e blocos recolhidos.** Precisam sair na impressão. Teste nas Tarefas 3 e 4, verificando a classe e a presença no DOM, já que o jsdom não aplica CSS.
3. **Sub-aba Turnos CPU sem os dados de `/reports`.** Ela não depende desses dados, então funciona enquanto `/reports` carrega ou se ele falhar. Teste na Tarefa 3.
4. **Valor inválido salvo no `localStorage`.** Cai na aba padrão, sem quebrar. Teste na Tarefa 1.
5. **Tema escuro com cor clara fixa.** Conferido no teste de CSS da Tarefa 2 e nos screenshots da Tarefa 6.

---

### Tarefa 1: componentes `Tabs` e `ScrollArea`

**Arquivos:**
- Criar: `frontend/src/components/Tabs.jsx`, `frontend/src/components/ScrollArea.jsx`
- Modificar: `frontend/src/pages/Operation.jsx`, que passa a usar `Tabs` e `useStoredChoice` no lugar do próprio markup e do `storedTab`
- Modificar: `frontend/src/situation-room.css`, tirando as regras `.sr-tabs` de dentro de `.situation-room` para que fiquem globais
- Teste: `frontend/src/__tests__/Tabs.test.jsx`

**Interfaces produzidas:**
- `Tabs({ tabs, value, onChange, label, idPrefix })`:
  - `tabs` é um array de `[id, rótulo, Icon?]`;
  - renderiza `<div class="sr-tabs" role="tablist" aria-label={label}>`;
  - cada aba é um `<button role="tab" id={`${idPrefix}-tab-${id}`} aria-selected aria-controls={`${idPrefix}-panel`}>`;
  - as setas ← e → mudam a seleção.
- `useStoredChoice(key, ids, fallback) -> [value, choose]`, exportado de `Tabs.jsx`:
  - lê do `localStorage` dentro de try/catch;
  - usa `fallback` se o valor salvo não estiver em `ids`;
  - `choose` grava dentro de try/catch.
- `ScrollArea({ children, label })`: renderiza `<div class="sr-scroll" tabIndex=0 role="region" aria-label={label}>`.

- [ ] **Passo 1: escrever os testes que devem falhar**

```jsx
it('marca a aba ativa e chama onChange', async () => {
  const onChange = vi.fn();
  render(<Tabs tabs={[['a','Alfa'],['b','Beta']]} value="a" onChange={onChange} label="Seções" idPrefix="t" />);
  expect(screen.getByRole('tab', { name: 'Alfa' })).toHaveAttribute('aria-selected', 'true');
  await userEvent.click(screen.getByRole('tab', { name: 'Beta' }));
  expect(onChange).toHaveBeenCalledWith('b');
});
it('seta para a direita seleciona a próxima aba', async () => { /* foco em Alfa, {ArrowRight} → onChange('b') */ });
it('useStoredChoice ignora valor inválido salvo', () => {
  localStorage.setItem('k', 'zzz');
  // renderHook(() => useStoredChoice('k', ['a','b'], 'a')) → result.current[0] === 'a'
});
it('ScrollArea expõe região rotulada', () => { /* getByRole('region', { name: 'Ocorrências' }) */ });
```

- [ ] **Passo 2:** rodar `npx vitest run src/__tests__/Tabs.test.jsx`. Esperado: falha porque o módulo não existe.
- [ ] **Passo 3:** implementar `Tabs.jsx` e `ScrollArea.jsx`. Trocar as abas de `Operation.jsx` por `<Tabs idPrefix="operation" …>`, mantendo os ids `operation-tab-*` e `operation-panel`.
- [ ] **Passo 4:** rodar `npx vitest run src/__tests__/Tabs.test.jsx src/__tests__/OperationPage.test.jsx`. Esperado: passa.
- [ ] **Passo 5 (checkpoint):** rodar `npx vitest run`. Esperado: tudo passa.

### Tarefa 2: tokens globais e estilo dos componentes base

**Arquivos:**
- Modificar `frontend/src/situation-room.css`:
  - os tokens `--sr-*` (cores, sombras e fontes) e as variantes escuras passam para `:root` e `:root[data-theme='dark']`;
  - `.situation-room` deixa de redefini-los.
- Modificar `frontend/src/styles.css`, seguindo a tabela da seção 2 da spec:
  - `.page-title`: eyebrow em mono com traço em gradiente; `h1` em Sora.
  - `.panel` e `.panel-head`: cartão elevado (`--sr-shadow-sm`), título no estilo `.sr-heading`.
  - `.button`: aparência de tecla (keycap) nas variantes primary, secondary, ghost e danger.
  - `.badge`: tag ou chip.
  - `.metric-card`, `.small-metrics > .panel` e `.small-metrics strong`: mesmo visual do Kpi.
  - `table`: listras alternadas, hover e números em mono pela classe `.num` no `td`.
  - `.sr-scroll`: `max-height: 65vh`, `overflow: auto`, `overscroll-behavior: auto`, `thead th { position: sticky; top: 0 }` e borda ou sombra interna.
  - `.sidebar`: marca em Sora; item ativo com barra lateral em `--sr-brand`.
  - Celular (`max-width: 720px`):
    - `.sr-tabs` com `flex-wrap: nowrap; overflow-x: auto`;
    - `.small-metrics` e os grids de KPI em 2 colunas;
    - padding dos painéis reduzido.
- Ainda em `frontend/src/styles.css`, todo `font-size` abaixo de 13 px sobe para 13 px. Exceção: rótulos em caixa alta com `letter-spacing`, que ficam em 11–12 px.
- Teste: `frontend/src/__tests__/styles.test.js` (ambiente node), lendo os arquivos CSS com `fs`.

**Interface produzida:** as classes `.sr-scroll` e `.num`, e os tokens `--sr-*` disponíveis globalmente.

- [ ] **Passo 1: escrever os testes que devem falhar**

```js
it('não há font-size abaixo de 11px em styles.css', () => {
  expect(css.match(/font-size:\s*(?:[0-9]|10)(?:\.\d+)?px/g)).toBeNull();
});
it('tokens sr estão em :root', () => {
  expect(srCss).toMatch(/:root\s*{[^}]*--sr-brand:/);
});
it('sr-scroll limita a altura a 65vh', () => {
  expect(css).toMatch(/\.sr-scroll\s*{[^}]*max-height:\s*65vh/);
});
```

- [ ] **Passo 2:** rodar `npx vitest run src/__tests__/styles.test.js`. Esperado: falha.
- [ ] **Passo 3:** fazer as mudanças de CSS. `UI.jsx` só muda se algum componente precisar de um elemento a mais (por exemplo, um `<span>` para o eyebrow), sem alterar textos nem papéis ARIA.
- [ ] **Passo 4:** rodar `npx vitest run` e `npm run build`. Esperado: tudo passa e o build fica OK.

### Tarefa 3: Relatórios com abas de modo e sub-abas

**Arquivos:**
- Modificar `frontend/src/pages/Reports.jsx`.
- Criar `frontend/src/__tests__/Reports.test.jsx`.
- Modificar `frontend/src/__tests__/reportsServiceDay.test.jsx`: o clique passa a ser em `getByRole('tab', { name: 'Indicadores gerais' })` e depois na sub-aba `Turnos CPU`.
- Em `styles.css`, acrescentar:
  - `@media screen { .report-section.is-inactive { display: none } }`
  - `@media print { .sr-tabs { display: none } .sr-scroll { max-height: none; overflow: visible } .report-cadastros { grid-template-columns: 1fr } }`

**Interfaces consumidas:**
- `Tabs`, `useStoredChoice` e `ScrollArea`, da Tarefa 1;
- `Kpi({ value, label, tone })`, de `components/operation/Kpi.jsx`.

**Decisões:**
- **Abas de modo:** `[['crews','Guarnições'],['vehicles','Viaturas'],['general','Indicadores gerais']]`, salvas na chave `srgop-relatorios-modo`, com padrão `crews`.
- **Sub-abas:** `[['resumo','Resumo'],['ocorrencias','Ocorrências'],['cpu','Turnos CPU'],['guarnicoes','Guarnições'],['cadastros','Cadastros']]`, salvas na chave `srgop-relatorios-secao`, com padrão `resumo`.
- **Seções:** cada uma é `<section className={`report-section${ativa ? '' : ' is-inactive'}`} role="tabpanel" aria-labelledby=… data-section={id}>`. Todas ficam sempre no DOM.
- **Turnos CPU:** o `CpuShiftsPanel` fica na própria seção, renderizado mesmo sem `data`, e continua `no-print`.
- **Demais seções:** as outras quatro ficam dentro de `.report-content.printable`.
- **Resumo:** os 10 indicadores viram `Kpi`, com os mesmos rótulos.
  - `hot`: `Em aberto / andamento`.
  - `ok`: `Encerradas`.
  - `warn`: `Tempo médio`, `Deslocamento médio` e `Tempo médio no local`.
  - Os demais ficam sem tom.
  - O gráfico de distribuição vem logo abaixo.
- **Ocorrências, Guarnições e Cadastros:** trocar `.table-scroll` por `<ScrollArea label=…>`. Em Cadastros, o `div.two-columns` ganha a classe `report-cadastros`.

- [ ] **Passo 1: escrever os testes que devem falhar.** Mockar `useData`, `api` e `AppContext` como em `reportsServiceDay.test.jsx`. O mock de `/reports` devolve `totals`, `occurrences: []`, `users: []`, `vehicles: []` e `shifts: []`.

```jsx
it('modos aparecem como abas e o modo escolhido é lembrado', async () => {
  // clique em tab 'Viaturas' → localStorage 'srgop-relatorios-modo' === 'vehicles'
});
it('sub-aba Ocorrências fica ativa e as demais ficam no DOM como inativas', async () => {
  // tab 'Indicadores gerais' → tab 'Ocorrências'
  // container.querySelector('[data-section="ocorrencias"]') sem classe is-inactive
  // container.querySelector('[data-section="resumo"]') com classe is-inactive
  // as 5 seções existem (impressão)
});
it('valor inválido em srgop-relatorios-secao abre Resumo', () => {});
it('Turnos CPU funciona enquanto /reports ainda carrega', async () => {
  // useData('/reports…') → { data: null, loading: true }; sub-aba 'Turnos CPU' → getByLabelText('Dia de serviço')
});
```

- [ ] **Passo 2:** rodar `npx vitest run src/__tests__/Reports.test.jsx`. Esperado: falha.
- [ ] **Passo 3:** implementar em `Reports.jsx` e ajustar `reportsServiceDay.test.jsx`.
- [ ] **Passo 4:** rodar `npx vitest run src/__tests__/Reports.test.jsx src/__tests__/reportsServiceDay.test.jsx`. Esperado: passa.
- [ ] **Passo 5 (checkpoint):** rodar `npx vitest run`.

### Tarefa 4: CrewTraceReport e VehicleReport com blocos recolhíveis

**Arquivos:**
- Criar: `frontend/src/components/Collapsible.jsx` e `frontend/src/components/FactList.jsx`.
- Modificar: `frontend/src/components/CrewTraceReport.jsx` e `frontend/src/components/VehicleReport.jsx`.
- Em `styles.css`:
  - `@media screen { .collapsible.is-collapsed > .collapsible-body { display: none } }`
  - `@media print { .collapsible-toggle svg { display: none } }`
  - `.fact-list`: grade de rótulo e valor; rótulo em caixa alta com 11–12 px e valor com 13 px.
- Teste: `frontend/src/__tests__/Collapsible.test.jsx`.

**Interfaces produzidas:**
- `Collapsible({ title, subtitle, chips, defaultOpen, className, children })`:
  - renderiza `<section className="panel collapsible …">`, no mesmo visual de um `Panel`;
  - o cabeçalho é um `<button className="collapsible-toggle" aria-expanded aria-controls>` com o título e chips `.tag`;
  - o corpo `<div className="collapsible-body">` fica sempre no DOM.
- `FactList({ items })`: recebe `items` como array de `[rótulo, valor]`, ignora valores nulos ou vazios e renderiza `<dl className="fact-list">` com `<dt>` e `<dd>`.

**Decisões:**
- Cada `Panel className="trace-crew"`, de guarnição ou de viatura, vira um `Collapsible`. `defaultOpen` é verdadeiro quando há um único item.
- Chips:
  - guarnição: `{n} turnos`, `{n} dias trabalhados` e `{n} ocorrências distintas`, com o município no `subtitle`;
  - viatura: `{n} checklists`.
- Viram `FactList`:
  - o bloco "Critérios do relatório" (Período, Guarnições ou Viaturas, Emitido em);
  - os parágrafos no formato `<strong>Rótulo:</strong> valor` de turnos e checklists (Equipe no turno, Fim previsto, Fim efetivo, Serviço observado até, Dias no período, Data, KM registrado, Policial, Guarnição…).
- Frases que não têm par rótulo/valor continuam em `.trace-note`.
- Todo texto e valor exibido hoje continua presente.
- As tabelas internas trocam `.table-scroll` por `ScrollArea`.

- [ ] **Passo 1: escrever os testes que devem falhar**

```jsx
it('corpo recolhido continua no DOM (para a impressão)', async () => {
  render(<Collapsible title="GU-01" defaultOpen={false}><p>conteúdo</p></Collapsible>);
  expect(screen.getByText('conteúdo')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /GU-01/ })).toHaveAttribute('aria-expanded', 'false');
});
it('clicar no cabeçalho expande', async () => { /* aria-expanded 'true', sem classe is-collapsed */ });
it('FactList omite itens sem valor', () => {
  render(<FactList items={[['Período', 'x'], ['Vazio', '']]} />);
  expect(screen.queryByText('Vazio')).toBeNull();
});
```

- [ ] **Passo 2:** rodar `npx vitest run src/__tests__/Collapsible.test.jsx`. Esperado: falha.
- [ ] **Passo 3:** implementar os componentes e aplicá-los nos dois relatórios.
- [ ] **Passo 4 (checkpoint):** rodar `npx vitest run`, com atenção a `CpuShiftReport.test.jsx` e `HandoverSummary.test.jsx`.

### Tarefa 5: Usuários e Viaturas com paginação e cartões no celular

**Arquivos:**
- Criar: `frontend/src/hooks/usePagination.js` e `frontend/src/components/Pagination.jsx`.
- Modificar: `frontend/src/pages/Resources.jsx`.
- Em `styles.css`:
  - a classe `.pagination`;
  - em `@media (max-width: 720px)`, a `.record-table` vira lista de cartões:
    - `thead` escondido;
    - cada `tr` vira um cartão (`display: grid`, `--sr-shadow-sm`, com espaçamento entre as células);
    - `td::before { content: attr(data-label) }`, com o rótulo em caixa alta;
    - a primeira célula fica sem rótulo e em destaque;
    - as ações ficam na última linha, alinhadas à direita.
- Teste: `frontend/src/__tests__/Resources.test.jsx`.

**Interfaces produzidas:**
- `usePagination(items, pageSize = 12, resetKey) -> { page, pageCount, pageItems, setPage, from, to, total }`:
  - `page` começa em 1;
  - quando `resetKey` muda, volta para a página 1;
  - se `page > pageCount`, limita a `pageCount` (mínimo 1);
  - `from` e `to` contam a partir de 1 e valem 0 quando a lista está vazia.
- `Pagination({ page, pageCount, from, to, total, onChange })`:
  - mostra `Mostrando {from}–{to} de {total}`;
  - botões `Anterior` e `Próxima`, desabilitados nas pontas;
  - números de página, com `aria-current="page"` na atual;
  - com `pageCount <= 1`, mostra só o texto.

**Decisões:**
- `Resources.jsx` chama `usePagination(filtered, 12, search)` e renderiza `pageItems` no lugar de `filtered`. O contador `"{n} registros"` continua.
- A `<table>` ganha `className="record-table"`. Cada `<td>` recebe `data-label` com o título da sua coluna, na mesma ordem do `thead` atual.
- No bloco de situação das viaturas, os `Panel` com `Badge` viram `<Kpi value label tone>`:
  - `Disponível` usa `ok`;
  - `Em operação` fica sem tom;
  - `Em manutenção` usa `warn`;
  - `Indisponível` usa `hot`.

- [ ] **Passo 1: escrever os testes que devem falhar.** O mock de `useData` devolve 30 usuários, de `Usuário 01` a `Usuário 30`. `AppContext` tem `user.role: 'Administrativo'`.

```jsx
it('mostra 12 por página e avança', async () => {
  expect(screen.getByText('Usuário 01')).toBeInTheDocument();
  expect(screen.queryByText('Usuário 13')).toBeNull();
  expect(screen.getByText('Mostrando 1–12 de 30')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Próxima' }));
  expect(screen.getByText('Usuário 13')).toBeInTheDocument();
  expect(screen.getByText('Mostrando 13–24 de 30')).toBeInTheDocument();
});
it('buscar volta para a página 1', async () => { /* página 3 → digitar 'Usuário 2' → 'Mostrando 1–11 de 11' */ });
it('células carregam data-label para o cartão do celular', () => {
  expect(screen.getByText('Usuário 01').closest('tr').querySelector('[data-label="Perfil"]')).not.toBeNull();
});
// usePagination (renderHook): itens encolhem de 30 para 5 na página 3 → page === 1, pageItems.length === 5
```

- [ ] **Passo 2:** rodar `npx vitest run src/__tests__/Resources.test.jsx`. Esperado: falha.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4 (checkpoint):** rodar `npx vitest run`.

### Tarefa 6: revisão visual e limpeza

**Arquivos:** `frontend/src/styles.css`, mais ajustes pontuais de CSS nas páginas que destoarem.

- [ ] **Passo 1:** rodar `npm run build` e `npx vite preview --port 5199`. Com o chrome-devtools, tirar screenshots em 1280×800 e 390×844, nos temas claro e escuro, de:
  - `/relatorios`: as 3 abas e as 5 sub-abas;
  - `/usuarios`, `/viaturas`, `/dashboard` e `/operacao`.
- [ ] **Passo 2:** corrigir o que aparecer, verificando:
  - contraste no tema escuro;
  - rolagem horizontal em 390 px: `document.documentElement.scrollWidth > innerWidth` deve ser `false`;
  - abas quebrando linha;
  - Operação diferente do visual anterior.
- [ ] **Passo 3:** com `emulate media print`, abrir `/relatorios` → Indicadores gerais e conferir que as 4 seções impressas saem completas e que Cadastros sai empilhado.
- [ ] **Passo 4:** remover as regras CSS que ficaram sem uso (`.report-tabs` e outras), confirmando com `grep` nos `.jsx`.
- [ ] **Passo 5:** encerrar o servidor de preview e apagar os arquivos temporários.
- [ ] **Passo 6 (checkpoint final):** rodar `npx vitest run` e `npm run build`. Esperado: todos os testes passam e o build fica OK.
