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

// Crash Simulator State & Navigation
const crashSimulatorMode = ref<'lowside' | 'highside'>('lowside');

function openCrashSimulator(mode: 'lowside' | 'highside') {
  crashSimulatorMode.value = mode;
  activeTab.value = 'crash';
  window.scrollTo({ top: 0, behavior: 'smooth' });
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

async function forceReloadFresh() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) {
        await r.update();
      }
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      for (const k of keys) {
        if (!k.includes('sqlite')) {
          await caches.delete(k);
        }
      }
    }
  } catch {
    // ignore
  }
  window.location.reload();
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
    cm: crashSimulatorMode.value,
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
    if (state.cm && ['lowside', 'highside'].includes(state.cm)) {
      crashSimulatorMode.value = state.cm;
    }
  } catch {
    // ignore
  }
}

watch([speedKmh, radiusM, longitudinalG, selectedSurface, rider, activeBike, activeTab, crashSimulatorMode], syncToUrlHash, { deep: true });

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
            <div class="chip reload-chip" @click="forceReloadFresh" title="Force check for app updates and refresh cache">
              <span>↻ Refresh App</span>
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
          class="tab-btn crash-tab-btn"
          :class="{ active: activeTab === 'crash' }"
          @click="activeTab = 'crash'"
        >
          💥 Crash Simulator (Low &amp; High-Side)
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
        <div class="alert-actions">
          <button
            v-if="telemetry.safetyStatus === 'lowside'"
            type="button"
            class="sim-action-btn pulse-glow-btn"
            @click="openCrashSimulator('lowside')"
          >
            📉 Simulate Low-Side Washout ({{ speedKmh }} km/h) →
          </button>
          <button
            v-else-if="telemetry.safetyStatus === 'highside'"
            type="button"
            class="sim-action-btn pulse-glow-btn highside-theme"
            @click="openCrashSimulator('highside')"
          >
            🚀 Simulate High-Side Catapult ({{ speedKmh }} km/h) →
          </button>
          <div v-else class="sim-action-links">
            <button
              type="button"
              class="sim-action-btn secondary"
              @click="openCrashSimulator('lowside')"
              title="Simulate front or rear slide washout and sliding distance"
            >
              📉 Low-Side Sim
            </button>
            <button
              type="button"
              class="sim-action-btn secondary"
              @click="openCrashSimulator('highside')"
              title="Simulate rear snap grip bite and catapult flight arc"
            >
              🚀 High-Side Sim
            </button>
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
      <section v-if="activeTab === 'crash'" class="card crash-card-container">
        <CrashSimulator
          :telemetrySpeedKmh="speedKmh"
          :riderMassKg="rider.massKg"
          :useImperial="useImperial"
          :initialMode="crashSimulatorMode"
        />
      </section>

      <!-- TAB 4: LIVE DYNAMICS CALCULATOR & VISUALIZATIONS -->
      <div v-show="activeTab === 'calc'" class="calculator-view">
        <!-- Multi-Angle Visualizer Perspective Switcher Card -->
        <section class="card angle-selector-card">
          <div class="angle-header-bar">
            <div class="angle-title-group">
              <span class="angle-badge">CHASSIS &amp; RIDER PERSPECTIVE</span>
              <h2 class="angle-main-title">Interactive Dynamic Telemetry Camera</h2>
            </div>
            <div class="angle-status-tag">
              Active View: <strong>{{ visualizerAngle === 'rear' ? 'Rear Dynamic Roll' : visualizerAngle === 'front' ? 'Front Aero & Knee-Down' : 'Side Chassis & CoG Ruler' }}</strong>
            </div>
          </div>

          <div class="angle-tabs-grid">
            <button
              type="button"
              class="angle-tab-btn"
              :class="{ active: visualizerAngle === 'rear' }"
              @click="visualizerAngle = 'rear'"
            >
              <div class="tab-icon-wrap">🔄</div>
              <div class="tab-text-wrap">
                <span class="tab-heading">Rear Dynamic Roll</span>
                <span class="tab-desc">Cossalter Lean θ &amp; Crown Shift</span>
              </div>
            </button>

            <button
              type="button"
              class="angle-tab-btn"
              :class="{ active: visualizerAngle === 'front' }"
              @click="visualizerAngle = 'front'"
            >
              <div class="tab-icon-wrap">🏍️</div>
              <div class="tab-text-wrap">
                <span class="tab-heading">Front Aero &amp; Knee-Down</span>
                <span class="tab-desc">Knee Puck Clearance &amp; Aero Wings</span>
              </div>
            </button>

            <button
              type="button"
              class="angle-tab-btn"
              :class="{ active: visualizerAngle === 'side' }"
              @click="visualizerAngle = 'side'"
            >
              <div class="tab-icon-wrap">📐</div>
              <div class="tab-text-wrap">
                <span class="tab-heading">Side Chassis &amp; CoG Ruler</span>
                <span class="tab-desc">Wheelbase, CoG Elevation &amp; Pitch</span>
              </div>
            </button>
          </div>
        </section>

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

        <!-- Crash Kinematics & Limit Loss Direct Launchers -->
        <section class="card crash-entry-card">
          <div class="crash-card-header">
            <div>
              <span class="section-tag alert">LIMIT LOSS &amp; EJECTION DYNAMICS</span>
              <h2 class="crash-card-title">💥 Crash Simulator: Low-Side Washout vs High-Side Catapult</h2>
            </div>
            <span class="crash-card-sub">Client-side physics modeling of loss of adhesion and kinetic energy dissipation</span>
          </div>
          <div class="crash-entry-grid">
            <div class="crash-entry-box lowside-box" @click="openCrashSimulator('lowside')" role="button" tabindex="0">
              <div class="box-badge lowside-badge">📉 LOW-SIDE SIMULATOR</div>
              <div class="box-title">Washout &amp; Pavement Slide</div>
              <p class="box-desc">
                Tire exceeds maximum adhesion limit. The chassis falls inward and slides flat. Analyze fairing vs rider gear sliding separation distance and abrasion risk.
              </p>
              <div class="box-cta">
                <span>Simulate Washout at {{ speedKmh }} km/h &amp; {{ telemetry.toroidalBikeLeanDeg.toFixed(1) }}° Lean</span>
                <span class="arrow">→</span>
              </div>
            </div>

            <div class="crash-entry-box highside-box" @click="openCrashSimulator('highside')" role="button" tabindex="0">
              <div class="box-badge highside-badge">🚀 HIGH-SIDE SIMULATOR</div>
              <div class="box-title">Catapult Snap &amp; Ejection Flight</div>
              <p class="box-desc">
                Rear tire breaks traction in yaw slip, then suddenly bites grip. Instantaneous roll torque turns the bike into a lever, catapulting the rider. Calculate apex height, flight time, and ground impact Gs.
              </p>
              <div class="box-cta">
                <span>Simulate Catapult at {{ speedKmh }} km/h &amp; {{ telemetry.toroidalBikeLeanDeg.toFixed(1) }}° Lean</span>
                <span class="arrow">→</span>
              </div>
            </div>
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

