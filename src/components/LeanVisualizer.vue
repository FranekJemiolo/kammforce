<script setup lang="ts">
import { computed } from 'vue';
import type { PhysicsResult } from '../physics/types';

const props = defineProps<{
  telemetry: PhysicsResult;
  maxMechLeanDeg: number;
  riderHangOffCm: number;
}>();

// SVG ViewBox coordinates: 600 wide, 460 tall
// Ground plane at y = 390
const groundY = 390;
const originX = 300;

// Scale: 1 meter = 320 px (approx 3.2 px/cm)
const pxPerMeter = 320;

const bikeLeanRad = computed(() => (props.telemetry.toroidalBikeLeanDeg * Math.PI) / 180);
const maxMechRad = computed(() => (props.maxMechLeanDeg * Math.PI) / 180);

// Contact patch migration along the ground
const cpOffsetPx = computed(() => (props.telemetry.contactPatchOffsetMm / 1000) * pxPerMeter);
const cpX = computed(() => originX + cpOffsetPx.value);

// Tire cross section geometry (crown radius rt)
const rtPx = computed(() => (props.telemetry.crownRadiusMm / 1000) * pxPerMeter);

// Bike CoG along bike centerline
const bikeCoGDistanceM = 0.62; // approx 620mm along frame
const bikeCoGDistPx = bikeCoGDistanceM * pxPerMeter;
const bikeCoGX = computed(() => cpX.value + bikeCoGDistPx * Math.sin(bikeLeanRad.value));
const bikeCoGY = computed(() => groundY - bikeCoGDistPx * Math.cos(bikeLeanRad.value));

// Rider CoG shifted laterally by hang-off
const riderHangOffM = computed(() => props.riderHangOffCm / 100);
const riderCoGX = computed(() => {
  return bikeCoGX.value + (riderHangOffM.value * pxPerMeter) * Math.cos(bikeLeanRad.value);
});
const riderCoGY = computed(() => {
  return bikeCoGY.value + (riderHangOffM.value * pxPerMeter) * Math.sin(bikeLeanRad.value) - 15;
});

// Force vectors at CoG (scaled for display)
const gravityVecLen = 75;
const centrifugalVecLen = computed(() => Math.min(140, props.telemetry.lateralAccelG * 55));

// Forces in Newtons
const gravityNewtons = computed(() => Math.round(props.telemetry.normalForceN));
const centrifugalNewtons = computed(() => Math.round(props.telemetry.requiredLateralForceN));

const isScraping = computed(() => props.telemetry.isScrapingHardParts);
const isTractionLoss = computed(() => props.telemetry.isTractionLoss);
</script>

