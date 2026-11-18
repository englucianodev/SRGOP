# Operação e Efetivo, turno do CPU e resiliência de conexão — design

Data: 2026-11-18 · Sistema: SRGOP (backend Node/Express/Mongo, frontend React/Vite + Leaflet)

## Por quê

A Sala de Situação do simulador mostrou, melhor que o sistema, o fluxo da área: onde estão as
guarnições, o que está em atendimento e quem está entrando em serviço. O Administrativo e o
Oficial precisam dessa visão no próprio SRGOP. Ao mesmo tempo, o turno do CPU hoje é só um
"dia de serviço" (08h→08h) sem fechamento: guarnições são encerradas às 08h mesmo em atendimento
e não existe relatório de turno. As simulações também mostraram muitos erros "Não foi possível
conectar ao servidor", sem aviso visual de reconexão.

## Objetivos

1. **Conexão** — indicador animado de reconexão; reduzir os erros de conexão vistos nas simulações.
2. **Operação e Efetivo** — visão para Administrativo e Oficial; o mapa da operação substitui o
   mapa "Área de cobertura" do Dashboard e o mapa da página Mapa.
3. **Turno do CPU** — fechamento automático por condição, passagem de serviço com aceite,
   guarnições que atravessam as 08h, relatório sintético e analítico do turno.

## Não objetivos

- Verificação em duas etapas (fora do sistema por decisão do usuário; está em `stash@{0}`).
- Botão de encerrar turno do CPU (não existe, por decisão do usuário).
- Mudar o plano de hospedagem (Render/MongoDB Atlas) — só recomendação no relatório final.
- Histórico de percurso de GPS (o sistema não coleta; continua assim).

## Antiobjetivos (seria falha mesmo funcionando)

- Encerrar automaticamente uma ocorrência em atendimento por causa das 08h.
- O indicador de reconexão piscar a cada oscilação curta (alarme falso cansa o usuário).
- Relatório de turno que conte ocorrências registradas depois das 08h no turno que terminou.
- Praça ganhar acesso à visão de Operação/Efetivo de outras guarnições além do que já tem.

## Regras decididas com o usuário

**Fim do turno (08h)**
- O oficial do CPU continua logado e despachando depois das 08h até o turno dele fechar.
- O turno fecha **automaticamente** quando: (a) não há ocorrência do turno em aberto, despachada
  ou em atendimento; e (b) todos os policiais que serviram no turno saíram de serviço.
- Ao fechar, o oficial vê uma tela para gerar o relatório sintético e analítico do turno. O mesmo
  relatório pode ser emitido depois em Relatórios.
- O relatório conta as ocorrências **registradas** dentro da janela do turno (08h→08h, ou até a
  hora de uma passagem). O que chega depois das 08h, mesmo despachado pelo oficial que sai,
  pertence ao turno seguinte.

**Quem é o CPU depois das 08h** (respondido após a revisão)
- Um único CPU por vez. O oficial que sai continua sendo o CPU — recebe ocorrências novas,
  emergências e notificações — até o turno dele fechar. Só então o oficial do dia seguinte
  consegue assumir. Portanto o "CPU atual" passa a vir do turno de CPU aberto, não mais só do
  `day` do `DailyOfficer` (todas as consultas `DailyOfficer.findOne({ day: serviceWindow().day })`
  passam por uma função única `currentCpu()`).
- Se o turno anterior não fechar, o oficial seguinte vê o motivo (o que ainda está pendente).

**Ocorrências não aceitas às 08h** (respondido após a revisão)
- Ocorrências "Em aberto" ou "Despachada" (sem aceite) às 08h **passam para o turno seguinte**:
  não seguram o fechamento do turno que sai e entram no relatório do turno seguinte, mesmo
  registradas antes das 08h. O oficial que ainda é CPU as despacha normalmente.
- Implementação: cada ocorrência guarda o dia de serviço a que pertence (`dutyDay`), definido no
  registro; às 08h as não aceitas recebem o dia novo. O relatório usa esse campo.
- Despacho feito para guarnição cujo turno expirou, antes do aceite, volta para a fila (a
  guarnição expirada não recebe despacho). *Decisão do implementador.*
- A condição (a) do fechamento fica: nenhuma ocorrência do dia do turno "Em atendimento".

**Motocicletas** (respondido após a revisão)
- Passam a expirar às 08h, com a mesma regra das viaturas (aviso, finalizar, sair), e contam
  para o fechamento do turno do CPU.

**Troca do CPU pelo Administrativo** — *decisão do implementador*: a troca existente
(`updateCpu`, sem aceite) vira uma passagem forçada: fecha o turno do oficial anterior na hora,
com relatório até ali.

**Dia sem oficial no CPU** — *decisão do implementador*: o relatório do dia de serviço continua
disponível em Relatórios (por data), mesmo sem turno de CPU.

**Guarnições em atendimento às 08h**
- A ocorrência não é encerrada automaticamente; continua em atendimento.
- A guarnição recebe aviso: "Seu turno encerrou. Finalize o atendimento o mais rápido possível
  para a próxima equipe assumir."
- Ela não recebe novos despachos. Ao encerrar a ocorrência, sai de serviço automaticamente
  (o turno já expirou), liberando a viatura para a equipe seguinte.
- 30 min após as 08h ainda em atendimento: alerta ao CPU (uma vez por guarnição).

