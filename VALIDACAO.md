# Validação e impasses — SRGOP

## Minha conta, identificação e serviço das 8h — 25/10/2026

- Página pessoal fora do menu lateral, acessível pelo menu do perfil via hover/clique/teclado, com Minha conta e Sair. Inclui nome de guerra, treze postos/graduações, número/barra, matrícula e telefone, também disponíveis no cadastro e na administração. Praça é identificada por posto e nome de guerra.
- Foto JPEG/PNG de até 2 MB, normalização para miniatura no navegador e armazenamento autenticado no MongoDB. Alteração de e-mail exige senha atual; alteração de senha exige confirmação e revoga todas as sessões, inclusive sockets. Uma resposta 401 de consulta antiga não bloqueia o novo login após o encerramento esperado.
- Serviço e CPU compartilham a referência das 8h de Fortaleza. Ingresso tardio não estende o serviço. A API agenda a limpeza para as 8h e mantém recuperação periódica; as operações validam a expiração diretamente. Turnos ativos antigos são adequados e auditados na inicialização, mantendo os registros reais de ingresso e os turnos já concluídos.
- Cadastro sem atendimento automático gera aviso persistente e sonoro para o CPU e entra nos alertas de pendências. Sem CPU ativo, Administrativo recebe o aviso. O novo CPU recupera as pendências recentes; o quadro acima do GPS da Praça exibe identificação e telefone do responsável. Avisos de pendência não emitem o evento de despacho para equipes.

Validação: 50 testes de integração aprovados, incluindo nova conta, permissões, foto e limites de upload, senha/e-mail, revogação de sessões, limites 07h59/08h00, adequação de turno antigo, notificações exclusivas ao CPU, ausência de alerta no atendimento automático e contato disponível para Praça. A regressão de chat, GPS, relatórios e atendimentos permaneceu aprovada. Build e Prettier conferidos.

Chrome headless com dados temporários: menu por hover/clique, conta sem link lateral, edição pessoal, miniatura após upload, identificação militar, contato do CPU acima do GPS, geração dos tons de alerta e acesso a Despachos, troca de senha/novo login e Sair em desktop/móvel, sem erros JavaScript. A foto usada foi uma imagem sintética; o teste de áudio verifica os osciladores do navegador. Nenhum dado persistente do usuário foi alterado durante os testes. Para publicar, atualize backend e frontend; não execute seed para habilitar os recursos.

## Rastreabilidade das guarnições — 25/10/2026

- Nova seção em Relatórios com seleção múltipla de guarnições, datas inicial e final e geração explícita. Exportação CSV e impressão/PDF usam os mesmos critérios emitidos. Os indicadores anteriores continuam disponíveis em Indicadores gerais.
- Relatório por equipe e turno, dias civis trabalhados, ingressos/saídas/reingressos dos integrantes, movimentações, ocorrências principais e apoios, responsável e integrantes no início de cada atendimento. Datas e dias calculados em America/Fortaleza, com limites inclusivos por dia e exclusão de turnos que terminaram exatamente à meia-noite da data inicial.
- Novos turnos guardam identificação da equipe/município/viatura, e novas movimentações guardam os nomes dos envolvidos. Aceite comum, atendimento automático e autorização de apoio registram o turno e os integrantes. Registros antigos são reconstruídos pelo histórico disponível, com intervalos estimados identificados; turnos ambíguos não são escolhidos arbitrariamente.
- Serviços que começaram antes do período e continuaram nele são incluídos. Atendimentos podem continuar vinculados ao turno original depois do fim do serviço. Turnos sem encerramento usam o limite previsto ou o instante de emissão. Limites de volume provocam erro explícito, sem apresentar resultado truncado como relatório completo.

Verificações: 38 testes de integração com MongoDB temporário, incluindo seleção múltipla, troca de composição, usuários inativos, trabalho noturno, reingresso, apoio, data do fato anterior ao atendimento, atendimento após fim do turno, ausência/ambiguidade de histórico, permissões, validação de filtros, CSV e gravação de novos vínculos. Build de produção e Prettier conferidos.

Chrome headless com dados fictícios: emissão por duas equipes, repetição da emissão com os mesmos filtros, composição histórica, download CSV, expansão das movimentações antes da impressão, interface móvel e acesso aos indicadores gerais, sem erros JavaScript. Nenhum banco persistente foi modificado e nenhum deploy foi executado. Para disponibilizar, atualize backend e frontend; não é necessário executar seed.

## Guia de chat, notificações e localização pelo mapa

