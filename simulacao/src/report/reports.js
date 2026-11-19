import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { config } from '../config.js';
import { aggregate } from './aggregate.js';
import { narrative } from './narrative.js';
import { render } from './render.js';
import { loadReportPhotos } from './photos.js';
import { localTime, serviceStart } from '../lib/time.js';

const DAILY_AFTER = '08:40';
const previousDay = (day) => new Date(Date.parse(`${day}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);

export async function htmlToPdf(html, file) {
  const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({ path: file, format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' } });
  } finally {
    await browser.close();
  }
}

/** Writes an HTML report (and optionally PDF + JSON) for a time window. */
export async function writeReport({ state, ai, from, to, name, partial, pdf }) {
  const dir = path.join(config.dataDir, 'relatorios');
  mkdirSync(dir, { recursive: true });
  const report = aggregate(config.dataDir, { from, to });
  const text = await narrative(report, state?.data, ai);
  const title = partial ? `Simulação SRGOP · parcial ${name.replace('parcial-', '')}` : 'Simulação SRGOP · relatório final';
  const photos = loadReportPhotos(config.dataDir, { from, to });
  const html = render(report, { title, state: state?.data, narrative: text, partial, reportsDir: dir, photos });
  const htmlFile = path.join(dir, `${name}.html`);
  writeFileSync(htmlFile, html);
  writeFileSync(path.join(dir, `${name}.json`), JSON.stringify({ ...report, state: state?.data && { ...state.data, occurrences: undefined } }, null, 2));
  if (pdf) await htmlToPdf(html, path.join(dir, `${name}.pdf`));
  return htmlFile;
}

/** Daily partial report after the 8 h hand-over and the final report at the end. */
export class Reports {
  constructor({ collector, state, ai }) {
    Object.assign(this, { collector, state, ai });
    this.running = false;
  }

  daily(now, day) {
    if (this.running || !day || localTime(now) < DAILY_AFTER) return;
    const previous = previousDay(day);
    if (this.state.data.lastDailyReport === previous) return;
    if (Date.parse(this.state.data.startedAt) >= +serviceStart(day)) {
      this.state.data.lastDailyReport = previous;
      return;
    }
    this.running = true;
    writeReport({ state: this.state, ai: this.ai, from: serviceStart(previous), to: serviceStart(day), name: `parcial-${previous}`, partial: true, pdf: false })
      .then((file) => {
        this.state.data.lastDailyReport = previous;
        this.collector.flow('relatorio.parcial', `Relatório parcial gerado: ${path.basename(file)}.`);
      })
      .catch((error) => this.collector.event({ severity: 'baixo', category: 'simulador', message: `Falha no relatório parcial: ${error.message}` }))
      .finally(() => {
        this.running = false;
      });
  }

  async final() {
    try {
      const file = await writeReport({ state: this.state, ai: this.ai, from: new Date(this.state.data.startedAt), to: new Date(), name: 'relatorio-final', partial: false, pdf: true });
      this.collector.flow('relatorio.final', `Relatório final gerado: ${file}.`);
      console.log(`Relatório final: ${file} (e .pdf / .json na mesma pasta).`);
    } catch (error) {
      this.collector.event({ severity: 'baixo', category: 'simulador', message: `Falha no relatório final: ${error.message}. Rode "npm run relatorio".` });
    }
  }
}
