# SRGOP — Sistema de Recebimento e Gerenciamento de Ocorrências Policiais

Aplicação web para organização do serviço operacional do **18º BPM da Polícia Militar do Maranhão**, com frontend React e API Node.js/Express, persistência MongoDB e comunicação Socket.IO.

Interface em português do Brasil, tema institucional, modos claro e escuro e navegação adaptada a Administrativo, Oficial e Praça. O sistema inclui uma base demonstrativa de **14 municípios configuráveis**. Essa base **não afirma a circunscrição oficial do batalhão**: confira os municípios e as coordenadas em **Administrativo → Municípios atendidos** antes de utilizar dados reais.

## Funcionalidades

- Login, solicitação de cadastro, aprovação administrativa, JWT em cookie HttpOnly, expiração, logout manual e por inatividade.
- Dashboard com indicadores calculados no banco, CPU único por dia, operações programadas, ocorrências recentes, mapa e guarnições em serviço.
- Ocorrências com protocolo automático, filtros, histórico de alterações, anexos PDF/JPEG/PNG autenticados e impressão.
- Despacho e reencaminhamento para guarnições ativas e disponíveis; notificação persistida e aviso Socket.IO aos integrantes.
- Aceite exclusivo sob concorrência, rejeição motivada, observações, cronômetro, pedido de apoio, autorização e encerramento com resumo e resultados.
- Guarnições, motorista único, associação de viatura e turnos de 24 horas, com encerramento automático e antecipado autorizado.
- Viaturas, quilometragem, manutenção, motorista, associação de guarnição e atualização de coordenadas por API/interface.
- Mapa React Leaflet com ocorrências, cidades, viaturas, prioridades e filtros.
- Relatórios por período, município, crime, prioridade, situação, guarnição e viatura; tempo médio, resultados, usuários ativos, turnos e manutenção.
- Exportação CSV compatível com Excel e PDF pelo comando **Imprimir → Salvar como PDF** do navegador.
- Gestão de usuários, cidades, tipos de crime, parâmetros, módulos do Dashboard e auditoria.
- Layout responsivo com drawer móvel, formulários acessíveis, foco visível e tabelas com rolagem horizontal.

## Tecnologias e organização

**Frontend:** React, Vite, JavaScript, HTML, CSS puro, React Router DOM, Axios, React Leaflet, Leaflet, Lucide e Socket.IO Client.

**Backend:** Node.js, Express, JavaScript ESM, MongoDB, Mongoose, JWT, bcryptjs, dotenv, cors, Socket.IO, Zod, Helmet, Multer e express-rate-limit.

**Testes:** `node:test`, Supertest e MongoDB temporário em replica set (`mongodb-memory-server`). Os testes exercitam um MongoDB real temporário, sem mocks de persistência.

O repositório atual já é a raiz do projeto; não é necessário criar uma segunda pasta `srgop` dentro dele.

```text
srgop/
├── frontend/
│   ├── public/favicon.svg
│   ├── src/
│   │   ├── assets/logo.svg
│   │   ├── components/
│   │   │   ├── CrewCommunication.jsx
│   │   │   ├── CrewManagement.jsx
│   │   │   ├── ErrorBoundary.jsx
│   │   │   ├── Layout.jsx
│   │   │   ├── OccurrenceDetail.jsx
│   │   │   ├── OccurrenceFilters.jsx
│   │   │   ├── OperationalMap.jsx
│   │   │   └── UI.jsx
│   │   ├── context/AppContext.jsx
│   │   ├── hooks/useData.js
│   │   ├── pages/
│   │   │   ├── Administration.jsx
│   │   │   ├── Attendance.jsx
│   │   │   ├── Crews.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Dispatches.jsx
│   │   │   ├── FieldDashboard.jsx
│   │   │   ├── Login.jsx
│   │   │   ├── MapPage.jsx
│   │   │   ├── Occurrences.jsx
│   │   │   ├── Reports.jsx
│   │   │   ├── Resources.jsx
│   │   │   └── Settings.jsx
│   │   ├── services/api.js
│   │   ├── utils/format.js
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── styles.css
│   ├── .env.example
│   ├── index.html
│   ├── package.json
│   ├── package-lock.json
│   ├── vercel.json
│   └── vite.config.js
├── backend/
│   ├── config/database.js
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── occurrenceController.js
│   │   ├── reportController.js
│   │   └── resourceController.js
│   ├── middlewares/
│   │   ├── auth.js
│   │   ├── errors.js
│   │   └── validation.js
│   ├── models/
│   │   ├── Attachment.js
│   │   ├── Attendance.js
│   │   ├── AuditLog.js
│   │   ├── City.js
│   │   ├── Crew.js
│   │   ├── CrewMessage.js
│   │   ├── CrewShift.js
│   │   ├── DailyOfficer.js
│   │   ├── Dispatch.js
│   │   ├── Notification.js
│   │   ├── Occurrence.js
│   │   ├── Session.js
│   │   ├── SupportRequest.js
│   │   ├── SystemSetting.js
│   │   ├── User.js
│   │   ├── Vehicle.js
│   │   └── index.js
│   ├── routes/index.js
│   ├── scripts/demo.js
│   ├── services/
│   │   ├── audit.js
│   │   ├── crewManagement.js
│   │   ├── operations.js
│   │   └── realtime.js
│   ├── tests/workflows.test.js
│   ├── utils/
│   │   ├── constants.js
│   │   ├── errors.js
│   │   └── time.js
│   ├── .env.example
│   ├── app.js
│   ├── package.json
│   ├── package-lock.json
│   ├── seed.js
│   └── server.js
├── .prettierrc.json
├── .prettierignore
├── package-lock.json
├── .gitignore
├── compose.yaml
├── package.json
├── render.yaml
└── README.md
```

