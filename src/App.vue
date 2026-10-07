<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { DbClient } from './db/client';
import type { MotorcycleRow } from './db/types';

type Phase = 'idle' | 'busy' | 'ok' | 'bad';

const isolated = window.crossOriginIsolated;
const storage = ref<'opfs' | 'memory' | null>(null);
const dbPhase = ref<Phase>('idle');
const hydratePhase = ref<Phase>('idle');
const error = ref('');
const bikes = ref<MotorcycleRow[]>([]);
const make = ref('');

let db: DbClient | undefined;

const makes = computed(() => [...new Set(bikes.value.map((b) => b.make))].sort());
const shown = computed(() => (make.value ? bikes.value.filter((b) => b.make === make.value) : bikes.value));

async function refresh() {
  if (db) bikes.value = await db.listMotorcycles();
}

async function boot() {
  try {
    db = new DbClient();
    dbPhase.value = 'busy';
    storage.value = (await db.init()).storage;
    dbPhase.value = 'ok';

    await refresh(); // show whatever is already persisted in OPFS immediately (offline-first)
    hydratePhase.value = 'busy';
    try {
      await db.hydrate();
      hydratePhase.value = 'ok';
    } catch (e) {
      // Offline or YAML missing: keep serving the persisted DB.
      hydratePhase.value = 'bad';
      console.warn('[hydrate]', e);
    }
    await refresh();
  } catch (e) {
    dbPhase.value = 'bad';
    error.value = e instanceof Error ? e.message : String(e);
  }
}

async function forceRehydrate() {
  if (!db) return;
  hydratePhase.value = 'busy';
  try {
    await db.hydrate(true);
    hydratePhase.value = 'ok';
    await refresh();
  } catch (e) {
    hydratePhase.value = 'bad';
    error.value = e instanceof Error ? e.message : String(e);
  }
}

onMounted(boot);
</script>

<template>
  <main class="shell">
    <h1>KammForce</h1>
    <p class="tagline">Offline grip &amp; lean limits · toroidal tire physics</p>

    <section class="card" aria-labelledby="status-h">
      <h2 id="status-h">System status</h2>
      <div class="status-grid">
        <div class="stat" id="stat-isolation">
          <div class="k">Cross-origin isolation</div>
          <div class="v"><span class="dot" :class="isolated ? 'ok' : 'bad'" />{{ isolated ? 'Active' : 'Inactive' }}</div>
        </div>
        <div class="stat" id="stat-storage">
          <div class="k">SQLite storage</div>
          <div class="v">
            <span class="dot" :class="storage === 'opfs' ? 'ok' : storage ? 'warn' : dbPhase === 'bad' ? 'bad' : 'busy'" />
            {{ storage === 'opfs' ? 'OPFS (persistent)' : storage === 'memory' ? 'In-memory (transient)' : '…' }}
          </div>
        </div>
        <div class="stat" id="stat-hydration">
          <div class="k">YAML hydration</div>
          <div class="v">
            <span class="dot" :class="hydratePhase" />
            {{ { idle: 'Waiting', busy: 'Syncing…', ok: 'Up to date', bad: 'Offline / failed' }[hydratePhase] }}
          </div>
        </div>
      </div>
      <p v-if="error" class="error" id="error-msg">{{ error }}</p>
    </section>

    <section class="card" aria-labelledby="bikes-h">
      <h2 id="bikes-h">Motorcycle database ({{ shown.length }})</h2>
      <div style="display: flex; gap: 0.6rem; flex-wrap: wrap">
        <select id="make-filter" v-model="make" aria-label="Filter by make">
          <option value="">All makes</option>
          <option v-for="m in makes" :key="m" :value="m">{{ m }}</option>
        </select>
        <button id="rehydrate-btn" type="button" @click="forceRehydrate">Re-sync data</button>
      </div>

      <p v-if="!shown.length" class="empty">No motorcycles yet. Run the scraper workflow or add YAML under <code>public/data/</code>.</p>
      <table v-else>
        <thead>
          <tr><th>Model</th><th>Year</th><th>Wheelbase</th><th>Mass</th><th>CoG h</th></tr>
        </thead>
        <tbody>
          <tr v-for="b in shown" :key="b.id">
            <td>{{ b.make }} {{ b.model }}</td>
            <td class="num">{{ b.year }}</td>
            <td class="num">{{ b.wheelbase_mm ?? '—' }} mm</td>
            <td class="num">{{ b.mass_kg ?? '—' }} kg</td>
            <td class="num">{{ b.cog_height_mm ?? '—' }} mm</td>
          </tr>
        </tbody>
      </table>
    </section>
  </main>
</template>
