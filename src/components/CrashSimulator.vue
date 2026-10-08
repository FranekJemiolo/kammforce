<script setup lang="ts">
import { computed, ref } from 'vue';
import { KMH_TO_MS, MS_TO_KMH, MS_TO_MPH, MPH_TO_MS } from '../physics/constants';
import { calculateSlidePhysics, GEAR_MATERIALS, type GearMaterial } from '../physics/kinematics';

const props = defineProps<{
  telemetrySpeedKmh: number;
  riderMassKg: number;
  useImperial: boolean;
}>();

// User state
const crashSpeedKmh = ref<number>(110);
const selectedMaterialKey = ref<string>('cowhide_leather');
const runoffBufferMeters = ref<number>(85); // typical track runoff gravel + asphalt run-out

const selectedMaterial = computed<GearMaterial>(() => {
  return GEAR_MATERIALS[selectedMaterialKey.value] ?? GEAR_MATERIALS.cowhide_leather;
});

// Conversion helpers
const crashSpeedMs = computed(() => crashSpeedKmh.value * KMH_TO_MS);
const displaySpeed = computed({
  get: () => {
    return props.useImperial ? Math.round(crashSpeedKmh.value * 0.621371) : Math.round(crashSpeedKmh.value);
  },
  set: (val: number) => {
    crashSpeedKmh.value = props.useImperial ? Math.round(val / 0.621371) : val;
  },
});

// Calculate slide physics using Work-Energy Theorem
const physics = computed(() => {
  return calculateSlidePhysics(
    crashSpeedMs.value,
    selectedMaterial.value.mu_k,
    props.riderMassKg,
    9.81,
  );
});

// Metric / imperial converted outputs
const slideDistDisplay = computed(() => {
  const m = physics.value.slideDistanceMeters;
  return props.useImperial ? `${(m * 3.28084).toFixed(1)} ft` : `${m.toFixed(1)} m`;
});

const runoffBufferDisplay = computed(() => {
  const m = runoffBufferMeters.value;
  return props.useImperial ? `${(m * 3.28084).toFixed(0)} ft` : `${m.toFixed(0)} m`;
});

// Runoff breach check
const isRunoffBreached = computed(() => {
  return physics.value.slideDistanceMeters > runoffBufferMeters.value;
});

const excessDistanceM = computed(() => {
  return Math.max(0, physics.value.slideDistanceMeters - runoffBufferMeters.value);
});

// Residual velocity if striking barrier (v_residual = sqrt(v0^2 - 2 * mu * g * d_runoff))
const residualSpeedKmh = computed(() => {
  if (!isRunoffBreached.value) return 0;
  const v0 = crashSpeedMs.value;
  const mu = selectedMaterial.value.mu_k;
  const g = 9.81;
  const dRunoff = runoffBufferMeters.value;
  const v2Rem = v0 * v0 - 2 * mu * g * dRunoff;
  if (v2Rem <= 0) return 0;
  return Math.round(Math.sqrt(v2Rem) * MS_TO_KMH);
});

// Abrasion safety ratio: compares slide duration with estimated material burn-through time
const burnThroughMarginRatio = computed(() => {
  const slideTime = physics.value.slideDurationSeconds;
  const burnTime = selectedMaterial.value.burnThroughTimeSecAt100Kmh * (100 / Math.max(30, crashSpeedKmh.value));
  return burnTime / Math.max(0.1, slideTime);
});

const isAbrasionFailure = computed(() => {
  return burnThroughMarginRatio.value < 1.0;
});

// Import speed from live cornering calculator
function importLiveSpeed() {
  crashSpeedKmh.value = Math.max(20, Math.min(300, Math.round(props.telemetrySpeedKmh)));
}

