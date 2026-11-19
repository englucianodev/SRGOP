import { Actor } from './actor.js';
import { Officer } from './officer.js';
import { config } from '../config.js';
import { buildChecklist, shiftDistance } from '../domain/checklist.js';
import { between, intBetween, minutes } from '../lib/random.js';
import { registerOccurrence, evaluateDispatch, progressAttendance, reconcileAttendance, closeAttendanceNow } from './attendance.js';
import { responseDelayMs } from '../domain/timing.js';

const RETRY_MS = minutes(2);
const LATE_ENTRY_MS = minutes(40);
const RETURN_TIMEOUT_MS = minutes(20);
const EXPIRED_TITLE = 'Turno encerrado';
const memberIds = (crew) => (crew?.members ?? []).map((m) => String(m._id ?? m));

/**
 * One team (commander + driver) of a city's crew during its 24 h shift: entry with the
 * vehicle checklist, routine (GPS, activity, reads), occurrences and the hand-over at 8 h.
 */
export class CrewTeam extends Actor {
  constructor({ engine, city, crewId, vehicleId, team, accounts, enterAt }) {
    super(engine.collector);
    Object.assign(this, { engine, city, crewId, vehicleId, team });
    const options = { collector: engine.collector, cityName: city.name };
    this.commander = new Officer(accounts.find((a) => a.duty === 'comandante'), options);
    this.driver = new Officer(accounts.find((a) => a.duty === 'motorista'), options);
    this.phase = 'entrando';
    this.stage = 'login';
    this.retryAt = enterAt;
    this.enterSince = enterAt;
    this.dutySince = enterAt; // when the team actually entered service (set in onDuty)
    this.warned = new Set();
    this.attendance = null;
    this.position = { latitude: city.latitude, longitude: city.longitude };
    this.next = { gps: 0, ping: 0, read: 0 };
    this.seenDispatches = new Set();
    this.expiredSeen = new Set();
    const onDispatch = (payload) => this.dispatchSeen(String(payload?.occurrenceId), payload?.kind, 'tempo-real');
    this.commander.on('dispatch:new', onDispatch);
    this.driver.on('dispatch:new', onDispatch);
  }

  get label() {
    return `${this.city.name}/${this.team}`;
  }

  /** Free to take a new occurrence right now. */
  get available() {
    return this.phase === 'em-servico' && !this.attendance;
  }

  dispatchSeen(occurrenceId, kind, via) {
    if (!occurrenceId || this.seenDispatches.has(occurrenceId)) return;
    this.seenDispatches.add(occurrenceId);
    this.engine.watch.noteDispatchReceived(occurrenceId, via);
    if (kind === 'apoio') {
      this.collector.flow('apoio.recebido', 'Recebeu aviso de apoio autorizado.', this.commander.context, { occurrenceId });
      return;
    }
    this.enqueue({ at: Date.now() + responseDelayMs(), kind: 'avaliar-despacho', occurrenceId });
  }

  async step(now) {
    if (this.phase === 'entrando') return this.enterStep(now);
    if (this.phase === 'encerrado') return;
    // A team that never got into service has nothing to keep alive; it only logs out.
    if (!this.neverServed) {
      for (const task of this.takeDue(now)) await this.runTask(task, now);
      await this.routine(now);
      await this.attend(now);
    }
    if (this.phase === 'saindo' && !this.attendance) await this.leaveStep(now);
  }

  async runTask(task, now) {
    try {
      if (task.kind === 'registrar') await registerOccurrence(this, task, now);
      if (task.kind === 'avaliar-despacho') await evaluateDispatch(this, task.occurrenceId, now);
    } catch (error) {
      if (await this.commander.recover(error)) this.enqueue({ ...task, at: now + minutes(1) });
      else this.unexpected(error, this.commander.context);
    }
  }

  async attend(now) {
    try {
      await progressAttendance(this, now);
    } catch (error) {
      if (!(await this.commander.recover(error))) this.unexpected(error, this.commander.context);
    }
  }

  // ── Entry into service ────────────────────────────────────────────
  async enterStep(now) {
    if (now < this.retryAt) return;
    this.retryAt = now + RETRY_MS;
    try {
      if (this.stage === 'login') {
        await this.driver.login();
        await this.commander.login();
        this.stage = 'liberacao';
      }
      if (this.stage === 'liberacao') await this.waitForCrew(now);
      if (this.stage === 'recebimento') await this.receiveVehicle(now);
      if (this.stage === 'ingresso') await this.commanderJoins(now);
    } catch (error) {
      if (!(await this.driver.recover(error))) this.unexpected(error, this.driver.context);
    }
  }

  warnOnce(key, now, limitMs, event) {
    if (this.warned.has(key) || now - this.enterSince < limitMs) return;
    this.warned.add(key);
    this.collector.event({ ...this.driver.context, ...event });
  }

