export type WorkerRequest =
  | { id: number; type: 'INIT'; payload: { baseUrl: string } }
  | { id: number; type: 'HYDRATE'; payload: { force?: boolean } }
  | { id: number; type: 'QUERY'; payload: { sql: string; bind?: unknown[] } };

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

export interface InitResult {
  storage: 'opfs' | 'memory';
}
export interface HydrateResult {
  skipped: boolean;
  motorcycles: number;
}

export interface MotorcycleRow {
  id: string;
  make: string;
  model: string;
  year: number;
  wheelbase_mm: number | null;
  rake_deg: number | null;
  trail_mm: number | null;
  cog_height_mm: number | null;
  mass_kg: number | null;
  max_mech_lean_deg: number | null;
  cog_source: string | null;
  oem_front_tire?: string | null;
  oem_rear_tire?: string | null;
}
