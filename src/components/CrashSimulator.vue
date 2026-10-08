<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { KMH_TO_MS, MS_TO_KMH } from '../physics/constants';
import {
  calculateHighSidePhysics,
  calculateLowSidePhysics,
  calculateSlidePhysics,
  GEAR_MATERIALS,
  type GearMaterial,
  type HighSidePhysicsResult,
  type LowSidePhysicsResult,
} from '../physics/kinematics';

const props = withDefaults(
  defineProps<{
    telemetrySpeedKmh: number;
    riderMassKg: number;
    useImperial: boolean;
    initialMode?: 'lowside' | 'highside';
  }>(),
  {
    initialMode: 'lowside',
  }
);

// Crash Mode Selector: 'lowside' vs 'highside'
const crashMode = ref<'lowside' | 'highside'>(props.initialMode);

// Sync mode if initialMode prop changes
watch(
  () => props.initialMode,
  (newMode) => {
    if (newMode) crashMode.value = newMode;
  }
);

// Shared Scenario Inputs
const crashSpeedKmh = ref<number>(110);
const leanAngleDeg = ref<number>(52);
const selectedMaterialKey = ref<string>('cowhide_leather');
const runoffBufferMeters = ref<number>(85); // typical track runoff gravel + asphalt buffer

// Low-Side Specific Inputs
const lowsideTireLost = ref<'front' | 'rear'>('front');

// High-Side Specific Inputs
const highsideSlipAngleDeg = ref<number>(22);
const highsideTrigger = ref<'throttle_chop' | 'curb_bite' | 'clean_tarmac'>('throttle_chop');

// Animation State
const isPlaying = ref(false);
const animProgress = ref(0); // 0.0 to 1.0
let animFrameId: number | null = null;
let lastAnimTimestamp = 0;

function togglePlay() {
  if (isPlaying.value) {
    pauseAnim();
  } else {
    if (animProgress.value >= 1) animProgress.value = 0;
    startAnim();
  }
}

function startAnim() {
  isPlaying.value = true;
  lastAnimTimestamp = performance.now();
  const step = (now: number) => {
    if (!isPlaying.value) return;
    const dt = (now - lastAnimTimestamp) / 1000;
    lastAnimTimestamp = now;

    // Total animation cycle ~ 4.5 seconds
    const duration = crashMode.value === 'highside' ? 4.5 : 4.0;
    animProgress.value = Math.min(1.0, animProgress.value + dt / duration);

    if (animProgress.value >= 1.0) {
      isPlaying.value = false;
    } else {
      animFrameId = requestAnimationFrame(step);
    }
  };
  animFrameId = requestAnimationFrame(step);
}

function pauseAnim() {
  isPlaying.value = false;
  if (animFrameId) cancelAnimationFrame(animFrameId);
}

function resetAnim() {
  pauseAnim();
  animProgress.value = 0;
}

onBeforeUnmount(() => {
  if (animFrameId) cancelAnimationFrame(animFrameId);
});

// Reset animation when mode changes
watch(crashMode, () => {
  resetAnim();
});

// Selected Gear Material
const selectedMaterial = computed<GearMaterial>(() => {
  return GEAR_MATERIALS[selectedMaterialKey.value] ?? GEAR_MATERIALS.cowhide_leather;
});

// Unit conversion helpers
const crashSpeedMs = computed(() => crashSpeedKmh.value * KMH_TO_MS);
const displaySpeed = computed({
  get: () => (props.useImperial ? Math.round(crashSpeedKmh.value * 0.621371) : Math.round(crashSpeedKmh.value)),
  set: (val: number) => {
    crashSpeedKmh.value = props.useImperial ? Math.round(val / 0.621371) : val;
  },
});

// Low-Side Physics Calculation
const lowsidePhysics = computed<LowSidePhysicsResult>(() => {
  return calculateLowSidePhysics(
    crashSpeedMs.value,
    leanAngleDeg.value,
    lowsideTireLost.value,
    props.riderMassKg,
    200,
    selectedMaterial.value.mu_k,
    9.81
  );
});

// High-Side Physics Calculation
const highsidePhysics = computed<HighSidePhysicsResult>(() => {
  return calculateHighSidePhysics(
    crashSpeedMs.value,
    leanAngleDeg.value,
    highsideSlipAngleDeg.value,
    props.riderMassKg,
    200,
    selectedMaterial.value.mu_k,
    9.81
  );
});

// General Slide Physics for shared cards
const slidePhysics = computed(() => {
  return calculateSlidePhysics(
    crashSpeedMs.value,
    selectedMaterial.value.mu_k,
    props.riderMassKg,
    9.81
  );
});

// Metric / Imperial converted outputs
const runoffBufferDisplay = computed(() => {
  const m = runoffBufferMeters.value;
  return props.useImperial ? `${(m * 3.28084).toFixed(0)} ft` : `${m.toFixed(0)} m`;
});

// Runoff breach check
const activeTotalDistanceM = computed(() => {
  return crashMode.value === 'highside'
    ? highsidePhysics.value.totalCrashDistanceMeters
    : lowsidePhysics.value.riderSlideDistanceMeters;
});

const isRunoffBreached = computed(() => {
  return activeTotalDistanceM.value > runoffBufferMeters.value;
});

