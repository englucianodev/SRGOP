import { Actor } from './actor.js';
import { Officer } from './officer.js';
import { config } from '../config.js';
import { between, intBetween, minutes } from '../lib/random.js';
import { responseDelayMs } from '../domain/timing.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { summarizeCpuShift, renderShiftReport, shiftHeadline } from '../domain/shift-report.js';
import { serviceDay } from '../lib/time.js';

const RETRY_ENTER_MS = minutes(2);
const CLOSE_POLL_MS = minutes(1);
const CLOSE_WAIT_MAX_MS = minutes(120);

// Scans every 20 s so an open occurrence is forwarded in under 1 min.
const SCAN_MS = minutes(1 / 3);
const WAIT_WARNING_MS = minutes(5);
const isSimulated = (occurrence) => occurrence.description?.startsWith(config.tag);
const idOf = (value) => String(value?._id ?? value ?? '');

/** Officer of the day at the CPU: dispatches open occurrences and authorizes support. */
export class CpuActor extends Actor {
  constructor({ engine, account, enterAt }) {
    super(engine.collector);
    this.engine = engine;
    this.officer = new Officer(account, { collector: engine.collector, cityName: 'CPU' });
    this.phase = 'entrando';
    this.retryAt = enterAt;
    this.next = { scan: 0, ping: 0, read: 0 };
    this.shiftId = null;
    this.waiting = new Map(); // occurrenceId → first seen open
    this.handling = new Set();
    this.officer.on('notification', (row) => {
      if (row?.kind === 'pendente' && row.occurrence) this.engine.watch.noteCpuNotice(idOf(row.occurrence));
      this.next.scan = Math.min(this.next.scan, Date.now() + 10000);
    });
  }

  get context() {
    return this.officer.context;
  }

  /** Still dispatching: on duty, or waiting for the backend to close the shift. */
  get dispatching() {
    return this.phase === 'em-servico' || this.phase === 'aguardando-fechamento';
  }

  async step(now) {
    if (this.phase === 'encerrado') return;
    if (this.phase === 'entrando') return this.enter(now);
    if (this.phase === 'saindo' && now >= this.leaveAt) return this.leave();
    for (const task of this.takeDue(now)) await this.runTask(task, now);
    await this.routine(now);
    if (this.phase === 'aguardando-fechamento') await this.pollClose(now);
  }

  async enter(now) {
    if (now < this.retryAt) return;
    this.retryAt = now + RETRY_ENTER_MS;
    try {
      await this.officer.login();
      const shiftId = await this.takeShift(now);
      if (shiftId === undefined) return;
      this.shiftId = shiftId;
      this.phase = 'em-servico';
      this.day = serviceDay(new Date(now));
      this.collector.flow('cpu.assumiu', 'Assumiu o CPU do dia.', this.context);
    } catch (error) {
      this.unexpected(error, this.context);
    }
  }

  /** Id of the shift held; null when supporting today's CPU; undefined when must wait and retry. */
  async takeShift(now) {
    const current = await this.officer.api.get('/cpu');
    if (current && idOf(current.officer) === idOf(this.officer.id)) return idOf(current._id);
    if (current?.day === serviceDay(new Date(now))) {
      this.collector.event({ ...this.context, severity: 'baixo', category: 'cpu', message: 'CPU do dia já assumido por outro oficial; seguindo como apoio de despacho.' });
      return null;
    }
    try {
      const opened = await this.officer.api.post('/cpu', {}, { tolerate: [409] });
      return idOf(opened?._id ?? (await this.officer.api.get('/cpu'))?._id) || null;
    } catch (error) {
      if (error.status !== 409) throw error;
      this.collector.event({ ...this.context, severity: 'baixo', category: 'cpu', message: 'Aguardando fechamento do turno anterior.', details: { pending: current?.pending ?? null } });
    }
  }

  async runTask(task, now) {
    try {
      if (task.kind === 'registrar') await this.register(task, now);
      if (task.kind === 'despachar') await this.dispatch(task, now);
      if (task.kind === 'autorizar') await this.authorize(task);
    } catch (error) {
      if (task.kind === 'despachar') this.handling.delete(task.occurrenceId);
      if (await this.officer.recover(error)) this.enqueue({ ...task, at: now + minutes(1) });
      else this.unexpected(error, this.context);
    }
  }