  async waitForCrew(now) {
    const crew = (await this.driver.api.get('/crews')).find((c) => String(c._id) === String(this.crewId));
    if (!crew) throw new Error(`Guarnição ${this.crewId} não encontrada (rode o seed).`);
    const members = memberIds(crew);
    if (members.includes(String(this.driver.id))) {
      this.stage = members.includes(String(this.commander.id)) ? 'pronto' : 'ingresso';
      if (this.stage === 'pronto') return this.onDuty(now, 'retomado');
      return;
    }
    if (!members.length && !crew.currentOccurrence) {
      this.stage = 'recebimento';
      return;
    }
    this.warnOnce('liberacao', now, LATE_ENTRY_MS, { severity: 'alto', category: 'troca-de-servico', message: `Equipe que entra não consegue assumir: a guarnição ainda está ocupada ${Math.round((now - this.enterSince) / 60000)} min após o início do serviço.`, details: { status: crew.status, members: members.length, currentOccurrence: Boolean(crew.currentOccurrence) } });
  }

  async completePendingChecklists(extraKm = 0) {
    const pending = await this.driver.api.get('/vehicle-checklists/pending');
    for (const record of pending) {
      const mileage = (record.vehicle?.mileage ?? 0) + extraKm;
      await this.driver.api.post(`/vehicle-checklists/${record._id}`, buildChecklist(mileage));
      this.collector.flow(record.pendingReturn ? 'checklist.entrega' : 'checklist.recebimento', `Checklist ${record.pendingReturn ? 'de entrega' : 'de recebimento'} da viatura ${record.vehicle?.prefix ?? ''}.`, this.driver.context, { km: mileage });
    }
    return pending.length;
  }

  async receiveVehicle(now) {
    await this.completePendingChecklists();
    const { mileage } = await this.driver.api.get(`/vehicle-checklists/defaults?vehicle=${this.vehicleId}`);
    try {
      await this.driver.api.post(`/crews/${this.crewId}/join`, { driver: true, checklist: buildChecklist(mileage) }, { tolerate: [409] });
    } catch (error) {
      if (error.status !== 409) throw error;
      this.warnOnce('recebimento', now, minutes(15), { severity: 'medio', category: 'checklist-viatura', message: `Motorista não consegue receber a viatura há ${Math.round((now - this.enterSince) / 60000)} min: ${error.message}` });
      return;
    }
    this.collector.flow('checklist.recebimento', `Recebeu a viatura com checklist (${mileage} km).`, this.driver.context, { km: mileage });
    this.stage = 'ingresso';
    await this.commanderJoins(now);
  }

  async commanderJoins(now) {
    await this.commander.api.post(`/crews/${this.crewId}/join`, { driver: false });
    this.onDuty(now, 'normal');
  }

  async onDuty(now, mode) {
    this.phase = 'em-servico';
    this.stage = 'pronto';
    this.dutySince = now;
    const delayMin = Math.round((now - this.enterSince) / 60000);
    this.collector.flow('turno.inicio', `Equipe ${this.team} em serviço (${delayMin} min após a chamada).`, this.commander.context, { team: this.team, delayMin, mode });
    if (mode === 'retomado') await reconcileAttendance(this, now);
  }

  // ── Routine while on duty ─────────────────────────────────────────
  async routine(now) {
    const tasks = [];
    if (this.phase === 'em-servico' && now >= this.next.gps) {
      this.next.gps = now + config.gpsIntervalMs;
      tasks.push([this.commander, this.sendGps()]);
    }
    if (now >= this.next.ping) {
      this.next.ping = now + minutes(between(4, 5));
      tasks.push([this.commander, this.commander.ping()], [this.driver, this.driver.ping()]);
    }
    if (now >= this.next.read) {
      this.next.read = now + minutes(between(3, 6));
      tasks.push([this.commander, this.readScreens()]);
    }
    const results = await Promise.allSettled(tasks.map(([, promise]) => promise));
    for (const [index, result] of results.entries())
      if (result.status === 'rejected') await tasks[index][0].recover(result.reason).catch(() => {});
  }

  async sendGps() {
    const anchor = this.attendance?.scenario ?? this.city;
    const drift = this.attendance ? 0.0008 : 0.004;
    this.position = {
      latitude: Number((anchor.latitude + between(-drift, drift)).toFixed(6)),
      longitude: Number((anchor.longitude + between(-drift, drift)).toFixed(6)),
    };
    await this.commander.api.patch(`/crews/${this.crewId}/gps`, { enabled: true, ...this.position, accuracy: intBetween(5, 30) });
    this.gpsAt = Date.now(); // the panel map shows how fresh the last accepted fix is
  }