- Nova rota `/chat-operacional`, abaixo de Guarnições no menu lateral, disponível durante atendimentos. O chat foi retirado da página de Guarnições; a consulta administrativa continua exigindo justificativa.
- Cada mensagem grava notificações na mesma transação, para os integrantes ativos das guarnições/turnos participantes, excluindo o remetente. As notificações contêm referência à conversa e à mensagem, sem transcrição do conteúdo privado. Não são enviadas globalmente à central nem a administradores apenas por terem autorização de consulta.
- Evento de notificação do chat toca dois tons curtos conforme as preferências, atualiza a central e sinaliza mensagens não lidas no menu. **Abrir conversa** direciona ao chat correto e marca aquela notificação como lida. Mensagens de chat não disparam `dispatch:new` nem interrompem a página com navegação automática.
- Botão de localização em cada guarnição com coordenadas abre `/mapa?crew=ID`, aplica zoom 16 e abre a identificação do marcador. A última posição permanece consultável se o turno terminou; sem coordenadas, o botão indica indisponibilidade.

Validação: 29 testes de integração aprovados, incluindo isolamento das notificações por usuário, leitura somente pelo destinatário, ausência de texto privado nos avisos e entrega Socket.IO sem emitir um despacho. Chrome headless com banco temporário: menu e rota do chat, central com link para a conversa, criação dos dois osciladores do toque, foco no marcador, posição atual/última posição, acesso ao chat durante atendimento e navegação móvel. Zero erros JavaScript no fluxo. O teste de áudio verifica a geração dos tons no navegador, sem avaliação auditiva em aparelho físico.

## Chat, atendimento automático e GPS — 24/10/2026

- Chat com grupos de até vinte guarnições, usuário remetente, horário, histórico paginado e notificações Socket.IO direcionadas. Participação exige vínculo atual com o turno da equipe; Oficial não possui acesso global. Inclusão de novas equipes e envio são serializados com as alterações de integrantes no banco.
- Consulta administrativa por justificativa com pelo menos dez caracteres, por conversa e sessão, com duração de quinze minutos. A abertura e as leituras ficam em auditoria. Consulta não concede participação ou envio.
- Atendimento automático ao cadastrar no município de serviço de uma equipe disponível. Reserva de guarnição e criação do atendimento na mesma transação; testes cobrem dois cadastros do mesmo usuário e cadastros de dois integrantes concorrentes.
- GPS voluntário com permissão do navegador, um transmissor por equipe, precisão e horário no mapa, interrupção ao sair e descarte da posição anterior no início de novo turno. Falta de atualização por um minuto remove a indicação de posição ativa. Não existe coleta de histórico de percurso.
- CARTO Voyager raster com a chave fornecida, substituível por `VITE_CARTO_API_KEY`, e atribuição preservada.
- Atualizações de posição chegam pelo Socket.IO e alteram os dados locais do mapa sem disparar consultas gerais à API; o chat possui revisão própria. Isso evita a multiplicação de consultas quando há várias sessões abertas.

Verificações: 28 testes de integração com MongoDB temporário e Socket.IO real; compilação de produção; formatação. Verificação adicional em Chrome headless com banco temporário: mensagem recebida em outra sessão, inclusão de terceira guarnição, conteúdo oculto antes da justificativa administrativa, consulta após autorização, GPS simulado, manutenção do GPS na navegação interna, desligamento, redirecionamento após atendimento automático e chat em viewport de 390 × 844 sem rolagem horizontal. Zero erros JavaScript nesse fluxo.

O teste do GPS no navegador usou coordenadas simuladas, não um aparelho físico. A coleta depende de HTTPS/localhost, permissão, sessão ativa e aplicação aberta. Navegadores podem suspender coleta em segundo plano ou com tela bloqueada. Não houve deploy nem alterações no banco persistente do usuário. As novas coleções são criadas pelo Mongoose ao iniciar a API; não é necessário executar seed para habilitar os recursos.

Para publicar, atualize backend e frontend juntos e faça novo build na Vercel. A chave CARTO já possui o valor fornecido como padrão; opcionalmente cadastre `VITE_CARTO_API_KEY` no ambiente de build.

## Revisão de integridade — 24/10/2026

A revisão encontrou o repositório sem os fontes da aplicação: `backend` continha apenas dependências e `frontend` continha dependências e `dist`. Também faltavam os manifests, lockfiles, modelos de ambiente e configurações de desenvolvimento e implantação.

Foram recuperados 85 arquivos a partir do commit local `76ddbae1b2603a160c99fb3adee868b40a99dc8a`, preservando a branch e o histórico atuais. A recuperação ficou na árvore de trabalho para revisão. Não foram recuperadas apresentações e outros artefatos sem relação com a execução.

O modelo `backend/.env.example` foi corrigido para usar MongoDB local com replica set, URL do frontend e campos vazios para os segredos. O modelo antigo continha uma credencial de banco: ela não foi copiada para os arquivos recuperados, mas continua no histórico antigo. Caso ainda esteja ativa, deve ser revogada no provedor do banco.

Validações realizadas nesta revisão:

- Compilação de produção do frontend concluída; os nomes dos bundles coincidem com o `dist` original.
- Suíte de integração: 17 testes aprovados, zero falhas, usando MongoDB temporário real.
- Prettier: todos os arquivos verificados aprovados.
- Conferência de 64 arquivos JavaScript/JSX e 199 referências locais: nenhum arquivo referenciado ausente.
- Dependências declaradas presentes no ambiente e manifests compatíveis com seus lockfiles na raiz, backend e frontend.

