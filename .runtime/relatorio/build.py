from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from copy import deepcopy
from lxml import etree as E
import hashlib, json

BASE=Path('D:/Documents/UEMA/SRGOP2')
REF=Path('D:/Downloads/Template – Proposta Tecnológica (1).docx')
OUT=BASE/'output/SRGOP_Proposta_Tecnologica_Revisada_Etapa_2.docx'
W='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
NS={'w':W}
def q(n): return '{'+W+'}'+n

# Conteúdo autoral organizado segundo as oito seções do documento de referência.
pages=[
('1 INTRODUÇÃO',[
('p','O SRGOP — Sistema de Recebimento e Gerenciamento de Ocorrências Policiais — é uma aplicação web voltada à organização do fluxo operacional do 18º Batalhão de Polícia Militar do Maranhão. Sua proposta surgiu da necessidade de centralizar registros, despachos, atendimentos e informações de equipes e viaturas, em um contexto distribuído por 14 cidades, conforme descrito no relatório técnico da Primeira Etapa (Pontes; Silva, 2026a).'),
('p','Esta proposta revisada corresponde à Nota 1 da Segunda Etapa de Prática Profissional Supervisionada. O trabalho mantém a equipe e o problema inicialmente investigado, mas atualiza o planejamento a partir do MVP já construído. O foco passa a ser o aperfeiçoamento do fluxo essencial, a explicitação dos requisitos e a preparação de uma avaliação controlada com usuários, antes de uma eventual implantação institucional.'),
('p','A escolha do tema decorre da relação entre organização da informação e coordenação do serviço. Um registro acessível, associado a responsáveis e acompanhado por estados definidos, pode apoiar a continuidade do atendimento e a consulta posterior. Essa contribuição será investigada por meio de tarefas simuladas, sem presumir que a existência do software já represente redução comprovada de tempo ou melhoria dos indicadores de segurança pública.'),
('p','A versão desenvolvida possui frontend em React e Vite, backend em Node.js e Express, persistência com MongoDB e comunicação por Socket.IO. O registro técnico local informa 17 testes de integração aprovados e build de produção concluído. Essas evidências demonstram comportamentos técnicos verificados, mas não equivalem à homologação operacional, à aprovação institucional ou à avaliação de desempenho sob carga (Pontes; Silva, 2026b).'),
('p','A articulação com Vivências – Empreendedorismo envolve reconhecer a oportunidade, definir os usuários, examinar a proposta de valor e analisar os recursos necessários à continuidade. A revisão sustenta que o projeto é viável como MVP acadêmico em ambiente controlado; sua adoção real permanece condicionada à validação dos fluxos, à infraestrutura, à governança dos dados e à definição de suporte técnico.')]),
('2 PROBLEMA',[
('p','O relatório anterior descreve dificuldades para consolidar informações operacionais, acompanhar ocorrências e identificar responsabilidades quando registros, despachos, guarnições e viaturas não estão integrados. Nesse contexto, a necessidade central não consiste apenas em informatizar um formulário, mas em organizar a passagem da informação entre quem registra, quem despacha e quem atende (Pontes; Silva, 2026a).'),
('p','Os usuários diretamente afetados são os integrantes das guarnições, os oficiais responsáveis pela coordenação diária e os profissionais com atribuições administrativas. A dispersão das informações pode gerar repetição de registros, consultas demoradas e divergências sobre a situação de uma equipe ou ocorrência. A população atendida é beneficiária indireta da melhoria da organização interna, mas não integra o público de acesso do MVP.'),
('p','A revisão delimita três pontos que o sistema precisa tratar: continuidade do fluxo entre registro e encerramento; consistência de dados quando há ações simultâneas; e diferenciação das permissões de cada perfil. Por exemplo, dois integrantes não devem assumir simultaneamente o mesmo atendimento, e uma equipe cujo turno tenha terminado não deve receber um novo despacho.'),
('p','Pergunta-problema: como aperfeiçoar o SRGOP para integrar o registro, o despacho e o acompanhamento de ocorrências do 18º BPM, com rastreabilidade e permissões adequadas, e avaliar sua utilidade em um ambiente controlado compatível com a rotina dos usuários?'),
('p','O recorte abrange o fluxo operacional interno e a gestão dos recursos associados. Não inclui investigação criminal, decisão policial automatizada, integração já homologada com bases oficiais ou atendimento direto ao cidadão. Os 14 municípios cadastrados na demonstração são configuráveis e devem ser conferidos com a unidade antes de qualquer piloto institucional.'),
('p','Não há, nesta revisão, uma linha de base quantitativa do tempo gasto no procedimento atual, do volume diário de ocorrências ou da frequência de retrabalho. O levantamento desses dados integra a próxima avaliação. Por isso, a magnitude dos ganhos permanece como hipótese a verificar, e não como resultado alcançado.')]),
('3 JUSTIFICATIVA',[
('p','A relevância prática do SRGOP está na possibilidade de reunir informações necessárias ao acompanhamento do serviço em um fluxo consultável. Associar ocorrência, equipe, viatura, responsável e horários permite reconstruir as ações registradas e apoiar a passagem de serviço. Essa organização pode reduzir ambiguidades, desde que os registros sejam corretamente preenchidos e os usuários reconheçam o sistema como parte do processo de trabalho.'),
('p','A relevância social decorre do apoio indireto à prestação do serviço público. Uma coordenação mais informada pode favorecer a continuidade do atendimento, sem que se possa atribuir ao MVP, isoladamente, diminuição da criminalidade ou redução comprovada do tempo de resposta. O benefício precisa ser demonstrado por indicadores e pela percepção dos usuários em avaliação autorizada.'),
('p','No aspecto tecnológico, a contribuição consiste em integrar módulos antes tratados separadamente e aplicar regras no servidor, além de apresentá-las na interface. A solução combina autenticação, autorização, persistência, histórico e eventos de atualização. A adaptação da interface do perfil Praça também busca limitar a navegação às tarefas necessárias durante o turno, tornando o uso mais compatível com sua responsabilidade operacional.'),
('p','No aspecto acadêmico, o projeto permite relacionar análise de requisitos, arquitetura cliente-servidor, modelagem de dados, desenvolvimento de interfaces e testes de integração. A revisão da proposta exercita a distinção entre funcionalidade implementada, evidência de teste e benefício esperado, evitando tratar a conclusão do código como conclusão de toda a intervenção.'),
('p','Em Vivências – Empreendedorismo, a oportunidade é compreendida como inovação de processo e geração de valor público. A proposta de valor é oferecer acompanhamento integrado do serviço com responsabilidade identificada. A continuidade exige avaliar quem utiliza, quem autoriza, quem mantém e quem financia a solução; esses papéis não devem ser confundidos nem pressupostos.'),
('p','A manutenção da aplicação web é coerente com o investimento já realizado. Caso a instituição prefira infraestrutura própria, o sistema pode ser hospedado em servidor interno acessível pela rede autorizada. Essa alternativa deve ser comparada com a nuvem antes de se propor uma reescrita como aplicação desktop, que ampliaria o escopo e o custo de manutenção.')]),
('4 OBJETIVOS',[
('h','4.1 Geral'),
('p','Aperfeiçoar e avaliar, em ambiente controlado, o MVP do SRGOP para apoiar o recebimento e o gerenciamento integrado de ocorrências do 18º BPM do Maranhão, com rastreabilidade, controle de acesso por perfil e condições definidas para sua continuidade.'),
('h','4.2 Específicos'),
('b','Revisar o problema e o fluxo de trabalho descritos na Primeira Etapa, identificando lacunas que ainda dependem de confirmação com usuários.'),
('b','Delimitar os usuários diretos, os beneficiários indiretos e as responsabilidades dos perfis Administrativo, Oficial e Praça.'),
('b','Especificar requisitos funcionais e não funcionais com prioridades e critérios de verificação vinculados ao MVP.'),
('b','Consolidar o fluxo de registro, despacho, aceite e encerramento, incluindo turnos, apoio entre equipes e histórico de ações.'),
('b','Verificar autenticação, autorização e consistência sob concorrência por meio de testes reproduzíveis.'),
('b','Planejar e executar, após autorização, uma avaliação de uso com cenários fictícios e participantes representativos dos três perfis.'),
('b','Analisar a viabilidade técnica, operacional e econômica da continuidade, incluindo hospedagem, suporte, capacitação e governança.'),
('b','Documentar resultados, limitações e prioridades de melhoria, estabelecendo critérios para avançar a um piloto institucional.'),
('p','Os objetivos de avaliação com participantes e implantação piloto constituem atividades futuras. A existência de código e testes automatizados é o ponto de partida para essas etapas, e não evidência de que elas já foram realizadas.')]),
('5 REFERENCIAL TEÓRICO',[
('p','O desenvolvimento de uma solução para um problema organizacional pode ser estruturado como construção e avaliação de um artefato. Peffers et al. (2007) apresentam uma metodologia de Design Science Research com identificação do problema, definição dos objetivos, desenvolvimento, demonstração, avaliação e comunicação. Essa sequência orienta a proposta a relacionar cada funcionalidade a uma necessidade e a exigir evidências de sua utilidade.'),
('p','No SRGOP, essa orientação será adotada como referência para o ciclo de aperfeiçoamento: retomar o diagnóstico, selecionar requisitos, ajustar o software e demonstrá-lo em cenários controlados. O enquadramento não transforma os testes existentes em uma pesquisa de campo concluída. A avaliação com usuários continua necessária para examinar a adequação da solução ao contexto.'),
('p','A abordagem Lean Startup associa o MVP à aprendizagem validada e ao ciclo construir, medir e aprender (The Lean Startup, s.d.). O valor do protótipo, portanto, não depende somente da quantidade de módulos. Para esta proposta, o núcleo de avaliação será o percurso completo de uma ocorrência, desde o cadastro até o encerramento. Módulos adicionais serão mantidos como apoio, mas não substituirão a validação desse percurso.'),
('p','Os padrões apresentados pela Secretaria de Governo Digital destacam linguagem simples, organização das informações e experiência do usuário como referências para serviços digitais (Brasil, s.d.). Embora o SRGOP seja uma ferramenta interna, esses princípios ajudam a orientar formulários compreensíveis, mensagens de erro claras e navegação compatível com as tarefas de cada perfil. A aderência deverá ser observada no uso, não presumida pela aparência das telas.'),
('p','A articulação dessas referências permite tratar a inovação como uma melhoria verificável do processo. A contribuição pretendida está na integração do fluxo e na clareza das responsabilidades. O desenvolvimento técnico sustenta a demonstração; os indicadores e o retorno dos participantes sustentam a decisão de continuar, ajustar ou limitar o escopo. Essa distinção aproxima a prática de desenvolvimento da análise de oportunidade e viabilidade exigida em Vivências – Empreendedorismo.')]),
('6 METODOLOGIA',[
('p','A proposta caracteriza-se como pesquisa aplicada, de abordagem predominantemente qualitativa, com apoio de medidas quantitativas de execução de tarefas. Seus objetivos são exploratórios e descritivos, e os procedimentos combinam estudo do contexto do 18º BPM, análise documental e desenvolvimento incremental do artefato. A metodologia de Peffers et al. (2007) será utilizada como orientação para relacionar problema, solução e avaliação.'),
('p','A revisão já realizada considera o relatório técnico da Primeira Etapa, o código do SRGOP, o README e o registro de validação. Esses materiais permitem identificar funções implementadas e limitações registradas. Não foram acrescentadas entrevistas, observações presenciais ou resultados de satisfação que não estejam documentados.'),
('p','A próxima coleta será proposta à unidade e à orientação acadêmica. Sugere-se selecionar intencionalmente de três a seis participantes, com representação dos três perfis, conforme disponibilidade e autorização. Serão utilizados roteiro de entrevista semiestruturada, ficha de observação de tarefas e questionário breve de clareza e facilidade de uso. Esse grupo será exploratório, sem pretensão de representar estatisticamente todo o efetivo.'),
('p','O roteiro de tarefas abrangerá ingresso na guarnição, registro de ocorrência fictícia, despacho, aceite, anotação de atendimento e encerramento. A observação registrará conclusão, necessidade de ajuda, tempo, erros e comentários. Uma segunda sessão poderá repetir os mesmos cenários após os ajustes, permitindo comparar os resultados em condições semelhantes.'),
('p','Os dados serão analisados por categorias de dificuldade e medidas descritivas, como proporção de tarefas concluídas e mediana do tempo de execução. Os testes automatizados serão reexecutados após mudanças nas regras. Problemas encontrados serão priorizados pelo efeito sobre segurança, integridade dos registros e conclusão do fluxo.'),
('p','As sessões utilizarão dados fictícios, sem conteúdo real de ocorrências. A participação, o registro das avaliações e eventual uso de informações institucionais dependerão das autorizações pertinentes. Os resultados serão comunicados de forma agregada, acompanhados das limitações do estudo e de um plano de correções.')]),
('7 PROPOSTA TECNOLÓGICA',[
('h','7.1 Solução e público atendido'),
('p','A solução proposta é o aperfeiçoamento do sistema web já desenvolvido. Seu fluxo principal articula ocorrência, despacho, atendimento e encerramento; guarnições, viaturas, CPU diário, notificações e relatórios fornecem os dados de apoio. O escopo inicial de validação será esse percurso completo, sem exigir a ampliação de todos os módulos antes da avaliação.'),
('p','Administrativo: gerencia usuários, permissões, cadastros e configurações, consulta auditoria e atua na gestão operacional. Oficial: coordena despachos e atendimentos, pode assumir o CPU diário, autorizar apoio e encerramentos antecipados; a manutenção de usuários e de permissões permanece administrativa na versão atual. Praça: registra e consulta ocorrências, ingressa em guarnição, recebe e atende os despachos destinados à equipe e solicita apoio, por uma interface simplificada.'),
('p','O comando e a área de tecnologia são partes interessadas na autorização e sustentação de um piloto, mas sua participação ainda deverá ser pactuada. A população é beneficiária indireta e não recebe conta no MVP. Essa delimitação evita ampliar o projeto para um canal público de denúncia ou acionamento não previsto.'),
('h','7.2 Arquitetura e escopo técnico'),
('p','O frontend utiliza React, Vite e JavaScript; a API utiliza Node.js e Express. MongoDB e Mongoose persistem os registros, enquanto Socket.IO distribui eventos autenticados. O mapa usa React Leaflet. A organização em frontend e backend separa apresentação e regras, permitindo manter a autorização no servidor mesmo quando um recurso está oculto na interface.'),
('p','Os fluxos críticos utilizam transações e exigem MongoDB em replica set. A arquitetura atual considera uma instância Node. O projeto está preparado para Vercel no frontend e serviço Node compatível no backend; implantação externa, infraestrutura definitiva e homologação não estão concluídas. GPS contínuo, uso offline, integração com bases oficiais e decisões automatizadas permanecem fora do núcleo desta etapa.')]),
('7.3 Requisitos funcionais',[
('p','Os requisitos abaixo estão implementados na base do MVP. Sua presença no código não dispensa a avaliação integrada com usuários. A prioridade P1 identifica o núcleo obrigatório do piloto; P2 identifica recursos de apoio.'),
('r','RF01 · P1 — Autenticar e autorizar por perfil. Cadastro público depende de aprovação. Verificar que requisições diretas à API não permitem autopromoção nem acesso administrativo por Praça.'),
('r','RF02 · P1 — Registrar e consultar ocorrências com protocolo, município, tipo, endereço, descrição, prioridade, autor e histórico. Verificar persistência, validações e restrição de edição pela autoria quando aplicável.'),
('r','RF03 · P1 — Despachar para guarnição ativa e disponível, identificando operador e horário. Verificar mudança para Despachada e notificação dos integrantes autorizados.'),
('r','RF04 · P1 — Aceitar, rejeitar com motivo, registrar observações e encerrar com resumo. Verificar aceite exclusivo concorrente, responsável, horários e duração do atendimento.'),
('r','RF05 · P1 — Controlar ingresso, motorista e turno de 24 horas. Verificar bloqueio de novo despacho após expiração e exigência de autorização e motivo para encerramento antecipado.'),
('r','RF06 · P1 — Solicitar e autorizar apoio entre guarnições. Verificar reserva da equipe de apoio e liberação ao concluir a ocorrência, sem permitir autorização por Praça.'),
('r','RF07 · P2 — Gerenciar viaturas e sua associação às equipes, quilometragem e manutenção. Verificar que a quilometragem não diminui e que vínculos ativos são protegidos.'),
('r','RF08 · P2 — Apresentar indicadores, operações e CPU diário. Verificar exclusividade do CPU e contabilização de resultados pela data de conclusão do atendimento.'),
('r','RF09 · P2 — Consultar mapa e relatórios filtrados, exportar CSV e imprimir. Conferir totais em relação aos registros e distinguir marcadores informados de rastreamento GPS contínuo.'),
('r','RF10 · P2 — Gerenciar parâmetros, consultar auditoria, anexos e comunicação entre equipes. Verificar autorização das consultas e preservação do histórico. A impressão para PDF é feita pelo navegador; não há exportação XLSX nativa.')]),
('7.4 Requisitos não funcionais',[
('r','RNF01 — Segurança de acesso. Manter hash de senhas com bcryptjs, JWT com expiração em cookie HttpOnly e autorização no backend. Critério: os testes de acesso indevido, revogação e inatividade devem continuar aprovados. HTTPS e gestão de segredos são condições de implantação.'),
('r','RNF02 — Integridade e rastreabilidade. Registrar responsáveis e horários, preservar referências históricas e impedir aceite duplicado e CPU simultâneo. Critério: uma única ação deve prevalecer nos testes concorrentes, sem deixar equipes indevidamente reservadas.'),
('r','RNF03 — Usabilidade e acessibilidade. Manter português do Brasil, labels, foco visível e navegação por perfil em computador, tablet e celular de 375 px. Critério proposto: concluir o fluxo essencial sem campos inacessíveis ou ações obrigatórias ocultas; ampliar os testes com teclado e tecnologia assistiva.'),
('r','RNF04 — Tratamento de erros e sessão. Exibir mensagem compreensível com origem e encaminhar ao Dashboard após ciência; sessão inválida exige retorno ao login. Reiniciar o prazo padrão de cinco minutos por atividade. Critério: não manter acesso após expiração nem expor senha ou detalhes sensíveis na mensagem.'),
('r','RNF05 — Desempenho e disponibilidade. Medir latência da API e atraso das notificações no ambiente de piloto. Como meta inicial de avaliação, propõe-se percentil 95 de até dois segundos nas consultas usuais com dez sessões simultâneas. A meta não foi comprovada e deverá ser ajustada ao cenário autorizado.'),
('r','RNF06 — Manutenibilidade e recuperação. Preservar separação de responsabilidades, configuração por ambiente, README e testes reproduzíveis. Antes de dados reais, definir backup, retenção, monitoramento e teste de restauração. A demonstração temporária não atende à persistência institucional.'),
('p','A versão atual possui controles técnicos iniciais, mas não há certificação de acessibilidade, garantia de disponibilidade ou auditoria externa de segurança. Essas qualidades exigem verificação específica, além dos testes funcionais já executados.')]),
('7.5 Viabilidade e continuidade',[
('p','A oportunidade está na integração de tarefas operacionais que dependem umas das outras. A proposta de valor é permitir acompanhar o serviço e identificar responsáveis com menor dispersão da informação. A hipótese a validar é que esse fluxo será compreensível e útil para os três perfis, sem criar trabalho adicional que inviabilize sua adoção.'),
('p','A viabilidade técnica do MVP é sustentada pela base funcional e pelos testes registrados. A continuidade exige avaliar conectividade nas cidades, volume de anexos, carga simultânea, disponibilidade de servidor e manutenção das dependências. Hospedagem em nuvem e servidor institucional devem ser comparados considerando acesso, controle, suporte e recuperação, sem assumir que uma opção será necessariamente mais barata.'),
('p','A viabilidade econômica ainda não está demonstrada por orçamento aprovado. O custo total deverá considerar implantação, hospedagem da API, banco, armazenamento, backups, domínio, monitoramento, suporte e capacitação. O levantamento deve registrar preço, capacidade e responsável por cada item. A disponibilidade de ferramentas gratuitas no desenvolvimento não significa custo operacional zero.'),
('p','Na dimensão operacional, a avaliação deverá confirmar se o fluxo respeita a organização do serviço e se há responsáveis por administração, treinamento e atendimento de falhas. Na dimensão institucional, deverão ser definidos autorização, titularidade do código, regras de acesso, tratamento dos registros e compatibilidade com sistemas já utilizados. Não se pressupõe parceria, contratação ou aceite formal do batalhão.'),
('p','A continuidade sugerida é um piloto restrito, após a avaliação acadêmica e as autorizações necessárias. A expansão poderá ocorrer por equipe ou município, condicionada aos resultados. A manutenção poderá ser pactuada por cooperação acadêmica ou estrutura técnica institucional; eventual prestação de serviço exigirá análise própria de viabilidade e contratação.'),
('p','Os principais riscos são indisponibilidade de rede, perda de dados, acesso indevido e dependência de suporte informal. As respostas propostas são procedimentos de contingência, restauração testada, revisão de permissões e definição explícita de responsáveis. A decisão de avançar deve considerar esses custos e riscos, além da aceitação da interface.')]),
('7.6 Resultados esperados e critérios de avaliação',[
('p','A base atual já integra módulos e possui registro de 17 testes de integração aprovados, incluindo concorrência, autorização, turnos, anexos e comunicação Socket.IO. Também há build de produção concluído. Esses são resultados técnicos documentados; não representam resultados de implantação com dados reais ou satisfação dos usuários (Pontes; Silva, 2026b).'),
('p','A revisão atualiza limitações do relatório anterior: autorização no backend e logs de auditoria já foram implementados; continuam necessários o endurecimento da infraestrutura, a avaliação independente de segurança, a definição de backups e a homologação. Entre as correções registradas estão a liberação de equipes após conclusão, a preservação de guarnições com histórico e a contabilização dos resultados no dia de encerramento.'),
('r','Resultado esperado 1 — Fluxo compreensível. Indicador: tarefas essenciais concluídas sem ajuda. Critério inicial proposto: ao menos 80% de conclusão nos cenários simulados, com todas as dificuldades registradas para revisão.'),
('r','Resultado esperado 2 — Registros consistentes. Indicador: presença de protocolo, responsável, horários e histórico nas ocorrências do teste. Critério proposto: preenchimento integral desses elementos e nenhum aceite duplicado nos cenários concorrentes.'),
('r','Resultado esperado 3 — Consulta mais eficiente. Indicador: tempo mediano para localizar uma ocorrência e identificar a equipe responsável. Comparar antes e depois dos ajustes com cenários equivalentes; não estabelecer percentual de ganho sem linha de base.'),
('r','Resultado esperado 4 — Continuidade planejada. Indicador: existência de plano de hospedagem, custos, suporte e recuperação. Critério proposto: responsáveis e recursos definidos antes do piloto institucional.'),
('p','Os percentuais e critérios desta seção são metas propostas para avaliação, não resultados já obtidos. O avanço ao piloto dependerá da correção de falhas críticas, da aprovação dos fluxos e das condições institucionais. Caso a avaliação mostre excesso de etapas ou baixa utilidade, o escopo deverá ser simplificado antes da expansão.')]),
('8 CRONOGRAMA',[
('p','O cronograma proposto organiza sete semanas a partir da aprovação desta revisão. Trata-se de uma estimativa de trabalho, a ajustar ao calendário do AVA e à disponibilidade dos participantes. As atividades futuras de campo dependem de autorização; a ausência dessa autorização limita a avaliação a cenários de laboratório.'),
('table',''),
('p','Responsabilidade proposta: Luciano Ferreira Pontes e Wenderson de Jesus da Costa Silva participarão conjuntamente da revisão, da implementação, da documentação e dos testes, com distribuição operacional das tarefas a pactuar entre os integrantes. A orientação acadêmica acompanhará a aderência à atividade; a participação institucional será solicitada para validar os fluxos e as condições de um eventual piloto.'),
('p','Ao final do ciclo, espera-se entregar uma proposta coerente com o MVP, um registro de avaliação e uma lista priorizada de ajustes. A continuidade será recomendada somente quando a utilidade para os usuários e as condições de sustentação estiverem suficientemente demonstradas. Essa decisão encerra a revisão do planejamento sem antecipar uma implantação ainda não autorizada.')]),
('REFERÊNCIAS',[
('ref','BRASIL. Ministério da Gestão e da Inovação em Serviços Públicos. Padrões de qualidade para serviços públicos digitais. Brasília, DF: Secretaria de Governo Digital, [s.d.]. Disponível em: https://www.gov.br/governodigital/pt-br/estrategias-e-governanca-digital/transformacao-digital/central-de-qualidade/padroes-de-qualidade. Acesso em: 29 set. 2026.'),
('ref','PEFFERS, Ken; TUUNANEN, Tuure; ROTHENBERGER, Marcus A.; CHATTERJEE, Samir. A design science research methodology for information systems research. Journal of Management Information Systems, v. 24, n. 3, p. 45–77, 2007. DOI: 10.2753/MIS0742-1222240302. Disponível em: https://zhang.ist.psu.edu/teaching/504/readings/Peffers.pdf. Acesso em: 29 set. 2026.'),
('ref','PONTES, Luciano Ferreira; SILVA, Wenderson de Jesus da Costa. SRGOP — Sistema de Recebimento e Gerenciamento de Ocorrências Policiais. Caxias: Universidade Estadual do Maranhão, 2026a. Relatório técnico do MVP da Primeira Etapa de Prática Profissional Supervisionada.'),
('ref','PONTES, Luciano Ferreira; SILVA, Wenderson de Jesus da Costa. SRGOP — código e documentação de desenvolvimento. 2026b. Versão local do projeto SRGOP2: README.md, VALIDACAO.md e código-fonte. Material técnico do projeto.'),
('ref','THE LEAN STARTUP. Methodology. [S.l.], [s.d.]. Disponível em: https://theleanstartup.com/principles. Acesso em: 29 set. 2026.')])
]

