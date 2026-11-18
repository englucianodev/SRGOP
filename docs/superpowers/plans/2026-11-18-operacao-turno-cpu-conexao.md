# Operação e Efetivo, turno do CPU e resiliência de conexão — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao SRGOP indicador de reconexão e menos erros de conexão, a visão Operação/Efetivo com o mapa novo, o turno do CPU com fechamento automático, passagem com aceite e relatórios, e adequar o simulador.

**Architecture:** Backend Express/Mongoose: novo modelo `CpuShift` + serviço `cpuShift.js` (CPU atual, abertura, fechamento, varredura a cada 30 s), `cpuTransfer.js` (passagem) e `cpuShiftReport.js` (relatório calculado sob demanda). `Occurrence.dutyDay` define a que dia de serviço cada ocorrência pertence. Frontend React: monitor de conexão + reenvio no cliente axios; mapa `OperationalMap` evoluído com situação das guarnições; página `/operacao` com abas.

**Tech Stack:** Node 20, Express, Mongoose (transações), `node --test` + MongoMemoryReplSet + supertest; React 18, Vite, react-leaflet, socket.io-client, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-18-operacao-turno-cpu-conexao-design.md`

## Global Constraints

- Fuso `America/Fortaleza`; dia de serviço por `serviceWindow()` (08h→08h) em `backend/utils/time.js`.
- Perfis: `Administrativo`, `Oficial`, `Praça`; rotas de gestão com `allow('Administrativo', 'Oficial')` (`management` em `backend/routes/index.js`).
- Escritas multi-documento dentro de `transaction()` de `backend/services/operations.js`.
- Texto do aviso à guarnição (exato): `Seu turno encerrou. Finalize o atendimento o mais rápido possível para a próxima equipe assumir.`
- Alerta ao CPU: 30 min após o fim do turno, uma vez por guarnição.
- Nunca encerrar automaticamente uma ocorrência "Em atendimento" por causa das 08h.
- Praça não recebe `open`/`events` da visão de Operação.
- Dados pessoais (envolvidos, endereço, texto do resumo) não entram em eventos da linha do tempo nem no relatório analítico.
- Verificação em duas etapas fica fora (está em `stash@{0}`; não aplicar).
- Testes: backend `cd backend && npm test`; frontend `cd frontend && npm test`; simulador `cd simulacao && npm test`.
- Commits: o usuário autoriza commits explicitamente. Cada "Checkpoint" abaixo roda a suíte; só faça `git commit` se o usuário já tiver autorizado. `simulacao/` não é versionado.
- Arquivos novos com no máximo ~400 linhas; funções com menos de 50 linhas.

## Review Focus

1. **Oficial recarrega a página depois do fechamento do turno** → a tela de relatório ainda aparece (vem de notificação não lida, não de estado em memória). Teste na Task 13.
2. **Dois oficiais assumem o CPU ou aceitam passagem ao mesmo tempo** → só um turno aberto; o outro recebe 409. Índice único parcial + teste concorrente nas Tasks 7 e 11.
3. **Servidor reinicia e perde a virada das 08h** → a varredura é idempotente e recupera a virada (dutyDay, avisos, fechamento). Testes nas Tasks 8 e 10.
4. **Queda de rede com escritas em andamento** → POST/PUT/DELETE nunca são reenviados; só GET e o GPS. Teste na Task 2.
5. **Oscilação curta da conexão (<3 s)** → o indicador não aparece; em queda longa aparece uma vez e há só um aviso vermelho por queda. Teste na Task 3.

---

## Frente 1 — Conexão

### Task 1: Cache das configurações gerais e GPS repetido no servidor

**Files:**
- Create: `backend/services/settingsCache.js`
- Modify: `backend/models/SystemSetting.js` (hooks de invalidação)
- Modify: `backend/middlewares/auth.js:21`, `backend/controllers/authController.js:78,89`, `backend/controllers/occurrenceController.js:130`, `backend/controllers/resourceController.js:519,607` (ler pelo cache)
- Modify: `backend/controllers/gpsController.js`
- Test: `backend/tests/connection-load.test.js`

**Interfaces:**
- Produces: `getGeneralSettings(): Promise<object|null>` (objeto `lean`, TTL `SETTINGS_TTL_MS = 30000`); `invalidateGeneralSettings(): void`.
- Produces: em `gpsController.js`, `SAME_POINT_MS = 10000` e um `Map` `${crewId}:${userId}` → `{ latitude, longitude, accuracy, at, location }` (máx. 500 entradas; descarta as mais antigas).

- [ ] **Step 1: Write the failing tests** (`connection-load.test.js`, setup igual a `cpu-handover.test.js`)

```js
test('configurações gerais vêm do cache e mudam logo após salvar', async () => {
  const spy = mock.method(SystemSetting, 'findOne');
  await getGeneralSettings(); await getGeneralSettings();
  assert.equal(spy.mock.callCount(), 1);
  await put(admin.agent, '/settings', settingsBody({ inactivityMinutes: 9 }));
  assert.equal((await getGeneralSettings()).inactivityMinutes, 9);
  await SystemSetting.updateOne({ key: 'general' }, { inactivityMinutes: 11 }); // hook do modelo
  assert.equal((await getGeneralSettings()).inactivityMinutes, 11);
});
test('GPS com o mesmo ponto em menos de 10 s não grava de novo', async () => {
  const body = { enabled: true, latitude: -5.1, longitude: -44.3, accuracy: 8 };
  assert.equal((await patch(member.agent, `/crews/${crew._id}/gps`, body)).status, 200);
  const before = (await Crew.findById(crew._id)).location.locatedAt;
  assert.equal((await patch(member.agent, `/crews/${crew._id}/gps`, body)).status, 200);
  assert.deepEqual((await Crew.findById(crew._id)).location.locatedAt, before);
  await patch(member.agent, `/crews/${crew._id}/gps`, { ...body, latitude: -5.2 });
  assert.equal((await Crew.findById(crew._id)).location.latitude, -5.2);
});
test('GPS repetido de quem não é integrante continua recusado', async () => {
  assert.equal((await patch(outsider.agent, `/crews/${crew._id}/gps`, body)).status, 403);
});
```

- [ ] **Step 2: Run** `cd backend && node --test tests/connection-load.test.js` — Expected: FAIL (`getGeneralSettings` não existe).
- [ ] **Step 3: Implement** `settingsCache.js`; em `SystemSetting.js` registre `schema.post(['save','findOneAndUpdate','updateOne','updateMany','deleteOne','deleteMany'], invalidateGeneralSettings)`. Para evitar import circular, o serviço obtém o modelo com `mongoose.model('SystemSetting')` na hora da leitura. Troque as leituras listadas por `getGeneralSettings()`. Em `location()`: antes do caminho rápido, se houver entrada no `Map` do mesmo usuário e guarnição com mesma latitude, longitude e precisão e `Date.now() - at < SAME_POINT_MS`, responda `res.json(entry.location)` sem gravar nem emitir `crew:location`. Grave a entrada após cada escrita bem-sucedida com `enabled: true` e apague-a quando `enabled: false`.
- [ ] **Step 4: Run** a suíte inteira do backend — Expected: PASS (testes que gravam `SystemSetting` direto passam pelos hooks).
- [ ] **Step 5: Checkpoint.**

### Task 2: Reenvio automático no cliente HTTP

**Files:**
- Create: `frontend/src/services/retry.js`
- Modify: `frontend/src/services/api.js`, `frontend/src/components/GpsControl.jsx:68` (passar `retry: true`)
- Test: `frontend/src/__tests__/retry.test.js`

**Interfaces:**
- Produces: `RETRY_DELAYS_MS = [1000, 2000, 4000]`; `MAX_RETRY_AFTER_MS = 10000`.
- Produces: `shouldRetry(error): boolean`. Verdadeiro só quando as três condições valem:
  - `config.method === 'get'` ou `config.retry === true`;
  - a requisição ficou sem resposta, ou voltou com status 502, 503, 504 ou 429;
  - `config.__attempt < 3`.
- Produces: `retryDelay(error, attempt): number`. Usa o cabeçalho `Retry-After` (em segundos), limitado a `MAX_RETRY_AFTER_MS`; sem o cabeçalho, `RETRY_DELAYS_MS[attempt]` + até 250 ms aleatórios.
- Produces: o interceptor de `api.js` reenvia antes de emitir `srgop:error`; só emite o evento quando não vai reenviar.

- [ ] **Step 1: Write the failing tests**

```js
it('reenvia GET sem resposta e 503, nunca POST', () => {
  expect(shouldRetry({ config: { method: 'get', __attempt: 0 } })).toBe(true);
  expect(shouldRetry({ config: { method: 'get', __attempt: 0 }, response: { status: 503 } })).toBe(true);
  expect(shouldRetry({ config: { method: 'post', __attempt: 0 } })).toBe(false);
  expect(shouldRetry({ config: { method: 'patch', retry: true, __attempt: 0 } })).toBe(true);
  expect(shouldRetry({ config: { method: 'get', __attempt: 0 }, response: { status: 422 } })).toBe(false);
  expect(shouldRetry({ config: { method: 'get', __attempt: 3 } })).toBe(false);
});
it('respeita Retry-After com teto de 10 s', () => {
  const e = { response: { status: 429, headers: { 'retry-after': '60' } } };
  expect(retryDelay(e, 0)).toBe(10000);
});
it('emite srgop:error uma vez só depois de esgotar os reenvios', async () => {
  /* adapter falso que rejeita sem resposta; vi.useFakeTimers; adapter chamado 4x; listener 1x */
});
```

- [ ] **Step 2: Run** `cd frontend && npx vitest run src/__tests__/retry.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** `retry.js` e o interceptor. Se `shouldRetry` for verdadeiro, o interceptor incrementa `config.__attempt`, espera `retryDelay` e chama `api(config)`. No GPS (`GpsControl.jsx`) envie `retry: true`, mantendo o `quiet` se ele já estiver lá. Em `api.test.js`, o teste que espera o evento logo no GET sem resposta passa a usar `__attempt: 3` no config.
- [ ] **Step 4: Run** `cd frontend && npm test` — Expected: PASS.
- [ ] **Step 5: Checkpoint.**