const excessDistanceM = computed(() => {
  return Math.max(0, activeTotalDistanceM.value - runoffBufferMeters.value);
});

// Residual velocity if striking perimeter barrier
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
  const slideTime =
    crashMode.value === 'highside'
      ? highsidePhysics.value.postImpactSlideDistanceMeters / Math.max(1, crashSpeedMs.value * 0.5)
      : lowsidePhysics.value.riderSlideDurationSeconds;
  const burnTime = selectedMaterial.value.burnThroughTimeSecAt100Kmh * (100 / Math.max(30, crashSpeedKmh.value));
  return burnTime / Math.max(0.1, slideTime);
});

// Sync speed from live cornering calculator
function importLiveSpeed() {
  crashSpeedKmh.value = Math.max(20, Math.min(300, Math.round(props.telemetrySpeedKmh)));
}

// Preset speeds
const SPEED_PRESETS = [
  { label: '60 km/h (Urban)', kmh: 60 },
  { label: '100 km/h (Club Apex)', kmh: 100 },
  { label: '140 km/h (Fast Sweeper)', kmh: 140 },
  { label: '180 km/h (GP Sweeper)', kmh: 180 },
  { label: '220 km/h (End of Straight)', kmh: 220 },
];
</script>

<template>
  <div class="crash-sim-panel">
    <!-- Header -->
    <div class="panel-header">
      <div class="title-group">
        <span class="panel-tag">PHASE 5 · CRASH DYNAMICS &amp; GEAR SIMULATION</span>
        <h2 class="panel-title">Low-Side &amp; High-Side Crash Physics Engine</h2>
        <p class="panel-subtitle">
          Interactive client-side simulation contrasting inward low-side pavement slides against violent high-side
          catapult ejections and gear abrasion energy dissipation.
        </p>
      </div>

      <div class="quick-import">
        <button type="button" class="btn-import" @click="importLiveSpeed">
          ⚡ Sync Live Speed ({{ Math.round(telemetrySpeedKmh) }} km/h)
        </button>
      </div>
    </div>

    <!-- PRIMARY CRASH MODE SELECTOR: LOW-SIDE VS HIGH-SIDE -->
    <div class="crash-mode-card">
      <div class="mode-header">
        <span class="mode-label">SELECT CRASH DYNAMICS SCENARIO:</span>
        <span class="mode-desc">
          {{
            crashMode === 'lowside'
              ? 'Tire adhesion limit exceeded — bike drops inward, sliding on chassis fairing.'
              : 'Rear wheel slip angle snaps back into adhesion — rotational impulse catapults rider over the bike.'
          }}
        </span>
      </div>

      <div class="mode-toggle-grid">
        <button
          type="button"
          class="mode-btn"
          :class="{ active: crashMode === 'lowside' }"
          @click="crashMode = 'lowside'"
        >
          <div class="mode-icon-box">📉</div>
          <div class="mode-text-box">
            <span class="mode-name">LOW-SIDE WASHOUT &amp; SLIDE</span>
            <span class="mode-sub">Trail-Braking Front Washout or Rear Power Spin · Flat Pavement Slide</span>
          </div>
        </button>

        <button
          type="button"
          class="mode-btn"
          :class="{ active: crashMode === 'highside' }"
          @click="crashMode = 'highside'"
        >
          <div class="mode-icon-box">🚀</div>
          <div class="mode-text-box">
            <span class="mode-name">HIGH-SIDE SNAP &amp; CATAPULT</span>
            <span class="mode-sub">Rear Tire Slip Break &amp; Grip Bite · Catapult Ejection &amp; Air Time</span>
          </div>
        </button>
      </div>
    </div>

    <!-- HAZARD & ALERT BANNERS -->
    <!-- High-Side Catapult Trauma Alert -->
    <div v-if="crashMode === 'highside'" class="alert-box danger-alert">
      <div class="alert-icon">💥</div>
      <div class="alert-content">
        <span class="alert-heading">HIGH-SIDE CATAPULT HAZARD · PEAK EJECTION ELEVATION DETECTED</span>
        <p>
          Sudden grip recovery snaps the chassis around its contact patch, launching the rider
          <strong>{{ highsidePhysics.apexHeightMeters.toFixed(1) }} meters into the air</strong> at
          <strong>{{ (highsidePhysics.verticalLaunchVelocityMs * 3.6).toFixed(0) }} km/h vertical velocity</strong>.
          Airborne duration is <strong>{{ highsidePhysics.airborneDurationSeconds.toFixed(2) }} seconds</strong> before
          crashing into the tarmac with a severe impact deceleration of approximately
          <strong>{{ highsidePhysics.groundImpactSeverityG }} Gs</strong>.
        </p>
      </div>
    </div>

    <!-- Low-Side Tumble Risk from Denim -->
    <div v-else-if="slidePhysics.tumbleRisk" class="alert-box danger-alert">
      <div class="alert-icon">⚠️</div>
      <div class="alert-content">
        <span class="alert-heading">VIOLENT TUMBLE &amp; ROTATIONAL TRAUMA HAZARD DETECTED</span>
        <p>
          <strong>{{ selectedMaterial.name }}</strong> has an excessively high coefficient of kinetic friction
          (<strong>&mu;<sub>k</sub> = {{ selectedMaterial.mu_k }}</strong> &gt; 0.60).
          Rather than allowing a flat, energy-dissipating slide, the cotton weave snags aggregate asphalt,
          generating intense rotational torque that violently throws the rider into high-G end-over-end flips.
        </p>
      </div>
    </div>

    <!-- Synthetic Fiber Melt Warning -->
    <div v-else-if="selectedMaterial.meltingRisk && crashSpeedKmh > 80" class="alert-box warn-alert">
      <div class="alert-icon">🔥</div>
      <div class="alert-content">
        <span class="alert-heading">SYNTHETIC FIBER MELT-THROUGH HAZARD</span>
        <p>
          At <strong>{{ crashSpeedKmh }} km/h</strong>, the sliding duration generates extreme frictional thermal heat
          (<strong>{{ ((slidePhysics.kineticEnergyJoules ?? 0) / 1000).toFixed(0) }} kJ</strong>).
          Polyamide/Cordura textiles risk melting directly into epidermal tissue under prolonged friction.
        </p>
      </div>
    </div>

    <!-- Runoff Zone Breach Warning -->
    <div v-else-if="isRunoffBreached" class="alert-box barrier-alert">
      <div class="alert-icon">🛑</div>
      <div class="alert-content">
        <span class="alert-heading">RUNOFF ZONE EXCEEDED — AIRFENCE / BARRIER IMPACT RISK</span>
        <p>
          Stopping distance of <strong>{{ activeTotalDistanceM.toFixed(1) }} m</strong> exceeds available track buffer
          (<strong>{{ runoffBufferDisplay }}</strong>) by <strong>{{ excessDistanceM.toFixed(1) }} meters</strong>.
          Residual barrier impact velocity is
          <strong>{{ useImperial ? Math.round(residualSpeedKmh * 0.621371) + ' mph' : residualSpeedKmh + ' km/h' }}</strong>!
        </p>
      </div>
    </div>

    <div v-else class="alert-box ok-alert">
      <div class="alert-icon">🛡️</div>
      <div class="alert-content">
        <span class="alert-heading">CONTROLLED LOW-SIDE TRACK SLIDE ENVELOPE</span>
        <p>
          Kinetic friction (<strong>&mu;<sub>k</sub> = {{ selectedMaterial.mu_k }}</strong>) allows a controlled
          flat slide stopping within available runoff. Sacrificial leather fibers safely absorb abrasion.
        </p>
      </div>
    </div>

    <!-- INTERACTIVE 2D DYNAMICS VISUALIZER CANVAS -->
    <section class="card visualizer-card">
      <div class="vis-header-row">
        <div class="vis-title-group">
          <span class="badge" :class="crashMode === 'highside' ? 'highside-badge' : 'lowside-badge'">
            {{ crashMode === 'highside' ? '🚀 HIGH-SIDE CATAPULT ARC' : '📉 LOW-SIDE SEPARATION RUNWAY' }}
          </span>
          <h3 class="vis-title">
            {{
              crashMode === 'highside'
                ? 'Airborne Ejection Trajectory & Tarmac Impact Shock'
                : 'Pavement Friction Deceleration & Bike Separation'
            }}
          </h3>
        </div>

        <!-- Animation Controls Bar -->
        <div class="anim-controls">
          <button type="button" class="btn-anim-play" @click="togglePlay">
            {{ isPlaying ? '⏸ Pause' : animProgress >= 1 ? '↺ Replay' : '▶ Play Simulation' }}
          </button>
          <button type="button" class="btn-anim-reset" @click="resetAnim">↺ Reset</button>
          <div class="scrub-container">
            <span class="scrub-label">Time: {{ (animProgress * 100).toFixed(0) }}%</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              v-model.number="animProgress"
              @input="pauseAnim"
              class="scrub-slider"
            />
          </div>
        </div>
      </div>

      <!-- SVG GRAPHIC 1: HIGH-SIDE CATAPULT TRAJECTORY ARC -->
      <svg
        v-if="crashMode === 'highside'"
        viewBox="0 0 760 380"
        class="sim-canvas"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#0a1222" />
            <stop offset="100%" stop-color="#121b2d" />
          </linearGradient>
          <linearGradient id="arcGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#ff4444" />
            <stop offset="50%" stop-color="#ffb347" />
            <stop offset="100%" stop-color="#ff6b3d" />
          </linearGradient>
          <filter id="glow-highside" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        <!-- Sky Background -->
        <rect x="0" y="0" width="760" height="380" fill="url(#skyGrad)" />

        <!-- Altitude Height Grid Ticks (0m to 4m) -->
        <g stroke="rgba(255,255,255,0.08)" stroke-dasharray="3 4">
          <line x1="60" y1="280" x2="720" y2="280" /> <!-- Ground plane -->
          <line x1="60" y1="210" x2="720" y2="210" /> <!-- 1 meter -->
          <line x1="60" y1="140" x2="720" y2="140" /> <!-- 2 meters -->
          <line x1="60" y1="70" x2="720" y2="70" />   <!-- 3 meters -->
        </g>
        <text x="35" y="284" fill="#94a3b8" font-size="10" font-family="monospace">0m</text>
        <text x="35" y="214" fill="#94a3b8" font-size="10" font-family="monospace">1m</text>
        <text x="35" y="144" fill="#94a3b8" font-size="10" font-family="monospace">2m</text>
        <text x="35" y="74" fill="#94a3b8" font-size="10" font-family="monospace">3m</text>

        <!-- Asphalt Road Surface -->
        <rect x="0" y="280" width="760" height="100" fill="#141a24" />
        <line x1="0" y1="280" x2="760" y2="280" stroke="#334460" stroke-width="3" />

        <!-- Runoff Airfence Barrier at distance scale -->
        <g transform="translate(680, 200)">
          <rect x="0" y="0" width="16" height="80" fill="#ff4444" rx="3" />
          <line x1="8" y1="0" x2="8" y2="80" stroke="#ffffff" stroke-width="2" stroke-dasharray="4 4" />
          <text x="-40" y="-10" fill="#ff6b3d" font-size="10" font-family="monospace" font-weight="bold">Airfence</text>
        </g>

        <!-- Catapult Launch Motorcycle (Position: X = 120, Y = 280) -->
        <g transform="translate(120, 280)">
          <!-- Bike snapped upright and pitching -->
          <circle cx="0" cy="-28" r="14" fill="#2d3748" stroke="#ffb347" stroke-width="2" />
          <line x1="0" y1="-28" x2="25" y2="-55" stroke="#cbd5e1" stroke-width="3" />
          <!-- Rear tire grip snap pivot indicator -->
          <circle cx="0" cy="0" r="5" fill="#ff4444" filter="url(#glow-highside)" />
          <text x="-50" y="24" fill="#ff6b3d" font-size="10" font-family="monospace" font-weight="bold">Snap Pivot</text>
          <!-- Catapult Vector Arrow -->
          <line x1="15" y1="-45" x2="48" y2="-95" stroke="#ff4444" stroke-width="3.5" stroke-linecap="round" />
          <polygon points="48,-95 38,-85 52,-82" fill="#ff4444" />
          <text x="55" y="-95" fill="#ff5c6c" font-size="11" font-weight="bold" font-family="monospace">
            Catapult Ejection ({{ (highsidePhysics.ejectionVelocityMs * 3.6).toFixed(0) }} km/h)
          </text>
        </g>

        <!-- Parabolic Catapult Flight Arc: from X=140, Y=225 to X=390, Y=280 with Apex at X=265, Y=280 - (apexHeight * 70) -->
        <!-- Scale: 70px per meter vertical -->
        <path
          :d="`M 140 225 Q 265 ${280 - highsidePhysics.apexHeightMeters * 70} 390 280`"
          fill="none"
          stroke="url(#arcGrad)"
          stroke-width="3.5"
          stroke-dasharray="6 4"
        />

        <!-- Apex Height Elevation Line & Measurement Badge -->
        <g :transform="`translate(265, ${280 - highsidePhysics.apexHeightMeters * 70})`">
          <line x1="0" y1="0" x2="0" :y2="highsidePhysics.apexHeightMeters * 70" stroke="#ffb347" stroke-width="1.5" stroke-dasharray="3 3" />
          <circle cx="0" cy="0" r="5" fill="#ffb347" filter="url(#glow-highside)" />
          <rect x="-65" y="-28" width="130" height="22" rx="5" fill="#162032" stroke="#ffb347" stroke-width="1.5" />
          <text x="0" y="-13" fill="#ffffff" font-size="11" font-weight="bold" text-anchor="middle" font-family="monospace">
            Apex: {{ highsidePhysics.apexHeightMeters.toFixed(1) }}m in air
          </text>
        </g>

        <!-- Ground Impact Point (X = 390, Y = 280) -->
        <g transform="translate(390, 280)">
          <!-- Impact shockwave rings -->
          <circle cx="0" cy="0" r="16" fill="none" stroke="rgba(255, 92, 108, 0.6)" stroke-width="2.5" />
          <circle cx="0" cy="0" r="30" fill="none" stroke="rgba(255, 92, 108, 0.3)" stroke-width="1.5" />
          <polygon points="0,-12 -8,-3 8,-3" fill="#ff5c6c" />
          <text x="0" y="38" fill="#ff5c6c" font-size="11" font-weight="bold" text-anchor="middle" font-family="monospace">
            Ground Impact ({{ highsidePhysics.groundImpactSeverityG }}G)
          </text>
          <text x="0" y="52" fill="#cbd5e1" font-size="9" text-anchor="middle" font-family="monospace">
            Velocity: {{ highsidePhysics.groundImpactVelocityKmh.toFixed(0) }} km/h
          </text>
        </g>

        <!-- Secondary Slide Skid Runway (from X = 390 to X = 650) -->
        <line x1="390" y1="280" x2="650" y2="280" stroke="#ff6b3d" stroke-width="6" stroke-linecap="round" stroke-dasharray="10 4" />
        <text x="520" y="270" fill="#ffb347" font-size="10" font-weight="bold" font-family="monospace" text-anchor="middle">
          Post-Impact Slide ({{ highsidePhysics.postImpactSlideDistanceMeters.toFixed(1) }}m)
        </text>

        <!-- DYNAMIC ANIMATED RIDER DOLL -->
        <!-- Animates along trajectory: 0.0 to 0.5 = airborne arc, 0.5 to 1.0 = ground slide -->
        <g
          :transform="
            animProgress <= 0.5
              ? `translate(${140 + animProgress * 2 * 250}, ${
                  225 +
                  (animProgress * 2) * (280 - 225) -
                  Math.sin(animProgress * 2 * Math.PI) * (highsidePhysics.apexHeightMeters * 70 - 40)
                })`
              : `translate(${390 + (animProgress - 0.5) * 2 * 260}, 275)`
          "
        >
          <!-- Rotating / tumbling rider mannequin -->
          <g :transform="`rotate(${animProgress * 720})`">
            <circle cx="0" cy="-10" r="6" fill="#f8fafc" stroke="#ff6b3d" stroke-width="1.5" /> <!-- Helmet -->
            <line x1="0" y1="-4" x2="0" y2="8" stroke="#f8fafc" stroke-width="3" /> <!-- Torso -->
            <line x1="0" y1="0" x2="-8" y2="-6" stroke="#f8fafc" stroke-width="2" /> <!-- Left Arm -->
            <line x1="0" y1="0" x2="8" y2="4" stroke="#f8fafc" stroke-width="2" /> <!-- Right Arm -->
            <line x1="0" y1="8" x2="-6" y2="16" stroke="#ff6b3d" stroke-width="2" /> <!-- Left Leg -->
            <line x1="0" y1="8" x2="7" y2="15" stroke="#ff6b3d" stroke-width="2" /> <!-- Right Leg -->
          </g>
        </g>
      </svg>

      <!-- SVG GRAPHIC 2: LOW-SIDE SEPARATION RUNWAY DIAGRAM -->
      <svg
        v-else
        viewBox="0 0 760 380"
        class="sim-canvas"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="roadGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#111827" />
            <stop offset="100%" stop-color="#0b101b" />
          </linearGradient>
          <filter id="glow-lowside" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        <!-- Asphalt Track Top-Down / Angled Perspective -->
        <rect x="0" y="0" width="760" height="380" fill="url(#roadGrad)" />

        <!-- Distance Ruler Marks across the track -->
        <g stroke="rgba(255,255,255,0.06)" stroke-dasharray="3 4">
          <line x1="100" y1="40" x2="100" y2="340" />
          <line x1="250" y1="40" x2="250" y2="340" />
          <line x1="400" y1="40" x2="400" y2="340" />
          <line x1="550" y1="40" x2="550" y2="340" />
          <line x1="700" y1="40" x2="700" y2="340" />
        </g>
        <text x="100" y="360" fill="#94a3b8" font-size="10" font-family="monospace" text-anchor="middle">0m (Washout)</text>
        <text x="250" y="360" fill="#94a3b8" font-size="10" font-family="monospace" text-anchor="middle">30m</text>
        <text x="400" y="360" fill="#94a3b8" font-size="10" font-family="monospace" text-anchor="middle">60m</text>
        <text x="550" y="360" fill="#94a3b8" font-size="10" font-family="monospace" text-anchor="middle">90m</text>
        <text x="700" y="360" fill="#94a3b8" font-size="10" font-family="monospace" text-anchor="middle">120m</text>

        <!-- Washout Apex Point (X = 100, Y = 180) -->
        <circle cx="100" cy="180" r="7" fill="#ff4444" filter="url(#glow-lowside)" />
        <text x="100" y="155" fill="#ff5c6c" font-size="11" font-weight="bold" font-family="monospace" text-anchor="middle">
          Low-Side Drop ({{ lowsideTireLost.toUpperCase() }} TIRE LOSS)
        </text>

        <!-- Bike Fairing Skid Runway (Slippery fairing mu = 0.28 slides farther) -->
        <!-- Track 1: Bike Path (Upper lane) -->
        <line x1="100" y1="130" x2="680" y2="130" stroke="rgba(255, 179, 71, 0.25)" stroke-width="12" stroke-linecap="round" />
        <line x1="100" y1="130" x2="650" y2="130" stroke="#ffb347" stroke-width="4" stroke-dasharray="8 4" stroke-linecap="round" />
        <!-- Bike fairing resting icon -->
        <g transform="translate(650, 130)">
          <rect x="-15" y="-8" width="30" height="16" rx="4" fill="#1e293b" stroke="#ffb347" stroke-width="1.5" />
          <text x="0" y="24" fill="#ffb347" font-size="10" font-weight="bold" font-family="monospace" text-anchor="middle">
            Motorcycle Rest ({{ lowsidePhysics.bikeSlideDistanceMeters.toFixed(1) }}m)
          </text>
        </g>

        <!-- Rider Gear Slide Runway (Lower lane) -->
        <line x1="100" y1="230" x2="520" y2="230" stroke="rgba(255, 107, 61, 0.25)" stroke-width="14" stroke-linecap="round" />
        <line x1="100" y1="230" x2="480" y2="230" stroke="#ff6b3d" stroke-width="5" stroke-linecap="round" />
        <!-- Rider resting icon -->
        <g transform="translate(480, 230)">
          <circle cx="0" cy="0" r="9" fill="#ff6b3d" stroke="#ffffff" stroke-width="2" />
          <text x="0" y="26" fill="#f8fafc" font-size="10" font-weight="bold" font-family="monospace" text-anchor="middle">
            Rider Rest ({{ lowsidePhysics.riderSlideDistanceMeters.toFixed(1) }}m)
          </text>
        </g>

        <!-- Separation Distance Delta Ruler between Bike and Rider -->
        <g transform="translate(0, 180)">
          <line x1="480" y1="0" x2="650" y2="0" stroke="#3ddc97" stroke-width="2" />
          <line x1="480" y1="-8" x2="480" y2="8" stroke="#3ddc97" stroke-width="2" />
          <line x1="650" y1="-8" x2="650" y2="8" stroke="#3ddc97" stroke-width="2" />
          <rect x="525" y="-14" width="80" height="20" rx="4" fill="#0f172a" stroke="#3ddc97" stroke-width="1" />
          <text x="565" y="0" fill="#3ddc97" font-size="10" font-weight="bold" font-family="monospace" text-anchor="middle">
            +{{ lowsidePhysics.separationDistanceMeters.toFixed(1) }}m Gap
          </text>
        </g>

        <!-- DYNAMIC ANIMATED BIKE & RIDER -->
        <!-- Bike animates from X = 100 to X = 650 -->
        <g :transform="`translate(${100 + animProgress * (650 - 100)}, 130)`">
          <rect x="-12" y="-6" width="24" height="12" rx="3" fill="#ffb347" stroke="#ffffff" stroke-width="1.5" />
          <!-- Animated sparks behind bike fairing -->
          <circle v-if="isPlaying && animProgress < 0.95" cx="-18" cy="-2" r="2.5" fill="#ffea00" />
          <circle v-if="isPlaying && animProgress < 0.95" cx="-24" cy="3" r="1.8" fill="#ff6b3d" />
        </g>

        <!-- Rider animates from X = 100 to X = 480 -->
        <g :transform="`translate(${100 + animProgress * (480 - 100)}, 230)`">
          <!-- Tumbling or sliding rider -->
          <g :transform="selectedMaterial.mu_k > 0.6 ? `rotate(${animProgress * 1080})` : 'rotate(0)'">
            <circle cx="0" cy="0" r="7" fill="#ff6b3d" stroke="#ffffff" stroke-width="2" />
          </g>
        </g>
      </svg>
    </section>

    <!-- METRIC STATS GRID -->
    <div class="metrics-grid">
      <!-- High-Side Specific Primary Metrics -->
      <template v-if="crashMode === 'highside'">
        <div class="metric-card primary">
          <span class="m-label">Apex Catapult Ejection Altitude</span>
          <span class="m-val">{{ highsidePhysics.apexHeightMeters.toFixed(1) }} m</span>
          <span class="m-sub">Peak elevation above asphalt during parabolic flight</span>
        </div>

        <div class="metric-card">
          <span class="m-label">Airborne Flight Duration</span>
          <span class="m-val">{{ highsidePhysics.airborneDurationSeconds.toFixed(2) }} s</span>
          <span class="m-sub">Time suspended in the air before first ground contact</span>
        </div>

        <div class="metric-card hazard-card">
          <span class="m-label">Ground Impact Severity</span>
          <span class="m-val bad">{{ highsidePhysics.groundImpactSeverityG }} G</span>
          <span class="m-sub">Impact velocity: {{ highsidePhysics.groundImpactVelocityKmh.toFixed(0) }} km/h</span>
        </div>

        <div class="metric-card">
          <span class="m-label">Flight Distance (Air)</span>
          <span class="m-val">{{ highsidePhysics.flightDistanceMeters.toFixed(1) }} m</span>
          <span class="m-sub">Horizontal distance covered before landing</span>
        </div>

        <div class="metric-card">
          <span class="m-label">Total Crash Displacement</span>
          <span class="m-val">{{ highsidePhysics.totalCrashDistanceMeters.toFixed(1) }} m</span>
          <span class="m-sub">Flight distance ({{ highsidePhysics.flightDistanceMeters.toFixed(1) }}m) + Slide ({{ highsidePhysics.postImpactSlideDistanceMeters.toFixed(1) }}m)</span>
        </div>
      </template>

      <!-- Low-Side Specific Primary Metrics -->
      <template v-else>
        <div class="metric-card primary">
          <span class="m-label">Rider Slide Stopping Distance</span>
          <span class="m-val">{{ lowsidePhysics.riderSlideDistanceMeters.toFixed(1) }} m</span>
          <span class="m-sub">Work-Energy theorem dissipation: d = v² / (2 · &mu;<sub>k</sub> · g)</span>
        </div>

        <div class="metric-card">
          <span class="m-label">Rider Slide Duration</span>
          <span class="m-val">{{ lowsidePhysics.riderSlideDurationSeconds.toFixed(2) }} s</span>
          <span class="m-sub">Time to complete kinetic energy dissipation</span>
        </div>

        <div class="metric-card">
          <span class="m-label">Motorcycle Slide Distance</span>
          <span class="m-val">{{ lowsidePhysics.bikeSlideDistanceMeters.toFixed(1) }} m</span>
          <span class="m-sub">Fairing &amp; frame slider friction (&mu; = 0.28)</span>
        </div>

        <div class="metric-card">
          <span class="m-label">Bike vs Rider Separation</span>
          <span class="m-val ok">+{{ lowsidePhysics.separationDistanceMeters.toFixed(1) }} m</span>
          <span class="m-sub">Gap between bike and rider at rest</span>
        </div>

        <div class="metric-card">
          <span class="m-label">Deceleration Rate</span>
          <span class="m-val">{{ lowsidePhysics.decelerationG.toFixed(2) }} G</span>
          <span class="m-sub">Pavement friction resistance deceleration</span>
        </div>
      </template>
    </div>

    <!-- CONTROLS & SCENARIO INPUTS GRID -->
    <div class="sim-grid">
      <div class="controls-col">
        <!-- Crash Entry Speed Slider -->
        <div class="input-card">
          <div class="input-header">
            <label for="crash-speed-slider">Corner / Crash Entry Speed</label>
            <span class="input-val accent">
              {{ displaySpeed }} {{ useImperial ? 'mph' : 'km/h' }}
              <span class="sub-val">({{ crashSpeedMs.toFixed(1) }} m/s)</span>
            </span>
          </div>

          <input
            id="crash-speed-slider"
            type="range"
            min="30"
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
              @click="crashSpeedKmh = p.kmh"
            >
              {{ p.label }}
            </button>
          </div>
        </div>

        <!-- Lean Angle at Crash -->
        <div class="input-card">
          <div class="input-header">
            <label for="lean-angle-slider">Chassis Lean Angle θ at Incident</label>
            <span class="input-val">{{ leanAngleDeg }}°</span>
          </div>
          <input
            id="lean-angle-slider"
            type="range"
            min="30"
            max="65"
            step="1"
            v-model.number="leanAngleDeg"
          />
          <div class="range-sub">
            <span>30° Moderate Lean</span>
            <span>55° Knee Down</span>
            <span>65° MotoGP Elbow</span>
          </div>
        </div>

        <!-- High-Side Specific Scenario Inputs -->
        <template v-if="crashMode === 'highside'">
          <div class="input-card">
            <div class="input-header">
              <label for="slip-angle-slider">Rear Tire Yaw Step-Out Slip Angle (&beta;)</label>
              <span class="input-val bad">{{ highsideSlipAngleDeg }}°</span>
            </div>
            <input
              id="slip-angle-slider"
              type="range"
              min="8"
              max="40"
              step="1"
              v-model.number="highsideSlipAngleDeg"
            />
            <div class="range-sub">
              <span>8° Minor Twitch</span>
              <span>20° Severe Powerslide</span>
              <span>40° Terminal Drift</span>
            </div>
          </div>

          <div class="input-card">
            <div class="input-header">
              <label>Grip Snap-Back Trigger</label>
            </div>
            <select v-model="highsideTrigger" class="styled-select">
              <option value="throttle_chop">Abrupt Throttle Chop (Engine Braking Weight Transfer)</option>
              <option value="curb_bite">Apex Kerbing / Paint Line Bite</option>
              <option value="clean_tarmac">Sudden Surface Grip Jump (&mu; 0.8 &rarr; 1.25)</option>
            </select>
          </div>
        </template>

        <!-- Low-Side Specific Scenario Inputs -->
        <template v-else>
          <div class="input-card">
            <div class="input-header">
              <label>Initial Loss of Adhesion Trigger</label>
            </div>
            <select v-model="lowsideTireLost" class="styled-select">
              <option value="front">Front Tire Washout (Trail-Braking / Over-Angle)</option>
              <option value="rear">Rear Tire Wheelspin (Exit Throttle Over-Power)</option>
            </select>
          </div>
        </template>

        <!-- Gear Material Selection Dropdown -->
        <div class="input-card">
          <div class="input-header">
            <label for="material-select">Rider Gear Contact Material</label>
            <span class="mu-badge" :class="slidePhysics.tumbleRisk ? 'bad' : 'ok'">
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

        <!-- Track Runoff Buffer Slider -->
        <div class="input-card">
          <div class="input-header">
            <label for="runoff-slider">Available Track Runoff Buffer</label>
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
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  color: var(--accent);
}