Arquivos `node_modules`, `dist` e `.env` são gerados localmente e não integram o código-fonte versionado.

## Pré-requisitos

- Node.js **22.12 ou superior**; validado com Node 24.
- npm e terminal PowerShell, Bash ou equivalente.
- MongoDB em **replica set**, local ou Atlas. As transações dos fluxos operacionais exigem replica set; MongoDB standalone não serve para esses fluxos.
- Docker Desktop é opcional, mas facilita o MongoDB local.
- Acesso à internet na instalação de pacotes, no primeiro download do MongoDB de testes e para carregar os tiles do mapa e a fonte Inter. A fonte possui fallback local.

## Início rápido: demonstração local

Esse modo inicia um MongoDB temporário automaticamente, popula dados fictícios e usa uma chave JWT aleatória. **Os dados da demonstração são apagados ao encerrar o processo. Não use este modo em produção.**

Na raiz:

```bash
npm run install:all
```

Terminal 1:

```bash
npm run dev:demo --prefix backend
```

Terminal 2:

```bash
npm run dev --prefix frontend
```

Acesse **http://localhost:5173**. A API roda em **http://localhost:5000/api**.

| Perfil de demonstração | E-mail | Senha padrão apenas do modo temporário |
|---|---|---|
| Administrativo | `admin@srgop.local` | `DemoSRGOP!2026` |
| Oficial | `oficial@srgop.local` | `DemoSRGOP!2026` |
| Praça | `praca@srgop.local` | `DemoSRGOP!2026` |

No modo normal, a senha inicial vem de `SEED_PASSWORD`, não dessa tabela. Use perfis de navegador separados, janelas anônimas ou navegadores distintos para testar usuários simultâneos: abas do mesmo perfil compartilham o cookie de sessão.

## Instalação local com banco persistente

### 1. Configurar MongoDB

Na raiz do projeto:

```bash
docker compose up -d
docker compose ps
```

O `compose.yaml` inicia MongoDB 8 em `127.0.0.1:27017`, replica set `rs0`, com volume persistente `srgop_mongo`. O healthcheck inicializa o replica set. Aguarde o estado `healthy`.

URI usada pela API executada no computador host:

```dotenv
MONGO_URI=mongodb://127.0.0.1:27017/srgop?replicaSet=rs0
```

O MongoDB local está limitado à interface de loopback e não tem autenticação no Compose de desenvolvimento. Não exponha esse Compose diretamente em um servidor público.

Alternativa sem Docker: instale MongoDB Community, inicie `mongod --replSet rs0 --bind_ip 127.0.0.1 --dbpath CAMINHO_DO_BANCO` e execute `rs.initiate()` pelo `mongosh`. Depois utilize a mesma URI. O diretório do banco precisa existir.

Alternativa Atlas: crie cluster, usuário de banco com acesso somente à base SRGOP e configuração de rede apropriada. Substitua `MONGO_URI` pela string `mongodb+srv://.../srgop`. Use percent-encoding para caracteres especiais da senha na URI. O Atlas já fornece replica set.