### Task 3: Monitor de conexão, indicador animado e um aviso por queda

**Files:**
- Create: `frontend/src/services/connection.js`, `frontend/src/components/ConnectionStatus.jsx`
- Modify: `frontend/src/services/api.js` (informar sucesso/falha de rede), `frontend/src/context/AppContext.jsx:77-84,198-218` (socket e filtro do `srgop:error`), `frontend/src/components/Layout.jsx` (renderizar o indicador), `frontend/src/pages/Dashboard.jsx:109-112` (selo "Conectando" lê o mesmo estado), `frontend/src/styles.css`
- Test: `frontend/src/__tests__/connection.test.jsx`

**Interfaces:**
- Produces (`connection.js`): constantes `RECONNECT_SHOW_DELAY_MS = 3000` e `RECOVERED_VISIBLE_MS = 2500`.
- Produces: `createConnectionMonitor({ now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout })`, que devolve:
  - `setSocketOnline(bool)`, `requestFailed()` e `requestSucceeded()`;
  - `subscribe(fn)`, que devolve a função de cancelar a inscrição;
  - `state()`: `'online'`, `'reconectando'` ou `'restabelecida'`;
  - `announceNetworkError(): boolean`.
- Produces: uma instância única exportada como `connection`.
- Regras do monitor:
  - **Offline:** o socket está desconectado, ou houve uma falha de rede sem nenhum sucesso depois dela.
  - **Reconectando:** o estado só muda para `reconectando` depois de `RECONNECT_SHOW_DELAY_MS` seguidos offline.
  - **Volta da conexão:** passa a `restabelecida` por `RECOVERED_VISIBLE_MS` e depois a `online`. Se `reconectando` nunca apareceu, vai direto a `online`.
  - **Aviso de erro:** `announceNetworkError()` devolve `true` no máximo uma vez por queda, e `false` enquanto o estado for `reconectando`.
- Produces: `<ConnectionStatus />`, com `role="status"`:
  - em `reconectando`, mostra `Reconectando…` com um círculo animado (`.reconnect-spinner`, que respeita `prefers-reduced-motion`);
  - em `restabelecida`, mostra `Conexão restabelecida`;
  - em `online`, não renderiza nada.

- [ ] **Step 1: Write the failing tests**

```js
it('não mostra nada em oscilação menor que 3 s', () => {
  const m = createConnectionMonitor(fakeClock);
  m.setSocketOnline(false); fakeClock.advance(2000); m.setSocketOnline(true); fakeClock.advance(5000);
  expect(seen(m)).toEqual(['online']);
});
it('mostra reconectando após 3 s e restabelecida ao voltar', () => {
  /* estados vistos: ['reconectando', 'restabelecida', 'online'] */
});
it('anuncia um único erro de rede por queda e nenhum durante reconectando', () => {
  const m = createConnectionMonitor(fakeClock);
  m.requestFailed(); expect(m.announceNetworkError()).toBe(true);
  m.requestFailed(); expect(m.announceNetworkError()).toBe(false);
  m.requestSucceeded(); m.requestFailed(); expect(m.announceNetworkError()).toBe(true);
});
it('ConnectionStatus mostra "Reconectando…" com status acessível', () => {
  /* monitor em reconectando; getByRole('status') contém 'Reconectando' */
});
```