<template>
  <div class="visualizer-card">
    <div class="vis-header">
      <div class="title-wrap">
        <span class="vis-title">Rear Dynamic Roll Profile &amp; Contact Patch Migration</span>
        <span class="badge" :class="isTractionLoss ? 'bad' : isScraping ? 'bad' : 'ok'">
          {{ isTractionLoss ? 'LOW-SIDE HAZARD' : isScraping ? 'HARD PART CONTACT' : 'CLEARANCE OK' }}
        </span>
      </div>
      <div class="vis-stats">
        <div class="metric">
          <span class="k">True Lean θ:</span>
          <span class="v accent">{{ telemetry.toroidalBikeLeanDeg.toFixed(1) }}°</span>
        </div>
        <div class="metric">
          <span class="k">Point-Mass Naive:</span>
          <span class="v muted">{{ telemetry.pointMassLeanDeg.toFixed(1) }}°</span>
        </div>
        <div class="metric">
          <span class="k">Toroidal Δ:</span>
          <span class="v" :class="telemetry.leanAngleDeltaDeg > 0 ? 'warn' : ''">+{{ telemetry.leanAngleDeltaDeg.toFixed(1) }}°</span>
        </div>
        <div class="metric" v-if="telemetry.hangOffSavingsDeg > 0">
          <span class="k">Hang-Off Saved:</span>
          <span class="v ok">-{{ telemetry.hangOffSavingsDeg.toFixed(1) }}°</span>
        </div>
      </div>
    </div>

    <svg viewBox="0 0 600 460" class="vis-canvas" preserveAspectRatio="xMidYMid meet">
      <defs>
        <!-- Asphalt pattern -->
        <pattern id="asphalt" width="18" height="18" patternUnits="userSpaceOnUse">
          <rect width="18" height="18" fill="#111622" />
          <circle cx="4" cy="4" r="1.1" fill="#1b2333" />
          <circle cx="13" cy="11" r="1.3" fill="#161e2b" />
          <circle cx="8" cy="15" r="0.8" fill="#232d42" />
        </pattern>

        <!-- Rumble kerb pattern -->
        <pattern id="kerb-pattern" width="32" height="20" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="16" height="20" fill="#e53e3e" />
          <rect x="16" y="0" width="16" height="20" fill="#edf2f7" />
          <line x1="0" y1="0" x2="32" y2="0" stroke="#718096" stroke-width="1.5" />
        </pattern>

        <!-- Force vector markers -->
        <marker id="arrow-gravity" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#3ddc97" />
        </marker>
        <marker id="arrow-cf" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#ff6b3d" />
        </marker>
        <marker id="arrow-resultant" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#ffcf5c" />
        </marker>

        <!-- Tire glow filter -->
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>

        <filter id="spark-glow-rear" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      <!-- Grid lines -->
      <line x1="40" y1="60" x2="560" y2="60" stroke="rgba(255,255,255,0.035)" stroke-dasharray="4 6" />
      <line x1="40" y1="160" x2="560" y2="160" stroke="rgba(255,255,255,0.035)" stroke-dasharray="4 6" />
      <line x1="40" y1="260" x2="560" y2="260" stroke="rgba(255,255,255,0.035)" stroke-dasharray="4 6" />

      <!-- Vertical upright reference line -->
      <line :x1="originX" y1="40" :x2="originX" :y2="groundY" stroke="rgba(255,255,255,0.14)" stroke-dasharray="3 4" />
      <text :x="originX + 6" y="55" fill="#718096" font-size="10" font-family="monospace">0° Upright</text>

      <!-- Ground plane & asphalt -->
      <rect x="0" :y="groundY" width="600" height="70" fill="url(#asphalt)" />
      <line x1="0" :y1="groundY" x2="600" :y2="groundY" stroke="#2d3748" stroke-width="2.5" />

      <!-- Inside Track Apex Kerbing (Right side) -->
      <rect x="420" :y="groundY - 5" width="180" height="20" fill="url(#kerb-pattern)" stroke="#718096" stroke-width="1" />
      <text x="440" :y="groundY + 32" fill="#a0aec0" font-size="10" font-family="monospace">Apex Rumble Kerb</text>

      <!-- Mechanical lean limit indicator wedge -->
      <g :transform="`translate(${cpX}, ${groundY})`">
        <line
          x1="0"
          y1="0"
          :x2="240 * Math.sin(maxMechRad)"
          :y2="-240 * Math.cos(maxMechRad)"
          stroke="rgba(255, 92, 108, 0.45)"
          stroke-width="1.6"
          stroke-dasharray="4 4"
        />
        <text
          :x="200 * Math.sin(maxMechRad) + 12"
          :y="-200 * Math.cos(maxMechRad)"
          fill="#ff5c6c"
          font-size="10"
          font-family="monospace"
        >
          Mech Limit {{ maxMechLeanDeg }}°
        </text>
      </g>

      <!-- Lean angle protractor arc with ticks -->
      <path
        :d="`M ${originX} ${groundY - 150} A 150 150 0 0 1 ${originX + 150 * Math.sin(bikeLeanRad)} ${groundY - 150 * Math.cos(bikeLeanRad)}`"
        fill="none"
        stroke="#ffb347"
        stroke-width="2"
      />
      <!-- Protractor degree markers (15°, 30°, 45°, 60°) -->
      <g :transform="`translate(${originX}, ${groundY})`">
        <line :x1="150 * Math.sin(15 * Math.PI / 180)" :y1="-150 * Math.cos(15 * Math.PI / 180)" :x2="158 * Math.sin(15 * Math.PI / 180)" :y2="-158 * Math.cos(15 * Math.PI / 180)" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" />
        <line :x1="150 * Math.sin(30 * Math.PI / 180)" :y1="-150 * Math.cos(30 * Math.PI / 180)" :x2="158 * Math.sin(30 * Math.PI / 180)" :y2="-158 * Math.cos(30 * Math.PI / 180)" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" />
        <line :x1="150 * Math.sin(45 * Math.PI / 180)" :y1="-150 * Math.cos(45 * Math.PI / 180)" :x2="158 * Math.sin(45 * Math.PI / 180)" :y2="-158 * Math.cos(45 * Math.PI / 180)" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" />
        <line :x1="150 * Math.sin(60 * Math.PI / 180)" :y1="-150 * Math.cos(60 * Math.PI / 180)" :x2="158 * Math.sin(60 * Math.PI / 180)" :y2="-158 * Math.cos(60 * Math.PI / 180)" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" />
      </g>
      <text :x="originX + 90 * Math.sin(bikeLeanRad / 2) + 10" :y="groundY - 90 * Math.cos(bikeLeanRad / 2)" fill="#ffb347" font-size="12" font-weight="700" font-family="monospace">
        θ = {{ telemetry.toroidalBikeLeanDeg.toFixed(1) }}°
      </text>

      <!-- LEANED REAR ASSEMBLY (Rotates around contact patch) -->
      <g :transform="`translate(${cpX}, ${groundY}) rotate(${telemetry.toroidalBikeLeanDeg})`">
        <!-- Rear tire cross-section (torus crown arc) -->
        <ellipse
          cx="0"
          :cy="-rtPx"
          :rx="rtPx * 0.96"
          :ry="rtPx"
          fill="#131922"
          stroke="#2d3748"
          stroke-width="3.5"
        />
        <!-- Inner rim & rubber tread grooves -->
        <ellipse cx="0" :cy="-rtPx" :rx="rtPx * 0.8" :ry="rtPx * 0.88" fill="#1a222e" />
        <path d="M -18 -60 Q -10 -40 -16 -20" fill="none" stroke="#090d14" stroke-width="2.5" />
        <path d="M 18 -60 Q 10 -40 16 -20" fill="none" stroke="#090d14" stroke-width="2.5" />

        <!-- Wheel rim with colored tape stripe -->
        <circle cx="0" :cy="-rtPx" :r="rtPx * 0.55" fill="none" stroke="#ff6b3d" stroke-width="2.5" />
        <circle cx="0" :cy="-rtPx" r="5" fill="#e2e8f0" />

        <!-- Swingarm & suspension -->
        <path d="M -12 -42 L -28 -115 L 0 -135 L 28 -115 L 12 -42 Z" fill="#232d3d" stroke="#475569" stroke-width="2" />

        <!-- Subframe & Aerodynamic Tail Unit -->
        <path d="M -32 -145 L -48 -225 L 0 -278 L 48 -225 L 32 -145 Z" fill="#18202c" stroke="#ff6b3d" stroke-width="2.5" />
        <path d="M -22 -235 L 0 -265 L 22 -235" fill="none" stroke="#ff6b3d" stroke-width="1.5" />

        <!-- Exhaust silencer on right side (Ground Clearance Test) -->
        <rect
          x="34"
          y="-132"
          width="26"
          height="80"
          rx="7"
          :fill="isScraping ? '#ff5c6c' : '#2d3748'"
          :stroke="isScraping ? '#ff5c6c' : '#94a3b8'"
          stroke-width="2"
        />
        <circle cx="47" cy="-56" r="6" fill="#1a202c" stroke="#4fd1c5" stroke-width="1.5" />

        <!-- Footpeg indicator -->
        <line
          x1="32"
          y1="-82"
          x2="58"
          y2="-82"
          :stroke="isScraping ? '#ff5c6c' : '#e2e8f0'"
          stroke-width="5"
          stroke-linecap="round"
        />

        <!-- Scraping sparks if peg/exhaust touches -->
        <g v-if="isScraping" filter="url(#spark-glow-rear)">
          <circle cx="62" cy="-78" r="3" fill="#ffcf5c" />
          <circle cx="72" cy="-70" r="2.5" fill="#ff6b3d" />
          <circle cx="82" cy="-64" r="2" fill="#ffb347" />
          <line x1="58" y1="-82" x2="80" y2="-65" stroke="#ffcf5c" stroke-width="1.8" />
        </g>

        <!-- Chassis centerline -->
        <line x1="0" y1="0" x2="0" y2="-290" stroke="rgba(255, 179, 71, 0.45)" stroke-width="1.8" stroke-dasharray="6 3" />
      </g>

      <!-- MIGRATING CONTACT PATCH MARKER (Δy = rt * sin(theta)) -->
      <g :transform="`translate(${cpX}, ${groundY})`">
        <!-- Glowing footprint oval -->
        <ellipse cx="0" cy="0" rx="16" ry="5" fill="#ff6b3d" filter="url(#glow)" />
        <circle cx="0" cy="0" r="3" fill="#ffffff" />
        <!-- Migration dimension bracket -->
        <line :x1="-cpOffsetPx" y1="18" x2="0" y2="18" stroke="#ffb347" stroke-width="1.6" />
        <circle :cx="-cpOffsetPx" cy="18" r="2.5" fill="#ffb347" />
        <circle cx="0" cy="18" r="2.5" fill="#ffb347" />
        <text :x="-cpOffsetPx / 2" y="32" fill="#ffb347" font-size="10.5" text-anchor="middle" font-family="monospace" font-weight="700">
          Δy = {{ telemetry.contactPatchOffsetMm.toFixed(1) }} mm
        </text>
      </g>

      <!-- Rider Silhouette (Hang-off offset into inside of turn) -->
      <g v-if="riderHangOffCm > 0">
        <!-- Offset connector line -->
        <line :x1="bikeCoGX" :y1="bikeCoGY" :x2="riderCoGX" :y2="riderCoGY" stroke="#ffcf5c" stroke-width="1.5" stroke-dasharray="2 3" />
        <!-- Rider torso & helmet -->
        <circle :cx="riderCoGX" :cy="riderCoGY - 26" r="15" fill="#1e3a8a" stroke="#60a5fa" stroke-width="2" />
        <ellipse :cx="riderCoGX" :cy="riderCoGY" rx="19" ry="24" fill="rgba(30, 58, 138, 0.55)" stroke="#60a5fa" stroke-width="2" />
        <text :x="riderCoGX" :y="riderCoGY + 36" fill="#90cdf4" font-size="10.5" text-anchor="middle" font-weight="600">
          Rider ({{ riderHangOffCm }}cm hang-off)
        </text>
      </g>

      <!-- SYSTEM COG MARKER & DYNAMIC FORCE VECTORS -->
      <g :transform="`translate(${bikeCoGX}, ${bikeCoGY})`">
        <!-- CoG symbol with crosshair -->
        <circle cx="0" cy="0" r="10" fill="#0b0f17" stroke="#ffcf5c" stroke-width="2.5" />
        <path d="M 0 -10 A 10 10 0 0 1 10 0 L 0 0 Z" fill="#ffcf5c" />
        <path d="M 0 10 A 10 10 0 0 1 -10 0 L 0 0 Z" fill="#ffcf5c" />
        <text x="16" y="4" fill="#ffcf5c" font-size="11" font-weight="700">CoG System</text>

        <!-- Gravity force vector (mg straight down) -->
        <line x1="0" y1="0" x2="0" :y2="gravityVecLen" stroke="#3ddc97" stroke-width="2.8" marker-end="url(#arrow-gravity)" />
        <text x="-10" :y="gravityVecLen + 16" fill="#3ddc97" font-size="10.5" font-weight="bold" font-family="monospace">
          mg = {{ gravityNewtons }} N
        </text>

        <!-- Centrifugal force vector (Fc outwards to right) -->
        <line x1="0" y1="0" :x2="centrifugalVecLen" y2="0" stroke="#ff6b3d" stroke-width="2.8" marker-end="url(#arrow-cf)" />
        <text :x="centrifugalVecLen + 10" y="-4" fill="#ff6b3d" font-size="10.5" font-weight="bold" font-family="monospace">
          Fc = {{ centrifugalNewtons }} N ({{ telemetry.lateralAccelG.toFixed(2) }}g)
        </text>

        <!-- Ground Reaction Resultant Line from CoG back down to contact patch -->
        <line
          x1="0"
          y1="0"
          :x2="cpX - bikeCoGX"
          :y2="groundY - bikeCoGY"
          stroke="rgba(255, 207, 92, 0.5)"
          stroke-width="1.8"
          stroke-dasharray="4 3"
        />
      </g>
    </svg>

    <div class="vis-footer">
      <div class="legend-item"><span class="swatch green"></span> Gravity Torque mg</div>
      <div class="legend-item"><span class="swatch orange"></span> Centrifugal Torque Fc</div>
      <div class="legend-item"><span class="swatch yellow"></span> Lean Angle Arc θ</div>
      <div class="legend-item"><span class="swatch red"></span> Mech Clearance Limit</div>
      <div class="legend-item"><span class="swatch blue"></span> Rider Hang-off</div>
    </div>
  </div>