  async routine(now) {
    const jobs = [];
    if (now >= this.next.ping) {
      this.next.ping = now + minutes(between(4, 5));
      jobs.push(this.officer.ping());
    }
    if (now >= this.next.read) {
      this.next.read = now + minutes(between(4, 7));
      jobs.push(this.officer.api.get('/dashboard'), this.officer.api.get('/notifications'));
    }
    if (now >= this.next.scan) {
      this.next.scan = now + SCAN_MS;
      jobs.push(this.scanOpen(now), this.scanSupport(now));
    }
    for (const result of await Promise.allSettled(jobs))
      if (result.status === 'rejected' && !(await this.officer.recover(result.reason).catch(() => false)))
        this.unexpected(result.reason, this.context);
  }

  async register({ scenario, targetCity }, now) {
    const occurrence = await this.officer.api.post('/occurrences', {
      occurredAt: new Date(now - minutes(intBetween(2, 10))).toISOString(),
      city: targetCity._id,
      crimeType: scenario.crimeType,
      address: scenario.address,
      description: scenario.description,
      priority: scenario.priority,
      latitude: scenario.latitude,
      longitude: scenario.longitude,
    });
    const { notes, summary, results, durationMs, wantsSupport, category, crimeType, latitude, longitude } = scenario;
    this.engine.state.trackOccurrence(occurrence._id, {
      protocol: occurrence.protocol, cityId: targetCity._id, cityName: targetCity.name, origin: 'cpu', createdAt: new Date(now).toISOString(),
      scenario: { notes, summary, results, durationMs, wantsSupport, category, crimeType, latitude, longitude },
    });
    this.collector.flow('ocorrencia.criada', `CPU cadastrou ${occurrence.protocol} (${scenario.crimeType}) para ${targetCity.name}.`, this.context, { protocol: occurrence.protocol, crimeType: scenario.crimeType, category: scenario.category, origin: 'cpu', generatedBy: scenario.generatedBy });
    this.next.scan = now + minutes(between(0.1, 0.3));
  }

  /** Open simulated occurrences go only to the crew of their own city (crews never leave their area). */
  async scanOpen(now) {
    const { items } = await this.officer.api.get('/occurrences?status=Em%20aberto&limit=100');
    const open = items.filter(isSimulated);
    const openIds = new Set(open.map((o) => idOf(o._id)));
    for (const id of this.waiting.keys()) if (!openIds.has(id)) this.waiting.delete(id);
    for (const occurrence of open) {
      const id = idOf(occurrence._id);
      if (this.handling.has(id)) continue;
      if (!this.waiting.has(id)) this.waiting.set(id, now);
      const waited = now - this.waiting.get(id);
      const home = this.engine.teamForCity(idOf(occurrence.city));
      const target = home?.available ? home : null;
      if (target) {
        this.handling.add(id);
        this.enqueue({ at: now + responseDelayMs(), kind: 'despachar', occurrenceId: id, protocol: occurrence.protocol, crewId: target.crewId });
      } else if (waited >= WAIT_WARNING_MS) {
        this.warnWaiting(id, occurrence, waited);
      }
    }
  }

  warnWaiting(id, occurrence, waited) {
    const key = `espera:${id}`;
    if (this.handling.has(key)) return;
    this.handling.add(key);
    this.collector.event({ ...this.context, severity: 'medio', category: 'fila', message: `Ocorrência ${occurrence.protocol} aguarda guarnição disponível há ${Math.round(waited / 60000)} min (${occurrence.city?.name ?? 'cidade'}).` });
  }

  async dispatch({ occurrenceId, protocol, crewId }, now) {
    try {
      await this.officer.api.post('/dispatches', { occurrence: occurrenceId, crew: crewId }, { tolerate: [409] });
    } catch (error) {
      this.handling.delete(occurrenceId);
      if (error.status !== 409) throw error;
      return;
    }
    this.handling.delete(occurrenceId);
    this.waiting.delete(occurrenceId);
    this.engine.watch.watchDispatch(occurrenceId, protocol, now);
    this.collector.flow('despacho.enviado', `Despachou ${protocol}.`, this.context, { protocol });
  }

