# Simulação contínua do SRGOP

Simula, 24 horas por dia e pelo número de dias configurado, a operação real do SRGOP
publicado: 14 cidades, 3 guarnições por cidade (equipes A, B e C, com motorista e
comandante), revezamento diário A → B → C e 1 oficial no CPU por dia. Cada policial
simulado entra na própria conta, e o motorista faz o checklist da viatura.

As guarnições cadastram e assumem as próprias ocorrências. Às vezes cadastram para
outra cidade, e o CPU encaminha. O CPU também lança ocorrências. Tudo isso entre 1 e 5
ocorrências por hora para toda a área. No fim sai um **relatório dos erros e problemas
que os policiais enfrentaram**, em HTML, PDF e JSON.

> Todos os dados são fictícios. As contas usam o domínio `@sim.srgop.local`, as
> guarnições se chamam `SIM <cidade>`, as viaturas têm prefixo `SIM-` e todo relato
> começa com `[SIMULAÇÃO]`.

## Como funciona

| Peça | O que faz |
|---|---|
| 29 atores leves (API + tempo real) | 28 policiais da equipe do dia e 1 CPU usam a mesma API e os mesmos avisos em tempo real que o sistema usa |
| 3 observadores em navegador real (Playwright) | O CPU e 2 comandantes usam as telas de verdade e registram erros de tela, de JavaScript e lentidão, com captura de tela |
| Workers AI da Cloudflare (opcional) | Escreve relatos fictícios variados e o texto de análise do relatório. Sem a conta e o token, o simulador usa modelos prontos |
| Monitor de saúde | Se o SRGOP ficar fora do ar, pausa sozinho, registra a indisponibilidade e retoma quando o sistema volta |
| Estado em `dados/` | Permite continuar **de onde parou** depois de uma pausa, de uma queda ou de um reinício da VPS. Pausas não contam no tempo testado |

## 1. Preparar o backend (uma vez)

1. Publique o backend com a alteração de isenção de limite (`backend/middlewares/rateLimitBypass.js`).
2. No Render, em **Environment** do backend, crie
   `SIMULATION_BYPASS_TOKEN` com um valor aleatório. Para gerar:
   ```bash
   openssl rand -hex 32
   ```
   Sem essa variável, a isenção fica desligada e o sistema funciona como antes.
   **Remova a variável quando o teste acabar.**
3. Confira se o endereço do frontend publicado (o mesmo de `SRGOP_WEB_URL`) está em
   `CLIENT_URL` no Render. Se não estiver, as chamadas do simulador são recusadas com
   "Origem não autorizada".

Por que a isenção é necessária: as 87 contas saem do mesmo IP (a VPS). Sem ela, o limite
de requisições por IP bloquearia a simulação inteira, e isso apareceria como falso
problema no relatório. No login, a isenção vale só para contas `@sim.srgop.local`. As
contas reais continuam protegidas contra tentativas repetidas de senha, mesmo que o
token vaze.

## 2. Preparar a VPS (Hostinger, Ubuntu)

```bash
# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # saia e entre de novo na sessão SSH

# Projeto (só a pasta simulacao é necessária)
git clone <seu-repositorio> srgop && cd srgop/simulacao
cp .env.example .env
nano .env
```

Preencha o `.env`:

| Variável | Valor |
|---|---|
| `SRGOP_API_URL` | Endereço do backend no Render, sem `/api` |
| `SRGOP_WEB_URL` | Endereço do frontend na Vercel |
| `SIMULATION_BYPASS_TOKEN` | O mesmo valor colocado no Render |
| `SIM_PASSWORD` | Senha das 87 contas simuladas (10 ou mais caracteres) |
| `SIM_ADMIN_EMAIL` / `SIM_ADMIN_PASSWORD` | Conta administrativa usada **só** pelo `seed` para criar contas, viaturas e guarnições |
| `SIM_DAYS` | Quantos dias de teste (padrão 7) |
| `CF_ACCOUNT_ID` e `CF_AI_TOKEN` | ID da conta Cloudflare e token com permissão Workers AI (opcional). No painel: **My Profile > API Tokens > Create Token**, modelo "Workers AI" |
| `MONGO_URI` | Só para a limpeza no final (passo 6). Pode ficar vazio até lá |

O `.env` fica apenas na VPS e nunca vai para o repositório. Proteja o arquivo com
`chmod 600 .env`.

## 3. Criar contas e conferir