### 2. Instalar o backend

```bash
cd backend
npm ci
```

Copie `.env.example` para `.env`:

```powershell
Copy-Item .env.example .env
```

Em Bash: `cp .env.example .env`.

Configure `backend/.env`:

```dotenv
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/srgop?replicaSet=rs0
JWT_SECRET=SUBSTITUA_POR_UMA_CHAVE_ALEATORIA_DE_PELO_MENOS_32_CARACTERES
CLIENT_URL=http://localhost:5173
NODE_ENV=development
COOKIE_SAME_SITE=lax
SEED_PASSWORD=SUBSTITUA_POR_UMA_SENHA_FORTE_DE_PELO_MENOS_10_CARACTERES
```

Gere uma chave JWT:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Copie o resultado para `JWT_SECRET`. Não publique `.env`, senhas ou chaves. O servidor recusa a chave de exemplo e chaves com menos de 32 caracteres.

### 3. Criar dados de exemplo

Dentro de `backend`:

```bash
npm run seed
```

O seed é incremental: não apaga o banco, não redefine senhas de contas já existentes e não altera registros existentes. Cria 14 cidades, três usuários, cinco viaturas, quatro guarnições e oito ocorrências fictícias. As guarnições começam fora de serviço para permitir testar o ingresso. `SEED_PASSWORD` é obrigatória no modo persistente.

Execute o seed **antes da primeira inicialização da API** para também criar a operação demonstrativa do dia. Se configurações já existirem, cadastre a operação em Configurações. Depois de testar, remova os dados demonstrativos em uma base separada antes de carregar dados institucionais; nunca misture seed com dados reais.

### 4. Rodar backend

```bash
npm run dev
```

Em execução sem watch:

```bash
npm start
```

Verifique `http://localhost:5000/api/health`. O servidor conecta ao MongoDB e cria/verifica os índices antes de aceitar requisições.

### 5. Instalar frontend

Em outro terminal, partindo da raiz:

```bash
cd frontend
npm ci
```

Copie `.env.example` para `.env` e configure:

```dotenv
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

### 6. Rodar frontend

```bash
npm run dev
```

Abra **http://localhost:5173**. Utilize `localhost` tanto para a interface quanto para a API, sem alternar com `127.0.0.1`, para manter origens e cookies consistentes. Mudanças em variáveis `VITE_*` exigem reiniciar o Vite ou recompilar o build.

### 7. Fluxo operacional de teste

1. Entre como Praça, abra **Minha guarnição**, escolha uma equipe e confirme se será motorista.
2. O primeiro ingresso inicia o turno de 24 horas. Outros integrantes entram no mesmo turno, sem reiniciá-lo.
3. Registre uma ocorrência, com descrição de pelo menos dez caracteres e município/tipo válidos.
4. Em outro perfil do navegador, entre como Oficial e assuma o CPU no Dashboard.
5. Abra Despachos e encaminhe a ocorrência à guarnição em serviço.
6. A janela dos integrantes abre Atendimento e apresenta aviso. O áudio depende de interação prévia e da permissão do navegador.
7. Aceite a ocorrência. Apenas um aceite é confirmado mesmo com dois integrantes tentando simultaneamente.
8. Registre observações e, se necessário, solicite apoio. O Oficial/Administrativo autoriza a guarnição disponível.
9. Encerre com resumo obrigatório, armas, veículos recuperados, conduzidos e abordagens.
10. Confira duração, histórico, relatório CSV/PDF e auditoria.

## Perfis e permissões

| Capacidade | Administrativo | Oficial | Praça |
|---|---|---|---|
| Dashboard | Completo | Completo | Painel simplificado |
| Criar/consultar ocorrências | Sim | Sim | Sim |
| Editar ocorrência não finalizada | Todas | Todas | Somente a própria |
| Excluir/cancelar ocorrência em aberto | Sim | Sim | Não |
| Despachar/reencaminhar | Sim | Sim | Não |
| Aceitar/rejeitar atendimento | Sim | Sim | Da sua guarnição ativa |
| Encerrar atendimento | Sim | Sim | Somente o que aceitou |
| Solicitar apoio | Sim | Sim | No atendimento da própria guarnição |
| Autorizar apoio | Sim | Sim | Não |
| Ingressar em guarnição | Sim | Sim | Sim |
| Encerrar turno antecipadamente | Sim, com motivo | Sim, com motivo | Não |
| CRUD de guarnições/viaturas | Sim | Consulta | Não |
| Usuários | Gerencia | Consulta | Não |
| Assumir CPU | Administra a indicação | Assume | Não |
| Mapa/relatórios | Sim | Sim | Não |
| Parâmetros/cidades/tipos/auditoria | Sim | Não | Não |
| Preferências de tema/som | Sim | Sim | Tema no cabeçalho |

**Decisão de segurança:** o cadastro público registra o perfil solicitado, mas cria uma conta **Praça e inativa**, aguardando aprovação. Somente o Administrativo ativa ou altera o perfil. Oficial consulta usuários e frota; não altera perfis nem dados administrativos. A matriz é fixa no middleware, e a atribuição dos perfis é gerenciada em Usuários; não há editor de permissões arbitrárias.

## Regras de negócio e consistência

- Dia operacional no fuso `America/Fortaleza`. Datas persistidas em UTC e apresentadas em português do Brasil. Configure os dispositivos operacionais no fuso de Brasília/Fortaleza.
- CPU protegido por índice único de `day`; apenas Oficial pode assumir. Administrativo altera a indicação com justificativa auditada, mantendo um registro por dia.
- MongoDB transactions em despacho, aceite, conclusão, ingresso e encerramento de turnos. Uma guarnição só pode ter uma ocorrência reservada por vez. O apoio autorizado também reserva a guarnição até o encerramento.
- Ocorrências encerradas/canceladas não são editáveis. Exclusão de ocorrência é lógica e preserva histórico. Usuários são desativados em vez de apagados.
- Alterações guardam campos alterados, autor e data no histórico. Senhas e tokens nunca integram o histórico.
- Guarnições e viaturas vinculadas a ocorrências não podem ser excluídas. Cadastros ativos em turno não podem ser alterados administrativamente até encerrar o turno.
- Um usuário só integra uma guarnição por vez e só mantém um atendimento principal ativo. Um motorista por guarnição.
- O encerramento automático é verificado a cada 30 segundos e na inicialização da API. Despachos também verificam a expiração diretamente: não há janela de 30 segundos para receber novos despachos após expirar.
- Encerramento do turno libera integrantes. Despachos não aceitos retornam à fila. Atendimento já aceito continua acessível ao responsável até finalizar; a equipe não recebe novos despachos.
- A saída durante as 24 horas é realizada pelo encerramento autorizado do turno completo. Não há remoção individual de integrante durante turno ativo nesta versão.
- Durante atendimento principal ativo, funções secundárias ficam ocultas no menu e bloqueadas no backend. Ocorrências, atendimento, informações essenciais da guarnição e posição da viatura permanecem acessíveis.
- Pedidos de apoio listam equipes disponíveis e usam distância aproximada em linha reta, com posição cadastrada da viatura ou centro do município. Não representam roteamento ou localização garantidamente atual.
- Anexos armazenados em coleção MongoDB separada, até dez arquivos por ocorrência, com limite de 5 MB por arquivo e validação da assinatura do formato. Download exige sessão e usa `Content-Disposition: attachment`.

## Autenticação, sessão e erros

- Senhas com bcrypt, custo 12. Mínimo de dez caracteres e máximo de 72 bytes.
- JWT assinado com HS256, issuer/audience explícitos, validade de 12 horas; opção Lembrar de mim aumenta a validade máxima para sete dias. **Inatividade continua encerrando a sessão**, mesmo quando Lembrar de mim está marcada.
- Token enviado em cookie `srgop_session`, HttpOnly, Secure em produção. Não é salvo em localStorage nem retornado como campo JSON ao frontend.
- Sessão registrada no MongoDB. Logout invalida a sessão, alterações de usuário invalidam suas sessões e sockets.
- Inatividade padrão de cinco minutos, configurável de 1 a 60 pelo Administrativo. Mouse, clique, teclado, toque e scroll reiniciam o cronômetro. A API também verifica inatividade, e recebe batimentos somente quando há interação.
- CORS com origens explícitas, checagem de Origin em mutações autenticadas, Helmet, validação estrita e limites de requisições.
- Socket.IO autentica o cookie, usa salas privadas por usuário e revalida sessões a cada 15 segundos. Eventos do cliente não podem despachar ou alterar registros; as mutações passam pela API autenticada.
- Erros centralizados retornam `message`, `origin` e `redirect: "/dashboard"`. A interface exibe a origem, exige ciência da mensagem e direciona ao Dashboard; sessão inválida chega ao Login pela proteção do Dashboard. Validações locais de formulário aparecem junto ao preenchimento.
- Logs técnicos ficam no console do servidor; detalhes internos inesperados não são enviados ao cliente. Auditoria persiste login, logout, cadastros, alterações, exclusões e ações operacionais.

Exemplo de erro:

```json
{
  "message": "Seu perfil não tem permissão para esta ação.",
  "origin": "Autorização",
  "redirect": "/dashboard"
}
```

## API REST

Prefixo `/api`. IDs são ObjectIds MongoDB. Campos e enums usam os valores escritos no código, inclusive acentos. Endpoints protegidos recebem o cookie da sessão; clientes HTTP precisam preservá-lo e enviar `Origin` autorizado nas mutações.

| Método | Endpoint | Finalidade / acesso |
|---|---|---|
| GET | `/health` | Saúde pública da API |
| GET | `/auth/cities` | Municípios ativos para cadastro público |
| POST | `/auth/register` | Solicitar cadastro |
| POST | `/auth/login` | Login e cookie HttpOnly |
| GET | `/auth/me` | Usuário, configurações e última atividade |
| POST | `/auth/activity` | Renovar atividade da sessão |
| POST | `/auth/logout` | Revogar sessão |
| GET | `/dashboard` | Indicadores de hoje |
| GET/POST | `/occurrences` | Listar / cadastrar |
| GET/PUT/DELETE | `/occurrences/:id` | Detalhar / editar / excluir logicamente |
| POST | `/occurrences/:id/cancel` | Cancelar ocorrência em aberto |
| POST | `/occurrences/:id/attachments` | Anexar via multipart, campo `file` |
| GET | `/attachments/:id` | Download autenticado |
| GET/POST | `/dispatches` | Histórico / despachar ou reencaminhar |
| GET | `/attendances` | Atendimentos pendentes/ativos acessíveis |
| POST | `/attendances/:id/accept` | Aceitar exclusivamente |
| POST | `/attendances/:id/reject` | Rejeitar com `reason` |
| POST | `/attendances/:id/notes` | Observação em `text` |
| POST | `/attendances/:id/close` | Encerrar com resumo e resultados |
| POST | `/attendances/:id/support` | Pedir apoio: `targetCrew`, `reason` |
| GET | `/attendances/support/requests` | Pedidos de apoio |
| POST | `/attendances/support/:id/authorize` | Autorizar apoio |
| POST | `/attendances/support/:id/reject` | Recusar apoio |
| GET/POST | `/crews` | Listar / cadastrar guarnição |
| PUT/DELETE | `/crews/:id` | Editar / excluir equipe inativa sem ocorrências |
| POST | `/crews/:id/join` | Ingressar: `{ "driver": true/false }` |
| POST | `/crews/:id/end-shift` | Encerrar turno com `reason` |
| GET/POST | `/vehicles` | Consultar / cadastrar viatura |
| PUT/DELETE | `/vehicles/:id` | Editar / excluir viatura sem vínculos |
| PATCH | `/vehicles/:id/location` | Latitude, longitude e quilometragem opcional |
| GET/POST | `/users` | Consultar / cadastrar usuário |
| PUT/DELETE | `/users/:id` | Editar/redefinir senha / desativar |
| GET/POST | `/cities` | Consultar / criar município |
| PUT | `/cities/:id` | Editar ou desativar município |
| GET/PUT | `/settings` | Consultar / configurar parâmetros |
| GET/POST/PUT | `/cpu` | Consultar / assumir / administrar CPU de hoje |
| GET | `/reports` | Relatório JSON; `format=csv` para download |
| GET | `/notifications` | Notificações do próprio usuário |
| PATCH | `/notifications/:id/read` | Marcar como lida |
| GET | `/audit-logs` | Últimas 200 ações; Administrativo |

Filtros de ocorrência: `search`, `city`, `priority`, `status`, `crimeType`, `from`, `to`, `crew`, `vehicle`, `createdBy`, `page`, `limit`. Datas `YYYY-MM-DD`. Listagem paginada: `{ items, total, page, pages }`. Limite máximo de 100 registros por página. Relatórios limitam a consulta a 10.000 ocorrências; para volumes maiores, reduza o período. Turnos do relatório são limitados aos 1.000 mais recentes, e usuários da tela aos 1.000 mais recentes.

Exemplo de registro:

```json
{
  "occurredAt": "2026-09-17T12:00:00-03:00",
  "city": "OBJECT_ID_DA_CIDADE",
  "crimeType": "Furto",
  "address": "Rua de exemplo, 100, Centro",
  "description": "Descrição detalhada da ocorrência de demonstração.",
  "priority": "Alta",
  "latitude": -5.2898,
  "longitude": -44.495
}
```

Exemplo de despacho:

```json
{ "occurrence": "OBJECT_ID_DA_OCORRENCIA", "crew": "OBJECT_ID_DA_GUARNICAO" }
```

Exemplo de encerramento:

```json
{
  "summary": "Atendimento concluído e medidas registradas pela equipe.",
  "weapons": 0,
  "recoveredVehicles": 1,
  "detained": 0,
  "approaches": 3
}
```

O cliente não pode definir diretamente o status no formulário de ocorrência: os endpoints de negócio controlam as transições.

Eventos Socket.IO: `dispatch:new`, `notification`, `attendance:changed`, `data:changed`. A conexão aceita o cookie; utilize `withCredentials: true`. Operações críticas usam HTTP, não mensagens de socket.

## Complementos operacionais

- Praça recebe um Dashboard simplificado com sua guarnição, turno e atendimentos.
- Oficial e Administrativo podem autorizar saída individual e troca de motorista, registrando motivo e histórico do turno (`POST /api/crews/:id/members`).
- Administrativo altera a disponibilidade de equipes sem ocorrência reservada (`PATCH /api/crews/:id/availability`).
- Comunicação textual persistida entre equipes ativas: `GET/POST /api/crew-messages`. Praça consulta apenas mensagens das quais participou; a central acompanha a comunicação operacional.
- Indicadores de encerramentos, armas e veículos recuperados usam a data de conclusão. A distribuição de ocorrências usa a data do fato.
- Atividade sincronizada entre abas, recuperação de despachos pendentes ao reconectar e logout restrito à sessão encerrada.

## Testes e build

A última execução aprovou **17 testes de integração**, incluindo conexões Socket.IO reais. O registro de verificações, impasses corrigidos e limitações está em [VALIDACAO.md](VALIDACAO.md).

Na raiz:

```bash
npm test
npm run build
```

Os testes iniciam um replica set descartável, verificando cadastro sem autopromoção, RBAC, cookie, CORS, CPU concorrente, motorista único, ownership de ocorrências, despacho, aceite concorrente, resumo obrigatório, resultados de relatórios, encerramento de turno, formato de anexo e inatividade.

Build do frontend em `frontend/dist`. Para inspecioná-lo localmente:

```bash
npm run preview --prefix frontend -- --port 5173
```

Pare o servidor Vite antes de usar a mesma porta. Se optar por outra porta, acrescente a origem em `CLIENT_URL` e reinicie o backend.

## Deploy do frontend na Vercel

1. Envie o repositório para seu GitHub.
2. Importe o projeto na Vercel com **Root Directory: `frontend`**.
3. Framework: Vite. Instalação: `npm ci`. Build: `npm run build`. Output: `dist`.
4. Cadastre `VITE_API_URL=https://ENDERECO_DA_API/api` e `VITE_SOCKET_URL=https://ENDERECO_DA_API`.
5. Faça deploy. O `frontend/vercel.json` encaminha rotas da SPA para `index.html`.
6. Configure a URL final exata do frontend em `CLIENT_URL` do backend.

