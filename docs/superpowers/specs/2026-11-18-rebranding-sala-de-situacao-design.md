# Rebranding no estilo da Sala de Situação — design

Data: 2026-11-18 · Escopo: só o frontend (`frontend/src`). Backend e API não mudam.

## Intenção

As abas Operação, Efetivo e Ocorrências ganharam o visual da Sala de Situação: cartões elevados, KPIs grandes, chips, títulos de seção em caixa alta, fontes Sora e JetBrains Mono, sombras e animações curtas. O resto do sistema continua no visual antigo, com textos pequenos (muitos entre 8 e 11 px) e pouca separação entre os blocos. O usuário quer o sistema inteiro no mesmo padrão.

As duas dores citadas por ele:

- **Relatórios:** "as informações não estão destacadas uma da outra, o texto está bastante corrido e causando confusão e a página está bem comprida". Ele pediu barra de rolagem para certos dados.
- **Usuários:** "ou coloque barra de rolagem ou coloque aba com várias páginas", com prioridade para o uso no celular.

## Objetivos

1. Tokens, fontes e padrões visuais da Sala de Situação no sistema todo, nos temas claro e escuro.
2. Relatórios com uma coisa por vez: sub-abas, KPIs em destaque, tabelas com rolagem interna e página curta.
3. Usuários e Viaturas, que usam o mesmo componente, com paginação e cartões no celular.
4. Leitura confortável no celular (360 px de largura), sem rolagem horizontal da página.

## Não objetivos

- Mudar dados, regras, filtros, endpoints ou permissões.
- Reestruturar outras páginas além de Relatórios e Usuários/Viaturas. As demais mudam só porque herdam os componentes base restilizados.
- Trocar bibliotecas ou adicionar dependências.

## Anti-objetivos (contam como falha mesmo que tudo funcione)

- A impressão ou o PDF do relatório perder conteúdo que sai hoje.
- O tema escuro ficar com contraste ruim ou com cores fixas do tema claro.
- As abas Operação, Efetivo e Ocorrências mudarem de aparência ou quebrarem.
- Rolagem presa no celular: uma área interna que engole o gesto e impede rolar a página.

## Restrições

- React/Vite, CSS puro (`styles.css`, `situation-room.css`) e lucide-react, que já estão no projeto.
- Os 161 testes do frontend e o build continuam passando.
- Toda animação nova respeita `prefers-reduced-motion`.
- Commit e push só quando o usuário pedir.

## Abordagens consideradas

**Relatórios** (o usuário escolheu a opção A):

- **A — Sub-abas (escolhida):** Resumo | Ocorrências | Turnos CPU | Guarnições | Cadastros. Uma seção por vez, página curta e tabelas com rolagem interna. A impressão inclui todas as seções.
- B — Seções recolhíveis (sanfona) numa página só. Dá para abrir várias ao mesmo tempo, mas a página volta a ficar comprida.
- C — Página única com rolagem interna em cada tabela. É a menor mudança, mas continua mostrando informação demais de uma vez.

**Usuários** (decisão minha, já comunicada ao usuário):

- **Paginação de 12 por página (escolhida):** no celular, cada usuário vira um cartão. Funciona bem com o toque e mostra quantos registros existem.
- Rolagem interna: no celular, uma rolagem dentro de outra confunde.
- Rolagem infinita: perde a noção de posição e não ajuda a achar um registro.

**Forma de aplicar o visual** (decisão minha): promover os tokens `--sr-*` para `:root` e restilizar os componentes base de `components/UI.jsx` e as classes globais. Reescrever página por página custaria mais e deixaria o visual inconsistente.

## Design

### 1. Tokens e fontes globais

- Os tokens hoje restritos a `.situation-room` passam para `:root` e `:root[data-theme='dark']`:
  - `--sr-brand`, `--sr-brand-2`, `--sr-ok`, `--sr-hot`, `--sr-warn`, `--sr-target`, `--sr-cpu`;
  - `--sr-shadow-sm/md/lg`;
  - `--sr-font-display` e `--sr-font-mono`.

  `.situation-room` continua funcionando, agora herdando esses valores.
- Uso das fontes:
  - **Sora** nos títulos de página e de painel e nos números de KPI.
  - **JetBrains Mono** nos eyebrows, protocolos, prefixos, horários e números de tabela.
  - **Inter** continua no corpo do texto.
