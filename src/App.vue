<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import CrashSimulator from './components/CrashSimulator.vue';
import FrontVisualizer from './components/FrontVisualizer.vue';
import GarageManager from './components/GarageManager.vue';
import KammCircle from './components/KammCircle.vue';
import LeanVisualizer from './components/LeanVisualizer.vue';
import SideVisualizer from './components/SideVisualizer.vue';
import TrackPresets, { type TrackCorner } from './components/TrackPresets.vue';
import { DbClient } from './db/client';
import type { MotorcycleRow } from './db/types';
import { KMH_TO_MS, MS_TO_KMH } from './physics/constants';
import { solveHangOffForLeanSafety, solveRadiusForTargetLean, solveSpeedForTargetLean } from './physics/optimizer';
import { solveCornerTelemetry } from './physics/solver';
import { SURFACE_COMPOUNDS } from './physics/tires';
import type { MotorcycleConfig, PhysicsResult, RiderConfig, SurfaceCondition } from './physics/types';

type Phase = 'idle' | 'busy' | 'ok' | 'bad';

const isolated = window.crossOriginIsolated;
const storage = ref<'opfs' | 'memory' | null>(null);
const dbPhase = ref<Phase>('idle');
const hydratePhase = ref<Phase>('idle');
const error = ref('');
const bikes = ref<MotorcycleRow[]>([]);

let db: DbClient | undefined;

// Unit Preferences
const useImperial = ref(false); // false = Metric (km/h, m, kg), true = Imperial (mph, ft, lbs)

// Multi-Angle Visualizer Selection
const visualizerAngle = ref<'rear' | 'front' | 'side'>('rear');

// Active Motorcycle Config
const activeBike = ref<MotorcycleConfig>({
  id: 'yam_yzf_r1_2024',
  name: 'Yamaha YZF-R1',
  wheelbaseMm: 1405,
  massKg: 201,
  cogHeightMm: 610,
  maxMechLeanDeg: 56,
  frontTireSize: '120_70_17',
  rearTireSize: '190_55_17',
});

// Rider Config
const rider = ref<RiderConfig>({
  massKg: 78,
  hangOffCm: 18,
});

// Scenario inputs
const speedKmh = ref(110);
const radiusM = ref(55);
const longitudinalG = ref(0);
const selectedSurface = ref<SurfaceCondition>('dry_track_supersport');

// Active Tab
const activeTab = ref<'calc' | 'garage' | 'presets' | 'crash'>('calc');

// Computed physics telemetry
const telemetry = computed<PhysicsResult>(() => {
  const speedMs = speedKmh.value * KMH_TO_MS;
  return solveCornerTelemetry(
    activeBike.value,
    rider.value,
    {
      speedMs,
      radiusM: radiusM.value,
      longitudinalAccelG: longitudinalG.value,
    },
    selectedSurface.value
  );
});

// Max safe corner speed
const maxSafeSpeedKmh = computed(() => {
  const compound = SURFACE_COMPOUNDS[selectedSurface.value];
  const maxAy = compound.muPeak * 9.80665;
  const maxV = Math.sqrt(maxAy * radiusM.value);
  return maxV * MS_TO_KMH;
});

// Min safe corner radius
const minSafeRadiusM = computed(() => {
  const compound = SURFACE_COMPOUNDS[selectedSurface.value];
  const maxAy = compound.muPeak * 9.80665;
  const speedMs = speedKmh.value * KMH_TO_MS;
  return (speedMs * speedMs) / maxAy;
});

// Optimizer Actions
function setToMaxMechLeanSpeed() {
  const opt = solveSpeedForTargetLean(
    activeBike.value,
    rider.value,
    activeBike.value.maxMechLeanDeg,
    radiusM.value,
    selectedSurface.value
  );
  speedKmh.value = Math.round(opt.requiredSpeedKmh);
}