Valores `VITE_*` são públicos no bundle. Nunca coloque JWT_SECRET, credenciais MongoDB ou senhas em variáveis do frontend. Mudanças nas URLs exigem novo build/deploy.

## Deploy do backend no Render, Railway ou Node compatível

O repositório inclui `render.yaml` para serviço Node. Também pode configurar manualmente:

- Root Directory: `backend`.
- Build: `npm ci --omit=dev`.
- Start: `npm start`.
- Healthcheck: `/api/health`.
- Node.js 22.12+.
- MongoDB Atlas ou outro replica set acessível pelo serviço.
- Variáveis: `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL`, `NODE_ENV=production`, `COOKIE_SAME_SITE` e `PORT` (normalmente fornecida pelo serviço).
- `CLIENT_URL` aceita múltiplas origens separadas por vírgula, sem barra final, por exemplo `https://srgop.exemplo.br,https://homologacao.exemplo.br`. Não use `*` com credenciais.

Para frontend e API em sites diferentes (por exemplo Vercel e Render), use `COOKIE_SAME_SITE=none` com HTTPS nos dois lados. Alguns navegadores bloqueiam cookies de terceiros mesmo com `SameSite=None`. Para funcionamento consistente, prefira domínios próprios no mesmo site, como `srgop.exemplo.br` e `api.exemplo.br`, usando `COOKIE_SAME_SITE=lax`.