// Preset speeds
const SPEED_PRESETS = [
  { label: '60 km/h (Urban Low-Side)', kmh: 60 },
  { label: '100 km/h (Club Corner Apex)', kmh: 100 },
  { label: '140 km/h (Fast Sweeper)', kmh: 140 },
  { label: '180 km/h (GP Sweeper)', kmh: 180 },
  { label: '220 km/h (End of Straight)', kmh: 220 },
];

function setPresetSpeed(kmh: number) {
  crashSpeedKmh.value = kmh;
}
</script>

<template>
  <div class="crash-sim-panel">
    <!-- Header -->
    <div class="panel-header">
      <div class="title-group">
        <span class="panel-tag">PHASE 5 · CRASH KINEMATICS &amp; GEAR SIMULATOR</span>
        <h2 class="panel-title">Low-Side Asphalt Energy Dissipation &amp; Tumble Risk</h2>
        <p class="panel-subtitle">
          Calculates stopping distance and duration via the Work-Energy Theorem ($d = v^2 / 2\mu_k g$).
          Contrasts controlled sliding in track leathers against violent tumbling in street denim.
        </p>
      </div>

      <div class="quick-import">
        <button type="button" class="btn-import" @click="importLiveSpeed">
          ⚡ Sync Live Speed ({{ Math.round(telemetrySpeedKmh) }} km/h)
        </button>
      </div>
    </div>

    <!-- Critical Tumble Risk Alert Banner -->
    <div v-if="physics.tumbleRisk" class="alert-box danger-alert">
      <div class="alert-icon">⚠️</div>
      <div class="alert-content">
        <span class="alert-heading">VIOLENT TUMBLE &amp; ROTATIONAL TRAUMA HAZARD DETECTED</span>
        <p>
          <strong>{{ selectedMaterial.name }}</strong> has an excessively high coefficient of kinetic friction
          (<strong>&mu;<sub>k</sub> = {{ selectedMaterial.mu_k }}</strong> &gt; 0.60).
          Rather than allowing a flat, energy-dissipating slide, the material snags against asphalt irregularities,
          generating intense rotational torque that violently throws the rider into end-over-end tumbles.
          This exponentially elevates catastrophic bone fractures, joint dislocations, and helmet impacts.
        </p>
      </div>
    </div>

    <!-- Synthetic Fiber Melt Warning -->
    <div v-else-if="selectedMaterial.meltingRisk && crashSpeedKmh > 80" class="alert-box warn-alert">
      <div class="alert-icon">🔥</div>
      <div class="alert-content">
        <span class="alert-heading">SYNTHETIC FIBER MELT-THROUGH HAZARD</span>
        <p>
          At <strong>{{ crashSpeedKmh }} km/h</strong>, the sustained sliding duration (<strong>{{ physics.slideDurationSeconds.toFixed(1) }}s</strong>)
          generates extreme frictional thermal energy (<strong>{{ ((physics.kineticEnergyJoules ?? 0) / 1000).toFixed(0) }} kJ</strong>).
          Polyamide/Cordura textiles risk melting directly into epidermal tissue under prolonged sliding contact.
        </p>
      </div>
    </div>

    <!-- Runoff Zone Breach Warning -->
    <div v-else-if="isRunoffBreached" class="alert-box barrier-alert">
      <div class="alert-icon">🛑</div>
      <div class="alert-content">
        <span class="alert-heading">RUNOFF ZONE EXCEEDED — AIRFENCE / BARRIER IMPACT RISK</span>
        <p>
          Slide distance of <strong>{{ slideDistDisplay }}</strong> exceeds the available track runoff buffer (<strong>{{ runoffBufferDisplay }}</strong>)
          by <strong>{{ excessDistanceM.toFixed(1) }} meters</strong>. The rider will strike the perimeter barrier at an estimated residual velocity of
          <strong>{{ useImperial ? Math.round(residualSpeedKmh * 0.621371) + ' mph' : residualSpeedKmh + ' km/h' }}</strong>!
        </p>
      </div>
    </div>

    <div v-else class="alert-box ok-alert">
      <div class="alert-icon">🛡️</div>
      <div class="alert-content">
        <span class="alert-heading">CONTROLLED TRACK SLIDE ENVELOPE</span>
        <p>
          Coefficient of friction (<strong>&mu;<sub>k</sub> = {{ selectedMaterial.mu_k }}</strong>) ensures a smooth,
          controlled deceleration slide within available track runoff. Sacrificial layers absorb mechanical abrasion.
        </p>
      </div>
    </div>

    <!-- Controls & Inputs Grid -->
    <div class="sim-grid">
      <!-- Input Column -->
      <div class="controls-col">
        <!-- Crash Speed Input -->
        <div class="input-card">
          <div class="input-header">
            <label for="crash-speed-slider">Crash Entry Speed</label>
            <span class="input-val accent">
              {{ displaySpeed }} {{ useImperial ? 'mph' : 'km/h' }}
              <span class="sub-val">({{ crashSpeedMs.toFixed(1) }} m/s)</span>
            </span>
          </div>

          <input
            id="crash-speed-slider"
            type="range"
            min="20"
            max="260"
            step="1"
            v-model.number="crashSpeedKmh"
          />

          <!-- Quick Speed Presets -->
          <div class="preset-pills">
            <button
              v-for="p in SPEED_PRESETS"
              :key="p.kmh"
              type="button"
              class="pill-btn"
              :class="{ active: crashSpeedKmh === p.kmh }"
              @click="setPresetSpeed(p.kmh)"
            >
              {{ useImperial ? Math.round(p.kmh * 0.621371) + ' mph' : p.kmh + ' km/h' }}
            </button>
          </div>
        </div>

        <!-- Gear Material Selection -->
        <div class="input-card">
          <div class="input-header">
            <label for="material-select">Rider Gear Contact Material</label>
            <span class="mu-badge" :class="physics.tumbleRisk ? 'bad' : 'ok'">
              &mu;<sub>k</sub> = {{ selectedMaterial.mu_k.toFixed(2) }}
            </span>
          </div>

          <select
            id="material-select"
            class="styled-select"
            v-model="selectedMaterialKey"
          >
            <option
              v-for="mat in GEAR_MATERIALS"
              :key="mat.id"
              :value="mat.id"
            >
              {{ mat.name }} (&mu;k = {{ mat.mu_k }})
            </option>
          </select>

          <p class="material-description">
            {{ selectedMaterial.description }}
          </p>

          <div class="material-meta">
            <span class="meta-item">
              <span class="lbl">Abrasion Rating:</span>
              <span class="val" :class="selectedMaterial.abrasionResistanceLevel === 'Poor' ? 'bad' : 'ok'">
                {{ selectedMaterial.abrasionResistanceLevel }}
              </span>
            </span>
            <span class="meta-item">
              <span class="lbl">Application:</span>
              <span class="val">{{ selectedMaterial.recommendedUse }}</span>
            </span>
          </div>
        </div>

        <!-- Runoff Distance Config -->
        <div class="input-card">
          <div class="input-header">
            <label for="runoff-slider">Track Runoff Buffer (Asphalt + Gravel)</label>
            <span class="input-val">{{ runoffBufferDisplay }}</span>
          </div>
          <input
            id="runoff-slider"
            type="range"
            min="20"
            max="180"
            step="5"
            v-model.number="runoffBufferMeters"
          />
          <div class="range-sub">
            <span>20m (Club Tight Runout)</span>
            <span>85m (FIM Grade A Circuit)</span>
            <span>180m (Super-Speedway)</span>
          </div>
        </div>
      </div>

      <!-- Telemetry Output Cards Column -->
      <div class="outputs-col">
        <!-- Main Kinematic Slide Metrics -->
        <div class="metrics-grid">
          <div class="metric-card primary">
            <span class="m-label">SLIDE DISTANCE (d)</span>
            <span class="m-val" :class="isRunoffBreached ? 'bad' : ''">{{ slideDistDisplay }}</span>
            <span class="m-formula">d = v&sup2; / (2 &middot; &mu;<sub>k</sub> &middot; g)</span>
          </div>

          <div class="metric-card">
            <span class="m-label">SLIDE DURATION (t)</span>
            <span class="m-val">{{ physics.slideDurationSeconds.toFixed(2) }} s</span>
            <span class="m-formula">t = v / (&mu;<sub>k</sub> &middot; g)</span>
          </div>

          <div class="metric-card">
            <span class="m-label">SLIDE DECELERATION</span>
            <span class="m-val">{{ physics.decelerationG.toFixed(2) }} G</span>
            <span class="m-formula">{{ physics.decelerationMs2.toFixed(1) }} m/s&sup2; (&mu;<sub>k</sub> &middot; g)</span>
          </div>

          <div class="metric-card" :class="physics.tumbleRisk ? 'hazard-card' : ''">
            <span class="m-label">TUMBLE RISK</span>
            <span class="m-val" :class="physics.tumbleRisk ? 'bad' : 'ok'">
              {{ physics.tumbleRisk ? 'HIGH (VIOLENT TUMBLE)' : 'LOW (SMOOTH SLIDE)' }}
            </span>
            <span class="m-formula">&mu;<sub>k</sub> {{ physics.tumbleRisk ? '> 0.60 (Grabs track)' : '&le; 0.60 (Controlled)' }}</span>
          </div>

          <div v-if="physics.kineticEnergyJoules" class="metric-card">
            <span class="m-label">KINETIC ENERGY (KE)</span>
            <span class="m-val">{{ ((physics.kineticEnergyJoules ?? 0) / 1000).toFixed(1) }} kJ</span>
            <span class="m-formula">&frac12; &middot; m &middot; v&sup2; (Dissipated via friction)</span>
          </div>

          <div v-if="physics.averageThermalPowerWatts" class="metric-card">
            <span class="m-label">THERMAL POWER DISSIPATION</span>
            <span class="m-val">{{ ((physics.averageThermalPowerWatts ?? 0) / 1000).toFixed(1) }} kW</span>
            <span class="m-formula">Average heat generation rate</span>
          </div>
        </div>

        <!-- Abrasion & Tear-Through Assessment -->
        <div class="abrasion-bar-card">
          <div class="bar-header">
            <span class="bar-title">Material Abrasion Integrity vs Slide Duration</span>
            <span class="bar-status" :class="isAbrasionFailure ? 'bad' : 'ok'">
              {{ isAbrasionFailure ? 'ABRASION BURN-THROUGH DANGER' : 'ARMOR INTEGRITY PRESERVED' }}
            </span>
          </div>

          <div class="progress-track">
            <div
              class="progress-fill"
              :class="isAbrasionFailure ? 'bad' : 'ok'"
              :style="{ width: `${Math.min(100, (physics.slideDurationSeconds / selectedMaterial.burnThroughTimeSecAt100Kmh) * 100)}%` }"
            ></div>
          </div>

          <div class="bar-legend">
            <span>Slide Duration: {{ physics.slideDurationSeconds.toFixed(1) }}s</span>
            <span>Est. Burn-Through Limit: {{ selectedMaterial.burnThroughTimeSecAt100Kmh.toFixed(1) }}s at 100 km/h</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Visual Track Slide Simulation Canvas (SVG) -->
    <div class="visualizer-container">
      <div class="vis-header">
        <span class="vis-title">Track Slide Runway &amp; Runoff Energy Dissipation Simulation</span>
        <span class="badge" :class="physics.tumbleRisk ? 'bad' : isRunoffBreached ? 'bad' : 'ok'">
          {{ physics.tumbleRisk ? 'ROTATIONAL TUMBLE TRAJECTORY' : isRunoffBreached ? 'RUNOFF BUFFER OVERRUN' : 'CONTROLLED RUNOFF CONTAINMENT' }}
        </span>
      </div>

      <svg viewBox="0 0 800 240" class="slide-canvas" preserveAspectRatio="xMidYMid meet">
        <defs>
          <!-- Asphalt surface pattern -->
          <pattern id="slide-asphalt" width="16" height="16" patternUnits="userSpaceOnUse">
            <rect width="16" height="16" fill="#121722" />
            <circle cx="4" cy="4" r="1.1" fill="#1d2638" />
            <circle cx="12" cy="11" r="1.3" fill="#182030" />
          </pattern>

          <!-- Gravel trap texture -->
          <pattern id="gravel-pattern" width="12" height="12" patternUnits="userSpaceOnUse">
            <rect width="12" height="12" fill="#2d2a24" />
            <circle cx="3" cy="3" r="1.4" fill="#605749" />
            <circle cx="9" cy="8" r="1.6" fill="#756b5c" />
            <circle cx="5" cy="10" r="1.2" fill="#4d4538" />
          </pattern>

          <!-- Heat / friction smoke blur -->
          <filter id="friction-smoke" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          <!-- Arrow markers -->
          <marker id="slide-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#ff6b3d" />
          </marker>
        </defs>

        <!-- Coordinate System: 800px width.
             Scale: 1 meter = 4 pixels. 800px = 200 meters.
             Start of slide at X = 80px (d = 0m).
        -->

        <!-- Track Surface Plane -->
        <rect x="0" y="80" width="800" height="90" fill="url(#slide-asphalt)" />
        <line x1="0" y1="80" x2="800" y2="80" stroke="#334155" stroke-width="2" />
        <line x1="0" y1="170" x2="800" y2="170" stroke="#334155" stroke-width="2" />

        <!-- Runoff Boundary Marker (Asphalt to Gravel or Barrier) -->
        <!-- runoffX = 80 + runoffBufferMeters * 3.4 (scale clamped) -->
        <g :transform="`translate(${Math.min(740, 80 + runoffBufferMeters * 3.4)}, 0)`">
          <!-- Gravel trap extending to barrier -->
          <rect x="0" y="80" :width="Math.max(0, 800 - (80 + runoffBufferMeters * 3.4))" height="90" fill="url(#gravel-pattern)" />
          <line x1="0" y1="50" x2="0" y2="190" stroke="#ffcf5c" stroke-width="2" stroke-dasharray="4 4" />
          <text x="6" y="70" fill="#ffcf5c" font-size="10" font-family="monospace">
            Runoff Barrier ({{ runoffBufferMeters }}m)
          </text>
        </g>

        <!-- Distance Ticks (0m, 25m, 50m, 75m, 100m, 150m, 200m) -->
        <g stroke="rgba(255,255,255,0.15)" stroke-width="1">
          <line x1="80" y1="165" x2="80" y2="175" />
          <line :x1="80 + 25 * 3.4" y1="165" :x2="80 + 25 * 3.4" y2="175" />
          <line :x1="80 + 50 * 3.4" y1="165" :x2="80 + 50 * 3.4" y2="175" />
          <line :x1="80 + 75 * 3.4" y1="165" :x2="80 + 75 * 3.4" y2="175" />
          <line :x1="80 + 100 * 3.4" y1="165" :x2="80 + 100 * 3.4" y2="175" />
          <line :x1="80 + 150 * 3.4" y1="165" :x2="80 + 150 * 3.4" y2="175" />
          <line :x1="80 + 200 * 3.4" y1="165" :x2="80 + 200 * 3.4" y2="175" />
        </g>

        <!-- Distance Labels -->
        <text x="80" y="190" fill="#64748b" font-size="10" font-family="monospace" text-anchor="middle">0m</text>
        <text :x="80 + 25 * 3.4" y="190" fill="#64748b" font-size="10" font-family="monospace" text-anchor="middle">25m</text>
        <text :x="80 + 50 * 3.4" y="190" fill="#64748b" font-size="10" font-family="monospace" text-anchor="middle">50m</text>
        <text :x="80 + 75 * 3.4" y="190" fill="#64748b" font-size="10" font-family="monospace" text-anchor="middle">75m</text>
        <text :x="80 + 100 * 3.4" y="190" fill="#64748b" font-size="10" font-family="monospace" text-anchor="middle">100m</text>
        <text :x="80 + 150 * 3.4" y="190" fill="#64748b" font-size="10" font-family="monospace" text-anchor="middle">150m</text>
        <text :x="80 + 200 * 3.4" y="190" fill="#64748b" font-size="10" font-family="monospace" text-anchor="middle">200m</text>

        <!-- Drop Point (Low-side Apex) -->
        <g transform="translate(80, 125)">
          <circle cx="0" cy="0" r="6" fill="#e53e3e" />
          <circle cx="0" cy="0" r="12" fill="none" stroke="#e53e3e" stroke-width="1.5" stroke-dasharray="3 3" />
          <text x="-10" y="-18" fill="#e53e3e" font-size="10" font-weight="700" text-anchor="end" font-family="monospace">
            Low-Side Apex
          </text>
          <text x="-10" y="-6" fill="#94a3b8" font-size="9" text-anchor="end">
            {{ crashSpeedKmh }} km/h
          </text>
        </g>

        <!-- Friction Streak / Skid Mark on Track -->
        <!-- Length clamped to canvas boundary for rendering -->
        <g>
          <!-- Friction heat trail -->
          <line
            x1="80"
            y1="125"
            :x2="Math.min(760, 80 + physics.slideDistanceMeters * 3.4)"
            y2="125"
            :stroke="physics.tumbleRisk ? '#ff5c6c' : '#ffb347'"
            :stroke-width="physics.tumbleRisk ? 8 : 5"
            :stroke-dasharray="physics.tumbleRisk ? '6 8' : 'none'"
            opacity="0.75"
          />

          <!-- Spark particles along skid if leather/slider -->
          <g v-if="!physics.tumbleRisk && crashSpeedKmh > 70" filter="url(#friction-smoke)">
            <circle :cx="80 + physics.slideDistanceMeters * 1.5" cy="123" r="3" fill="#ffcf5c" />
            <circle :cx="80 + physics.slideDistanceMeters * 2.2" cy="127" r="2.5" fill="#ff6b3d" />
            <circle :cx="80 + physics.slideDistanceMeters * 2.9" cy="124" r="2" fill="#ffd166" />
          </g>
        </g>

        <!-- Final Rest Position (Rider stopped or barrier impact) -->
        <g :transform="`translate(${Math.min(760, 80 + physics.slideDistanceMeters * 3.4)}, 125)`">
          <!-- Tumble vs Slide Graphic -->
          <template v-if="physics.tumbleRisk">
            <!-- Violent Tumble Icon (Rotating red arrows + hazard) -->
            <circle cx="0" cy="0" r="16" fill="#7f1d1d" stroke="#ef4444" stroke-width="2.5" />
            <path d="M -8 -8 L 8 8 M 8 -8 L -8 8" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" />
            <text x="0" y="-22" fill="#ef4444" font-size="11" font-weight="700" text-anchor="middle" font-family="monospace">
              VIOLENT TUMBLE ({{ physics.slideDurationSeconds.toFixed(1) }}s)
            </text>
          </template>

          <template v-else>
            <!-- Controlled Flat Slide Icon -->
            <ellipse cx="0" cy="0" rx="18" ry="8" fill="#1e3a8a" stroke="#60a5fa" stroke-width="2" />
            <circle cx="12" cy="-2" r="5" fill="#2563eb" stroke="#93c5fd" stroke-width="1.2" />
            <text x="0" y="-18" fill="#60a5fa" font-size="10.5" font-weight="700" text-anchor="middle" font-family="monospace">
              {{ isRunoffBreached ? 'BARRIER IMPACT!' : `Rider Stopped (${physics.slideDurationSeconds.toFixed(1)}s)` }}
            </text>
          </template>

          <!-- Slide Distance Label -->
          <text x="0" y="24" fill="#ffb347" font-size="11" font-weight="700" text-anchor="middle" font-family="monospace">
            {{ slideDistDisplay }}
          </text>
        </g>

        <!-- Distance Dimension Line Arrow above the slide -->
        <g transform="translate(0, 45)">
          <line
            x1="80"
            y1="0"
            :x2="Math.min(760, 80 + physics.slideDistanceMeters * 3.4)"
            y2="0"
            stroke="#ff6b3d"
            stroke-width="1.8"
            marker-end="url(#slide-arrow)"
          />
          <line x1="80" y1="-8" x2="80" y2="8" stroke="#ff6b3d" stroke-width="1.5" />
          <line
            :x1="Math.min(760, 80 + physics.slideDistanceMeters * 3.4)"
            y1="-8"
            :x2="Math.min(760, 80 + physics.slideDistanceMeters * 3.4)"
            y2="8"
            stroke="#ff6b3d"
            stroke-width="1.5"
          />
          <text
            :x="(80 + Math.min(760, 80 + physics.slideDistanceMeters * 3.4)) / 2"
            y="-8"
            fill="#ff6b3d"
            font-size="11"
            font-weight="700"
            text-anchor="middle"
            font-family="monospace"
          >
            Slide Distance = {{ slideDistDisplay }}
          </text>
        </g>
      </svg>
    </div>
  </div>