- Tamanho mínimo de fonte: 13 px para texto de conteúdo e de tabela. Só rótulos em caixa alta com espaçamento entre letras podem usar 11–12 px. Isso elimina os 8–10 px atuais.

### 2. Componentes base (`components/UI.jsx` + CSS)

| Componente | Novo visual |
|---|---|
| `PageTitle` | Eyebrow em mono, com o traço em gradiente do `.sr-heading`; título em Sora |
| `Panel` | Cartão elevado (`--sr-shadow-sm`, borda suave, mesmo raio do `.sr-card`); título no estilo `.sr-heading`; subtítulo em cinza e menor |
| `Button` | Estilo "keycap" do `.sr-filters` (sombra inferior e afundamento ao clicar); mantém as variantes primary, secondary, ghost e danger |
| `Badge` | Vira chip/tag (`.tag`) com os mesmos tons: red, amber, green, blue e gray |
| `.metric-card`, `.small-metrics` | Visual do `Kpi`: número grande em Sora, rótulo em caixa alta, tons hot/ok/warn |
| Tabelas | Cabeçalho fixo (`position: sticky`), linhas zebradas suaves, números em mono, destaque ao passar o mouse |
| `Tabs` (novo) | Extraído de `pages/Operation.jsx`, com o mesmo markup e ARIA de `.sr-tabs`. Usado pela Operação, pelo seletor de modo dos Relatórios e pelas sub-abas |
| `ScrollArea` (novo) | Wrapper `.sr-scroll` com `max-height: 65vh`, rolagem interna e borda/sombra que indicam conteúdo além da área visível |

A barra lateral e o topo herdam os tokens. A marca passa para Sora, e o item ativo do menu ganha uma barra lateral em `--sr-brand`, no padrão do `.sr-entry`.

### 3. Relatórios (`pages/Reports.jsx`)

Esboço no celular:

```
RELATÓRIOS
[Guarnições] [Viaturas] [Indicadores]      ← Tabs (modo)
┌ Filtros ──────────────────────────┐
│ período · município · ... [Aplicar]│
└───────────────────────────────────┘
[Resumo][Ocorrências][Turnos CPU][Guarn…] → ← sub-abas, rolam na horizontal
┌──────┐┌──────┐
│ 128  ││  12  │   KPIs 2 por linha
│OCORR.││ALTA  │
└──────┘└──────┘
```

- Os três modos atuais (Guarnições, Viaturas, Indicadores gerais) viram `Tabs`.
- Em **Indicadores gerais**, o painel de filtros fica no topo e as sub-abas vêm abaixo dele:
  - **Resumo:** as 10 métricas como KPIs com tom (por exemplo, prioridade alta em hot e encerradas em ok), seguidas do gráfico de distribuição com "Agrupar por".
  - **Ocorrências:** a tabela de ocorrências dentro de um `ScrollArea`, com a contagem no subtítulo.
  - **Turnos CPU:** o `CpuShiftsPanel` atual, com a tabela em `ScrollArea`.
  - **Guarnições:** a tabela "Turnos das guarnições" em `ScrollArea`.
  - **Cadastros:** "Usuários ativos" e "Viaturas em manutenção", lado a lado no desktop e empilhados no celular, cada um em `ScrollArea`.
- A sub-aba escolhida fica lembrada em `localStorage`, no mesmo padrão de `srgop-operacao-aba`.
- **Impressão:**
  - Todas as seções ficam no DOM. As inativas recebem uma classe que as esconde apenas na tela.
  - No `@media print`, todas aparecem com os seus títulos, o `ScrollArea` perde o `max-height`, e as abas e os filtros somem.
  - O que hoje é `no-print` continua de fora, inclusive o `CpuShiftsPanel`.
  - Resultado: o conteúdo impresso fica igual ao de hoje.
- **CrewTraceReport e VehicleReport:**
  - Herdam o visual dos componentes base.
  - Cada guarnição ou viatura vira um bloco recolhível, com nome e chips de totais no cabeçalho. Quando há só um bloco, ele já vem aberto.
  - As tabelas de cada turno ficam em `ScrollArea`.
  - Os parágrafos `trace-note` formados por pares rótulo/valor viram linhas rótulo/valor (`<dl>`); o restante fica como nota curta.
  - Na impressão, tudo sai expandido.

### 4. Usuários e Viaturas (`pages/Resources.jsx`)

