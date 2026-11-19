import { CATEGORIES } from '../domain/crimes.js';

export const SEVERITY_LABEL = { critico: 'Crítico', alto: 'Alto', medio: 'Médio', baixo: 'Baixo' };

export const PROBLEM_LABEL = {
  'erro-servidor': 'Erro no servidor',
  rede: 'Falha de rede / sem resposta',
  sessao: 'Sessão encerrada',
  'limite-requisicoes': 'Limite de requisições',
  'regra-negocio': 'Ação recusada pelo sistema',
  lentidao: 'Lentidão',
  'tempo-real': 'Avisos em tempo real',
  'atendimento-automatico': 'Atendimento automático',
  encerramento: 'Encerramento de atendimento',
  'troca-de-servico': 'Troca de serviço às 8h',
  'checklist-viatura': 'Checklist da viatura',
  fila: 'Fila de despacho',
  cpu: 'CPU do dia',
  interface: 'Tela (interface)',
  'login-interface': 'Login pela tela',
  indisponibilidade: 'Indisponibilidade do sistema',
};

export const FLOW_LABEL = {
  'ocorrencia.criada': 'Ocorrências cadastradas',
  'atendimento.inicio': 'Atendimentos iniciados',
  'atendimento.encerrado': 'Atendimentos encerrados',
  'despacho.enviado': 'Despachos feitos pelo CPU',
  'despacho.recebido': 'Despachos percebidos pela guarnição',
  'despacho.aceito': 'Despachos aceitos',
  'despacho.rejeitado': 'Despachos rejeitados',
  'apoio.solicitado': 'Pedidos de apoio',
  'apoio.autorizado': 'Apoios autorizados',
  'checklist.recebimento': 'Checklists de recebimento',
  'checklist.entrega': 'Checklists de entrega',
  'turno.inicio': 'Entradas em serviço',
  'turno.fim': 'Saídas de serviço',
  'turno.expirado': 'Avisos de turno encerrado com atendimento aberto',
  'cpu.relatorio': 'Relatórios de turno do CPU',
  login: 'Logins',
  'navegador.login': 'Logins pela tela (navegador)',
};

export const ORIGIN_LABEL = {
  guarnicao: 'Guarnição na própria cidade',
  'outra-cidade': 'Guarnição para outra cidade',
  cpu: 'CPU',
};

export const categoryLabel = (id) => CATEGORIES[id]?.label ?? id;

/** Who in the operation faces the problem. */
export const ROLE_ORDER = ['Comandante', 'Motorista', 'CPU', 'Sistema'];
