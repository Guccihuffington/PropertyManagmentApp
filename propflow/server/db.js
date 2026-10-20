// Builds SQLite tables straight from schema.dbml so your DBML stays the source of truth.
import { DatabaseSync } from 'node:sqlite';  // built into Node 22.13+, no native install needed
import fs from 'node:fs';

const TYPES = { int: 'INTEGER', decimal: 'REAL', boolean: 'INTEGER' };

export function dbmlToSql(src) {
  const out = []; let t = null, idx = false, m;
  for (let line of src.split('\n')) {
    line = line.trim();
    if (!line || line.startsWith('//')) continue;
    if ((m = line.match(/^Table (\w+) \{/))) { t = { name: m[1], defs: [], extra: [] }; continue; }
    if (!t) continue;
    if (line === 'indexes {') { idx = true; continue; }
    if (line === '}') {
      if (idx) idx = false;
      else { out.push(`CREATE TABLE IF NOT EXISTS ${t.name} (${[...t.defs, ...t.extra].join(', ')});`); t = null; }
      continue;
    }
    if (idx) { m = line.match(/^\((.+)\) \[(unique|pk)\]/); t.extra.push(`${m[2] === 'pk' ? 'PRIMARY KEY' : 'UNIQUE'} (${m[1]})`); continue; }
    const [, name, type, opts = ''] = line.match(/^(\w+) (\w+)(?:\([\d,]+\))?(?: \[(.*)\])?$/);
    let sql = `${name} ${TYPES[type] || 'TEXT'}`;
    if (opts.includes('increment')) sql = `${name} INTEGER PRIMARY KEY AUTOINCREMENT`;
    else {
      if (opts.includes('pk')) sql += ' PRIMARY KEY';
      if (opts.includes('not null')) sql += ' NOT NULL';
      if (opts.includes('unique')) sql += ' UNIQUE';
    }
    const d = opts.match(/default: (\w+)/);
    if (d) sql += ` DEFAULT ${d[1] === 'false' ? 0 : d[1] === 'true' ? 1 : d[1]}`;
    const r = opts.match(/ref: > (\w+)\.(\w+)/);
    if (r) sql += ` REFERENCES ${r[1]}(${r[2]})`;
    t.defs.push(sql);
  }
  return out.join('\n');
}

export const db = new DatabaseSync(process.env.DB_FILE || new URL('./propflow.db', import.meta.url).pathname);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
db.exec(dbmlToSql(fs.readFileSync(new URL('./schema.dbml', import.meta.url), 'utf8')));

// all-or-nothing wrapper: db.transaction(fn)(...args). Safe to nest; only the outermost call commits.
let depth = 0;
db.transaction = (fn) => (...args) => {
  if (depth++ === 0) db.exec('BEGIN');
  try { const r = fn(...args); if (--depth === 0) db.exec('COMMIT'); return r; }
  catch (e) { if (--depth === 0) db.exec('ROLLBACK'); throw e; }
};

export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const get = (sql, ...p) => db.prepare(sql).get(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);
