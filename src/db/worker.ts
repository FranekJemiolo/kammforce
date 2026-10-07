/// <reference lib="webworker" />
// All SQLite Wasm work happens here — never on the main thread.
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import yaml from 'js-yaml';
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema';
import type { HydrateResult, InitResult, WorkerRequest, WorkerResponse } from './types';

// The package's types don't export the DB class conveniently; keep it loose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

let db: Db | undefined;
let baseUrl = '/';

async function init(url: string): Promise<InitResult> {
  baseUrl = url.endsWith('/') ? url : `${url}/`;
  const sqlite3 = await sqlite3InitModule({ print: console.log, printErr: console.error });

  let storage: InitResult['storage'];
  if (sqlite3.oo1.OpfsDb) {
    db = new sqlite3.oo1.OpfsDb('/kammforce.sqlite3', 'c');
    storage = 'opfs';
  } else {
    console.warn('[db] OPFS unavailable (not cross-origin isolated?). Using transient in-memory DB.');
    db = new sqlite3.oo1.DB(':memory:', 'c');
    storage = 'memory';
  }

  db.exec('PRAGMA foreign_keys = ON;');
  const row = db.selectObject?.('PRAGMA user_version');
  const current = (row?.user_version as number | undefined) ?? 0;
  if (current < SCHEMA_VERSION) {
    db.exec(SCHEMA_SQL);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  }
  return { storage };
}

async function fetchText(path: string): Promise<string | null> {
  const res = await fetch(`${baseUrl}data/${path}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return res.text();
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface IndexFile {
  brands?: { brand: string; file: string }[];
}
interface MakeFile {
  brand: string;
  models?: Record<string, unknown>[];
}

async function hydrate(force = false): Promise<HydrateResult> {
  if (!db) throw new Error('DB not initialised');

  const indexText = await fetchText('_index.yaml');
  if (!indexText) return { skipped: true, motorcycles: count() };
  const index = (yaml.load(indexText) as IndexFile) ?? {};

  const texts: string[] = [indexText];
  const files: MakeFile[] = [];
  for (const b of index.brands ?? []) {
    const t = await fetchText(b.file);
    if (!t) continue;
    texts.push(t);
    files.push(yaml.load(t) as MakeFile);
  }

  // Skip rewriting the DB when the YAML content hasn't changed since last hydration.
  const hash = await sha256(texts.join('\n---\n'));
  const prev = db.selectValue("SELECT value FROM meta WHERE key = 'data_hash'");
  if (!force && prev === hash) return { skipped: true, motorcycles: count() };

  db.transaction(() => {
    // Reference data is read-only and fully derived from YAML, so rebuild it atomically
    // (also removes models deleted upstream).
    db.exec('DELETE FROM motorcycle_tire_fitments; DELETE FROM motorcycles;');
    const bike = db.prepare(
      `INSERT OR REPLACE INTO motorcycles
       (id, make, model, year, wheelbase_mm, rake_deg, trail_mm, cog_height_mm, mass_kg, max_mech_lean_deg, cog_source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const fit = db.prepare(
      'INSERT OR IGNORE INTO motorcycle_tire_fitments (motorcycle_id, position, tire_size) VALUES (?, ?, ?)',
    );
    try {
      for (const f of files) {
        for (const m of f.models ?? []) {
          bike
            .bind([
              m.id, f.brand, m.name, m.year,
              m.wheelbase_mm ?? null, m.rake_deg ?? null, m.trail_mm ?? null,
              m.cog_height_mm ?? null, m.mass_kg ?? null, m.max_mech_lean_deg ?? null,
              m.cog_source ?? null,
            ])
            .stepReset();
          for (const [key, pos] of [['compatible_front_tires', 'front'], ['compatible_rear_tires', 'rear']] as const) {
            for (const size of (m[key] as unknown[] | undefined) ?? []) {
              fit.bind([m.id, pos, String(size)]).stepReset();
            }
          }
        }
      }
    } finally {
      bike.finalize();
      fit.finalize();
    }
    db.exec({ sql: "INSERT OR REPLACE INTO meta (key, value) VALUES ('data_hash', ?)", bind: [hash] });
  });

  return { skipped: false, motorcycles: count() };
}

function count(): number {
  return Number(db?.selectValue('SELECT COUNT(*) FROM motorcycles') ?? 0);
}

function query(sql: string, bind?: unknown[]): unknown[] {
  if (!db) throw new Error('DB not initialised');
  // Guard: the UI may only read through this channel.
  if (!/^\s*(select|with|pragma\s+table_info)\b/i.test(sql)) throw new Error('Only read queries are allowed');
  return db.exec({ sql, bind, rowMode: 'object', returnValue: 'resultRows' });
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    let result: unknown;
    switch (req.type) {
      case 'INIT': result = await init(req.payload.baseUrl); break;
      case 'HYDRATE': result = await hydrate(req.payload.force); break;
      case 'QUERY': result = query(req.payload.sql, req.payload.bind); break;
    }
    self.postMessage({ id: req.id, ok: true, result } satisfies WorkerResponse);
  } catch (err) {
    console.error('[db] request failed', req.type, err);
    self.postMessage({
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    } satisfies WorkerResponse);
  }
};