function setToMaxMechLeanRadius() {
  const speedMs = speedKmh.value * KMH_TO_MS;
  const reqRadius = solveRadiusForTargetLean(
    activeBike.value,
    rider.value,
    activeBike.value.maxMechLeanDeg,
    speedMs
  );
  radiusM.value = Math.max(10, Math.round(reqRadius));
}

function setToTargetLean(targetDeg: number) {
  const opt = solveSpeedForTargetLean(
    activeBike.value,
    rider.value,
    targetDeg,
    radiusM.value,
    selectedSurface.value
  );
  speedKmh.value = Math.max(20, Math.round(opt.requiredSpeedKmh));
}

function optimizeHangOff() {
  const currentAy = ((speedKmh.value * KMH_TO_MS) ** 2) / radiusM.value;
  const safeTargetLean = Math.max(30, activeBike.value.maxMechLeanDeg - 4);
  const optHangOff = solveHangOffForLeanSafety(
    activeBike.value,
    rider.value,
    currentAy,
    safeTargetLean
  );
  rider.value.hangOffCm = optHangOff;
}

function setToMaxGripLimit() {
  speedKmh.value = Math.round(maxSafeSpeedKmh.value * 0.99);
}

// Database & Hydration Lifecycle
async function refreshBikes() {
  if (db) {
    const list = await db.listMotorcycles();
    bikes.value = list;
    if (list.length && activeBike.value.id === 'yam_yzf_r1_2024') {
      const match = list.find((b) => b.id === 'yam_yzf_r1_2024') ?? list[0];
      if (match) {
        activeBike.value = {
          id: match.id,
          name: `${match.make} ${match.model}`,
          wheelbaseMm: match.wheelbase_mm ?? 1410,
          massKg: match.mass_kg ?? 200,
          cogHeightMm: match.cog_height_mm ?? 610,
          maxMechLeanDeg: match.max_mech_lean_deg ?? 56,
          frontTireSize: match.oem_front_tire ?? '120_70_17',
          rearTireSize: match.oem_rear_tire ?? '190_55_17',
        };
      }
    }
  }
}

async function boot() {
  try {
    db = new DbClient();
    dbPhase.value = 'busy';
    storage.value = (await db.init()).storage;
    dbPhase.value = 'ok';

    await refreshBikes();
    hydratePhase.value = 'busy';
    try {
      await db.hydrate();
      hydratePhase.value = 'ok';
    } catch (e) {
      hydratePhase.value = 'bad';
      console.warn('[hydrate]', e);
    }
    await refreshBikes();
    loadFromUrlHash();
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
    await refreshBikes();
  } catch (e) {
    hydratePhase.value = 'bad';
    error.value = e instanceof Error ? e.message : String(e);
  }
}

function onCornerSelected(c: TrackCorner) {
  speedKmh.value = c.speedKmh;
  radiusM.value = c.radiusM;
  if (c.defaultLongitudinalG !== undefined) {
    longitudinalG.value = c.defaultLongitudinalG;
  }
  activeTab.value = 'calc';
}

// URL Hash State Serialization
function syncToUrlHash() {
  const state = {
    b: activeBike.value.id,
    v: speedKmh.value,
    r: radiusM.value,
    h: rider.value.hangOffCm,
    m: rider.value.massKg,
    s: selectedSurface.value,
    ax: longitudinalG.value,
    t: activeTab.value,
  };
  try {
    history.replaceState(null, '', `#${encodeURIComponent(JSON.stringify(state))}`);
  } catch {
    // ignore
  }
}

function loadFromUrlHash() {
  try {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const state = JSON.parse(decodeURIComponent(hash));
    if (state.v) speedKmh.value = Number(state.v);
    if (state.r) radiusM.value = Number(state.r);
    if (state.h !== undefined) rider.value.hangOffCm = Number(state.h);
    if (state.m) rider.value.massKg = Number(state.m);
    if (state.s) selectedSurface.value = state.s;
    if (state.ax !== undefined) longitudinalG.value = Number(state.ax);
    if (state.t && ['calc', 'garage', 'presets', 'crash'].includes(state.t)) {
      activeTab.value = state.t;
    }
  } catch {
    // ignore
  }
}