  async scanSupport(now) {
    const requests = await this.officer.api.get('/attendances/support/requests');
    for (const request of requests.filter((r) => r.status === 'Pendente')) {
      const key = `apoio:${idOf(request._id)}`;
      if (this.handling.has(key)) continue;
      this.handling.add(key);
      this.enqueue({ at: now + responseDelayMs(), kind: 'autorizar', supportId: idOf(request._id), protocol: request.occurrence?.protocol });
    }
  }

  async authorize({ supportId, protocol }) {
    await this.officer.api.post(`/attendances/support/${supportId}/authorize`, {}, { tolerate: [409] });
    this.collector.flow('apoio.autorizado', `Autorizou apoio em ${protocol ?? 'ocorrência'}.`, this.context, { protocol });
  }

  beginLeave(at) {
    if (this.phase === 'encerrado') return;
    if (this.phase === 'em-servico' && this.shiftId) {
      // The holder of the shift keeps dispatching until the backend closes it by itself.
      this.phase = 'aguardando-fechamento';
      this.closePollAt = at;
      this.closeDeadline = at + CLOSE_WAIT_MAX_MS;
      return;
    }
    // Already logged in while still entering: leave properly so the session is closed.
    this.phase = this.phase === 'entrando' && !this.officer.api.cookie ? 'encerrado' : 'saindo';
    this.leaveAt = at;
  }

  /** Polls GET /cpu: the shift is closed when it is gone or replaced by another one. */
  async pollClose(now) {
    if (now >= this.closePollAt) {
      this.closePollAt = now + CLOSE_POLL_MS;
      try {
        const current = await this.officer.api.get('/cpu');
        this.lastPending = current?.pending ?? null;
        if (!current || idOf(current._id) !== this.shiftId) return await this.leave();
      } catch (error) {
        if (!(await this.officer.recover(error).catch(() => false))) this.unexpected(error, this.context);
      }
    }
    if (now >= this.closeDeadline) {
      const { attending = [], onDuty = [] } = this.lastPending ?? {};
      const protocols = attending.map((o) => o.protocol).join(', ') || 'nenhum';
      this.collector.event({ ...this.context, severity: 'alto', category: 'cpu-fechamento', message: `Turno do CPU não fechou em ${CLOSE_WAIT_MAX_MS / 60000} min: ${attending.length} atendimento(s) (${protocols}) e ${onDuty.length} guarnição(ões) em serviço.`, details: { pending: this.lastPending ?? null } });
      await this.leave();
    }
  }

  /** After the close, the CPU officer reports what the shift produced, from the SRGOP shift report. */
  async reportShift() {
    if (!this.shiftId) return;
    const day = this.day;
    try {
      await this.officer.ensureSession();
      const report = await this.officer.api.get(`/reports/cpu-shifts/${this.shiftId}`);
      const account = this.officer.account;
      const summary = summarizeCpuShift(report, { cpu: { name: account.name, rank: account.rank } });
      summary.end ??= new Date().toISOString();
      const dir = path.join(config.dataDir, 'relatorios', 'turnos');
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, `turno-${day}.json`), JSON.stringify(summary, null, 2));
      writeFileSync(path.join(dir, `turno-${day}.html`), renderShiftReport(summary));
      this.collector.flow('cpu.relatorio', shiftHeadline(summary), this.context, { day, ...summary.occurrences, ...summary.staff, ...summary.results, seizures: undefined });
    } catch (error) {
      this.collector.event({ ...this.context, severity: 'medio', category: 'relatorio-turno', message: `CPU não conseguiu gerar o relatório do turno ${day}: ${error.message}` });
    }
  }

  async leave() {
    await this.reportShift();
    await this.officer.logout();
    this.phase = 'encerrado';
    this.collector.flow('cpu.saiu', 'Passou o CPU ao oficial seguinte.', this.context);
  }

  async reconcile() {
    if (!this.dispatching && this.phase !== 'saindo') return;
    await this.officer.ensureSession();
    this.handling.clear();
  }

  async shutdown() {
    if (this.dispatching || this.phase === 'saindo') await this.reportShift();
    await this.officer.logout().catch(() => {});
    this.phase = 'encerrado';
  }
}
