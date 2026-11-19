import { PROBLEM_LABEL, SEVERITY_LABEL } from './labels.js';

const RECOMMENDATIONS = {
  'erro-servidor': 'Investigar os erros 5xx nos logs do Render nos horários indicados; cada um interrompeu uma ação do policial.',
  rede: 'Verificar a estabilidade da hospedagem (Render) e do banco (Atlas M0) nos horários de falha; considerar plano sem hibernação.',
  sessao: 'Avaliar a duração da sessão: com "lembrar" desmarcado ela dura 12h, menos que o turno de 24h.',
  lentidao: 'Otimizar as rotas mais lentas (índices no MongoDB, paginação) e acompanhar o consumo do Atlas M0.',
  'tempo-real': 'Revisar a entrega de avisos via Socket.IO (reconexão, proxy do Render); despachos sem aviso dependem do policial olhar a tela.',
  'atendimento-automatico': 'Revisar as condições do atendimento automático no cadastro pela guarnição.',
  'troca-de-servico': 'Revisar a troca de serviço às 8h: atendimentos que atravessam o turno bloqueiam a equipe seguinte.',
  'checklist-viatura': 'Revisar o fluxo de entrega/recebimento da viatura entre equipes.',
  fila: 'Avaliar a fila de ocorrências quando a guarnição da cidade está ocupada.',
  interface: 'Corrigir os erros de tela e de JavaScript nas capturas anexas.',
  'login-interface': 'Verificar o login pela tela no celular.',
  indisponibilidade: 'Tratar a causa das indisponibilidades listadas antes do uso real.',
};

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Minimal Markdown (## headings, lists, **bold**) to HTML; everything is escaped first. */
export function markdownToHtml(markdown) {
  const out = [];
  let list = false;
  const inline = (text) => escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    const item = /^[-*] (.+)/.exec(line) ?? /^\d+\. (.+)/.exec(line);
    if (item) {
      if (!list) out.push('<ul>');
      list = true;
      out.push(`<li>${inline(item[1])}</li>`);
      continue;
    }
    if (list) out.push('</ul>');
    list = false;
    if (!line) continue;
    const heading = /^#{1,4} (.+)/.exec(line);
    out.push(heading ? `<h3>${inline(heading[1])}</h3>` : `<p>${inline(line)}</p>`);
  }
  if (list) out.push('</ul>');
  return out.join('\n');
}

function facts(report, state) {
  return {
    horasTestadas: Math.round((state?.activeMs ?? 0) / 360000) / 10,
    problemasPorGravidade: report.severity,
    problemasPorPerfil: report.byRole,
    indisponibilidades: report.outages.map((o) => o.message),
    ocorrenciasCadastradas: report.flow['ocorrencia.criada'] ?? 0,
    atendimentosEncerrados: report.flow['atendimento.encerrado'] ?? 0,
    despachos: report.flow['despacho.enviado'] ?? 0,
    latenciaAvisoDespachoMs: report.latency.dispatch,
    principaisProblemas: report.problems.slice(0, 25).map((p) => ({
      gravidade: SEVERITY_LABEL[p.severity], tipo: PROBLEM_LABEL[p.category] ?? p.category, descricao: p.message, vezes: p.count, perfis: p.roles, cidades: p.cities.slice(0, 5),
    })),
    rotasMaisLentas: report.endpoints.slice(0, 8).map((e) => ({ rota: e.key, p95ms: e.p95, errosServidor: e.serverErrors + e.network, total: e.count })),
  };
}

function ruleBased(f) {
  const lines = ['## Resumo executivo'];
  const total = Object.values(f.problemasPorGravidade).reduce((a, b) => a + b, 0);
  lines.push(`Em ${f.horasTestadas}h de operação simulada foram cadastradas ${f.ocorrenciasCadastradas} ocorrências e encerrados ${f.atendimentosEncerrados} atendimentos. Foram registrados ${total} problemas (${f.problemasPorGravidade.critico} críticos, ${f.problemasPorGravidade.alto} altos, ${f.problemasPorGravidade.medio} médios).`);
  if (f.indisponibilidades.length) lines.push(`Houve ${f.indisponibilidades.length} registro(s) de indisponibilidade.`);
  lines.push('## Problemas enfrentados pelos colaboradores');
  if (!f.principaisProblemas.length) lines.push('Nenhum problema registrado no período.');
  for (const p of f.principaisProblemas.slice(0, 12))
    lines.push(`- **${p.gravidade} · ${p.tipo}** (${p.vezes}x; ${p.perfis.join(', ') || 'Sistema'}): ${p.descricao}`);
  lines.push('## Recomendações');
  const categories = [...new Set(f.principaisProblemas.map((p) => Object.keys(PROBLEM_LABEL).find((k) => PROBLEM_LABEL[k] === p.tipo)))];
  const recs = categories.map((c) => RECOMMENDATIONS[c]).filter(Boolean);
  lines.push(...(recs.length ? recs.map((r) => `- ${r}`) : ['- Manter o monitoramento; nenhum ponto exige ação imediata.']));
  return lines.join('\n');
}

const prompt = (f) => `Você é analista de qualidade de software e escreve para o comando do 18º BPM (PMMA) e a equipe técnica do SRGOP.
A partir dos dados abaixo, de um teste contínuo com policiais SIMULADOS (comandante, motorista e oficial do CPU),
escreva em português do Brasil, em Markdown, com exatamente estas seções:
## Resumo executivo (1 parágrafo, com números)
## Problemas enfrentados pelos colaboradores (agrupe por perfil: Comandante, Motorista, CPU; diga o impacto no serviço)
## Indisponibilidades (se houver)
## Recomendações (lista priorizada, ações concretas)
Não invente fatos além dos dados. Dados: ${JSON.stringify(f)}`;

/** Analytical text of the report: Workers AI when available, rule-based otherwise. */
export async function narrative(report, state, ai) {
  const data = facts(report, state);
  const text = ai?.available() ? await ai.text(prompt(data)) : null;
  return { html: markdownToHtml(text ?? ruleBased(data)), source: text ? 'Workers AI (Cloudflare)' : 'regras automáticas' };
}