watch([speedKmh, radiusM, longitudinalG, selectedSurface, rider, activeBike, activeTab], syncToUrlHash, { deep: true });

onMounted(boot);
</script>

<template>
  <div class="app-layout">
    <!-- Header with Branding & Quick Status -->
    <header class="app-header">
      <div class="brand-row">
        <div class="title-group">
          <div class="logo-circle">
            <svg viewBox="0 0 512 512" class="logo-svg">
              <circle cx="256" cy="256" r="150" fill="none" stroke="#2a3446" stroke-width="14" />
              <circle cx="256" cy="256" r="150" fill="none" stroke="#ff6b3d" stroke-width="24" stroke-dasharray="520 1000" stroke-linecap="round" transform="rotate(-200 256 256)" />
              <circle cx="256" cy="256" r="80" fill="none" stroke="#2a3446" stroke-width="10" />
              <circle cx="256" cy="256" r="14" fill="#ffb347" />
            </svg>
          </div>
          <div>
            <h1>KammForce</h1>
            <p class="tagline">Motorcycle Grip &amp; Lean Limit Engine · Toroidal Cossalter Physics &amp; Pacejka '94</p>
          </div>
        </div>

        <div class="header-right">
          <!-- Active Bike Quick Badge -->
          <div class="active-bike-badge" @click="activeTab = 'garage'">
            <span class="active-badge-tag">ACTIVE SETUP:</span>
            <span class="active-badge-name">{{ activeBike.name }}</span>
            <span class="tire-specs">{{ activeBike.frontTireSize }} / {{ activeBike.rearTireSize }}</span>
          </div>

          <!-- Unit Toggle Button -->
          <button type="button" class="unit-toggle" @click="useImperial = !useImperial">
            {{ useImperial ? '🇺🇸 Imperial (mph, ft)' : '🇪🇺 Metric (km/h, m)' }}
          </button>

          <!-- System Status Bar -->
          <div class="status-chips">
            <div class="chip" title="SharedArrayBuffer cross-origin isolation">
              <span class="dot" :class="isolated ? 'ok' : 'bad'"></span>
              <span>COI: {{ isolated ? 'Active' : 'Inactive' }}</span>
            </div>
            <div class="chip" title="SQLite Wasm persistent Origin Private File System">
              <span class="dot" :class="storage === 'opfs' ? 'ok' : storage ? 'warn' : 'busy'"></span>
              <span>DB: {{ storage === 'opfs' ? 'OPFS' : storage ? 'RAM' : '…' }}</span>
            </div>
            <div class="chip" title="YAML Catalog database sync state">
              <span class="dot" :class="hydratePhase"></span>
              <span>YAML: {{ { idle: 'Wait', busy: 'Sync…', ok: 'Synced', bad: 'Offline' }[hydratePhase] }}</span>
              <button type="button" class="sync-mini-btn" @click="forceRehydrate" title="Force re-sync">↺</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <nav class="nav-tabs">
        <button
          type="button"
          class="tab-btn"
          :class="{ active: activeTab === 'calc' }"
          @click="activeTab = 'calc'"
        >
          ⚡ Live Dynamics Cockpit
        </button>
        <button
          type="button"
          class="tab-btn"
          :class="{ active: activeTab === 'presets' }"
          @click="activeTab = 'presets'"
        >
          🏁 Circuit Corner Presets
        </button>
        <button
          type="button"
          class="tab-btn"
          :class="{ active: activeTab === 'garage' }"
          @click="activeTab = 'garage'"
        >
          🏍️ Garage &amp; Geometry Catalog ({{ bikes.length }})
        </button>
        <button
          type="button"
          class="tab-btn"
          :class="{ active: activeTab === 'crash' }"
          @click="activeTab = 'crash'"
        >
          💥 Crash Kinematics &amp; Gear
        </button>
      </nav>
    </header>

    <main class="main-content">
      <!-- Error Alert -->
      <div v-if="error" class="alert-bar bad">
        <strong>Error:</strong> {{ error }}
      </div>

      <!-- Critical Physics Safety Warning Banner -->
      <section
        class="alert-banner"
        :class="telemetry.safetyStatus"
        role="alert"
      >
        <div class="alert-icon">
          <span v-if="telemetry.safetyStatus === 'lowside'">🚨</span>
          <span v-else-if="telemetry.safetyStatus === 'highside'">💥</span>
          <span v-else-if="telemetry.safetyStatus === 'scraping'">⚠️</span>
          <span v-else-if="telemetry.safetyStatus === 'warning'">⚡</span>
          <span v-else>✅</span>
        </div>
        <div class="alert-body">
          <div class="alert-title">
            <span v-if="telemetry.safetyStatus === 'lowside'">CRITICAL: TRACTION LOSS / LOW-SIDE HAZARD</span>
            <span v-else-if="telemetry.safetyStatus === 'highside'">CRITICAL: COMBINED TRACTION BREAK (HIGH-SIDE RISK)</span>
            <span v-else-if="telemetry.safetyStatus === 'scraping'">CRITICAL: MECHANICAL GROUND CLEARANCE EXCEEDED</span>
            <span v-else-if="telemetry.safetyStatus === 'warning'">CAUTION: APPROACHING ADHESION OR LEAN LIMITS</span>
            <span v-else>OPTIMAL: OPERATING SAFELY WITHIN ENVELOPE</span>
          </div>
          <div class="alert-desc">{{ telemetry.statusMessage }}</div>
        </div>
        <div class="alert-kpi">
          <div class="kpi-box">
            <span class="k">True Lean θ</span>
            <span class="v">{{ telemetry.toroidalBikeLeanDeg.toFixed(1) }}°</span>
          </div>
          <div class="kpi-box">
            <span class="k">Grip Demand</span>
            <span class="v">{{ telemetry.gripUtilizationPct.toFixed(1) }}%</span>
          </div>
          <div class="kpi-box">
            <span class="k">Lateral Accel</span>
            <span class="v">{{ telemetry.lateralAccelG.toFixed(2) }} G</span>
          </div>
        </div>
      </section>

      <!-- TAB 1: CIRCUIT PRESETS -->
      <section v-if="activeTab === 'presets'" class="card">
        <TrackPresets @select="onCornerSelected" />
      </section>

      <!-- TAB 2: GARAGE & MOTORCYCLE SETUP -->
      <section v-if="activeTab === 'garage'" class="card">
        <GarageManager
          :availableMotorcycles="bikes"
          :selectedConfig="activeBike"
          @select-bike="(cfg) => { activeBike = cfg; activeTab = 'calc'; }"
        />
      </section>

      <!-- TAB 3: CRASH KINEMATICS & GEAR SIMULATOR -->
      <section v-if="activeTab === 'crash'" class="card">
        <CrashSimulator
          :telemetrySpeedKmh="speedKmh"
          :riderMassKg="rider.massKg"
          :useImperial="useImperial"
        />
      </section>

      <!-- TAB 4: LIVE DYNAMICS CALCULATOR & VISUALIZATIONS -->
      <div v-show="activeTab === 'calc'" class="calculator-view">
        <!-- Lean Auto-Optimizer Quick Bar -->
        <section class="card quick-actions-card">
          <div class="actions-header">
            <span class="section-tag">LEAN &amp; SPEED OPTIMIZERS</span>
            <span class="section-hint">Instantly solve required parameters to match target lean angle or grip limit:</span>
          </div>
          <div class="quick-btn-row">
            <button type="button" class="opt-btn" @click="setToMaxMechLeanSpeed">
              🎯 Set Speed for Max Lean ({{ activeBike.maxMechLeanDeg }}°)
            </button>
            <button type="button" class="opt-btn" @click="setToMaxMechLeanRadius">
              📐 Set Radius for Max Lean ({{ activeBike.maxMechLeanDeg }}°)
            </button>
            <button type="button" class="opt-btn" @click="setToTargetLean(50)">
              📍 Set Speed to 50.0° Lean
            </button>
            <button type="button" class="opt-btn" @click="setToTargetLean(55)">
              📍 Set Speed to 55.0° Lean
            </button>
            <button type="button" class="opt-btn highlight" @click="setToMaxGripLimit">
              ⚡ Set to 100% Grip Limit
            </button>
            <button type="button" class="opt-btn ok" @click="optimizeHangOff">
              🛡️ Auto-Hang-off for 4° Margin
            </button>
          </div>
        </section>

        <!-- Interactive Controls Card -->
        <section class="card controls-card">
          <h2>Cornering &amp; Rider Telemetry Controls</h2>

          <div class="controls-grid">
            <!-- Speed Control -->
            <div class="control-box">
              <div class="control-head">
                <label>Speed ({{ useImperial ? 'mph' : 'km/h' }})</label>
                <span class="val">{{ useImperial ? (speedKmh * 0.621371).toFixed(1) + ' mph' : speedKmh.toFixed(0) + ' km/h' }}</span>
              </div>
              <input
                type="range"
                min="20"
                max="260"
                step="1"
                v-model.number="speedKmh"
              />
              <div class="control-sub">
                <span>{{ (speedKmh * KMH_TO_MS).toFixed(1) }} m/s</span>
                <span>Max Safe: {{ maxSafeSpeedKmh.toFixed(0) }} km/h</span>
              </div>
            </div>

            <!-- Corner Radius Control -->
            <div class="control-box">
              <div class="control-head">
                <label>Corner Radius R ({{ useImperial ? 'feet' : 'meters' }})</label>
                <span class="val">{{ useImperial ? (radiusM * 3.28084).toFixed(0) + ' ft' : radiusM.toFixed(0) + ' m' }}</span>
              </div>
              <input
                type="range"
                min="10"
                max="180"
                step="1"
                v-model.number="radiusM"
              />
              <div class="control-sub">
                <span>Yaw Rate: {{ telemetry.turnRateDegS.toFixed(1) }}°/s</span>
                <span>Min Safe: {{ minSafeRadiusM.toFixed(0) }} m</span>
              </div>
            </div>

            <!-- Rider Hang-Off Control -->
            <div class="control-box">
              <div class="control-head">
                <label>Rider Hang-Off Offset</label>
                <span class="val ok">{{ rider.hangOffCm }} cm</span>
              </div>
              <input
                type="range"
                min="0"
                max="35"
                step="1"
                v-model.number="rider.hangOffCm"
              />
              <div class="control-sub">
                <span>{{ rider.hangOffCm === 0 ? 'Centered on seat' : rider.hangOffCm > 22 ? 'Extreme Knee/Elbow Down' : 'Body shifted off' }}</span>
                <span class="ok">Saves {{ telemetry.hangOffSavingsDeg.toFixed(1) }}° Lean</span>
              </div>
            </div>

            <!-- Rider Body Mass -->
            <div class="control-box">
              <div class="control-head">
                <label>Rider Body Mass</label>
                <span class="val">{{ useImperial ? (rider.massKg * 2.20462).toFixed(0) + ' lbs' : rider.massKg + ' kg' }}</span>
              </div>
              <input
                type="range"
                min="45"
                max="130"
                step="1"
                v-model.number="rider.massKg"
              />
              <div class="control-sub">
                <span>Bike: {{ activeBike.massKg }} kg</span>
                <span>Total: {{ activeBike.massKg + rider.massKg }} kg</span>
              </div>
            </div>

            <!-- Track Surface & Compound -->
            <div class="control-box full-width">
              <div class="control-head">
                <label>Surface Grip &amp; Tire Compound</label>
                <span class="val accent">Peak μ = {{ SURFACE_COMPOUNDS[selectedSurface].muPeak }}</span>
              </div>
              <select v-model="selectedSurface" class="styled-select">
                <option v-for="(val, key) in SURFACE_COMPOUNDS" :key="key" :value="key">
                  {{ val.label }} (μ = {{ val.muPeak }})
                </option>
              </select>
            </div>
          </div>
        </section>

        <!-- Multi-Angle Visualizer Cockpit Navigation -->
        <div class="angle-selector-bar">
          <div class="angle-title">Multi-Angle Dynamic View:</div>
          <div class="angle-btn-group">
            <button
              type="button"
              class="angle-btn"
              :class="{ active: visualizerAngle === 'rear' }"
              @click="visualizerAngle = 'rear'"
            >
              🔄 Rear Dynamic Roll Profile
            </button>
            <button
              type="button"
              class="angle-btn"
              :class="{ active: visualizerAngle === 'front' }"
              @click="visualizerAngle = 'front'"
            >
              🏍️ Front Aero &amp; Knee-Down
            </button>
            <button
              type="button"
              class="angle-btn"
              :class="{ active: visualizerAngle === 'side' }"
              @click="visualizerAngle = 'side'"
            >
              📐 Side Chassis &amp; CoG Ruler
            </button>
          </div>
        </div>

        <!-- Twin Visualizers Row -->
        <div class="visualizers-row">
          <!-- Active Angle Visualizer -->
          <div class="angle-container">
            <LeanVisualizer
              v-if="visualizerAngle === 'rear'"
              :telemetry="telemetry"
              :maxMechLeanDeg="activeBike.maxMechLeanDeg"
              :riderHangOffCm="rider.hangOffCm"
            />
            <FrontVisualizer
              v-else-if="visualizerAngle === 'front'"
              :telemetry="telemetry"
              :maxMechLeanDeg="activeBike.maxMechLeanDeg"
              :riderHangOffCm="rider.hangOffCm"
            />
            <SideVisualizer
              v-else-if="visualizerAngle === 'side'"
              :bike="activeBike"
              :riderMassKg="rider.massKg"
            />
          </div>

          <!-- Kamm Traction Circle -->
          <KammCircle
            :telemetry="telemetry"
            :longitudinalG="longitudinalG"
            @update:longitudinalG="(val) => longitudinalG = val"
          />
        </div>

        <!-- Detailed Physics Breakdown Card -->
        <section class="card breakdown-card">
          <h2>Vehicle Dynamics &amp; Contact Patch Kinematics</h2>
          <div class="breakdown-grid">
            <div class="stat-card highlight">
              <div class="stat-title">Toroidal Roll Lean vs Naive Point Mass</div>
              <div class="stat-val-big">{{ telemetry.toroidalBikeLeanDeg.toFixed(1) }}° <span class="sub">vs {{ telemetry.pointMassLeanDeg.toFixed(1) }}°</span></div>
              <div class="stat-desc">
                Cossalter's toroidal model shows the motorcycle must lean <strong>+{{ telemetry.leanAngleDeltaDeg.toFixed(1) }}° further</strong> than a simple point mass because the tire contact patch migrates up the tire wall.
              </div>
            </div>

            <div class="stat-card">
              <div class="stat-title">Contact Patch Migration (Δy)</div>
              <div class="stat-val">{{ telemetry.contactPatchOffsetMm.toFixed(1) }} mm</div>
              <div class="stat-desc">
                Lateral shift of the contact patch across the {{ activeBike.rearTireSize }} rear tire crown (crown radius rt = {{ telemetry.crownRadiusMm.toFixed(1) }} mm).
              </div>
            </div>

            <div class="stat-card">
              <div class="stat-title">Camber Thrust vs Slip Angle</div>
              <div class="stat-val">{{ (telemetry.camberThrustN / 1000).toFixed(2) }} kN <span class="sub">Camber</span></div>
              <div class="stat-desc">
                Camber thrust provides <strong>{{ ((telemetry.camberThrustN / Math.max(1, telemetry.requiredLateralForceN)) * 100).toFixed(0) }}%</strong> of the turning force as a rolling cone. Slip angle generates the remaining {{ (telemetry.slipAngleRequiredForceN / 1000).toFixed(2) }} kN.
              </div>
            </div>

            <div class="stat-card">
              <div class="stat-title">Available Acceleration Reserve</div>
              <div class="stat-val ok">{{ telemetry.availableLongitudinalG.toFixed(2) }} G</div>
              <div class="stat-desc">
                Remaining tractive capacity on the Kamm ellipse before breaking traction on corner exit throttle or trail braking.
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-layout {
  max-width: 1260px;
  margin: 0 auto;
  padding: 1.5rem 1rem 4rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.app-header {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}

.brand-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
}