- [ ] **Step 2: Run** `npx vitest run src/__tests__/connection.test.jsx` — Expected: FAIL.
- [ ] **Step 3: Implement.** Ligações do monitor:
  - **`api.js`:** resposta OK chama `connection.requestSucceeded()`; erro sem `response`, já depois dos reenvios, chama `connection.requestFailed()`.
  - **Listener de `srgop:error` no `AppContext`:** ignora o evento quando `!e.detail.status` e `!connection.announceNetworkError()`.
  - **Socket:** `connect` chama `connection.setSocketOnline(true)`; `disconnect` chama `setSocketOnline(false)`.
- [ ] **Step 4: Run** `cd frontend && npm test && npm run build` — Expected: PASS e build ok.
- [ ] **Step 5: Checkpoint.**

---

## Frente 2 — Operação e Efetivo

### Task 4: `/dashboard` com ocorrências abertas e linha do tempo (só gestão)

**Files:**
- Create: `backend/services/operationEvents.js`
- Modify: `backend/controllers/resourceController.js` (`dashboard`)
- Test: `backend/tests/operation-view.test.js`

**Interfaces:**
- Produces: `OPERATION_ACTIONS = ['Despacho','Aceite','Encerramento','Ingresso na guarnição','Saída da guarnição','Encerramento de turno','Apoio autorizado','Assumiu CPU','CPU administrado','Passagem do CPU aceita','Turno do CPU fechado']`.
- Produces: `operationEvents(since: Date, limit = 40): Promise<Array<{ at, action, actor: string|null, label: string }>>`. O `label` é o protocolo (entidade `Occurrence`) ou o nome da guarnição (entidade `Crew`), nunca o `detail` do log.
- Produces: a resposta de `/dashboard` ganha dois campos, só para Administrativo e Oficial:
  - `open: Occurrence[]` — ocorrências com status `Em aberto`, `Despachada` ou `Em atendimento`, com os campos `protocol crimeType priority status city crew latitude longitude createdAt startedAt`;
  - `events` — eventos desde o início do turno de CPU aberto, ou desde `serviceWindow().start` se não houver turno aberto.

- [ ] **Step 1: Write the failing tests**

```js
test('gestão recebe ocorrências abertas e eventos sem dados pessoais', async () => {
  const body = (await officer.agent.get('/api/dashboard')).body;
  assert.ok(body.open.some((o) => o.protocol === aberta.protocol));
  assert.ok(body.events.some((e) => e.action === 'Despacho' && e.label === aberta.protocol));
  assert.ok(!JSON.stringify(body.events).includes('Vítima Fulano'));
});
test('Praça não recebe open nem events', async () => {
  const body = (await praca.agent.get('/api/dashboard')).body;
  assert.equal(body.open, undefined); assert.equal(body.events, undefined);
});
```

- [ ] **Step 2: Run** `node --test tests/operation-view.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** `operationEvents`: consulta o `AuditLog` por `action` em `OPERATION_ACTIONS` e `createdAt ≥ since`, ordena do mais recente para o mais antigo e resolve os rótulos em lote. No `dashboard`, inclua `open` e `events` quando `req.user.role !== 'Praça'`.
- [ ] **Step 4: Run** a suíte do backend — Expected: PASS.
- [ ] **Step 5: Checkpoint.**

### Task 5: Mapa da operação no Dashboard e na página Mapa

**Files:**
- Create: `frontend/src/utils/operation.js`, `frontend/src/components/OperationLegend.jsx`
- Modify: `frontend/src/components/OperationalMap.jsx` (cor por situação; ocorrências abertas com cor por prioridade)
- Modify: `frontend/src/pages/Dashboard.jsx:286-312` (troca "Área de cobertura" por "Mapa da operação", com `data.open`)
- Modify: `frontend/src/pages/MapPage.jsx:19-20,261` (lê `/dashboard` em vez de `/crews`)
- Test: `frontend/src/__tests__/operation.test.js`

**Interfaces:**
- Produces: `ENTERING_WINDOW_MS = 15 * 60000`.
- Produces: `crewSituation(crew, now)`, que devolve `'livre'`, `'atendimento'`, `'entrando'`, `'expirado'` ou `'fora'`. As regras são testadas nesta ordem:
  1. sem integrantes, ou status `Fora de serviço` → `fora`;
  2. `shiftEnd ≤ now` → `expirado`;
  3. `status === 'Em atendimento'` → `atendimento`;
  4. `now - shiftStart < ENTERING_WINDOW_MS` → `entrando`;
  5. nos demais casos → `livre`.
- Produces: `SITUATION_STYLE: Record<situação, { label, color }>`, com os rótulos `Livre`, `Em atendimento`, `Entrando em serviço` e `Turno encerrado`.
- Produces: `operationCounters(crews, now) → { emServico, emAtendimento, livres, expirados }`. "Em serviço" conta toda guarnição cuja situação não é `fora`.
- Produces: `OperationalMap` recebe `occurrences` já filtradas e colore cada `CrewMarker` com `SITUATION_STYLE[crewSituation(c, now)].color`.
- Produces: `<OperationLegend />`, que lista as situações e as prioridades.

- [ ] **Step 1: Write the failing tests**

```js
const now = Date.parse('2026-11-18T12:00:00Z');
it.each([
  [{ members: [], status: 'Disponível' }, 'fora'],
  [{ members: ['a'], status: 'Em atendimento', shiftEnd: '2026-11-18T11:00:00Z' }, 'expirado'],
  [{ members: ['a'], status: 'Em atendimento', shiftEnd: '2026-11-19T11:00:00Z' }, 'atendimento'],
  [{ members: ['a'], status: 'Disponível', shiftStart: '2026-11-18T11:50:00Z', shiftEnd: '2026-11-19T11:00:00Z' }, 'entrando'],
  [{ members: ['a'], status: 'Disponível', shiftStart: '2026-11-18T08:00:00Z', shiftEnd: '2026-11-19T11:00:00Z' }, 'livre'],
])('situação %#', (crew, expected) => expect(crewSituation(crew, now)).toBe(expected));
it('conta em serviço, em atendimento, livres e expirados', () => {
  /* uma guarnição de cada situação → { emServico: 4, emAtendimento: 1, livres: 1, expirados: 1 } */
});
```

- [ ] **Step 2: Run** `npx vitest run src/__tests__/operation.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** os utilitários e o mapa. No Dashboard o painel passa a se chamar "Mapa da operação", e o link "Ampliar" leva a `/operacao`.
- [ ] **Step 4: Run** `npm test && npm run build` — Expected: PASS.
- [ ] **Step 5: Checkpoint.**

