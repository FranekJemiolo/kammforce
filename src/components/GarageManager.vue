<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { MotorcycleRow } from '../db/types';
import { garage, type GarageEntry } from '../garage';
import type { MotorcycleConfig } from '../physics/types';
import { STANDARD_TIRE_SIZES } from '../physics/tires';

const props = defineProps<{
  availableMotorcycles: MotorcycleRow[];
  selectedConfig: MotorcycleConfig;
}>();

const emit = defineEmits<{
  (e: 'select-bike', config: MotorcycleConfig): void;
}>();

const savedGarages = ref<GarageEntry[]>([]);
const isCustomMode = ref(false);

const customName = ref('Custom Track Bike');
const customMass = ref(190);
const customWheelbase = ref(1420);
const customCoG = ref(610);
const customMaxLean = ref(58);
const customRearTire = ref('190_55_17');
const customFrontTire = ref('120_70_17');

async function loadGarage() {
  savedGarages.value = await garage.list();
}

onMounted(loadGarage);

function onPickPreset(row: MotorcycleRow) {
  isCustomMode.value = false;
  emit('select-bike', {
    id: row.id,
    name: `${row.make} ${row.model}`,
    wheelbaseMm: row.wheelbase_mm ?? 1410,
    massKg: row.mass_kg ?? 200,
    cogHeightMm: row.cog_height_mm ?? 610,
    maxMechLeanDeg: row.max_mech_lean_deg ?? 56,
    frontTireSize: row.oem_front_tire ?? '120_70_17',
    rearTireSize: row.oem_rear_tire ?? '190_55_17',
  });
}

function applyCustom() {
  isCustomMode.value = true;
  emit('select-bike', {
    id: `custom_${Date.now()}`,
    name: customName.value,
    wheelbaseMm: customWheelbase.value,
    massKg: customMass.value,
    cogHeightMm: customCoG.value,
    maxMechLeanDeg: customMaxLean.value,
    frontTireSize: customFrontTire.value,
    rearTireSize: customRearTire.value,
  });
}

async function saveCurrentToGarage() {
  await garage.save({
    motorcycleId: props.selectedConfig.id,
    nickname: props.selectedConfig.name,
    customMassKg: props.selectedConfig.massKg,
    rearTire: props.selectedConfig.rearTireSize,
    frontTire: props.selectedConfig.frontTireSize,
  });
  await loadGarage();
}

async function removeGarageEntry(id: string) {
  await garage.remove(id);
  await loadGarage();
}
</script>