.title-group {
  display: flex;
  align-items: center;
  gap: 0.9rem;
}

.logo-circle {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: rgba(255, 107, 61, 0.1);
  border: 1px solid rgba(255, 107, 61, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.logo-svg {
  width: 36px;
  height: 36px;
}

h1 {
  margin: 0;
  font-size: 1.85rem;
  letter-spacing: -0.03em;
  background: linear-gradient(90deg, var(--accent), var(--accent-2));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.tagline {
  margin: 0.15rem 0 0;
  font-size: 0.8rem;
  color: var(--muted);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.active-bike-badge {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  background: rgba(255, 107, 61, 0.08);
  border: 1px solid rgba(255, 107, 61, 0.3);
  padding: 0.3rem 0.65rem;
  border-radius: 8px;
  font-size: 0.72rem;
  cursor: pointer;
}
.active-badge-tag { color: var(--muted); font-size: 0.65rem; font-weight: 700; }
.active-badge-name { font-weight: 700; color: var(--text); }
.tire-specs { color: var(--accent-2); font-size: 0.68rem; font-family: monospace; }

.unit-toggle {
  font-size: 0.75rem;
  padding: 0.35rem 0.65rem;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border);
  color: var(--text);
  cursor: pointer;
}
.unit-toggle:hover {
  background: rgba(255, 255, 255, 0.1);
}

.status-chips {
  display: flex;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.chip {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid var(--border);
  padding: 0.3rem 0.6rem;
  border-radius: 8px;
  font-size: 0.72rem;
  color: var(--muted);
}

.sync-mini-btn {
  background: transparent;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 0;
  font-size: 0.85rem;
  line-height: 1;
}
.sync-mini-btn:hover {
  color: var(--accent-2);
}

.nav-tabs {
  display: flex;
  gap: 0.5rem;
  border-bottom: 1px solid var(--border);
  padding-bottom: 0.5rem;
  overflow-x: auto;
}

.tab-btn {
  background: transparent;
  border: 1px solid transparent;
  padding: 0.5rem 0.9rem;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}
.tab-btn:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.04);
}
.tab-btn.active {
  color: var(--accent-2);
  background: rgba(255, 107, 61, 0.12);
  border-color: rgba(255, 107, 61, 0.3);
}

.main-content {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.alert-banner {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 1.25rem;
  padding: 1rem 1.25rem;
  border-radius: 14px;
  backdrop-filter: blur(14px);
  border: 1px solid var(--border);
}

.alert-banner.optimal {
  background: linear-gradient(135deg, rgba(61, 220, 151, 0.12), rgba(61, 220, 151, 0.04));
  border-color: rgba(61, 220, 151, 0.35);
}
.alert-banner.warning {
  background: linear-gradient(135deg, rgba(255, 207, 92, 0.15), rgba(255, 207, 92, 0.05));
  border-color: rgba(255, 207, 92, 0.4);
}
.alert-banner.scraping {
  background: linear-gradient(135deg, rgba(255, 92, 108, 0.2), rgba(255, 92, 108, 0.08));
  border-color: rgba(255, 92, 108, 0.55);
  animation: pulse-red 1.2s infinite ease-in-out;
}
.alert-banner.lowside, .alert-banner.highside {
  background: linear-gradient(135deg, rgba(255, 92, 108, 0.25), rgba(255, 107, 61, 0.15));
  border-color: rgba(255, 92, 108, 0.65);
  animation: pulse-red 0.9s infinite ease-in-out;
}

@keyframes pulse-red {
  0% { box-shadow: 0 0 0 rgba(255, 92, 108, 0); }
  50% { box-shadow: 0 0 16px rgba(255, 92, 108, 0.4); }
  100% { box-shadow: 0 0 0 rgba(255, 92, 108, 0); }
}

.alert-icon { font-size: 1.8rem; }
.alert-title { font-size: 0.92rem; font-weight: 800; letter-spacing: 0.05em; color: var(--text); }
.alert-desc { font-size: 0.82rem; color: var(--text); margin-top: 0.2rem; opacity: 0.9; }

.alert-kpi {
  display: flex;
  gap: 0.75rem;
}
.kpi-box {
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.3);
  padding: 0.4rem 0.75rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.kpi-box .k { font-size: 0.68rem; color: var(--muted); }
.kpi-box .v { font-size: 1rem; font-weight: 800; color: var(--text); font-variant-numeric: tabular-nums; }

.calculator-view {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.quick-actions-card {
  padding: 0.9rem 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  background: rgba(255, 255, 255, 0.02);
}

.actions-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.section-tag {
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: var(--accent-2);
}
.section-hint {
  font-size: 0.72rem;
  color: var(--muted);
}

.quick-btn-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.opt-btn {
  font-size: 0.72rem;
  padding: 0.35rem 0.65rem;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border);
  color: var(--text);
  cursor: pointer;
  transition: all 0.15s ease;
}
.opt-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}
.opt-btn.highlight {
  background: rgba(255, 107, 61, 0.15);
  border-color: rgba(255, 107, 61, 0.35);
  color: var(--accent-2);
}
.opt-btn.ok {
  background: rgba(61, 220, 151, 0.12);
  border-color: rgba(61, 220, 151, 0.3);
  color: var(--ok);
}

.controls-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem;
}

.control-box {
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.85rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.control-box.full-width {
  grid-column: 1 / -1;
}

.control-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.78rem;
  color: var(--muted);
}
.control-head .val {
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--text);
}
.control-head .val.ok { color: var(--ok); }
.control-head .val.accent { color: var(--accent-2); }