</template>

<style scoped>
.crash-sim-panel {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 1rem;
}

.title-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.panel-tag {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--accent);
}

.panel-title {
  font-size: 1.35rem;
  font-weight: 800;
  color: var(--text);
  margin: 0;
  letter-spacing: -0.01em;
}

.panel-subtitle {
  font-size: 0.8rem;
  color: var(--muted);
  max-width: 680px;
  line-height: 1.45;
  margin: 0;
}

.btn-import {
  background: rgba(255, 107, 61, 0.15);
  border: 1px solid rgba(255, 107, 61, 0.45);
  color: var(--accent);
  padding: 0.5rem 0.9rem;
  border-radius: 8px;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}
.btn-import:hover {
  background: rgba(255, 107, 61, 0.25);
  transform: translateY(-1px);
}

/* Alert Boxes */
.alert-box {
  display: flex;
  align-items: flex-start;
  gap: 0.9rem;
  padding: 1rem 1.25rem;
  border-radius: 12px;
  font-size: 0.82rem;
  line-height: 1.45;
}

.alert-icon {
  font-size: 1.4rem;
  line-height: 1;
}

.alert-content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.alert-heading {
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  font-size: 0.8rem;
}

.danger-alert {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.5);
  color: #fca5a5;
}
.danger-alert .alert-heading { color: #ef4444; }

.warn-alert {
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.5);
  color: #fcd34d;
}
.warn-alert .alert-heading { color: #f59e0b; }

.barrier-alert {
  background: rgba(249, 115, 22, 0.15);
  border: 1px solid rgba(249, 115, 22, 0.5);
  color: #fdba74;
}
.barrier-alert .alert-heading { color: #f97316; }

.ok-alert {
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.4);
  color: #6ee7b7;
}
.ok-alert .alert-heading { color: #10b989; }

/* Grid layout */
.sim-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem;
}

.controls-col, .outputs-col {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.input-card {
  background: #101826;
  border: 1.5px solid #23354d;
  border-radius: 12px;
  padding: 1rem 1.15rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}

.input-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
}
.input-header label {
  font-weight: 700;
  color: #cbd5e1;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.input-val {
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--text);
  font-size: 1rem;
}
.input-val.accent { color: var(--accent); }
.input-val .sub-val {
  font-size: 0.75rem;
  color: var(--muted);
  font-weight: 500;
  margin-left: 0.35rem;
}