.reload-chip {
  cursor: pointer;
  background: rgba(255, 107, 61, 0.16);
  border-color: rgba(255, 107, 61, 0.45);
  color: var(--accent-2);
  font-weight: 700;
  transition: all 0.2s ease;
}
.reload-chip:hover {
  background: rgba(255, 107, 61, 0.3);
  border-color: var(--accent);
  color: #ffffff;
  transform: translateY(-1px);
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
  gap: 0.6rem;
  background: #0d1422;
  border: 1.5px solid #23334b;
  border-radius: 14px;
  padding: 0.45rem;
  overflow-x: auto;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
}

.tab-btn {
  background: #141f30;
  border: 1.5px solid #23354d;
  padding: 0.65rem 1.15rem;
  border-radius: 10px;
  font-size: 0.88rem;
  font-weight: 700;
  color: #cbd5e1;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 0.45rem;
}
.tab-btn:hover {
  color: #ffffff;
  background: #1c2b42;
  border-color: #3b567d;
  transform: translateY(-1px);
}
.tab-btn.active {
  color: #ffffff;
  background: linear-gradient(135deg, #ff6b3d, #ff8c42);
  border-color: #ffaa5a;
  box-shadow: 0 4px 16px rgba(255, 107, 61, 0.45);
}

.main-content {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.alert-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1.25rem;
  padding: 1rem 1.35rem;
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
.alert-body { flex: 1 1 300px; min-width: 260px; }
.alert-title { font-size: 0.92rem; font-weight: 800; letter-spacing: 0.05em; color: var(--text); }
.alert-desc { font-size: 0.82rem; color: var(--text); margin-top: 0.2rem; opacity: 0.9; }

.alert-kpi {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
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

.alert-actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-shrink: 0;
}
.sim-action-links {
  display: flex;
  gap: 0.5rem;
}
.sim-action-btn {
  background: linear-gradient(135deg, #ff6b3d, #ff3d5a);
  border: 1.5px solid #ffa17a;
  color: #ffffff;
  padding: 0.6rem 1.1rem;
  border-radius: 9px;
  font-size: 0.85rem;
  font-weight: 800;
  cursor: pointer;
  letter-spacing: 0.02em;
  box-shadow: 0 4px 14px rgba(255, 61, 90, 0.4);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  white-space: nowrap;
}
.sim-action-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(255, 61, 90, 0.6);
  border-color: #ffffff;
}
.sim-action-btn.secondary {
  background: #142032;
  border: 1.5px solid #294061;
  color: #e2e8f0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}
.sim-action-btn.secondary:hover {
  background: #1d2e48;
  border-color: #ff6b3d;
  color: #ffffff;
  box-shadow: 0 4px 14px rgba(255, 107, 61, 0.35);
}
.sim-action-btn.highside-theme {
  background: linear-gradient(135deg, #ff3d5a, #d62246);
  border-color: #ff758c;
  box-shadow: 0 4px 14px rgba(214, 34, 70, 0.45);
}

.crash-card-container {
  padding: 0;
  background: transparent;
  border: none;
}

.crash-entry-card {
  padding: 1.25rem 1.4rem;
  background: linear-gradient(180deg, rgba(20, 30, 48, 0.85), rgba(13, 20, 34, 0.98));
  border: 1.5px solid #23354d;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  border-radius: 14px;
}
.crash-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.crash-card-title {
  margin: 0.25rem 0 0;
  font-size: 1.25rem;
  font-weight: 800;
  color: #ffffff;
  letter-spacing: -0.01em;
}
.crash-card-sub {
  font-size: 0.82rem;
  color: #94a3b8;
  font-style: italic;
}
.crash-entry-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1.1rem;
}
.crash-entry-box {
  background: #0d1524;
  border: 1.5px solid #1f2f47;
  border-radius: 12px;
  padding: 1.2rem 1.25rem;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  position: relative;
  overflow: hidden;
}
.crash-entry-box:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5);
}
.crash-entry-box.lowside-box:hover {
  border-color: #ff8c42;
  box-shadow: 0 10px 28px rgba(255, 140, 66, 0.25);
}
.crash-entry-box.highside-box:hover {
  border-color: #ff3d5a;
  box-shadow: 0 10px 28px rgba(255, 61, 90, 0.25);
}
.box-badge {
  display: inline-block;
  align-self: flex-start;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  padding: 0.25rem 0.6rem;
  border-radius: 6px;
}
.box-badge.lowside-badge {
  background: rgba(255, 140, 66, 0.15);
  border: 1px solid rgba(255, 140, 66, 0.4);
  color: #ffaa5a;
}
.box-badge.highside-badge {
  background: rgba(255, 61, 90, 0.15);
  border: 1px solid rgba(255, 61, 90, 0.4);
  color: #ff758c;
}
.box-title {
  font-size: 1.05rem;
  font-weight: 800;
  color: #ffffff;
}
.box-desc {
  margin: 0;
  font-size: 0.82rem;
  color: #94a3b8;
  line-height: 1.45;
  flex-grow: 1;
}
.box-cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 0.5rem;
  padding-top: 0.6rem;
  border-top: 1px solid #1a273b;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--accent);
}
.crash-entry-box:hover .box-cta {
  color: #ffffff;
}
.box-cta .arrow {
  font-size: 1.1rem;
  transition: transform 0.2s ease;
}
.crash-entry-box:hover .box-cta .arrow {
  transform: translateX(4px);
}

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

