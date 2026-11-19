import path from 'node:path';
import { SEVERITY_LABEL, PROBLEM_LABEL, FLOW_LABEL, ORIGIN_LABEL, ROLE_ORDER, categoryLabel } from './labels.js';
import { localDateTime } from '../lib/time.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const when = (iso) => (iso ? localDateTime(new Date(iso)) : '—');
const secs = (ms) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)}s`);
const hours = (ms) => `${(ms / 3600000).toFixed(1)}h`;
const badge = (s) => `<span class="badge ${s}">${esc(SEVERITY_LABEL[s] ?? s)}</span>`;

const CSS = `
:root{--bg:#f6f7f9;--card:#fff;--ink:#16202c;--muted:#5b6675;--line:#dde2e8;--accent:#1d4f91;
--critico:#b42318;--alto:#c4580e;--medio:#a37b00;--baixo:#4a6b8a}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0f141a;--card:#161d26;--ink:#e6ebf1;--muted:#9aa6b4;--line:#2a3441;--accent:#7fb0ff;
--critico:#ff7b72;--alto:#f0a35e;--medio:#e3c35a;--baixo:#8fb3d9}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:1080px;margin:0 auto;padding:32px 16px 64px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:19px;margin:36px 0 12px;padding-bottom:6px;border-bottom:1px solid var(--line)}h3{font-size:16px;margin:20px 0 8px}
.sub{color:var(--muted);margin:0}.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 20px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-top:20px}
.kpi b{display:block;font-size:24px;font-variant-numeric:tabular-nums}.kpi span{color:var(--muted);font-size:13px}
.table{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.03em}td.num{text-align:right;font-variant-numeric:tabular-nums}
.badge{display:inline-block;font-size:12px;font-weight:600;padding:1px 8px;border-radius:999px;border:1px solid currentColor;white-space:nowrap}
.badge.critico{color:var(--critico)}.badge.alto{color:var(--alto)}.badge.medio{color:var(--medio)}.badge.baixo{color:var(--baixo)}
.muted{color:var(--muted)}a{color:var(--accent)}ul{padding-left:20px}
.shots{display:grid;gap:14px}.shot{margin:0;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden;break-inside:avoid}
.shot img{display:block;width:100%;height:auto}.shot figcaption{padding:6px 12px;color:var(--muted);font-size:13px}
@media print{body{background:#fff}.card{break-inside:avoid}}`;

function table(headers, rows) {
  if (!rows.length) return '<p class="muted">Nenhum registro.</p>';
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join('');
  return `<div class="table"><table><thead><tr>${head}</tr></thead><tbody>${rows.map((r) => `<tr>${r.join('')}</tr>`).join('')}</tbody></table></div>`;
}

function problemsByRole(report, reportsDir) {
  return ROLE_ORDER.map((role) => {
    const items = report.problems.filter((p) => (p.roles.length ? p.roles.includes(role) : role === 'Sistema'));
    if (!items.length) return '';
    const rows = items.slice(0, 40).map((p) => [
      `<td>${badge(p.severity)}</td>`,
      `<td><b>${esc(PROBLEM_LABEL[p.category] ?? p.category)}</b><br>${esc(p.message)}${p.screenshots.map((s, i) => ` <a href="${esc(path.relative(reportsDir, s).replace(/\\/g, '/'))}">captura ${i + 1}</a>`).join('')}</td>`,
      `<td class="num">${p.count}</td>`,
      `<td>${esc(when(p.first))}<br><span class="muted">${esc(when(p.last))}</span></td>`,
      `<td>${esc(p.cities.slice(0, 6).join(', ') || '—')}${p.cities.length > 6 ? ` +${p.cities.length - 6}` : ''}</td>`,
    ]);
    return `<h3>${esc(role)}</h3>${table(['Gravidade', 'Problema', 'Vezes', 'Primeira / última', 'Cidades'], rows)}`;
  }).join('');
}

/** Photos of the local panel taken while attendances were open (see src/panel/capture.js). */
function panelPhotos(photos) {
  if (!photos?.length) return '';
  const figures = photos.map((p) => `<figure class="shot"><img src="${esc(p.src)}" alt="Painel do teste em ${esc(when(p.takenAt))}"><figcaption>${esc(when(p.takenAt))}</figcaption></figure>`).join('');
  return `<h2>Painel durante os atendimentos</h2><p class="muted">Fotos do painel local do teste: guarnições no mapa (verde livre, vermelho em atendimento), locais das ocorrências e linha do tempo.</p><div class="shots">${figures}</div>`;
}

export function render(report, { title, state, narrative, partial, reportsDir, photos = [] }) {
  const s = report.severity;
  const pauses = state?.pauses ?? [];
  const downtime = pauses.filter((p) => p.automatic).reduce((sum, p) => sum + p.durationMs, 0);
  const kpi = (value, label) => `<div class="card kpi"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;
  const flowRows = Object.entries(FLOW_LABEL).filter(([k]) => report.flow[k]).map(([k, label]) => [`<td>${esc(label)}</td>`, `<td class="num">${report.flow[k]}</td>`]);
  const typeRows = Object.entries(report.occurrencesByCategory).sort((a, b) => b[1] - a[1]).map(([k, n]) => [`<td>${esc(categoryLabel(k))}</td>`, `<td class="num">${n}</td>`]);
  const originRows = Object.entries(report.occurrencesByOrigin).map(([k, n]) => [`<td>${esc(ORIGIN_LABEL[k] ?? k)}</td>`, `<td class="num">${n}</td>`]);
  const pauseRows = pauses.map((p) => [`<td>${esc(when(p.from))}</td>`, `<td>${esc(when(p.to))}</td>`, `<td class="num">${Math.round(p.durationMs / 60000)} min</td>`, `<td>${esc(p.reason)}</td>`]);
  const endpointRows = report.endpoints.slice(0, 20).map((e) => [`<td><code>${esc(e.key)}</code></td>`, `<td class="num">${e.count}</td>`, `<td class="num">${e.p50} ms</td>`, `<td class="num">${e.p95} ms</td>`, `<td class="num">${e.serverErrors + e.network}</td>`, `<td class="num">${e.slow}</td>`]);
  const dayRows = Object.entries(report.byDay).sort().map(([d, c]) => [`<td>${esc(d)}</td>`, ...['critico', 'alto', 'medio', 'baixo'].map((k) => `<td class="num">${c[k] ?? 0}</td>`)]);
  const faultRows = report.simulatorFaults.slice(0, 15).map((p) => [`<td>${esc(p.message)}</td>`, `<td class="num">${p.count}</td>`]);
  const lat = report.latency;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${CSS}</style></head><body><main>
<h1>${esc(title)}</h1>
<p class="sub">SRGOP · 18º BPM · ${partial ? 'Relatório parcial' : 'Relatório final'} · ${esc(when(report.period.from))} a ${esc(when(report.period.to))} · gerado em ${esc(localDateTime())}</p>
<p class="sub">Dados fictícios produzidos por policiais simulados. Os problemas abaixo são o que colaboradores reais teriam enfrentado.</p>
<div class="kpis">
${kpi(hours(state?.activeMs ?? 0), 'de operação testada')}
${kpi(report.flow['ocorrencia.criada'] ?? 0, 'ocorrências cadastradas')}
${kpi(report.flow['atendimento.encerrado'] ?? 0, 'atendimentos encerrados')}
${kpi(s.critico, 'problemas críticos')}
${kpi(s.alto, 'problemas altos')}
${kpi(`${Math.round(downtime / 60000)} min`, `indisponível (${pauses.filter((p) => p.automatic).length} vez(es))`)}
</div>
<h2>Análise</h2><div class="card">${narrative.html}<p class="muted">Texto gerado por ${esc(narrative.source)} a partir dos dados abaixo.</p></div>
<h2>Problemas enfrentados pelos colaboradores</h2>${problemsByRole(report, reportsDir) || '<p class="muted">Nenhum problema registrado.</p>'}
<h2>Indisponibilidades e pausas</h2>${table(['Início', 'Fim', 'Duração', 'Motivo'], pauseRows)}${report.outageSymptoms ? `<p class="muted">${report.outageSymptoms} falha(s) registradas nos minutos que antecederam as pausas automáticas foram contadas como parte da indisponibilidade, não como problemas separados.</p>` : ''}
<h2>Avisos em tempo real</h2>
<div class="card"><p>Despacho → guarnição: mediana ${secs(lat.dispatch.median)}, p95 ${secs(lat.dispatch.p95)}, máximo ${secs(lat.dispatch.max)} (${lat.dispatch.count} avisos).<br>
Ocorrência pendente → CPU: mediana ${secs(lat.cpu.median)}, p95 ${secs(lat.cpu.p95)} (${lat.cpu.count} avisos).<br>
Atendimento: mediana ${report.attendance.median ?? '—'} min. Entrada da equipe em serviço: mediana ${report.entryDelay.median ?? '—'} min, máximo ${report.entryDelay.max ?? '—'} min.</p></div>
${panelPhotos(photos)}
<h2>Operação simulada</h2>
<h3>Fluxo</h3>${table(['Etapa', 'Quantidade'], flowRows)}
<h3>Ocorrências por tipo</h3>${table(['Tipo', 'Quantidade'], typeRows)}
<h3>Origem do cadastro</h3>${table(['Origem', 'Quantidade'], originRows)}
<h2>Problemas por dia</h2>${table(['Dia (UTC)', 'Crítico', 'Alto', 'Médio', 'Baixo'], dayRows)}
<h2>Desempenho da API</h2>${table(['Rota', 'Chamadas', 'p50', 'p95', 'Falhas', 'Lentas'], endpointRows)}
<p class="muted">Recusas esperadas (ex.: viatura aguardando a entrega da equipe anterior) não entram como problema: ${report.expectedRejections}.</p>
<h2>Falhas do próprio simulador</h2><p class="muted">Listadas por transparência; não são problemas do SRGOP.</p>${table(['Falha', 'Vezes'], faultRows)}
</main></body></html>`;
}