# Redução de repetições para preservar a legibilidade na paginação do modelo.
shorten={
'No aspecto tecnológico,': 'No aspecto tecnológico, a contribuição é integrar os módulos e aplicar regras no servidor, combinando autenticação, autorização, histórico e eventos de atualização. A interface do perfil Praça limita a navegação às tarefas necessárias durante o turno, de acordo com sua responsabilidade operacional.',
'No aspecto acadêmico,': 'No aspecto acadêmico, o projeto relaciona análise de requisitos, arquitetura, modelagem, interfaces e testes. A revisão distingue funcionalidade implementada, evidência de teste e benefício esperado, evitando tratar a conclusão do código como conclusão da intervenção.',
'A manutenção da aplicação web': 'A aplicação web aproveita o investimento já realizado e pode ser hospedada em servidor institucional. Essa alternativa deve ser comparada com a nuvem antes de propor uma reescrita como aplicação desktop, que ampliaria o escopo e a manutenção.',
'A revisão delimita três pontos': 'A revisão delimita a continuidade entre registro e encerramento, a consistência sob ações simultâneas e as permissões de cada perfil. Dois integrantes não devem assumir o mesmo atendimento, e uma equipe com turno encerrado não deve receber novo despacho.',
'No SRGOP, essa orientação': 'No SRGOP, essa orientação será adotada para retomar o diagnóstico, selecionar requisitos, ajustar o software e demonstrá-lo em cenários controlados. Os testes existentes não constituem pesquisa de campo concluída; a avaliação com usuários permanece necessária.',
'A revisão já realizada': 'A revisão considera o relatório da Primeira Etapa, o código, o README e o registro de validação, permitindo identificar funções e limitações. Não foram acrescentadas entrevistas, observações presenciais ou resultados de satisfação não documentados.',
'A viabilidade técnica do MVP': 'A viabilidade técnica do MVP é sustentada pela base funcional e pelos testes registrados. A continuidade exige avaliar conectividade, anexos, carga, servidor e manutenção. Nuvem e servidor institucional devem ser comparados quanto a acesso, controle, suporte e recuperação, sem presumir qual será mais barato.',
}
pages=[(heading,[(kind,next((replacement for prefix,replacement in shorten.items() if text.startswith(prefix)),text)) for kind,text in blocks]) for heading,blocks in pages]