  /** What the officer sees on screen; also catches dispatches missed by real time. */
  async readScreens(now = Date.now()) {
    const [open, notifications] = await Promise.all([this.commander.api.get('/attendances'), this.commander.api.get('/notifications')]);
    this.noticeShiftExpiry(notifications, now);
    for (const row of open)
      if (row.status === 'Despachada' && String(row.crew?._id ?? row.crew) === String(this.crewId))
        this.dispatchSeen(String(row._id), 'despacho', 'consulta');
  }

  /**
   * The server tells a crew still attending past its shift to hurry (title "Turno encerrado").
   * The CPU's own overtime alert shares the kind but has another title and is ignored here.
   */
  noticeShiftExpiry(notifications, now) {
    const fresh = (Array.isArray(notifications) ? notifications : []).filter(
      (n) => n.kind === 'turno-expirado' && n.title === EXPIRED_TITLE && !n.read && Date.parse(n.createdAt) >= this.dutySince && !this.expiredSeen.has(String(n._id)),
    );
    if (!fresh.length) return;
    for (const n of fresh) this.expiredSeen.add(String(n._id));
    if (this.attendance) this.attendance.dueAt = Math.min(this.attendance.dueAt, now + minutes(between(1, 3)));
    this.collector.flow('turno.expirado', 'Turno encerrou com atendimento aberto; equipe agiliza o encerramento.', this.commander.context, { team: this.team });
  }

  // ── Hand-over at 8 h ──────────────────────────────────────────────
  /** `early`: the simulation ends mid-shift, so the CPU must close the shift on the server. */
  beginLeave(now, { early = false } = {}) {
    if (this.phase === 'encerrado') return;
    this.neverServed = this.phase === 'entrando' && this.stage !== 'ingresso';
    this.early = early && !this.neverServed;
    this.phase = 'saindo';
    this.leaveSince = now;
    this.dropTasks('registrar');
    // Manual wrap-up keeps the closing short; the normal end of a shift leaves time to finish the work.
    const finishWithin = early ? minutes(between(5, 15)) : minutes(between(20, 40));
    if (this.attendance) this.attendance.dueAt = Math.min(this.attendance.dueAt, now + finishWithin);
  }

  async leaveStep(now) {
    if (now < (this.leaveRetryAt ?? 0)) return;
    this.leaveRetryAt = now + minutes(1);
    try {
      if (this.early) {
        await this.engine.endShiftEarly(this);
        this.early = false;
      }
      if (!this.neverServed) {
        if (!this.driver.api.cookie) await this.driver.login();
        const done = await this.completePendingChecklists(shiftDistance());
        const waited = now - this.leaveSince;
        if (!done && waited < RETURN_TIMEOUT_MS) return;
        if (!done)
          this.collector.event({ ...this.driver.context, severity: 'alto', category: 'checklist-viatura', message: `Checklist de entrega não foi solicitado ao motorista ${Math.round(waited / 60000)} min após o fim do turno.` });
      }
    } catch (error) {
      if (!(await this.driver.recover(error))) this.unexpected(error, this.driver.context);
      if (now - this.leaveSince < RETURN_TIMEOUT_MS) return;
    }
    await Promise.all([this.commander.logout(), this.driver.logout()]);
    this.phase = 'encerrado';
    this.collector.flow('turno.fim', `Equipe ${this.team} encerrou o serviço.`, this.commander.context, { team: this.team });
  }

  /** After an outage: valid sessions, real-time links and the true open attendance. */
  async reconcile(now) {
    if (this.phase === 'entrando' || this.phase === 'encerrado') return;
    await this.commander.ensureSession();
    await this.driver.ensureSession();
    await reconcileAttendance(this, now);
  }

  /**
   * Manual end of the test: closes the open attendance at once (remaining notes are skipped),
   * has the CPU end the shift, hands the vehicle back in one try and logs out.
   */
  async finishNow(now) {
    if (this.phase === 'encerrado') return;
    const served = !(this.phase === 'entrando' && this.stage !== 'ingresso');
    this.phase = 'saindo';
    this.tasks = [];
    await closeAttendanceNow(this, now).catch(() => {});
    // Even a team still entering may hold an open shift in the system (restart mid-test).
    await this.engine.endShiftEarly(this).catch(() => {});
    if (served) {
      try {
        if (!this.driver.api.cookie) await this.driver.login();
        await this.completePendingChecklists(shiftDistance());
      } catch (error) {
        this.unexpected(error, this.driver.context);
      }
    }
    await Promise.allSettled([this.commander.logout(), this.driver.logout()]);
    this.phase = 'encerrado';
    if (served) this.collector.flow('turno.fim', `Equipe ${this.team} encerrou o serviço (fim imediato do teste).`, this.commander.context, { team: this.team });
  }

  async shutdown() {
    await closeAttendanceNow(this, Date.now()).catch(() => {});
    await Promise.allSettled([this.commander.logout(), this.driver.logout()]);
    this.phase = 'encerrado';
  }
}
