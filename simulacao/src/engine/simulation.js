import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { CrewTeam } from '../actors/crew.js';
import { CpuActor } from '../actors/cpu.js';
import { Officer } from '../actors/officer.js';
import { NotificationWatch } from './watch.js';
import { OccurrenceScheduler } from './scheduler.js';
import { HealthMonitor } from './health.js';
import { serviceDay, teamFor, officerIndexFor, localTime } from '../lib/time.js';
import { between, pick, minutes, sleep } from '../lib/random.js';
import { buildChecklist, shiftDistance } from '../domain/checklist.js';
import { buildSnapshot, writeSnapshot } from './snapshot.js';
import { pickServiceUnit } from '../domain/service-cities.js';

const TICK_MS = 10000;
const WRAP_UP_LIMIT_MS = minutes(45);
const MANUAL_END = 'encerrada manualmente';
const BACKLOG_RETRY_MS = minutes(5);
const BACKLOG_TRIES = 4;

const distance = (a, b) => Math.hypot(a.latitude - b.latitude, a.longitude - b.longitude);

export class Simulation {
  constructor({ collector, state, world, factory, browsers, reports }) {
    Object.assign(this, { collector, state, world, factory, browsers, reports });
    this.watch = new NotificationWatch(collector);
    this.scheduler = new OccurrenceScheduler({ min: config.minPerHour, max: config.maxPerHour });
    this.health = new HealthMonitor({ collector, onDown: (r) => this.autoPause(r), onUp: () => this.autoResume() });
    this.teams = new Map();
    this.leaving = [];
    this.backlog = [];
    this.deferredCalls = 0; // calls drawn before any city had its crew in service
    this.cpu = null;
    this.day = null;
    this.stopping = false;
    this.abort = new AbortController();
    this.controlFile = path.join(config.dataDir, 'controle.json');
    this.nextFlush = 0;
  }

  // ── Queries used by the actors ────────────────────────────────────
  teamForCity(cityId) {
    return this.teams.get(String(cityId));
  }

  /**
   * The only case in which a crew leaves its own city: a support request from another city.
   * Picks the nearest free crew; ordinary dispatches always stay with the city's own crew.
   */
  supportCandidate(team) {
    const origin = team.city;
    return [...this.teams.values()]
      .filter((t) => t !== team && t.available)
      .sort((x, y) => distance(x.city, origin) - distance(y.city, origin))[0] ?? null;
  }

  expectCpuNotice(occurrenceId, protocol, now) {
    if (this.cpu?.dispatching) this.watch.expectCpuNotice(occurrenceId, protocol, now);
  }

  get actors() {
    return [...this.teams.values(), this.cpu, ...this.leaving].filter((a) => a && a.phase !== 'encerrado');
  }

  // ── Service days ──────────────────────────────────────────────────
  startDay(day, now, initial) {
    this.day = day;
    const team = teamFor(day);
    const [min, max] = initial ? [0, 3] : [0, 20];
    for (const unit of this.world.units)
      this.teams.set(unit.city._id, new CrewTeam({ engine: this, ...unit, team, accounts: unit.accounts.filter((a) => a.team === team), enterAt: now + minutes(between(min, max)) }));
    const officer = this.world.officers[officerIndexFor(day)];
    this.cpu = new CpuActor({ engine: this, account: officer, enterAt: now + minutes(initial ? 0 : between(0, 10)) });
    this.collector.flow('servico.troca', `Serviço de ${day}: equipe ${team} nas ${this.world.units.length} cidades e ${officer.name} no CPU.`, {}, { day, team });
    this.browsers?.assign(day, this);
  }

  rotate(day, now) {
    for (const team of this.teams.values()) {
      team.beginLeave(now);
      this.leaving.push(team);
    }
    if (this.cpu) {
      this.cpu.beginLeave(now);
      this.leaving.push(this.cpu);
    }
    this.teams = new Map();
    this.startDay(day, now, false);
  }