```bash
docker compose build
docker compose run --rm simulador npm run seed
docker compose run --rm simulador npm run verificar
```

O `seed` cria, em cada cidade, a viatura `SIM-<CIDADE>`, a guarnição `SIM <cidade>` e
6 praças, além de 3 oficiais. Pode ser rodado de novo sem duplicar nada.

O `verificar` confere API, isenção de limite, login, tempo real, os tipos de crime
usados em cada categoria, a IA (Workers AI) e o navegador. Corrija os itens com ✖. Os itens com !
são avisos.

Se algum tipo de crime não for reconhecido automaticamente, copie
`config/tipos.example.json` para `config/tipos.json` e escreva o nome exato do tipo
cadastrado para cada categoria.

## 4. Iniciar

```bash
docker compose up -d
docker compose logs -f --tail 50     # acompanhar (Ctrl+C só sai da visualização)
```

O contêiner volta sozinho se o processo cair ou se a VPS reiniciar.

## 5. Acompanhar e controlar

```bash
docker compose exec simulador npm run status     # situação, horas testadas, problemas do dia
docker compose exec simulador npm run monitorar  # acompanha ocorrências e despachos ao vivo (Ctrl+C sai; --tudo, --desde=60)
docker compose exec simulador npm run pausar
docker compose exec simulador npm run retomar
docker compose exec simulador npm run encerrar   # encerra na hora: fecha os atendimentos abertos, tira todos do sistema e gera o relatório final
```

**Quando o SRGOP cair:** o simulador detecta a queda em cerca de 2 minutos, pausa e
registra a indisponibilidade no relatório. Corrija o sistema normalmente. Assim que a
API voltar a responder e aceitar login, a simulação retoma sozinha: confere no servidor
cada guarnição e ocorrência em andamento e continua de onde parou. Se preferir retomar
manualmente, use `SIM_AUTO_RETOMAR=false` e depois `npm run retomar`.

Pausar à mão antes de uma manutenção planejada evita que o tempo parado entre como
falha.

**Relatórios:** ficam em `dados/relatorios/`.
- `relatorio-AAAA-MM-DD.html` e `.json`: um parcial por dia de serviço, gerado depois das 08:40.
- `relatorio-final.html`, `.pdf` e `.json`: gerado no fim do prazo ou ao `encerrar`.

Para gerar de novo a qualquer momento:
```bash
docker compose exec simulador npm run relatorio
# opções: -- --sem-ia  (sem Workers AI)   -- --sem-pdf
```

Para copiar para o seu computador:
```bash
scp usuario@ip-da-vps:~/srgop/simulacao/dados/relatorios/relatorio-final.pdf .
```

**Mudar a duração no meio do teste:** altere `SIM_DAYS` no `.env` e rode
`docker compose up -d`. O tempo já testado é mantido.

**Começar um teste novo do zero:** `docker compose down`, apague a pasta `dados/` e
rode `docker compose up -d`.

## Painel local (no seu computador)

```bash
npm run painel        # abre http://localhost:4300 no navegador
```

- **Operação:** mapa com as guarnições (verde livre, vermelho em atendimento, cinza entrando,
  laranja saindo), o local de cada ocorrência, os atendimentos em andamento com comandante e
  motorista, e a linha do tempo de ocorrências, despachos e apoios. O mapa segue o GPS que cada
  guarnição envia ao sistema: os marcadores deslizam até a nova posição, deixam um rastro e o
  zoom fica o mais próximo possível da área onde as guarnições estão atuando (sem sair da região
  do teste). Mexeu no mapa? Ele para de seguir até você clicar em "Seguir guarnições"; "Área
  toda" mostra a região inteira.
- **Modo claro e escuro:** botão de sol/lua no canto superior direito. A escolha fica salva
  neste navegador; as fotos do relatório saem sempre no modo escuro.
- **Efetivo:** a preparação ao vivo: barra de progresso total (contas prontas de todos os
  policiais), barra de guarnições em serviço, cada cidade com sua barra e cada policial
  clicável (função, lotação, se a conta foi criada/atualizada/já existia e em que etapa da
  entrada em serviço está: login → liberação → checklist da viatura → ingresso do comandante →
  em serviço). Tem busca e filtro (pendentes, entrando, em serviço).
- **Iniciar só libera com o efetivo pronto:** enquanto a preparação não terminar com sucesso
  (`dados/preparacao.json` com status concluída), o botão fica desligado e o servidor recusa o
  início. Quando fica pronto, aparece o aviso "Pronto para iniciar", o botão pisca em verde e o
  Windows mostra uma notificação (se você permitir ao clicar em "Preparar efetivo").