- **Paginação, 12 por página:**
  - controles "‹ Anterior · 1 2 3 · Próxima ›" e o texto "Mostrando 1–12 de 40";
  - mudar a busca volta para a página 1;
  - se uma exclusão esvaziar a página atual, a lista volta uma página.
- **Celular (até 720 px):** a mesma tabela vira cartões via CSS, com `data-label` nas células.

  ```
  ┌───────────────────────────────┐
  │ SD FULANO DE TAL     [Ativo]  │
  │ fulano@pm.ma.gov.br           │
  │ PERFIL  Praça   MUNICÍPIO  X  │
  │ GUARNIÇÃO  GU-01              │
  │                  [✎] [🔒] [🗑] │
  └───────────────────────────────┘
  ```
- No desktop continua a tabela, com o estilo novo.

### 5. Celular

- As abas rolam na horizontal, sem quebrar linha.
- KPIs em 2 colunas.
- Painéis com padding menor.
- `ScrollArea` com `max-height: 65vh` e `overscroll-behavior: auto`: ao chegar ao fim da área interna, o gesto continua rolando a página.

### 6. Testes

- Os testes existentes continuam passando. Os que buscam texto ou papel em Relatórios e Usuários só são ajustados se o markup mudar.
- Testes novos:
  - Relatórios: trocar de sub-aba mostra a seção certa, e a escolha fica lembrada.
  - Relatórios: todas as seções estão no DOM, para a impressão.
  - Usuários: com 30 registros, aparecem 12; "Próxima" mostra do 13 ao 24; uma busca volta para a página 1.
  - `Tabs`: ARIA (`role="tab"`, `aria-selected`) e troca de aba.
- Conferência visual por screenshots das páginas Relatórios, Usuários, Dashboard e Operação, em 1280 px e 390 px, nos temas claro e escuro.

## Ordem sugerida

1. Tokens globais e componentes base, incluindo `Tabs` e `ScrollArea`.
2. Relatórios.
3. Usuários e Viaturas.
4. Revisão visual das demais páginas, com ajustes pontuais de CSS.

## Decisões tomadas após a revisão (minhas, podem ser corrigidas)

1. **Operação, Efetivo e Ocorrências:**
   - Não precisam ficar idênticas pixel a pixel. Precisam continuar funcionando e com o mesmo visual de hoje.
   - As regras `.sr-*` têm precedência dentro de `.situation-room` e não são reescritas.
   - O novo estilo global é feito para coincidir com elas.
2. **Impressão:**
   - O critério é o conteúdo: os mesmos títulos, números e tabelas de hoje, sem comparação visual.
   - Nos relatórios de guarnição, viatura e dia/turno CPU, a troca de `trace-note` por `<dl>` é aceita, desde que nenhum dado se perca.
   - Na impressão, Cadastros sai empilhado, uma tabela abaixo da outra.
3. **Modos Guarnições e Viaturas:**
   - Mantêm os filtros e o layout atuais. Mudam só o visual, os blocos recolhíveis e o `ScrollArea`.
   - As sub-abas existem apenas em Indicadores gerais.
   - O seletor de datas do painel Turnos CPU continua independente.
4. **Itens lembrados no navegador:**
   - o modo, na chave `srgop-relatorios-modo`;
   - a sub-aba, na chave `srgop-relatorios-secao`.

   Os dois são independentes.
5. **Testes existentes:**
   - Textos, papéis ARIA e rótulos usados pelos testes ficam estáveis sempre que possível.
   - Quando uma mudança de markup exigir, a asserção é ajustada sem perder o que ela verificava.
6. **Cartões no celular, também para Viaturas:**
   - Mostram as mesmas colunas da tabela, na mesma ordem, e cada `data-label` é o título da coluna.
   - As ações ficam na última linha.
   - O bloco de situação das viaturas (Disponível, Em operação…) passa a usar o visual de KPI.
7. **Cabeçalho fixo:** vale apenas para tabelas dentro de `ScrollArea`.

Plano de implementação: `docs/superpowers/plans/2026-11-18-rebranding-sala-de-situacao.md`.

## A critério de quem constrói

- O tom de cada uma das 10 métricas do Resumo.
- Os valores exatos de raio, espaçamento e sombra, desde que sigam `situation-room.css`.
- Navegação por setas em `Tabs`: recomendada, não obrigatória.
- A remoção das regras CSS que ficarem sem uso depois da mudança.