  /** On a process restart, drivers of the previous team may still owe the hand-over checklist. */
  async recoverPreviousDrivers(day) {
    const previous = teamFor(new Date(Date.parse(`${day}T12:00:00Z`) - 86400000).toISOString().slice(0, 10));
    for (const unit of this.world.units) {
      const account = unit.accounts.find((a) => a.team === previous && a.duty === 'motorista');
      const driver = new Officer(account, { collector: this.collector, cityName: unit.city.name });
      try {
        await driver.login();
        for (const record of await driver.api.get('/vehicle-checklists/pending')) {
          await driver.api.post(`/vehicle-checklists/${record._id}`, buildChecklist((record.vehicle?.mileage ?? 0) + shiftDistance()));
          this.collector.flow('checklist.entrega', 'Entrega pendente concluída após reinício do simulador.', driver.context);
        }
      } catch {
        /* recorded by the client */
      } finally {
        await driver.logout();
      }
    }
  }

  // ── Occurrences ───────────────────────────────────────────────────
  spawn() {
    const unit = pickServiceUnit(this.world.units, (cityId) => this.teamForCity(cityId));
    // No city in service yet: the call is held until the first crew enters service.
    if (!unit) {
      this.deferredCalls++;
      return;
    }
    this.factory
      .create(unit.city)
      .then((scenario) => this.route({ scenario, targetCity: unit.city, tries: 0 }))
      .catch((error) => this.collector.event({ severity: 'baixo', category: 'simulador', message: `Falha ao gerar cenário: ${error.message}` }));
  }

  /** Held calls go out one per tick once some city is in service, so they do not arrive in a burst. */
  releaseDeferred() {
    if (!this.deferredCalls || !pickServiceUnit(this.world.units, (cityId) => this.teamForCity(cityId))) return;
    this.deferredCalls--;
    this.spawn();
  }

  route(call) {
    const now = Date.now();
    const task = { at: now, kind: 'registrar', scenario: call.scenario, targetCity: call.targetCity };
    const home = this.teamForCity(call.targetCity._id);
    const draw = Math.random();
    if (draw < config.cpuCreatedRate && this.cpu?.dispatching) return this.cpu.enqueue(task);
    if (draw < config.cpuCreatedRate + config.otherCityRate) {
      const reporter = pick([...this.teams.values()].filter((t) => t.available && t !== home));
      if (reporter) return reporter.enqueue({ ...task, at: now + minutes(between(0, 2)) });
    }
    if (home?.available) return home.enqueue(task);
    if (this.cpu?.dispatching) {
      this.collector.flow('roteamento.cpu', `Guarnição de ${call.targetCity.name} ocupada ou fora de serviço; chamado registrado pelo CPU.`);
      return this.cpu.enqueue(task);
    }
    if (call.tries + 1 >= BACKLOG_TRIES) {
      this.collector.event({ severity: 'baixo', category: 'simulador', message: `Chamado para ${call.targetCity.name} descartado: ninguém em serviço para registrar.` });
      return;
    }
    this.backlog.push({ ...call, tries: call.tries + 1, retryAt: now + BACKLOG_RETRY_MS });
  }

  retryBacklog(now) {
    const due = this.backlog.filter((c) => c.retryAt <= now);
    this.backlog = this.backlog.filter((c) => c.retryAt > now);
    due.forEach((call) => this.route(call));
  }

  // ── Pause / resume / control ──────────────────────────────────────
  async autoPause(reason) {
    const now = Date.now();
    if (this.state.pause(`Indisponibilidade: ${reason}`, now, { automatic: true }))
      this.collector.event({ severity: 'critico', category: 'indisponibilidade', message: `Sistema indisponível (${reason}). Simulação pausada às ${localTime(now)}.` });
  }

  async autoResume() {
    if (!this.state.data.pause?.automatic) return;
    if (!config.autoResume) {
      this.collector.event({ severity: 'info', category: 'indisponibilidade', message: 'Sistema voltou a responder. Aguardando "npm run retomar".' });
      return;
    }
    await this.resume('automática');
  }