with ZipFile(REF) as z: parts={n:z.read(n) for n in z.namelist()}
baseline=json.loads((BASE/'.runtime/relatorio/inventory.json').read_text())
assert all(hashlib.sha256(v).hexdigest()==baseline[k] for k,v in parts.items())
root=E.fromstring(parts['word/document.xml']); body=root.find(q('body')); original=list(body)
ps=body.findall(q('p')); proto_body=deepcopy(ps[73]); proto_heading=deepcopy(ps[71]); proto_cover=deepcopy(ps[0]); proto_note=deepcopy(ps[41]); proto_bullet=deepcopy(ps[168]); proto_table=deepcopy(body.find(q('tbl')))
sect1=deepcopy(ps[70].find('w:pPr/w:sectPr',NS)); sect2=deepcopy(body.find(q('sectPr')))
for c in list(body): body.remove(c)

def prop(parent,name,attrs):
 n=parent.find(q(name))
 if n is None: n=E.SubElement(parent,q(name))
 for k,v in attrs.items(): n.set(q(k),str(v))
 return n

def para(text,kind='p',page=False,before=0,after=100):
 template=proto_heading if kind=='h' else proto_cover if kind=='c' else proto_note if kind=='note' else proto_bullet if kind=='b' else proto_body
 p=deepcopy(template)
 for n in list(p):
  if n.tag!=q('pPr'): p.remove(n)
 for k in list(p.attrib): del p.attrib[k]
 pp=p.find(q('pPr'))
 if pp is None: pp=E.SubElement(p,q('pPr'))
 for tag in ['sectPr','pBdr','shd','tabs','pageBreakBefore','numPr','ind']:
  for n in pp.findall(q(tag)): pp.remove(n)
 if kind=='b': prop(pp,'ind',{'left':360,'hanging':180})
 elif kind=='note': prop(pp,'ind',{'left':3969})
 else: prop(pp,'ind',{'firstLine':709 if kind=='p' else 0})
 prop(pp,'spacing',{'before':before,'after':after,'line':240 if kind in ['h','ref','c','note','toc'] else 360,'lineRule':'auto'})
 prop(pp,'jc',{'val':'center' if kind=='c' else 'left' if kind in ['h','ref','r','toc'] else 'both'})
 prop(pp,'keepNext',{'val':1 if kind=='h' else 0}); prop(pp,'keepLines',{'val':1}); prop(pp,'widowControl',{'val':1})
 if page: prop(pp,'pageBreakBefore',{'val':1})
 r=E.SubElement(p,q('r')); rp=E.SubElement(r,q('rPr'))
 prop(rp,'rFonts',{'ascii':'Arial','hAnsi':'Arial','eastAsia':'Arial','cs':'Arial'}); prop(rp,'sz',{'val':24}); prop(rp,'color',{'val':'000000'})
 prop(rp,'b',{'val':1 if kind=='h' else 0})
 for j,line in enumerate(text.split('\n')):
  if j: E.SubElement(r,q('br'))
  t=E.SubElement(r,q('t')); t.text=('• ' if kind=='b' and j==0 else '')+line
 body.append(p); return p