.panel-title {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 800;
  color: #ffffff;
  letter-spacing: -0.02em;
}

.panel-subtitle {
  margin: 0;
  font-size: 0.8rem;
  color: var(--muted);
  max-width: 720px;
  line-height: 1.45;
}

.btn-import {
  background: #172336;
  border: 1.5px solid var(--border);
  color: var(--accent-2);
  font-weight: 700;
  font-size: 0.82rem;
  padding: 0.55rem 1rem;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.btn-import:hover {
  background: rgba(255, 107, 61, 0.2);
  border-color: var(--accent);
  color: #ffffff;
  transform: translateY(-1px);
}

/* CRASH MODE TOGGLE CARD */
.crash-mode-card {
  background: #0d1422;
  border: 1.5px solid #23354d;
  border-radius: 14px;
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

.mode-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.mode-label {
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #cbd5e1;
}
.mode-desc {
  font-size: 0.74rem;
  color: var(--muted);
}

.mode-toggle-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.85rem;
}

@media (max-width: 700px) {
  .mode-toggle-grid {
    grid-template-columns: 1fr;
  }
}

.mode-btn {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 0.85rem 1.15rem;
  background: #141f30;
  border: 1.5px solid #243750;
  border-radius: 12px;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.mode-btn:hover {
  background: #1c2b42;
  border-color: #3b567d;
  transform: translateY(-2px);
}

.mode-btn.active {
  background: linear-gradient(135deg, rgba(255, 107, 61, 0.22), rgba(255, 179, 71, 0.12));
  border-color: #ff6b3d;
  box-shadow: 0 0 16px rgba(255, 107, 61, 0.35);
}

.mode-icon-box {
  font-size: 1.6rem;
  line-height: 1;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.mode-btn.active .mode-icon-box {
  background: rgba(255, 107, 61, 0.2);
  border-color: rgba(255, 107, 61, 0.45);
}

.mode-text-box {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.mode-name {
  font-size: 0.92rem;
  font-weight: 800;
  color: #ffffff;
  letter-spacing: -0.01em;
}

.mode-btn.active .mode-name {
  color: #ffb347;
}

.mode-sub {
  font-size: 0.7rem;
  color: #94a3b8;
  line-height: 1.35;
}

/* ALERTS */
.alert-box {
  display: flex;
  align-items: flex-start;
  gap: 0.9rem;
  padding: 0.95rem 1.15rem;
  border-radius: 12px;
  font-size: 0.8rem;
  line-height: 1.45;
}

.alert-icon { font-size: 1.4rem; line-height: 1; }
.alert-content { display: flex; flex-direction: column; gap: 0.25rem; }
.alert-heading { font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; font-size: 0.8rem; }

.danger-alert { background: rgba(239, 68, 68, 0.15); border: 1.5px solid rgba(239, 68, 68, 0.5); color: #fca5a5; }
.danger-alert .alert-heading { color: #ef4444; }

.warn-alert { background: rgba(245, 158, 11, 0.15); border: 1.5px solid rgba(245, 158, 11, 0.5); color: #fcd34d; }
.warn-alert .alert-heading { color: #f59e0b; }

.barrier-alert { background: rgba(249, 115, 22, 0.15); border: 1.5px solid rgba(249, 115, 22, 0.5); color: #fdba74; }
.barrier-alert .alert-heading { color: #f97316; }

.ok-alert { background: rgba(16, 185, 129, 0.12); border: 1.5px solid rgba(16, 185, 129, 0.4); color: #6ee7b7; }
.ok-alert .alert-heading { color: #10b989; }

/* VISUALIZER SECTION */
.visualizer-card {
  padding: 1.15rem;
  background: #0d1422;
  border: 1.5px solid #23354d;
}

.vis-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}

.vis-title-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.badge {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  padding: 0.25rem 0.6rem;
  border-radius: 6px;
}
.highside-badge { background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.4); }
.lowside-badge { background: rgba(255, 107, 61, 0.2); color: #ff6b3d; border: 1px solid rgba(255, 107, 61, 0.4); }

.vis-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: #ffffff;
}

.anim-controls {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.btn-anim-play {
  background: linear-gradient(135deg, #ff6b3d, #ff8c42);
  border: 1px solid #ffaa5a;
  color: #ffffff;
  font-weight: 700;
  font-size: 0.78rem;
  padding: 0.45rem 0.85rem;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-anim-play:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(255, 107, 61, 0.35);
}

.btn-anim-reset {
  background: #141f30;
  border: 1px solid #243750;
  color: #cbd5e1;
  font-size: 0.78rem;
  padding: 0.45rem 0.7rem;
  border-radius: 8px;
  cursor: pointer;
}

.scrub-container {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.scrub-label { font-size: 0.7rem; font-family: monospace; color: var(--muted); }
.scrub-slider { width: 90px; }

.sim-canvas {
  width: 100%;
  height: auto;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

/* METRIC CARDS */
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 0.75rem;
}

.metric-card {
  background: #101826;
  border: 1.5px solid #23354d;
  border-radius: 12px;
  padding: 0.9rem 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}

.metric-card.primary {
  grid-column: span 2;
  background: linear-gradient(135deg, rgba(255, 107, 61, 0.18), rgba(255, 179, 71, 0.08));
  border-color: rgba(255, 107, 61, 0.5);
}

@media (max-width: 600px) {
  .metric-card.primary {
    grid-column: span 1;
  }
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
  font-size: 1.4rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: #ffffff;
}
.metric-card.primary .m-val {
  font-size: 1.85rem;
  color: var(--accent);
}
.m-val.bad { color: #ef4444; }
.m-val.ok { color: #3ddc97; }

.m-sub {
  font-size: 0.68rem;
  color: var(--muted);
  line-height: 1.35;
}

/* INPUT CARDS */
.sim-grid {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.controls-col {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 0.75rem;
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
.input-val.bad { color: #ef4444; }
.input-val .sub-val {
  font-size: 0.75rem;
  color: var(--muted);
  font-weight: 500;
  margin-left: 0.35rem;
}

.preset-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
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

.range-sub {
  display: flex;
  justify-content: space-between;
  font-size: 0.68rem;
  color: var(--muted);
}
</style>