  async resume(how) {
    const now = Date.now();
    const record = this.state.resume(now);
    if (!record) return;
    this.health.reset();
    this.collector.resetRecent();
    this.watch.clear();
    this.scheduler.reset();
    const minutesDown = Math.round(record.durationMs / 60000);
    this.collector.event({ severity: record.automatic ? 'alto' : 'info', category: record.automatic ? 'indisponibilidade' : 'controle', message: `Simulação retomada (${how}) após ${minutesDown} min parada: ${record.reason}.`, details: { durationMs: record.durationMs, automatic: record.automatic } });
    for (const actor of this.actors) await actor.reconcile(now).catch((error) => actor.unexpected(error));
  }

  async applyControl(now) {
    if (!existsSync(this.controlFile)) return;
    let command;
    try {
      command = JSON.parse(readFileSync(this.controlFile, 'utf8')).comando;
    } finally {
      rmSync(this.controlFile, { force: true });
    }
    if (command === 'pausar' && this.state.pause('Pausa manual', now))
      this.collector.event({ severity: 'info', category: 'controle', message: 'Simulação pausada manualmente.' });
    if (command === 'retomar') await this.resume('manual');
    if (command === 'encerrar') await this.finishNow(now, MANUAL_END);
  }

  // ── Main loop ─────────────────────────────────────────────────────
  async run({ restarted }) {
    if (this.state.data.status === 'finalizado') return this.idleFinished();
    const now = Date.now();
    if (restarted) {
      this.state.markRestart(now);
      this.collector.event({ severity: 'info', category: 'controle', message: `Simulador reiniciado; retomando de onde parou (${Math.round(this.state.data.activeMs / 3600000)}h de teste já cumpridas).` });
    } else this.collector.flow('simulacao.inicio', `Simulação iniciada: ${config.days} dia(s), ${this.world.units.length} cidades.`);
    // Restarted during an automatic pause: start in "down" so recovery is still detected.
    if (this.state.data.pause?.automatic) this.health.down = true;
    this.startDay(serviceDay(now), now, true);
    this.recoverPreviousDrivers(this.day).catch((error) => this.collector.event({ severity: 'baixo', category: 'simulador', message: `Falha ao recuperar entregas pendentes: ${error.message}` }));
    const pendingEnd = this.state.data.wrapUp;
    if (pendingEnd?.reason === MANUAL_END) await this.finishNow(now, MANUAL_END);
    else if (pendingEnd) this.beginWrapUp(now, pendingEnd.reason);
    for (const signal of ['SIGTERM', 'SIGINT'])
      process.once(signal, () => {
        this.stopping = true;
        this.abort.abort();
      });
    while (!this.stopping) {
      await this.tick(Date.now()).catch((error) => this.collector.event({ severity: 'baixo', category: 'simulador', message: `Falha no ciclo: ${error.message}`, details: { stack: error.stack } }));
      await sleep(TICK_MS, this.abort.signal);
    }
    this.state.save();
    this.collector.flushMetrics();
    await this.browsers?.close();
  }

  async tick(now) {
    await this.applyControl(now);
    await this.health.check(now);
    this.state.tick(now);
    if (now >= this.nextFlush) {
      this.collector.flushMetrics();
      this.state.pruneOccurrences(now);
      this.nextFlush = now + 60000;
    }
    this.state.save();
    this.publishSnapshot(now);
    if (!this.state.running) return;
    if (this.wrapUpSince) return this.wrapUp(now);
    const day = serviceDay(now);
    if (day !== this.day) this.rotate(day, now);
    for (let due = this.scheduler.due(now); due > 0; due--) this.spawn();
    this.releaseDeferred();
    this.retryBacklog(now);
    this.watch.check(now);
    this.leaving = this.leaving.filter((a) => a.phase !== 'encerrado');
    for (const actor of this.actors) actor.run(now);
    this.browsers?.tick(now);
    this.reports?.daily(now, this.day);
    if (this.state.isComplete()) this.beginWrapUp(now, 'duração configurada concluída');
  }