**Passagem de serviço do CPU (antes do fim)**
- O oficial do CPU escolhe outro Oficial ativo e envia a passagem, com motivo opcional.
- O destinatário recebe notificação e aceita ou recusa.
- Aceite: o destinatário vira o CPU do dia dali em diante; o turno do primeiro fecha na hora da
  passagem (relatório até a passagem) e o do segundo vai da passagem até o fechamento.
- Recusa: nada muda; o remetente é avisado. Só uma passagem pendente por vez; o remetente pode
  cancelá-la enquanto pendente.

**Operação e Efetivo**
- Visão para Administrativo e Oficial (Praça continua com o FieldDashboard).
- Operação: mapa com guarnições por situação (livre, em atendimento, entrando, saindo, turno
  expirado), ocorrências abertas, contadores (em serviço, em atendimento, livres), CPU atual,
  cartões de atendimentos em andamento com tempo decorrido, linha do tempo dos eventos do turno.
- Efetivo: por município, a guarnição, comandante e motorista (e motociclistas), situação de
  cada um e entradas em serviço recentes.
- O mapa da operação substitui o "Área de cobertura" do Dashboard e o mapa da página Mapa.

**Relatórios**
- Sintético (1 página): janela, oficial, ocorrências (registradas, atendidas, em atendimento na
  passagem, aguardando, canceladas, tempo médio), efetivo (policiais, guarnições), resultados
  (conduções à delegacia, detidos, veículos recuperados, armas, abordagens, apreensões por tipo),
  totais por município e por tipo.
- Analítico: uma linha por ocorrência (protocolo, hora, município, tipo, guarnição, tempo de
  resposta, duração, detidos, delegacia, apreensões); guarnições do turno (entrada, saída,
  integrantes, nº de atendimentos); passagens de serviço e eventos (urgências, apoios).
- Ambos com impressão/PDF pelo navegador; analítico também em CSV.

## Abordagens consideradas

**Turno do CPU como registro próprio (escolhida).** Novo modelo `CpuShift` (oficial, início,
fim previsto, fechamento, motivo, passagem). `DailyOfficer` continua dizendo quem é o CPU do dia
(muitas rotinas dependem dele). O relatório é calculado sob demanda a partir da janela do
`CpuShift`, como o `/reports` já faz. Prós: janela exata mesmo com passagem no meio; relatório
reemitível; pouca mudança nas rotinas existentes.

**Estender `DailyOfficer`.** Mais simples, mas o `day` é único por dia: uma passagem no meio do
dia precisaria de dois registros no mesmo dia, o que quebra a unicidade e as consultas atuais.

**Relatório gravado (snapshot) no fechamento.** Rápido de abrir depois, mas fica desatualizado se
uma ocorrência do turno for editada depois; o cálculo sob demanda evita isso. Guardamos só a
janela e os metadados do turno.

**Operação/Efetivo:** reaproveitar `OperationalMap` (react-leaflet) e evoluí-lo com as camadas e
legendas da Sala de Situação, em vez de embutir o painel do simulador (HTML puro, outra pilha).
Dados: estender `/dashboard` e o evento `crew:location` já existentes, em vez de nova API.

**Conexão:** o tempo real (Socket.IO) já sinaliza `online`; o indicador usa esse estado e as
falhas de rede das requisições, com atraso de alguns segundos antes de aparecer.

## Diagnóstico dos erros de conexão (simulações de 17–18/11)

- As falhas não vêm de uma rotina com defeito: o servidor deixou de aceitar conexões em picos
  (`UND_ERR_CONNECT_TIMEOUT`, 502 da hospedagem, `ping timeout` do tempo real).
- Picos: 02:40 e 07:00–07:40 (este agravado por dois simuladores simultâneos a partir de 07:26).
- A rota mais chamada era `PATCH /crews/:id/gps` (15 guarnições a cada 15 s), que até 18/11 abria
  transação a cada envio; a versão publicada em 18/11 usa uma escrita só.
- Cada requisição autenticada faz ~5 leituras no banco (sessão, configurações, usuário,
  checklist pendente, atendimento ativo).

Medidas do lado do sistema:
- Cliente: reenvio automático com espera crescente para leituras (GET) e para o GPS quando a
  falha é de rede/5xx/429; não reenviar escritas que não são idempotentes.
- Cliente: suprimir o aviso vermelho de erro de conexão enquanto o indicador de reconexão está
  visível (um só sinal por queda, em vez de um toast por requisição).
- Servidor: cache curto em memória das configurações gerais (`SystemSetting general`) — lida em
  toda requisição e quase nunca muda; invalidar ao salvar.
- Servidor: GPS não repassa ao banco posições repetidas dentro de poucos segundos (mesmo ponto).
- Recomendação (fora do código): verificar plano do Render (instância gratuita/baixa CPU dorme e
  satura) e do MongoDB Atlas (M0 compartilhado).

## Restrições

- Fuso America/Fortaleza; janela de serviço por `serviceWindow()` (08h→08h).
- Transações Mongo já usadas nas operações; manter.
- Perfis: Administrativo, Oficial, Praça (`allow(...)`).
- Testes: backend `node --test` com MongoMemoryReplSet; frontend vitest.
- O simulador (`simulacao/`) precisa acompanhar: guarnição que atravessa 08h finaliza e sai;
  oficial do CPU aguarda o fechamento automático em vez de sair às 08h.

## Deixado para quem implementar

- Layout fino das telas (seguir o visual existente do sistema e da Sala de Situação).
- Intervalo exato de atualização da linha do tempo; tamanho do cache de configurações.
- Nomes de rotas e componentes.