def title(text,before):
 p=para(text,'c',before=before,after=120)
 prop(p.find(q('pPr')),'pStyle',{'val':'Title'})
 prop(p.find('w:r/w:rPr',NS),'b',{'val':1})
 return p

names='LUCIANO FERREIRA PONTES\nWENDERSON DE JESUS DA COSTA SILVA'
titletext='SRGOP\nSISTEMA DE RECEBIMENTO E GERENCIAMENTO\nDE OCORRÊNCIAS POLICIAIS'
para('UNIVERSIDADE ESTADUAL DO MARANHÃO\nNÚCLEO DE TECNOLOGIAS PARA EDUCAÇÃO\nCURSO SUPERIOR DE TECNOLOGIA EM ANÁLISE\nE DESENVOLVIMENTO DE SISTEMAS','c',after=0)
para(names,'c',before=480)
title(titletext,1800)
para('PROPOSTA TECNOLÓGICA REVISADA\nSEGUNDA ETAPA','c',before=120)
para('CAXIAS\n2026','c',before=2400,after=0)
para(names,'c',page=True)
title(titletext,1800)
para('Projeto apresentado ao Curso Superior de Tecnologia em Análise e Desenvolvimento de Sistemas, da Universidade Estadual do Maranhão, Núcleo de Tecnologias para Educação, como requisito parcial para a Nota 1 de Prática Profissional Supervisionada, Segunda Etapa, articulada à disciplina Vivências – Empreendedorismo.','note',before=720)
para('Docente: Prof. Me. Pedro Brandão Neto\nTutor: Prof. Fandson da Silva Morais','note',before=240)
para('CAXIAS\n2026','c',before=1680,after=0)
sumario=para('SUMÁRIO','c',page=True,after=300)
prop(sumario.find('w:r/w:rPr',NS),'b',{'val':1})
# Campos automáticos mantêm o sumário atualizável em Word.
toc=para('','toc',after=0)
rr=E.SubElement(toc,q('r')); E.SubElement(rr,q('fldChar')).set(q('fldCharType'),'begin')
rr=E.SubElement(toc,q('r')); ins=E.SubElement(rr,q('instrText')); ins.text=' TOC \\o "1-2" \\h \\z \\u '
rr=E.SubElement(toc,q('r')); E.SubElement(rr,q('fldChar')).set(q('fldCharType'),'separate')
for idx,(heading,_) in enumerate(pages,4):
 p=para(f'{heading}\t{idx}','toc',after=140)
 pp=p.find(q('pPr')); tabs=E.SubElement(pp,q('tabs')); prop(tabs,'tab',{'val':'right','leader':'dot','pos':9071})
 t=p.find('w:r/w:t',NS); a,b=t.text.split('\t'); t.text=a
 E.SubElement(p.find(q('r')),q('tab')); E.SubElement(p.find(q('r')),q('t')).text=b