### Task 6: Página Operação e Efetivo

**Files:**
- Create: `frontend/src/pages/Operation.jsx`, `frontend/src/components/operation/OperationTab.jsx`, `frontend/src/components/operation/StaffTab.jsx`
- Modify: `frontend/src/App.jsx` (rota `/operacao`, só Administrativo/Oficial), `frontend/src/components/Layout.jsx` (item de menu "Operação"), `frontend/src/styles.css`
- Test: `frontend/src/__tests__/OperationPage.test.jsx`

**Interfaces:**
- Consumes: `/dashboard` (`crews`, `open`, `events`, `cpu`), `crewSituation`, `operationCounters`, `OperationalMap`, `OperationLegend`.
- Produces: a página `Operation`, com as abas `Operação` e `Efetivo`. A aba escolhida fica guardada em `localStorage` na chave `srgop-operacao-aba` (leitura e escrita em try/catch).
- Aba Operação mostra:
  - os contadores;
  - o CPU atual (`cpu.officer.name`);
  - o mapa;
  - os cartões "Em atendimento": guarnição, protocolo e tempo decorrido (`duration(startedAt, now)`);
  - a linha do tempo (`events`).
- Aba Efetivo mostra as guarnições agrupadas por `crew.city.name`. Para cada guarnição:
  - nome e situação;
  - comandante: o primeiro integrante que não é o `driver`;
  - motorista (`driver`) e motociclistas (`motorcycleSeats`).
- A aba Efetivo também lista as "Entradas recentes": os eventos `Ingresso na guarnição` do turno.

- [ ] **Step 1: Write the failing test.** Renderize com dados falsos de `/dashboard`:
  - a aba Operação mostra `Em atendimento` com o protocolo e o tempo;
  - depois de clicar em "Efetivo", aparecem o município, `Comandante`, `Motorista` e a situação `Turno encerrado` de uma guarnição expirada.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/OperationPage.test.jsx` — Expected: FAIL.
- [ ] **Step 3: Implement** a página e as abas.
- [ ] **Step 4: Run** `npm test && npm run build` — Expected: PASS.
- [ ] **Step 5: Checkpoint.**

---

## Frente 3 — Turno do CPU

### Task 7: Modelo `CpuShift`, `currentCpu()` e assumir/trocar CPU

**Files:**
- Create: `backend/models/CpuShift.js`, `backend/services/cpuShift.js`
- Modify: `backend/models/index.js`
- Modify: `backend/models/Notification.js` (kinds `turno-expirado`, `passagem-cpu`, `turno-cpu`; campo `cpuShift: ref CpuShift`)
- Modify: `backend/controllers/resourceController.js` (`cpu`, `assumeCpu`, `updateCpu`, `dashboard.cpu`)
- Modify: `backend/controllers/emergencyController.js:29,88`, `backend/services/pendingDispatch.js:7`, `backend/services/sessionPolicy.js:35-45`
- Modify: `backend/server.js` (migração: um `DailyOfficer` do dia sem `CpuShift` aberto ganha um turno aberto)
- Test: `backend/tests/cpu-shift.test.js`

**Interfaces:**
- Produces: o modelo `CpuShift`, com os campos:
  - `officer` (User, obrigatório), `day` (`YYYY-MM-DD`), `start`, `plannedEnd`, `end`;
  - `status`: `'Aberto'` ou `'Fechado'`;
  - `closeReason`: `'Automático'`, `'Passagem'` ou `'Troca administrativa'`;
  - `reportFrom: Date|null` (null = desde o início do dia, incluindo o que passou do dia anterior) e `reportUntil: Date|null`;
  - `previous` e `next` (CpuShift);
  - `transfers`: lista de `{ to: User, reason (≤300), requestedAt, status, decidedAt }`, com `status` `'Pendente'`, `'Aceita'`, `'Recusada'` ou `'Cancelada'`.
- O modelo tem um índice único parcial `{ status: 1 }` com `partialFilterExpression: { status: 'Aberto' }`, que garante um só turno aberto.
- Produces (`cpuShift.js`):
  - `currentCpu(session = null): Promise<CpuShiftDoc|null>` — o turno `Aberto`, com `officer` populado com `name callSign rank phone`.
  - `cpuView(shift, pending = null): object|null` — devolve `{ _id, day, officer, assumedAt: start, plannedEnd, status, transfer, pending }`. `transfer` é a última transferência `Pendente`, ou null. O formato mantém compatível o uso atual de `data.cpu.officer.name` e `assumedAt`.
  - `openCpuShift(officerId, { session, at = new Date(), reportFrom = null, previous = null }): Promise<CpuShiftDoc>` — usa `serviceWindow(at)` para definir `day` e `plannedEnd`, e faz upsert do `DailyOfficer` do dia.
  - `closeCpuShift(shift, { reason, session, at = new Date() }): Promise<CpuShiftDoc>`. Ao fechar:
    - grava `status 'Fechado'`, `end` e `closeReason`;
    - grava `reportUntil`: `null` quando o motivo é `Automático`, senão `at`;
    - cria uma `Notification` kind `turno-cpu`, com `cpuShift`, para o oficial: título `Turno do CPU encerrado`, mensagem `Gere o relatório sintético e analítico do turno de <dia>.`;
    - registra a auditoria `Turno do CPU fechado`.
  - `shiftPending(shift): Promise<{ attending: Array<{ protocol, crew }>, onDuty: Array<{ crew, members: number }> }>`:
    - `attending`: ocorrências com `dutyDay === shift.day` e status `Em atendimento`;
    - `onDuty`: `CrewShift` com `dutyDay === shift.day` e `end` nulo.
- Comportamento das rotas:
  - `GET /cpu` e `GET /service-cpu` devolvem `cpuView(await currentCpu(), pending)`. Só `/cpu` traz `pending`.
  - `POST /cpu` (Oficial): se já houver turno aberto, responde 409 com a mensagem `O turno do CPU anterior ainda não fechou: <n> atendimento(s) e <m> guarnição(ões) em serviço.`. Senão abre o turno e devolve 201 com `handover`, como hoje.
  - `PUT /cpu` (Administrativo) é uma passagem forçada. Na mesma transação, fecha o turno aberto com `Troca administrativa` e abre outro para o novo oficial com `reportFrom = agora`.
  - `sessionPolicy`: o oficial com turno aberto conta como "em serviço", com `dutyEndsAt = max(plannedEnd, agora + 1 h)`.

- [ ] **Step 1: Write the failing tests**

```js
test('oficial assume e GET /cpu traz o turno aberto', async () => {
  /* 201; body.officer.name; status 'Aberto' */
});
test('dois oficiais assumem ao mesmo tempo: só um turno aberto', async () => {
  const [a, b] = await Promise.all([post(o1.agent, '/cpu'), post(o2.agent, '/cpu')]);
  assert.deepEqual([a.status, b.status].sort(), [201, 409]);
  assert.equal(await CpuShift.countDocuments({ status: 'Aberto' }), 1);
});
test('com turno anterior aberto o próximo oficial recebe 409 com o motivo', async () => {
  /* turno de ontem aberto + ocorrência com dutyDay de ontem Em atendimento */
  const r = await post(next.agent, '/cpu');
  assert.equal(r.status, 409); assert.match(r.body.message, /1 atendimento/);
});
test('troca pelo Administrativo fecha o anterior e abre outro', async () => {
  /* closeReason 'Troca administrativa'; reportUntil definido; novo turno aberto */
});
test('ocorrência nova notifica o CPU do turno aberto mesmo depois das 08h', async () => {
  /* turno aberto de ontem; POST /occurrences; Notification kind pendente para o oficial de ontem */
});
```

- [ ] **Step 2: Run** `node --test tests/cpu-shift.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** o modelo e o serviço. Troque toda consulta `DailyOfficer.findOne({ day: serviceWindow().day })` ou `exists` por `currentCpu()`. A exceção é `services/handover.js`, que lê o snapshot do dia. Para conferir, rode `grep -rn "DailyOfficer" backend --include=*.js | grep -v tests`: só podem sobrar o modelo, o upsert em `openCpuShift` e `handover.js`.
- [ ] **Step 4: Run** a suíte do backend — Expected: PASS. Em `cpu-handover.test.js`, ajuste só os pontos que criam `DailyOfficer` direto, para criarem também o `CpuShift`.
- [ ] **Step 5: Checkpoint.**

