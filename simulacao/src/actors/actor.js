/**
 * Base of every simulated actor: a time-ordered task queue processed by `step(now)`.
 * The engine calls `run(now)` on each tick; a slow API call never blocks other actors
 * because each actor runs at most one step at a time.
 */
export class Actor {
  constructor(collector) {
    this.collector = collector;
    this.tasks = [];
    this.busy = false;
    this.frozen = false;
  }

  /** Stops new steps and waits (up to `timeoutMs`) for the one in progress to finish. */
  async freeze(timeoutMs = 30000) {
    this.frozen = true;
    const until = Date.now() + timeoutMs;
    while (this.busy && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 100));
  }

  enqueue(task) {
    this.tasks = [...this.tasks, task].sort((a, b) => a.at - b.at);
  }

  takeDue(now) {
    const due = this.tasks.filter((t) => t.at <= now);
    this.tasks = this.tasks.filter((t) => t.at > now);
    return due;
  }

  dropTasks(kind) {
    const dropped = this.tasks.filter((t) => t.kind === kind);
    this.tasks = this.tasks.filter((t) => t.kind !== kind);
    return dropped;
  }

  run(now) {
    if (this.busy || this.frozen) return;
    this.busy = true;
    this.step(now)
      .catch((error) => this.unexpected(error))
      .finally(() => {
        this.busy = false;
      });
  }

  /** API errors are already recorded by the client; anything else is a simulator fault. */
  unexpected(error, context = {}) {
    if (error?.status !== undefined) return;
    this.collector.event({ ...context, severity: 'baixo', category: 'simulador', message: `Falha interna do simulador: ${error?.message}`, details: { stack: error?.stack } });
  }

  async step() {
    throw new Error('step() não implementado');
  }
}
