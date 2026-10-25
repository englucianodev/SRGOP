# Validação e impasses — SRGOP

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

Última execução da suíte: **17 testes aprovados, zero falhas**. Build de produção do frontend concluído com sucesso. Essas verificações não substituem homologação com os usuários do batalhão nem testes de carga em infraestrutura de produção.

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
- GPS contínuo, mapas offline, notificações push com o aplicativo fechado, MFA, recuperação por e-mail e antivírus de anexos permanecem evoluções documentadas.
- A exportação atual usa CSV e impressão para PDF. XLSX nativo e PDF gerado no servidor são evoluções.
- A configuração atual considera uma instância Node; múltiplas instâncias exigem coordenação do agendador e adaptador de eventos.

## Reprodução

Na raiz, após instalar as dependências conforme README:

```bash
npm test
npm run build
```

Para verificar a formatação, instale também as dependências da raiz (`npm install`) e execute `npm run format:check`.