.angle-selector-card {
  margin-bottom: 1rem;
  padding: 1rem 1.25rem;
  background: #0f1726;
  border: 1.5px solid #23354d;
}

.angle-header-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}

.angle-title-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.angle-badge {
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  padding: 0.2rem 0.55rem;
  border-radius: 6px;
  background: rgba(255, 107, 61, 0.15);
  color: var(--accent);
  border: 1px solid rgba(255, 107, 61, 0.35);
}

.angle-main-title {
  margin: 0 !important;
  font-size: 0.9rem !important;
  font-weight: 700;
  color: #f1f5f9;
  letter-spacing: normal !important;
  text-transform: none !important;
}

.angle-status-tag {
  font-size: 0.8rem;
  color: var(--muted);
}
.angle-status-tag strong {
  color: var(--accent-2);
}

.angle-tabs-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
}

@media (max-width: 820px) {
  .angle-tabs-grid {
    grid-template-columns: 1fr;
  }
}

.angle-tab-btn {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 0.75rem 1rem;
  background: #141f30;
  border: 1.5px solid #243750;
  border-radius: 12px;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.angle-tab-btn:hover {
  background: #1b2b42;
  border-color: #3b567d;
  transform: translateY(-2px);
}

.angle-tab-btn.active {
  background: linear-gradient(135deg, rgba(255, 107, 61, 0.22), rgba(255, 179, 71, 0.12));
  border-color: #ff6b3d;
  box-shadow: 0 0 16px rgba(255, 107, 61, 0.35);
}

.tab-icon-wrap {
  font-size: 1.4rem;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.angle-tab-btn.active .tab-icon-wrap {
  background: rgba(255, 107, 61, 0.2);
  border-color: rgba(255, 107, 61, 0.45);
}

.tab-text-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.tab-heading {
  font-size: 0.88rem;
  font-weight: 700;
  color: #f8fafc;
}

.angle-tab-btn.active .tab-heading {
  color: #ffb347;
}

.tab-desc {
  font-size: 0.7rem;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.angle-tab-btn.active .tab-desc {
  color: #cbd5e1;
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