### Task 8: `dutyDay` das ocorrências e virada das 08h

**Files:**
- Modify: `backend/models/Occurrence.js` (`dutyDay: { type: String, index: true }`)
- Modify: `backend/controllers/occurrenceController.js:153` e os demais pontos que criam ocorrências (`grep -rn "Occurrence.create" backend`), para gravar o campo no registro
- Modify: `backend/services/cpuShift.js`
- Modify: `backend/server.js` (preencher `dutyDay` faltante na subida)
- Test: `backend/tests/cpu-shift.test.js`

**Interfaces:**
- Produces: `backfillDutyDay(): Promise<number>`, que preenche as ocorrências sem `dutyDay` com `updateMany({ dutyDay: { $exists: false } }, [{ $set: { dutyDay: { $dateToString: { format: '%Y-%m-%d', date: { $subtract: ['$createdAt', 8 * 3600000] }, timezone: 'America/Fortaleza' } } } }])`.
- Produces: `rollOverPending(now = new Date()): Promise<number>` — `updateMany({ dutyDay: { $lt: serviceWindow(now).day }, status: { $in: ['Em aberto', 'Despachada'] }, deleted: false }, { dutyDay: serviceWindow(now).day })`.
- Regra: no registro, `dutyDay = serviceWindow(new Date()).day`.

- [ ] **Step 1: Write the failing tests**

```js
test('registro grava o dia de serviço', async () => {
  /* POST /occurrences; dutyDay === serviceWindow().day */
});
test('às 08h só as não aceitas passam para o dia seguinte e a virada é idempotente', async () => {
  /* aberta, despachada e em atendimento, todas com dutyDay de ontem */
  assert.equal(await rollOverPending(), 2);
  assert.equal(await rollOverPending(), 0);
  assert.equal((await Occurrence.findById(emAtendimento._id)).dutyDay, ontem);
});
test('backfill calcula o dia pelas 08h de Fortaleza', async () => {
  /* createdAt 2026-11-18T10:59:00Z (07:59 local) → '2026-11-17'; 11:00Z → '2026-11-18' */
});
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** a suíte do backend — Expected: PASS.
- [ ] **Step 5: Checkpoint.**

### Task 9: Expiração às 08h sem encerrar atendimento (viaturas e motocicletas)

**Files:**
- Modify: `backend/services/operations.js`:
  - `joinCrew` (`:402-424`): motocicleta também recebe `shiftEnd = duty.end` e `dutyDay`;
  - `expireShifts` (`:617`);
  - `alignActiveShifts` (`:631`): remover a exceção de motocicleta;
  - `closeOccurrence` (`:208`): depois da transação, tirar de serviço as guarnições liberadas cujo turno venceu.
- Modify: `backend/models/CrewShift.js` (`expiryNoticeAt: Date`, `overtimeAlertAt: Date`)
- Test: `backend/tests/shift-expiry.test.js`

**Interfaces:**
- Produces: `expireShifts(now = new Date())`. Percorre as guarnições com `shiftEnd ≤ now` (qualquer `shiftMode`) que ainda têm integrantes ou status ativo:
  - **Atendimento aceito em andamento** (`currentOccurrence` com status `Em atendimento`): não encerra o turno. Se `CrewShift.expiryNoticeAt` estiver vazio, notifica os integrantes e grava `expiryNoticeAt`. A notificação é kind `turno-expirado`, título `Turno encerrado`, com a mensagem exata da Global Constraints.
  - **Demais casos:** chama `endShift(id, null)`, que já devolve à fila um despacho que não foi aceito.
- Produces: `closeOccurrence` chama `endShift(crewId, null, 'Saída após atendimento com turno encerrado')` para a guarnição principal e para as de apoio cujo `shiftEnd ≤ agora`. Um 409 é ignorado; outros erros vão para `console.error`.
- Produces: GPS durante o atendimento além do turno. Em `backend/controllers/gpsController.js`, as duas consultas (`refreshOwnPosition` e o caminho com transação) aceitam a guarnição quando `activeDuty()` vale **ou** quando ela tem integrantes e `currentOccurrence` aponta para ocorrência `Em atendimento`. Crie em `backend/utils/duty.js` `gpsAllowed(): object` (filtro Mongo `$or` dessas duas condições) e use-o nas duas consultas.

- [ ] **Step 1: Write the failing tests**

```js
test('guarnição em atendimento às 08h continua, recebe aviso uma vez e não recebe despacho', async () => {
  /* crew com shiftEnd no passado e ocorrência Em atendimento aceita */
  await expireShifts(); await expireShifts();
  assert.equal((await Occurrence.findById(occ._id)).status, 'Em atendimento');
  assert.equal(await Notification.countDocuments({ kind: 'turno-expirado', user: cmd.user._id }), 1);
  assert.equal((await post(cpu.agent, '/dispatches', { occurrence: outra._id, crew: crew._id })).status, 409);
});
test('quem aceitou encerra depois das 08h e a guarnição sai de serviço', async () => {
  assert.equal((await post(cmd.agent, `/attendances/${occ._id}/close`, closeBody)).status, 200);
  const row = await Crew.findById(crew._id);
  assert.equal(row.status, 'Fora de serviço'); assert.equal(row.members.length, 0);
});
test('despacho sem aceite de guarnição vencida volta para a fila', async () => {
  /* status Em aberto, crew vazio */
});
test('guarnição em atendimento além do turno continua enviando GPS; sem atendimento, não', async () => {
  /* shiftEnd no passado + ocorrência Em atendimento → PATCH /crews/:id/gps 200
     depois do encerramento (fora de serviço) → 403 */
});
test('motocicleta recebe fim às 08h e expira como viatura', async () => {
  /* joinCrew de moto → shiftEnd === serviceWindow().end */
});
```

(Use as rotas reais de despacho e encerramento conforme `routes/index.js`.)

- [ ] **Step 2: Run** `node --test tests/shift-expiry.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement.** O frontend não muda nesta task.
- [ ] **Step 4: Run** a suíte do backend — Expected: PASS. Testes antigos que esperavam motocicleta sem fim de turno devem ser ajustados para a regra nova do spec.
- [ ] **Step 5: Checkpoint.**