O serviço Node precisa aceitar WebSocket e executar continuamente para alertas e encerramento pontual dos turnos. Em serviços que suspendem por inatividade, a correção de turnos ocorre ao reiniciar, e não há entrega de alertas durante a suspensão. Esta versão é preparada para **uma instância Node**. Para múltiplas instâncias, adicione adaptador Redis ao Socket.IO e coordenação do agendador.

Faça a carga inicial de demonstração somente em banco de homologação. Para uma instalação institucional, crie a primeira conta administrativa por processo controlado e troque/desative contas de demonstração antes de liberar acesso. Use TLS, contas de banco restritas, backups, observabilidade e política de retenção adequada à instituição.

**Não foi realizado deploy externo automaticamente**: a entrega inclui código e configurações prontos para essas plataformas. Domínios, projeto de hospedagem e credenciais de banco devem ser configurados no ambiente escolhido.

## Solução de problemas

- **Transaction numbers are only allowed…**: MongoDB está standalone. Use o Compose fornecido, inicialize `rs0` ou utilize Atlas.
- **Erro de configuração/JWT**: substitua a chave de exemplo por uma aleatória de pelo menos 32 caracteres.
- **Cadastro aguardando aprovação**: ative o usuário pela conta administrativa e confira o perfil solicitado.
- **Erro CORS / CSRF**: confira protocolo, domínio e porta exatos em `CLIENT_URL`; não use barra final nem misture localhost com 127.0.0.1.
- **Login funciona, mas não persiste em produção**: confira HTTPS, `COOKIE_SAME_SITE` e bloqueio de cookies de terceiros.
- **Sem guarnição no despacho**: é preciso ter integrantes, turno não expirado e status Disponível. Guarnição atendendo ou prestando apoio fica reservada.
- **Sem som**: interaja com a página após o login e verifique as preferências. Restrições do navegador podem exigir um clique para ativar o áudio.
- **Mapa sem marcadores**: confira coordenadas e filtros. Registros sem coordenadas são omitidos.
- **Mapa sem fundo**: tiles exigem acesso à internet; tabela e demais módulos continuam disponíveis.
- **Primeiro teste/demo demora**: o MongoDB temporário pode precisar baixar o binário oficial. Depois utiliza cache.
- **EPERM ao iniciar Vite/testes em ambiente restrito**: autorize a execução dos subprocessos do compilador e MongoDB no ambiente de desenvolvimento.

## Limites e melhorias futuras

- Recuperação automática de senha por e-mail (a interface orienta procurar o Administrativo).
- MFA e integração com identidade institucional.
- Rastreamento GPS contínuo, histórico de posição e mapas offline.
- Notificações push para aplicação fechada; atualmente os alertas em tempo real dependem de sessão e conexão abertas.
- Antivírus de anexos e armazenamento de objetos para maiores volumes.
- Redis/outbox para entrega resiliente de eventos e implantação com múltiplas instâncias.
- Exportação XLSX e geração de PDF no servidor; atualmente CSV e impressão para PDF.
- Paginação ampliada e relatórios assíncronos para grandes volumes.
- Revisão e homologação institucional dos municípios, tipificações e fluxos antes da operação real.

## Aviso de uso

Projeto de referência para avaliação acadêmica/institucional. Não representa produto oficialmente homologado pela Polícia Militar do Maranhão e não confere autorização para tratamento de dados reais. A instituição responsável deve definir a licença de distribuição, autorização de uso, política de acesso e implantação. Não há licença permissiva de redistribuição presumida. Dados e identidades do seed são fictícios.