<template>
  <div class="garage-panel">
    <div class="garage-header">
      <span class="panel-title">Motorcycle &amp; Chassis Setup</span>
      <div class="actions">
        <button type="button" class="btn-subtle" @click="saveCurrentToGarage">★ Save Setup to Garage</button>
      </div>
    </div>

    <!-- Active Selection Summary -->
    <div class="active-bike-card">
      <div class="bike-identity">
        <span class="bike-badge">ACTIVE BIKE</span>
        <span class="bike-title">{{ selectedConfig.name }}</span>
      </div>
      <div class="spec-pills">
        <div class="pill"><span class="k">Mass:</span> <span class="v">{{ selectedConfig.massKg }} kg</span></div>
        <div class="pill"><span class="k">Wheelbase:</span> <span class="v">{{ selectedConfig.wheelbaseMm }} mm</span></div>
        <div class="pill"><span class="k">CoG Height:</span> <span class="v">{{ selectedConfig.cogHeightMm }} mm</span></div>
        <div class="pill"><span class="k">Mech Limit:</span> <span class="v">{{ selectedConfig.maxMechLeanDeg }}°</span></div>
        <div class="pill"><span class="k">Rear Tire:</span> <span class="v">{{ selectedConfig.rearTireSize }}</span></div>
      </div>
    </div>

    <!-- Quick Database Picker -->
    <div class="selection-grid">
      <div class="db-picker">
        <label for="db-select" class="section-label">Select From Catalog Database</label>
        <select
          id="db-select"
          class="styled-select"
          :value="selectedConfig.id"
          @change="(e) => {
            const row = availableMotorcycles.find(m => m.id === (e.target as HTMLSelectElement).value);
            if (row) onPickPreset(row);
          }"
        >
          <option v-for="b in availableMotorcycles" :key="b.id" :value="b.id">
            {{ b.make }} {{ b.model }} ({{ b.year }}) - {{ b.mass_kg }}kg / {{ b.wheelbase_mm }}mm
          </option>
        </select>
      </div>

      <div class="tire-picker">
        <label for="rear-tire-select" class="section-label">Rear Tire Specification</label>
        <select
          id="rear-tire-select"
          class="styled-select"
          :value="selectedConfig.rearTireSize"
          @change="(e) => {
            emit('select-bike', { ...selectedConfig, rearTireSize: (e.target as HTMLSelectElement).value });
          }"
        >
          <option v-for="t in STANDARD_TIRE_SIZES" :key="t.value" :value="t.value">
            {{ t.label }}
          </option>
        </select>
      </div>
    </div>

    <!-- Custom Chassis Adjustments Drawer -->
    <details class="custom-accordion">
      <summary>Custom Geometry &amp; Suspension Tweaks</summary>
      <div class="custom-grid">
        <div class="input-field">
          <label>Mass (Wet Weight kg)</label>
          <input
            type="number"
            v-model.number="selectedConfig.massKg"
            min="60"
            max="450"
            @change="emit('select-bike', { ...selectedConfig, massKg: selectedConfig.massKg })"
          />
        </div>
        <div class="input-field">
          <label>Wheelbase (mm)</label>
          <input
            type="number"
            v-model.number="selectedConfig.wheelbaseMm"
            min="1000"
            max="2000"
            @change="emit('select-bike', { ...selectedConfig, wheelbaseMm: selectedConfig.wheelbaseMm })"
          />
        </div>
        <div class="input-field">
          <label>Center of Gravity Height (mm)</label>
          <input
            type="number"
            v-model.number="selectedConfig.cogHeightMm"
            min="400"
            max="900"
            @change="emit('select-bike', { ...selectedConfig, cogHeightMm: selectedConfig.cogHeightMm })"
          />
        </div>
        <div class="input-field">
          <label>Mechanical Lean Clearance (°)</label>
          <input
            type="number"
            v-model.number="selectedConfig.maxMechLeanDeg"
            min="35"
            max="70"
            @change="emit('select-bike', { ...selectedConfig, maxMechLeanDeg: selectedConfig.maxMechLeanDeg })"
          />
        </div>
      </div>
    </details>

    <!-- Saved User Garage Entries -->
    <div v-if="savedGarages.length" class="saved-garage-list">
      <span class="section-label">Saved Bikes in Local Garage (IndexedDB)</span>
      <div class="garage-tags">
        <div v-for="entry in savedGarages" :key="entry.id" class="garage-chip">
          <span>{{ entry.nickname }}</span>
          <button type="button" class="del-chip" @click="removeGarageEntry(entry.id)" title="Remove">✕</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.garage-panel {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.garage-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.panel-title {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--muted);
  font-weight: 600;
}

.btn-subtle {
  font-size: 0.72rem;
  padding: 0.35rem 0.65rem;
  background: rgba(255, 107, 61, 0.12);
  color: var(--accent-2);
  border: 1px solid rgba(255, 107, 61, 0.3);
  border-radius: 8px;
  cursor: pointer;
}
.btn-subtle:hover {
  background: rgba(255, 107, 61, 0.22);
}

.active-bike-card {
  background: linear-gradient(135deg, rgba(255, 107, 61, 0.08), rgba(255, 179, 71, 0.04));
  border: 1px solid rgba(255, 107, 61, 0.25);
  border-radius: 12px;
  padding: 0.85rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.bike-identity {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.bike-badge {
  font-size: 0.65rem;
  font-weight: 800;
  background: var(--accent);
  color: #0b0f17;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
}

.bike-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text);
}

.spec-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.pill {
  font-size: 0.75rem;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--border);
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  display: flex;
  gap: 0.35rem;
}
.pill .k { color: var(--muted); }
.pill .v { font-weight: 600; color: var(--text); }

.selection-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 0.75rem;
}

.section-label {
  display: block;
  font-size: 0.8rem;
  color: #cbd5e1;
  margin-bottom: 0.35rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.styled-select {
  width: 100%;
}

.custom-accordion {
  background: #101826;
  border: 1.5px solid #23354d;
  border-radius: 10px;
  padding: 0.75rem 1rem;
  font-size: 0.84rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.custom-accordion summary {
  cursor: pointer;
  color: var(--accent-2);
  font-weight: 700;
}

.custom-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.input-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.input-field label {
  font-size: 0.75rem;
  color: #cbd5e1;
  font-weight: 600;
}
.input-field input {
  font: inherit;
  color: #ffffff;
  background: #162032;
  border: 1.5px solid #2c3e58;
  border-radius: 8px;
  padding: 0.55rem 0.75rem;
  font-weight: 600;
}
.input-field input:focus {
  outline: none;
  border-color: #ff6b3d;
  box-shadow: 0 0 0 3px rgba(255, 107, 61, 0.25);
}

.saved-garage-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding-top: 0.25rem;
}

.garage-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.garage-chip {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.72rem;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border);
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
}

.del-chip {
  background: transparent;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 0;
  font-size: 0.7rem;
}
.del-chip:hover { color: var(--bad); }
</style>