O sandbox bloqueou inicialmente subprocessos com `EPERM`; a compilação e os testes foram executados com a permissão apropriada e concluídos. Isso não exigiu alteração no código da aplicação.

Para executar sem configurar um banco persistente, use em terminais separados, na raiz: `npm run dev:demo --prefix backend` e `npm run dev:frontend`. Acesse `http://localhost:5173`. Para instalação limpa, execute antes `npm ci --prefix backend` e `npm ci --prefix frontend`. Para banco persistente, siga o README e configure `backend/.env`; nenhum segredo ou banco de produção foi criado nesta revisão.

As verificações visuais mencionadas nas seções seguintes são registros históricos do desenvolvimento. Esta revisão não incluiu navegação manual completa, implantação externa nem validação de conexão com banco de produção.

## Estado da entrega

Código organizado em `frontend` e `backend`, com banco MongoDB, API, permissões no servidor, interface por perfil e dados demonstrativos. Instruções de instalação, variáveis e deploy estão no [README](README.md).

Última execução da suíte: **50 testes aprovados, zero falhas**. Build de produção do frontend concluído com sucesso. Essas verificações não substituem homologação com os usuários do batalhão nem testes de carga em infraestrutura de produção.

## Verificações automatizadas

- Cadastro público sem autopromoção e aprovação administrativa obrigatória.
- Cookie HttpOnly, proteção de rotas, autorização por perfil e origem das requisições.
- Exclusividade do CPU diário sob concorrência.
- Ingresso, motorista único e duração do turno.
- Validação, autoria e histórico das ocorrências.
- Despacho, notificação persistida e aceite exclusivo concorrente.
- Resumo obrigatório, resultados e encerramento de atendimento.
- Encerramento autorizado e automático de turnos.
- Anexos autenticados, validação de formato e expiração por inatividade.
- Liberação de integrantes ao concluir atendimento após expiração do turno.
- Bloqueio de aceite de despachos com turno expirado.
- Troca de motorista e saída individual com autorização.
- Reserva e liberação de equipe de apoio e comunicação entre participantes.
- Revogação de sessão após redefinição de senha.
- Indicadores pela data de conclusão e rejeição de filtros de data inválidos.
- Preservação de guarnições com histórico de turnos.
- Socket.IO real: rejeição sem autenticação, despacho para todos os integrantes, sincronização do aceite e logout isolado por sessão.

Verificação visual realizada durante o desenvolvimento: login e Dashboard administrativo em desktop; login, Dashboard simplificado e ingresso de Praça em viewport de 375 × 812. Não há suíte automatizada de navegação completa nem medição de desempenho sob carga.

## Principais impasses e soluções

| Impasse | Tratamento implementado |
| --- | --- |
| Dois usuários aceitando a mesma ocorrência | Atualizações condicionais, transações e índices de exclusividade. |
| Dois oficiais assumindo CPU no mesmo dia | Índice único por dia e resposta de conflito. |
| Turno expirando durante o atendimento | Conclusão preservada e rotina de liberação dos integrantes. |
| Apoio mantendo equipe ocupada após conclusão | Encerramento dos pedidos e liberação da equipe na transação. |
| Exclusão quebrando referências históricas | Exclusão bloqueada quando a guarnição possui histórico. |
| Encerramentos de fatos antigos ausentes nos indicadores do dia | Resultados calculados pela data de conclusão. |
| Sessão e alertas inconsistentes entre abas e reconexões | Atividade sincronizada, consulta de despachos pendentes ao reconectar e salas por sessão. |
| MongoDB standalone sem suporte às transações necessárias | Compose com replica set e orientação para MongoDB Atlas. |
| Banco temporário excedendo o prazo inicial nos testes | Prazo de inicialização ampliado para 60 segundos; suíte reexecutada com sucesso. |
| Código pouco legível após a implementação inicial | Formatação padronizada com Prettier e separação por responsabilidade. |

## Pendências de implantação e evolução

- Configurar MongoDB persistente, chave JWT, URLs, HTTPS e hospedagem; nenhum deploy externo foi realizado.
- Validar os 14 municípios demonstrativos, tipificações, perfis e fluxos com a instituição.
- Executar homologação operacional, testes de carga e revisão de segurança no ambiente definitivo.
- GPS em segundo plano com o aplicativo fechado, mapas offline, notificações push com o aplicativo fechado, MFA, recuperação por e-mail e antivírus de anexos permanecem evoluções documentadas.
- A exportação atual usa CSV e impressão para PDF. XLSX nativo e PDF gerado no servidor são evoluções.
- A configuração atual considera uma instância Node; múltiplas instâncias exigem coordenação do agendador e adaptador de eventos.

## Reprodução

Na raiz, após instalar as dependências conforme README:

```bash
npm test
npm run build
```

Para verificar a formatação, instale também as dependências da raiz (`npm install`) e execute `npm run format:check`.