.mu-badge {
  font-size: 0.75rem;
  font-weight: 800;
  font-family: monospace;
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
}
.mu-badge.ok {
  background: rgba(16, 185, 129, 0.15);
  color: #10b989;
  border: 1px solid rgba(16, 185, 129, 0.35);
}
.mu-badge.bad {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.5);
}

.preset-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.2rem;
}

.pill-btn {
  background: #162235;
  border: 1px solid #263850;
  color: #cbd5e1;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.35rem 0.65rem;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.pill-btn:hover, .pill-btn.active {
  background: rgba(255, 107, 61, 0.22);
  color: #ffffff;
  border-color: var(--accent);
}

.material-description {
  font-size: 0.76rem;
  color: #cbd5e1;
  line-height: 1.45;
  margin: 0;
}

.material-meta {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem;
  font-size: 0.74rem;
  padding-top: 0.45rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.meta-item .lbl { color: #94a3b8; font-weight: 600; margin-right: 0.3rem; }
.meta-item .val { font-weight: 700; color: #f1f5f9; }
.meta-item .val.ok { color: #3ddc97; }
.meta-item .val.bad { color: #ff5c6c; }

.range-sub {
  display: flex;
  justify-content: space-between;
  font-size: 0.68rem;
  color: var(--muted);
}

/* Metric Output Cards */
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}

.metric-card {
  background: #101826;
  border: 1.5px solid #23354d;
  border-radius: 12px;
  padding: 0.85rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}

.metric-card.primary {
  grid-column: span 2;
  background: linear-gradient(135deg, rgba(255, 107, 61, 0.16), rgba(255, 179, 71, 0.08));
  border-color: rgba(255, 107, 61, 0.45);
}

.metric-card.hazard-card {
  border-color: rgba(239, 68, 68, 0.5);
  background: rgba(239, 68, 68, 0.08);
}

.m-label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #cbd5e1;
  font-weight: 700;
}

.m-val {
  font-size: 1.35rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--text);
}
.metric-card.primary .m-val {
  font-size: 1.8rem;
  color: var(--accent);
}
.m-val.bad { color: #ef4444; }
.m-val.ok { color: #10b989; }

.m-formula {
  font-size: 0.65rem;
  color: var(--muted);
  font-family: monospace;
}

/* Abrasion Bar */
.abrasion-bar-card {
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 0.9rem 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.bar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.72rem;
}
.bar-title {
  color: var(--muted);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.bar-status {
  font-weight: 800;
}
.bar-status.ok { color: #10b989; }
.bar-status.bad { color: #ef4444; }

.progress-track {
  width: 100%;
  height: 8px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.3s ease;
}
.progress-fill.ok { background: linear-gradient(90deg, #10b989, #34d399); }
.progress-fill.bad { background: linear-gradient(90deg, #f59e0b, #ef4444); }

.bar-legend {
  display: flex;
  justify-content: space-between;
  font-size: 0.68rem;
  color: var(--muted);
}

/* Visualizer Container */
.visualizer-container {
  background: #080d16;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 14px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.vis-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.vis-title {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--muted);
  font-weight: 700;
}

.badge {
  font-size: 0.68rem;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  font-weight: 700;
}
.badge.ok { background: rgba(16, 185, 129, 0.15); color: #10b989; border: 1px solid rgba(16, 185, 129, 0.35); }
.badge.bad { background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.5); }

.slide-canvas {
  width: 100%;
  height: auto;
  max-height: 240px;
  border-radius: 8px;
}

@media (max-width: 900px) {
  .sim-grid {
    grid-template-columns: 1fr;
  }
}
</style>