.control-sub {
  display: flex;
  justify-content: space-between;
  font-size: 0.68rem;
  color: var(--muted);
}

.angle-selector-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 0.25rem 0.5rem;
}
.angle-title {
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}

.angle-btn-group {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.angle-btn {
  font-size: 0.74rem;
  font-weight: 600;
  padding: 0.35rem 0.7rem;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border);
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
}
.angle-btn:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.08);
}
.angle-btn.active {
  color: var(--accent-2);
  background: rgba(255, 107, 61, 0.12);
  border-color: rgba(255, 107, 61, 0.35);
}

.visualizers-row {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: 1.25rem;
}

@media (max-width: 900px) {
  .visualizers-row {
    grid-template-columns: 1fr;
  }
}

.angle-container {
  display: flex;
  flex-direction: column;
}

.breakdown-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 1rem;
}

.stat-card {
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.stat-card.highlight {
  border-color: rgba(255, 107, 61, 0.35);
  background: linear-gradient(135deg, rgba(255, 107, 61, 0.08), rgba(0, 0, 0, 0.3));
}

.stat-title {
  font-size: 0.74rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}

.stat-val-big {
  font-size: 1.45rem;
  font-weight: 800;
  color: var(--accent-2);
  font-variant-numeric: tabular-nums;
}
.stat-val-big .sub {
  font-size: 0.95rem;
  color: var(--muted);
  font-weight: 500;
}

.stat-val {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.stat-val.ok { color: var(--ok); }
.stat-val .sub { font-size: 0.8rem; color: var(--muted); }

.stat-desc {
  font-size: 0.72rem;
  color: var(--muted);
  line-height: 1.4;
}

.alert-bar.bad {
  background: rgba(255, 92, 108, 0.15);
  border: 1px solid var(--bad);
  color: var(--bad);
  padding: 0.65rem 1rem;
  border-radius: 10px;
  font-size: 0.8rem;
}
</style>