### Task 10: Varredura: alerta de 30 min e fechamento automático

**Files:**
- Modify: `backend/services/cpuShift.js`
- Modify: `backend/server.js` (o intervalo de 30 s e a virada chamam `sweepCpuShift()` depois de `expireShifts()`)
- Test: `backend/tests/cpu-shift.test.js`

**Interfaces:**
- Produces: `OVERTIME_ALERT_MS = 30 * 60000`.
- Produces: `sweepCpuShift(now = new Date()): Promise<{ rolled, alerted, closed }>`, que faz, nesta ordem:
  1. chama `rollOverPending(now)`;
  2. alerta o oficial de `currentCpu()` sobre cada guarnição em atendimento com `shiftEnd ≤ now - OVERTIME_ALERT_MS` e `overtimeAlertAt` vazio. A notificação é kind `turno-expirado`, título `Guarnição além do turno`, mensagem `<guarnição> segue em atendimento 30 min após o fim do turno.`;
  3. se `now ≥ plannedEnd` do turno aberto e `shiftPending` vier vazio, chama `closeCpuShift(shift, { reason: 'Automático' })` e `serviceChanged()`.

- [ ] **Step 1: Write the failing tests**

```js
test('antes das 08h o turno não fecha mesmo sem pendências', async () => {
  /* plannedEnd futuro → closed false */
});
test('depois das 08h fecha só quando não há atendimento nem guarnição do dia em serviço', async () => {
  /* plannedEnd passado e 1 CrewShift do dia aberto → closed false */
  /* encerra o CrewShift → closed true e Notification turno-cpu com cpuShift */
});
test('alerta de 30 min é enviado uma vez por guarnição', async () => {
  /* duas varreduras → 1 notificação */
});
test('varredura repetida após reinício não duplica nada', async () => {
  /* sweep 2x → a segunda retorna { rolled: 0, alerted: 0, closed: false } */
});
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** a suíte do backend — Expected: PASS.
- [ ] **Step 5: Checkpoint.**

### Task 11: Passagem de serviço com aceite

**Files:**
- Create: `backend/services/cpuTransfer.js`
- Modify: `backend/routes/index.js` (rotas abaixo)
- Modify: `backend/middlewares/validation.js` (`cpuTransfer: { to: id, reason?: string ≤300 }`, `cpuTransferAnswer: { accept: boolean }`)
- Test: `backend/tests/cpu-transfer.test.js`

**Interfaces:**
- Produces: `requestTransfer(actor, { to, reason }): Promise<CpuShiftDoc>`:
  - o ator precisa ser o oficial do turno aberto;
  - `to` precisa ser um Oficial ativo, diferente do ator;
  - responde 409 se já houver transferência `Pendente`;
  - notifica `to` com kind `passagem-cpu`, título `Passagem do CPU`, mensagem `<remetente> quer passar o CPU para você.`.
- Produces: `answerTransfer(actor, accept): Promise<CpuShiftDoc>`. O ator precisa ser o `to` da transferência pendente.
  - **Aceite**, numa única transação:
    1. marca a transferência como `Aceita`;
    2. chama `closeCpuShift(atual, { reason: 'Passagem' })`;
    3. chama `openCpuShift(actor._id, { reportFrom: agora, previous: atual._id })` e liga o `next` do turno anterior;
    4. registra a auditoria `Passagem do CPU aceita`;
    5. notifica o remetente.
  - **Recusa:** marca `Recusada` e notifica o remetente: `<destinatário> recusou a passagem do CPU.`.
- Produces: `cancelTransfer(actor): Promise<CpuShiftDoc>` — só o remetente cancela; a transferência passa a `Cancelada`.
- Rotas, todas para Oficial: `POST /cpu/transfer`, `POST /cpu/transfer/answer` e `DELETE /cpu/transfer`.

- [ ] **Step 1: Write the failing tests**

```js
test('aceite fecha o turno do remetente e abre o do destinatário', async () => {
  await post(a.agent, '/cpu/transfer', { to: b.user._id, reason: 'Consulta médica' });
  assert.equal((await post(b.agent, '/cpu/transfer/answer', { accept: true })).status, 200);
  const [old, cur] = await Promise.all([CpuShift.findById(shiftA), currentCpu()]);
  assert.equal(old.closeReason, 'Passagem'); assert.ok(old.reportUntil);
  assert.equal(String(cur.officer._id), String(b.user._id));
  assert.deepEqual(cur.reportFrom, old.reportUntil);
});
test('recusa mantém tudo e avisa o remetente', async () => {
  /* turno de A segue aberto; Notification passagem-cpu para A com 'recusou' */
});
test('só uma pendente; só o destinatário responde; só o remetente cancela', async () => {
  /* 409, 403, 403 */
});
test('aceites simultâneos de duas abas: um 200 e um 409', async () => {
  /* Promise.all de dois POST /cpu/transfer/answer; status ordenados [200, 409]; um turno aberto */
});
```

- [ ] **Step 2: Run** `node --test tests/cpu-transfer.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** a suíte do backend — Expected: PASS.
- [ ] **Step 5: Checkpoint.**

