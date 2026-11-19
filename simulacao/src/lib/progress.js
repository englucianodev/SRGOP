// Progress of "Preparar efetivo" (npm run seed) for the panel's Preparação tab:
// dados/preparacao.json with each city and each account. E-mails stay out of the file.
import { writeFileSync, renameSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export class PrepProgress {
  constructor(dataDir) {
    this.file = path.join(dataDir, 'preparacao.json');
    this.dataDir = dataDir;
    this.keys = new Map(); // e-mail → index, kept in memory only
    this.data = null;
  }

  start(cityNames, accounts) {
    this.keys = new Map(accounts.map((a, i) => [a.email, i]));
    this.data = {
      status: 'executando',
      startedAt: new Date().toISOString(),
      cities: cityNames.map((name) => ({ name, status: 'pendente' })),
      accounts: accounts.map(({ name, rank, duty, team, city }) => ({ name, rank, duty, team: team ?? null, city, result: 'pendente' })),
    };
    this.save();
  }

  city(name, status) {
    const row = this.data?.cities.find((c) => c.name === name);
    if (row) row.status = status;
    this.save();
  }

  /** result: criada | atualizada | existente */
  account(email, result) {
    const row = this.data?.accounts[this.keys.get(email)];
    if (row) row.result = result;
    this.save();
  }

  finish(error = null) {
    if (!this.data) return;
    Object.assign(this.data, { status: error ? 'falhou' : 'concluida', finishedAt: new Date().toISOString(), error: error?.message ?? null });
    this.save();
  }

  save() {
    if (!this.data) return;
    try {
      mkdirSync(this.dataDir, { recursive: true });
      writeFileSync(`${this.file}.tmp`, JSON.stringify(this.data));
      renameSync(`${this.file}.tmp`, this.file);
    } catch {
      /* progress is only a view; the seed itself must not fail because of it */
    }
  }
}