- **Configurar:** parâmetros do teste (gravados no `.env`, valem no próximo início),
  "Preparar efetivo" (sorteia nomes e patentes e atualiza as contas: comandantes 1º, 2º ou 3º
  Sargento; motoristas Soldado ou Cabo), "Novo teste" (arquiva o anterior em `dados/arquivo/`)
  e fotos do painel.
- **Botões:** Iniciar, Pausar, Retomar e Encerrar. O simulador roda em processo próprio:
  fechar o painel não para o teste.
- **Fotos:** enquanto houver atendimento, o painel se fotografa a cada `PAINEL_FOTO_MIN`
  minutos (padrão 15) e quando surge um atendimento novo. Ficam em
  `dados/capturas/painel/` e até 8 entram no relatório, na seção "Painel durante os atendimentos".

O painel só aceita acesso do próprio computador (127.0.0.1) e nunca mostra senhas ou tokens.

## 6. Limpar os dados da simulação

As ocorrências encerradas não podem ser apagadas pela API, então a limpeza acessa o banco
diretamente. Ela remove **somente** dados da simulação: contas `@sim.srgop.local`,
guarnições `SIM …`, viaturas `SIM-…` e o que essas contas criaram. Ela se recusa a rodar
se alguma guarnição SIM tiver policial real.

```bash
docker compose down
docker compose run --rm simulador npm run limpar                  # simulação: mostra o que seria apagado
docker compose run --rm simulador npm run limpar -- --confirmar   # apaga de fato
```

Depois, remova `SIMULATION_BYPASS_TOKEN` do Render.

Observação: a numeração de protocolo das ocorrências continua de onde parou. Os números
usados pela simulação não voltam a ser usados.

## Recursos e limites

- **VPS (2 vCPU, 8 GB):** os atores leves consomem pouco. Cada navegador real usa de
  300 a 500 MB. Se a VPS ficar sobrecarregada, reduza `SIM_ATORES_NAVEGADOR` (0 desliga).
- **MongoDB Atlas gratuito (512 MB):** a simulação acrescenta poucos MB por dia
  (ocorrências, histórico, auditoria, sessões). O GPS só atualiza a posição atual e não
  acumula histórico. Mesmo assim, acompanhe em Atlas → Metrics → Data Size e rode a
  limpeza ao terminar.
- **Workers AI gratuito:** 10.000 neurônios por dia, renovados às 00:00 UTC (21h em
  Fortaleza). Com o modelo padrão isso dá cerca de 100 chamadas, o valor de
  `IA_LIMITE_DIARIO`. Se a cota acabar, o simulador usa os modelos prontos até a
  renovação, sem interromper nada. Só dados fictícios são enviados à Cloudflare.
- **Render:** se o plano do backend dorme quando fica ocioso, o primeiro acesso depois
  do sono aparece como lentidão. Isso também acontece com usuários reais.

## Leitura do relatório

| Gravidade | Significado |
|---|---|
| Crítico | Erro 5xx, sistema fora do ar, tela recebendo erro do servidor |
| Alto | Fluxo quebrado: aviso em tempo real que não chegou, ocorrência que não foi assumida automaticamente, checklist não solicitado, sessão expirada no meio do turno, erro de JavaScript na tela |
| Médio | Recusa inesperada de regra de negócio, lentidão acima de `SIM_LENTIDAO_MS`, fila de ocorrência sem guarnição |

Recusas esperadas pelo fluxo, como "viatura aguardando a entrega da equipe anterior",
são contadas à parte e não entram como problema. Falhas do próprio simulador aparecem
numa seção separada, para não serem confundidas com problemas do SRGOP.

**Achado deliberado:** com `SIM_LEMBRAR_LOGIN=false`, padrão igual ao do formulário de
login, a sessão dura 12 h, mas o turno dura 24 h. O relatório mostra quando isso derruba
o policial no meio do serviço. Para testar só o resto, use `true`.

## Desenvolvimento

```bash
npm install
npm test     # testes unitários
```

Para testar localmente com o backend de demonstração (`backend/scripts/demo.js`), use
`SIM_ESCALA_TEMPO=0.05`, que encurta as durações internas 20 vezes. Essa variável é
apenas para teste e nunca deve ser usada na VPS.