rr=E.SubElement(p,q('r')); E.SubElement(rr,q('fldChar')).set(q('fldCharType'),'end')
sectionp=para('','c',after=0); sectionp.find(q('pPr')).append(sect1)
prop(sectionp.find(q('pPr')),'spacing',{'line':20,'after':0,'before':0})
schedule=[
['Atividades','S1','S2','S3','S4','S5','S6','S7'],
['Revisão bibliográfica e da proposta','X','X','','','','',''],
['Confirmação de requisitos e autorização','X','X','','','','',''],
['Preparação dos cenários e instrumentos','','X','X','','','',''],
['Ajustes do MVP e testes de integração','','','X','X','','',''],
['Avaliação com usuários autorizados','','','','X','X','',''],
['Análise e correção dos problemas','','','','','X','X',''],
['Viabilidade e plano de continuidade','','','','','X','X',''],
['Relatório e apresentação acadêmica','','','','','','X','X']]

def table():
 t=deepcopy(proto_table)
 for child in list(t):
  if child.tag==q('tr'): t.remove(child)
 tp=t.find(q('tblPr')); prop(tp,'tblW',{'w':9071,'type':'dxa'}); prop(tp,'tblLayout',{'type':'fixed'})
 borders=prop(tp,'tblBorders',{})
 for side in ['top','bottom','left','right','insideH','insideV']: prop(borders,side,{'val':'single','sz':4,'color':'D9D9D9'})
 grid=t.find(q('tblGrid'))
 if grid is None: grid=E.SubElement(t,q('tblGrid'))
 for n in list(grid): grid.remove(n)
 widths=[4171]+[700]*7
 for v in widths: E.SubElement(grid,q('gridCol')).set(q('w'),str(v))
 for ri,values in enumerate(schedule):
  row=E.SubElement(t,q('tr')); trp=E.SubElement(row,q('trPr')); E.SubElement(trp,q('cantSplit'))
  if ri==0:E.SubElement(trp,q('tblHeader'))
  for ci,value in enumerate(values):
   cell=E.SubElement(row,q('tc')); cp=E.SubElement(cell,q('tcPr')); prop(cp,'tcW',{'w':widths[ci],'type':'dxa'}); prop(cp,'vAlign',{'val':'center'})
   if ri==0: prop(cp,'shd',{'fill':'E7E6E6'})
   mar=prop(cp,'tcMar',{})
   for side in ['top','bottom','left','right']: prop(mar,side,{'w':90,'type':'dxa'})
   p=para(value,'r',after=0); body.remove(p); cell.append(p)
   prop(p.find(q('pPr')),'spacing',{'line':240,'before':0,'after':0}); prop(p.find(q('pPr')),'jc',{'val':'left' if ci==0 else 'center'})
   prop(p.find('w:r/w:rPr',NS),'sz',{'val':20}); prop(p.find('w:r/w:rPr',NS),'b',{'val':1 if ri==0 else 0})
 body.append(t)