  /** Live view for the local panel; a failure here never stops the test. */
  publishSnapshot(now) {
    try {
      writeSnapshot(config.dataDir, buildSnapshot(this, now));
    } catch (error) {
      this.collector.event({ severity: 'baixo', category: 'simulador', message: `Falha ao atualizar o painel: ${error.message}` });
    }
  }

  /** Mid-shift end of the test: the CPU officer formally closes the crew's shift. */
  async endShiftEarly(team) {
    const officer = this.closingCpu?.officer;
    if (!officer) return;
    // After a restart the CPU officer may not be logged in yet.
    if (!officer.api.cookie) await officer.login().catch(() => {});
    if (!officer.api.cookie) return;
    await officer.api.post(`/crews/${team.crewId}/end-shift`, { reason: 'Encerramento da simulação de testes.' }, { tolerate: [409] }).catch(() => {});
  }

  beginWrapUp(now, reason) {
    if (this.wrapUpSince) return;
    this.wrapUpSince = now;
    this.wrapUpReason = reason;
    // Persisted so a restart during the wrap-up does not resume the whole test.
    this.state.setWrapUp(now, reason);
    this.state.save();
    this.collector.flow('simulacao.encerrando', `Encerrando a simulação (${reason}).`);
    for (const team of this.teams.values()) team.beginLeave(now, { early: true });
    this.leaving.push(...this.teams.values());
    this.closingCpu = this.cpu;
    this.teams = new Map();
    this.cpu = null;
  }

  async wrapUp(now) {
    this.leaving = this.leaving.filter((a) => a && a.phase !== 'encerrado');
    for (const actor of [...this.leaving, this.closingCpu].filter(Boolean)) actor.run(now);
    if (this.leaving.length && now - this.wrapUpSince < WRAP_UP_LIMIT_MS) return;
    await Promise.allSettled([...this.leaving, this.closingCpu].filter(Boolean).map((a) => a.shutdown()));
    await this.complete(now);
  }

  /**
   * "Encerrar": ends the test right away. Every actor stops, open attendances are closed at
   * once, the CPU ends each crew's shift, everyone logs out and the final report is written.
   */
  async finishNow(now, reason) {
    if (this.finishing || this.state.data.status === 'finalizado') return;
    this.finishing = true;
    this.wrapUpReason = reason;
    this.state.setWrapUp(now, reason);
    this.state.save();
    this.collector.flow('simulacao.encerrando', `Encerrando a simulação imediatamente (${reason}).`);
    this.closingCpu = this.closingCpu ?? this.cpu;
    const actors = [...new Set([...this.teams.values(), ...this.leaving, this.cpu, this.closingCpu])].filter(Boolean);
    await Promise.all(actors.map((a) => a.freeze()));
    const crews = actors.filter((a) => typeof a.finishNow === 'function');
    await Promise.allSettled(crews.map((team) => team.finishNow(Date.now())));
    // The CPU officer leaves last: it is the one who ends the crews' shifts.
    await Promise.allSettled(actors.filter((a) => !crews.includes(a)).map((a) => a.shutdown()));
    this.teams = new Map();
    this.leaving = [];
    await this.complete(Date.now());
  }

  async complete(now) {
    this.state.finish(now);
    this.state.save();
    this.publishSnapshot(now);
    this.collector.flow('simulacao.fim', `Simulação finalizada (${this.wrapUpReason}).`);
    this.collector.flushMetrics();
    await this.browsers?.close();
    await this.reports?.final();
    this.stopping = true;
  }

  /** Keeps the container alive (restart policy) without running anything after the end. */
  async idleFinished() {
    console.log('Simulação já finalizada. Relatório em dados/relatorios/. Use "npm run relatorio" para gerar de novo.');
    // A signal listener alone does not keep the event loop alive; the timer does.
    await new Promise((resolve) => {
      const keepAlive = setInterval(() => {}, 3_600_000);
      const stop = () => {
        clearInterval(keepAlive);
        resolve();
      };
      process.once('SIGTERM', stop);
      process.once('SIGINT', stop);
    });
  }
}
