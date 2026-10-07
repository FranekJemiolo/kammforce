import localforage from 'localforage';

/** User-specific data (never in the YAML DB). Persisted in IndexedDB via localForage. */
export interface GarageEntry {
  id: string;               // uuid
  motorcycleId: string;     // FK -> motorcycles.id (SQLite)
  nickname?: string;
  customMassKg?: number;
  riderMassKg?: number;
  frontTire?: string;
  rearTire?: string;
  sagMm?: number;
  updatedAt: number;
}

const store = localforage.createInstance({ name: 'kammforce', storeName: 'user_garage' });

export const garage = {
  async list(): Promise<GarageEntry[]> {
    const out: GarageEntry[] = [];
    await store.iterate<GarageEntry, void>((v) => {
      out.push(v);
    });
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  },
  get: (id: string) => store.getItem<GarageEntry>(id),
  async save(entry: Omit<GarageEntry, 'id' | 'updatedAt'> & { id?: string }): Promise<GarageEntry> {
    const full: GarageEntry = { ...entry, id: entry.id ?? crypto.randomUUID(), updatedAt: Date.now() };
    await store.setItem(full.id, full);
    return full;
  },
  remove: (id: string) => store.removeItem(id),
  /** Manual export for moving a garage between devices. */
  async exportJson(): Promise<string> {
    return JSON.stringify(await this.list(), null, 2);
  },
  async importJson(json: string): Promise<number> {
    const items = JSON.parse(json) as GarageEntry[];
    if (!Array.isArray(items)) throw new Error('Invalid garage file');
    for (const it of items) if (it?.id && it.motorcycleId) await store.setItem(it.id, it);
    return items.length;
  },
};
