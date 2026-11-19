const DEADLINE_MS = 90000;
const FORGET_MS = 30 * 60000;

/**
 * Checks that real-time notices really arrive: dispatches must reach the crew and new
 * open occurrences must reach the CPU, both within 90 s.
 *
 * The server emits the socket event while handling the request, so the notice can arrive
 * before the HTTP response that lets us register the expectation. Such early notices are
 * remembered and matched when the expectation is registered.
 */
export class NotificationWatch {
  constructor(collector) {
    this.collector = collector;
    this.clear();
  }

  watchDispatch(occurrenceId, protocol, now) {
    const id = String(occurrenceId);
    this.dispatches.set(id, { protocol, at: now, received: false, late: false });
    const early = this.earlyDispatches.get(id);
    if (early) {
      this.earlyDispatches.delete(id);
      this.noteDispatchReceived(id, early.via, early.at);
    }
  }

  noteDispatchReceived(occurrenceId, via, at = Date.now()) {
    const id = String(occurrenceId);
    const entry = this.dispatches.get(id);
    if (!entry) {
      if (!this.earlyDispatches.has(id)) this.earlyDispatches.set(id, { via, at });
      return;
    }
    if (entry.received) return;
    entry.received = true;
    const latencyMs = Math.max(0, at - entry.at);
    this.collector.flow('despacho.recebido', `Guarnição percebeu o despacho de ${entry.protocol} (${via}).`, {}, { protocol: entry.protocol, latencyMs, via });
    if (via !== 'tempo-real' && !entry.late)
      this.collector.event({ severity: 'alto', category: 'tempo-real', message: `Despacho de ${entry.protocol} só foi percebido pela guarnição ao consultar a tela (sem aviso em tempo real).`, details: { latencyMs } });
  }

  expectCpuNotice(occurrenceId, protocol, now) {
    const id = String(occurrenceId);
    this.cpuNotices.set(id, { protocol, at: now, received: false, late: false });
    const early = this.earlyCpuNotices.get(id);
    if (early) {
      this.earlyCpuNotices.delete(id);
      this.noteCpuNotice(id, early.at);
    }
  }

  noteCpuNotice(occurrenceId, at = Date.now()) {
    const id = String(occurrenceId);
    const entry = this.cpuNotices.get(id);
    if (!entry) {
      if (!this.earlyCpuNotices.has(id)) this.earlyCpuNotices.set(id, { at });
      return;
    }
    if (entry.received) return;
    entry.received = true;
    this.collector.flow('cpu.notificado', `CPU recebeu aviso de ${entry.protocol}.`, {}, { protocol: entry.protocol, latencyMs: Math.max(0, at - entry.at) });
  }

  check(now) {
    this.expire(this.dispatches, now, (e) => `Aviso de despacho de ${e.protocol} não chegou à guarnição em ${DEADLINE_MS / 1000}s.`);
    this.expire(this.cpuNotices, now, (e) => `CPU não recebeu aviso em tempo real da ocorrência pendente ${e.protocol} em ${DEADLINE_MS / 1000}s.`);
    for (const early of [this.earlyDispatches, this.earlyCpuNotices])
      for (const [id, entry] of early) if (now - entry.at > FORGET_MS) early.delete(id);
  }

  expire(map, now, message) {
    for (const [id, entry] of map) {
      if (now - entry.at > FORGET_MS) map.delete(id);
      else if (!entry.received && !entry.late && now - entry.at > DEADLINE_MS) {
        entry.late = true;
        this.collector.event({ severity: 'alto', category: 'tempo-real', message: message(entry) });
      }
    }
  }

  /** Pauses would otherwise turn every pending notice into a false alarm. */
  clear() {
    this.dispatches = new Map();
    this.cpuNotices = new Map();
    this.earlyDispatches = new Map();
    this.earlyCpuNotices = new Map();
  }
}
