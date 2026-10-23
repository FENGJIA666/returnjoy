import fs from 'node:fs/promises';
import path from 'node:path';
import { makeCases } from './policy.js';

export class Store {
  constructor(file) { this.file = file; this.state = { version: 1, cases: makeCases() }; this.locks = new Map(); this.writes = Promise.resolve(); }
  async init() {
    if (!this.file) return this;
    try { this.state = JSON.parse(await fs.readFile(this.file, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; await this.save(); }
    return this;
  }
  save() {
    if (!this.file) return Promise.resolve();
    const snapshot = JSON.stringify(this.state, null, 2);
    this.writes = this.writes.then(async () => { await fs.mkdir(path.dirname(this.file), { recursive: true }); await fs.writeFile(`${this.file}.tmp`, snapshot, { mode: 0o600 }); await fs.rename(`${this.file}.tmp`, this.file); });
    return this.writes;
  }
  async lock(key, action) {
    const prior = this.locks.get(key) || Promise.resolve();
    let release;
    const current = new Promise(resolve => { release = resolve; });
    this.locks.set(key, current);
    await prior;
    try { return await action(); }
    finally { release(); if (this.locks.get(key) === current) this.locks.delete(key); }
  }
}