</template>

<style scoped>
.visualizer-card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  backdrop-filter: blur(14px);
}

.vis-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.title-wrap {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.vis-title {
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--muted);
  font-weight: 600;
}

.badge {
  font-size: 0.68rem;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  font-weight: 700;
  letter-spacing: 0.05em;
}
.badge.ok { background: rgba(61, 220, 151, 0.15); color: var(--ok); border: 1px solid rgba(61, 220, 151, 0.4); }
.badge.bad { background: rgba(255, 92, 108, 0.2); color: var(--bad); border: 1px solid rgba(255, 92, 108, 0.5); }

.vis-stats {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.metric {
  display: flex;
  flex-direction: column;
  font-size: 0.75rem;
}
.metric .k { color: var(--muted); }
.metric .v { font-weight: 700; font-variant-numeric: tabular-nums; }
.metric .v.accent { color: var(--accent); font-size: 1rem; }
.metric .v.muted { color: var(--muted); }
.metric .v.warn { color: var(--warn); }
.metric .v.ok { color: var(--ok); }

.vis-canvas {
  width: 100%;
  height: auto;
  max-height: 420px;
  background: #080d14;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.07);
}

.vis-footer {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  font-size: 0.72rem;
  color: var(--muted);
  padding-top: 0.25rem;
}
.legend-item { display: flex; align-items: center; gap: 0.35rem; }
.swatch { width: 8px; height: 8px; border-radius: 2px; }
.swatch.green { background: var(--ok); }
.swatch.orange { background: var(--accent); }
.swatch.yellow { background: #ffcf5c; }
.swatch.red { background: var(--bad); }
.swatch.blue { background: #60a5fa; }
</style>