### Task 12: Relatórios sintético e analítico do turno

**Files:**
- Create: `backend/services/cpuShiftReport.js`, `backend/controllers/cpuShiftController.js`
- Modify: `backend/routes/index.js` (`GET /reports/cpu-shifts`, `GET /reports/cpu-shifts/:id` e `GET /reports/duty-days/:day`, todas com `management`; as duas últimas aceitam `?format=csv`)
- Test: `backend/tests/cpu-shift-report.test.js`

**Interfaces:**
- Produces: `shiftOccurrenceFilter(shift)` → `{ deleted: false, dutyDay: shift.day, createdAt: { ...(shift.reportFrom ? { $gte: shift.reportFrom } : {}), ...(shift.reportUntil ? { $lt: shift.reportUntil } : {}) } }`. A chave `createdAt` é omitida quando fica vazia.
- Produces: `buildShiftReport({ day, shift = null }): Promise<Report>`, no formato:

```
Report = {
  header: { day, officer: name|null, start, end|null, closeReason|null },
  synthetic: {
    occurrences: { registered, attended, inProgress, waiting, cancelled, averageMinutes|null },
    staff: { officers, crews },
    results: { policeStation, detained, recoveredVehicles, weapons, approaches, seizures: { [kind]: count } },
    byCity: { [nome]: n }, byCrimeType: { [tipo]: n }
  },
  analytic: {
    occurrences: [{ protocol, registeredAt, city, crimeType, status, crew, responseMinutes|null, durationMinutes|null, detained, policeStation, seizures: string }],
    crews: [{ name, city, start, end|null, members: string[], attendances }],
    transfers: [{ at, from, to, status, reason }],
    events: [{ at, kind: 'Urgência'|'Apoio', label }]
  }
}
```

- Como cada campo é calculado:
  - `responseMinutes` = `startedAt - createdAt`;
  - `durationMinutes` = `durationSeconds / 60`;
  - `crews`, com turno: os `CrewShift` com `dutyDay === day` que se sobrepõem ao intervalo `[início, shift.end ?? agora]`. O início é `shift.start`, ou o início do dia quando `reportFrom` é nulo;
  - `crews`, sem turno: todos os `CrewShift` do dia.
- O relatório não traz endereço, envolvidos nem resumo em parte alguma.
- Produces: `analyticCsv(report): string`, com BOM, `;` como separador e cabeçalhos em português, na mesma convenção de `utils/occurrenceCsv.js`.
- `GET /reports/cpu-shifts?from=YYYY-MM-DD&to=YYYY-MM-DD` devolve `[{ _id, day, officer: name, start, end, status, closeReason }]`, no máximo 200, do mais recente para o mais antigo.

- [ ] **Step 1: Write the failing tests**

```js
test('turno conta só as ocorrências do seu dia e janela', async () => {
  /* Dia D, com passagem de A para B no meio do dia:
     - 1 registrada antes da passagem → turno A
     - 1 que passou do dia anterior → turno A
     - 1 registrada depois da passagem → turno B
     - 1 registrada após as 08h, com dutyDay D+1 → nenhum dos dois */
  const ra = await buildShiftReport({ day: D, shift: A });
  assert.equal(ra.synthetic.occurrences.registered, 2);
  assert.equal((await buildShiftReport({ day: D, shift: B })).synthetic.occurrences.registered, 1);
});
test('resultados somam delegacia, detidos, veículos, armas e apreensões por tipo', async () => {
  /* 2 encerradas com valores conhecidos → somas exatas; seizures { Droga: 2, Arma: 1 } */
});
test('analítico não traz dados pessoais', async () => {
  const text = JSON.stringify(await buildShiftReport({ day: D, shift: A }));
  for (const t of ['Rua Reservada, 99', 'Vítima Fulano de Tal']) assert.ok(!text.includes(t));
});
test('dia sem CPU tem relatório por data; CSV baixa com cabeçalho', async () => {
  const r = await officer.agent.get(`/api/reports/duty-days/${D}?format=csv`);
  assert.equal(r.status, 200); assert.match(r.text, /Protocolo;/);
});
test('Praça não acessa relatórios de turno', async () => {
  /* 403 nas três rotas */
});
```

- [ ] **Step 2: Run** `node --test tests/cpu-shift-report.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** a suíte do backend — Expected: PASS.
- [ ] **Step 5: Checkpoint.**

### Task 13: Telas do turno do CPU (cartão, passagem, fechamento, aviso à guarnição)

**Files:**
- Create: `frontend/src/components/cpu/CpuTransferDialog.jsx` (enviar), `frontend/src/components/cpu/CpuTransferPrompt.jsx` (aceitar/recusar), `frontend/src/components/cpu/CpuShiftClosed.jsx` (tela ao fechar), `frontend/src/components/ShiftExpiredBanner.jsx`
- Modify: `frontend/src/pages/Dashboard.jsx:188-218`. O cartão do CPU passa a mostrar:
  - o estado do turno e as pendências depois das 08h (`cpu.pending`);
  - o botão "Passar serviço", só para o CPU atual;
  - a transferência pendente, com "Cancelar".
- Modify: `frontend/src/components/Layout.jsx` (monta `CpuTransferPrompt` e `CpuShiftClosed` para Oficial)
- Modify: `frontend/src/pages/Attendance.jsx` e `frontend/src/pages/FieldDashboard.jsx` (banner)
- Modify: `frontend/src/context/AppContext.jsx` (os kinds novos chamam `setNotificationRevision` e mostram o toast)
- Test: `frontend/src/__tests__/cpuShift.test.jsx`

**Interfaces:**
- Consumes: `GET /cpu` (`cpuView`), `POST /cpu/transfer`, `POST /cpu/transfer/answer`, `DELETE /cpu/transfer`, `/notifications` e `PATCH /notifications/:id` (marcar como lida, rota existente de `markNotification`).
- Produces: `CpuShiftClosed`, que fica visível enquanto houver notificação **não lida** kind `turno-cpu`:
  - `Relatório sintético` leva a `/relatorios/turno-cpu/:cpuShift?modo=sintetico`;
  - `Relatório analítico` leva a `/relatorios/turno-cpu/:cpuShift?modo=analitico`;
  - `Depois` marca a notificação como lida; o relatório continua disponível em Relatórios.
- Produces: `CpuTransferPrompt`, que aparece quando `cpu.transfer?.to === user._id`.
- Produces: `ShiftExpiredBanner`, que mostra o texto exato da Global Constraints quando a guarnição do usuário tem `shiftEnd ≤ now` e ainda está em atendimento.

- [ ] **Step 1: Write the failing tests**

```js
it('mostra a tela de fechamento a partir de notificação não lida, também após recarregar', async () => {
  /* mock de /notifications com { kind: 'turno-cpu', read: false, cpuShift: 's1' }
     render do Layout → link 'Relatório sintético' com href /relatorios/turno-cpu/s1?modo=sintetico */
});
it('destinatário vê aceitar/recusar e envia a resposta', async () => {
  /* clicar em Aceitar → POST /cpu/transfer/answer { accept: true } */
});
it('banner de turno encerrado para guarnição em atendimento além do horário', () => {
  /* shiftEnd no passado e status Em atendimento → texto exato visível */
});
```

- [ ] **Step 2: Run** `npx vitest run src/__tests__/cpuShift.test.jsx` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run build` — Expected: PASS.
- [ ] **Step 5: Checkpoint.**

