import type {
  HydrateResult, InitResult, MotorcycleRow, WorkerRequest, WorkerResponse,
} from './types';

type Distribute<T> = T extends { id: number } ? Omit<T, 'id'> : never;

/** Promise-based RPC wrapper around the SQLite Wasm Web Worker. */
export class DbClient {
  private worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  constructor() {
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.result);
      else p.reject(new Error(e.data.error));
    };
    this.worker.onerror = (e) => {
      const err = new Error(e.message || 'DB worker crashed');
      this.pending.forEach((p) => p.reject(err));
      this.pending.clear();
    };
  }

  private call<T>(req: Distribute<WorkerRequest>): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker.postMessage({ ...req, id });
    });
  }

  init(): Promise<InitResult> {
    return this.call({ type: 'INIT', payload: { baseUrl: import.meta.env.BASE_URL } });
  }
  hydrate(force = false): Promise<HydrateResult> {
    return this.call({ type: 'HYDRATE', payload: { force } });
  }
  query<T = Record<string, unknown>>(sql: string, bind?: unknown[]): Promise<T[]> {
    return this.call({ type: 'QUERY', payload: { sql, bind } });
  }

  listMotorcycles(make?: string): Promise<MotorcycleRow[]> {
    return make
      ? this.query<MotorcycleRow>('SELECT * FROM motorcycles WHERE make = ? ORDER BY year DESC, model', [make])
      : this.query<MotorcycleRow>('SELECT * FROM motorcycles ORDER BY make, year DESC, model');
  }
}