for ix,(heading,blocks) in enumerate(pages):
 p=para(heading,'h',page=ix>0,after=280)
 if heading=='REFERÊNCIAS': prop(p.find(q('pPr')),'jc',{'val':'center'})
 for kind,text in blocks:
  if kind=='table': table()
  else: para(text,kind,after=180 if kind=='ref' else 140 if kind=='h' else 100)
sect2.find(q('pgNumType')).set(q('start'),'4'); body.append(sect2)
parts['word/document.xml']=E.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True)
settings=E.fromstring(parts['word/settings.xml']); prop(settings,'updateFields',{'val':'true'}); parts['word/settings.xml']=E.tostring(settings,xml_declaration=True,encoding='UTF-8',standalone=True)
OUT.parent.mkdir(exist_ok=True)
with ZipFile(OUT,'w',ZIP_DEFLATED) as z:
 for n,v in parts.items(): z.writestr(n,v)
assert all(hashlib.sha256(v).hexdigest()==baseline[n] for n,v in parts.items() if n not in ['word/document.xml','word/settings.xml'])
print(OUT)
print('Páginas planejadas:',len(pages)+3,'Palavras:',sum(len(t.split()) for _,b in pages for _,t in b))
(BASE/'.runtime/relatorio/content.json').write_text(json.dumps(pages,ensure_ascii=False,indent=2),encoding='utf8')