### Task 14: Página do relatório do turno e lista em Relatórios

**Files:**
- Create: `frontend/src/pages/CpuShiftReport.jsx`
- Modify: `frontend/src/App.jsx` (rotas `/relatorios/turno-cpu/:id` e `/relatorios/dia/:day`, só gestão)
- Modify: `frontend/src/pages/Reports.jsx`: novo painel "Turnos do CPU", com a lista de `/reports/cpu-shifts` no período do filtro e "Relatório do dia" por data
- Modify: `frontend/src/styles.css` (`@media print` esconde menu e botões)
- Test: `frontend/src/__tests__/CpuShiftReport.test.jsx`

**Interfaces:**
- Consumes: `GET /reports/cpu-shifts/:id`, `GET /reports/duty-days/:day` e `downloadFile(path, name)` de `api.js` para o CSV (`srgop-turno-<dia>.csv`).
- Produces: a página `CpuShiftReport`, com as abas `Sintético` e `Analítico` (a aba inicial vem da query `modo`), o botão `Imprimir / PDF` (`window.print()`) e, no analítico, `Baixar CSV`.

- [ ] **Step 1: Write the failing test.** Com um relatório falso:
  - `?modo=analitico` abre a tabela com o protocolo;
  - o sintético mostra `Conduções à delegacia` com o valor;
  - "Baixar CSV" chama `downloadFile('/reports/cpu-shifts/s1?format=csv', 'srgop-turno-2026-11-18.csv')`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run build` — Expected: PASS.
- [ ] **Step 5: Checkpoint.**

---

## Frente 4 — Simulador

### Task 15: CPU espera o fechamento automático; o próximo espera para assumir

**Files:**
- Modify: `simulacao/src/actors/cpu.js` (`enter`, `beginLeave`, `step`, `reportShift`, `leave`)
- Modify: `simulacao/src/domain/shift-report.js`
- Modify: `simulacao/src/engine/simulation.js:82-84` (`rotate`: a saída do CPU deixa de ter hora marcada)
- Test: `simulacao/test/cpu-shift-close.test.js` e ajuste de `simulacao/test/cpu-shift-report.test.js`

**Interfaces:**
- Produces: a fase `aguardando-fechamento` no `CpuActor`:
  - o CPU continua com `routine` e com as tarefas, ou seja, segue despachando;
  - a cada `CLOSE_POLL_MS = minutes(1)` faz `GET /cpu`;
  - se `/cpu` vier `null`, ou com um `_id` diferente do `this.shiftId` gravado no `enter`, chama `reportShift(now)` e depois `leave`;
  - se passar de `CLOSE_WAIT_MAX_MS = minutes(120)`, registra um evento `severity: 'alto', category: 'cpu-fechamento'` com as pendências de `cpu.pending` e sai.
- Produces: o novo `enter`:
  - faz `POST /cpu` com `tolerate: [409]`;
  - num 409, registra o evento `baixo` "Aguardando fechamento do turno anterior" e tenta de novo em 2 min, sem virar apoio;
  - só segue como apoio se o CPU atual for de **hoje** (`current.day === serviceDay(now)`).
- Produces: o novo `reportShift`, que lê `GET /reports/cpu-shifts/${this.shiftId}` e grava `turno-<dia>.json` e `turno-<dia>.html`.
- Produces: `summarizeCpuShift(report): Summary` em `shift-report.js`. Converte `synthetic` para o formato atual de `summarizeShift`, com as mesmas chaves (`occurrences`, `staff.total`, `results`, `byCity`, `byCrimeType`), para que `renderShiftReport` e `shiftHeadline` continuem iguais.

- [ ] **Step 1: Write the failing tests**, com uma API falsa:
  1. às 08h o CPU continua despachando e não faz logout; quando `/cpu` passa a retornar outro turno, ele grava o relatório e sai;
  2. o oficial do dia seguinte recebe 409 e não registra "seguindo como apoio"; tenta de novo 2 min depois e assume;
  3. `summarizeCpuShift` converte `synthetic`, com asserções sobre `occurrences.attended`, `staff.total` e `results.policeStation`.
- [ ] **Step 2: Run** `cd simulacao && node --test test/cpu-shift-close.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `cd simulacao && npm test` — Expected: PASS.

### Task 16: Guarnição que atravessa as 08h agiliza e sai

**Files:**
- Modify: `simulacao/src/actors/crew.js` (tratar a notificação `turno-expirado`)
- Modify: `simulacao/src/report/labels.js` e `simulacao/src/panel/live.js` (rótulo `turno.expirado`)
- Test: `simulacao/test/crew-expired.test.js`

**Interfaces:**
- Produces: ao receber a notificação kind `turno-expirado`, a equipe registra o fluxo `turno.expirado` e reduz `attendance.dueAt` para no máximo `now + minutes(between(1, 3))`. Depois do encerramento, `leaveStep` segue como hoje, porque o servidor já tirou a guarnição de serviço.

- [ ] **Step 1: Write the failing test.** Uma equipe com atendimento de `dueAt` em +4 min recebe a notificação. Depois disso, `dueAt ≤ now + 3 min`, e o fluxo `turno.expirado` aparece registrado uma única vez.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `cd simulacao && npm test` — Expected: PASS.

---

## Fechamento

- [ ] Rodar as três suítes e `cd frontend && npm run build`, e colar a saída no relatório ao usuário.
- [ ] Revisar todo o diff com um agente revisor, com atenção ao Review Focus.
- [ ] Relatório ao usuário:
  - o que mudou;
  - as decisões do implementador marcadas no spec;
  - a recomendação sobre o plano de hospedagem (Render/Atlas);
  - o aviso de que o backend precisa ser publicado antes do simulador, por causa das rotas novas.
