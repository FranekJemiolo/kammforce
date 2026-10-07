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
const systemLeanRad = computed(() => (props.telemetry.systemLeanDeg * Math.PI) / 180);
const maxMechRad = computed(() => (props.maxMechLeanDeg * Math.PI) / 180);

// Contact patch migration along the ground
const cpOffsetPx = computed(() => (props.telemetry.contactPatchOffsetMm / 1000) * pxPerMeter);
const cpX = computed(() => originX + cpOffsetPx.value);
const cpY = groundY;

// Tire cross section geometry (crown radius rt)
const rtPx = computed(() => (props.telemetry.crownRadiusMm / 1000) * pxPerMeter);
// Center of tire crown curvature when leaned
const crownCenterX = computed(() => cpX.value - rtPx.value * Math.sin(bikeLeanRad.value));
const crownCenterY = computed(() => groundY - rtPx.value * Math.cos(bikeLeanRad.value));

// Bike CoG along bike centerline
const bikeCoGDistanceM = 0.62; // approx 620mm along frame
const bikeCoGDistPx = bikeCoGDistanceM * pxPerMeter;
const bikeCoGX = computed(() => cpX.value + bikeCoGDistPx * Math.sin(bikeLeanRad.value));
const bikeCoGY = computed(() => groundY - bikeCoGDistPx * Math.cos(bikeLeanRad.value));

// Rider CoG shifted laterally by hang-off
const riderHangOffM = computed(() => props.riderHangOffCm / 100);
const riderCoGX = computed(() => {
  // Lateral hang-off perpendicular to leaned bike frame
  return bikeCoGX.value + (riderHangOffM.value * pxPerMeter) * Math.cos(bikeLeanRad.value);
});
const riderCoGY = computed(() => {
  return bikeCoGY.value + (riderHangOffM.value * pxPerMeter) * Math.sin(bikeLeanRad.value) - 15;
});

// Peg / exhaust mechanical clearance line
const pegDistancePx = 0.28 * pxPerMeter;
const pegAngleDeg = computed(() => props.maxMechLeanDeg);

// Force vectors at CoG (scaled for display)
const gravityVecLen = 70;
const centrifugalVecLen = computed(() => Math.min(130, props.telemetry.lateralAccelG * 55));

const isScraping = computed(() => props.telemetry.isScrapingHardParts);
const isTractionLoss = computed(() => props.telemetry.isTractionLoss);
</script>

<template>
  <div class="visualizer-card">
    <div class="vis-header">
      <div class="title-wrap">
        <span class="vis-title">Rear Dynamic Roll Profile</span>
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
        <pattern id="asphalt" width="16" height="16" patternUnits="userSpaceOnUse">
          <rect width="16" height="16" fill="#131822" />
          <circle cx="4" cy="4" r="1" fill="#1d2535" />
          <circle cx="12" cy="10" r="1.2" fill="#182030" />
          <circle cx="8" cy="14" r="0.8" fill="#222c3e" />
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
      </defs>

      <!-- Background sky/road grid -->
      <line x1="50" y1="50" x2="550" y2="50" stroke="rgba(255,255,255,0.04)" stroke-dasharray="4 6" />
      <line x1="50" y1="150" x2="550" y2="150" stroke="rgba(255,255,255,0.04)" stroke-dasharray="4 6" />
      <line x1="50" y1="250" x2="550" y2="250" stroke="rgba(255,255,255,0.04)" stroke-dasharray="4 6" />

      <!-- Vertical reference upright line -->
      <line :x1="originX" y1="40" :x2="originX" :y2="groundY" stroke="rgba(255,255,255,0.12)" stroke-dasharray="3 4" />
      <text :x="originX + 6" y="60" class="svg-label-dim">0° Upright</text>

      <!-- Ground plane -->
      <rect x="0" :y="groundY" width="600" height="70" fill="url(#asphalt)" />
      <line x1="0" :y1="groundY" x2="600" :y2="groundY" stroke="#2d3748" stroke-width="2.5" />
      <text x="24" :y="groundY + 22" class="svg-label">Track Surface</text>

      <!-- Mechanical lean limit indicator wedge -->
      <g :transform="`translate(${cpX}, ${groundY})`">
        <line
          x1="0"
          y1="0"
          :x2="220 * Math.sin(maxMechRad)"
          :y2="-220 * Math.cos(maxMechRad)"
          stroke="rgba(255, 92, 108, 0.45)"
          stroke-width="1.5"
          stroke-dasharray="4 4"
        />
        <text
          :x="170 * Math.sin(maxMechRad) + 12"
          :y="-170 * Math.cos(maxMechRad)"
          fill="#ff5c6c"
          font-size="10.5"
          font-family="monospace"
        >
          Mech Limit {{ maxMechLeanDeg }}°
        </text>
      </g>

      <!-- Lean angle arc from vertical -->
      <path
        :d="`M ${originX} ${groundY - 140} A 140 140 0 0 1 ${originX + 140 * Math.sin(bikeLeanRad)} ${groundY - 140 * Math.cos(bikeLeanRad)}`"
        fill="none"
        stroke="#ffb347"
        stroke-width="2"
      />
      <text :x="originX + 80 * Math.sin(bikeLeanRad / 2) + 10" :y="groundY - 80 * Math.cos(bikeLeanRad / 2)" fill="#ffb347" font-size="12" font-weight="600">
        θ = {{ telemetry.toroidalBikeLeanDeg.toFixed(1) }}°
      </text>

      <!-- Leaned Motorcycle Body Structure (Chassis, swingarm, tail, exhaust) -->
      <g :transform="`translate(${cpX}, ${groundY}) rotate(${telemetry.toroidalBikeLeanDeg})`">
        <!-- Rear tire cross-section (torus crown arc) -->
        <ellipse
          cx="0"
          :cy="-rtPx"
          :rx="rtPx * 0.95"
          :ry="rtPx"
          fill="#1c2430"
          stroke="#384558"
          stroke-width="3"
        />
        <circle cx="0" :cy="-rtPx" r="5" fill="#4a5a73" />
        <line x1="0" y1="0" x2="0" :y2="-rtPx * 2" stroke="rgba(255,255,255,0.2)" stroke-dasharray="3 3" />

        <!-- Wheel rim -->
        <circle cx="0" :cy="-rtPx" :r="rtPx * 0.55" fill="none" stroke="#ff6b3d" stroke-width="2.5" />

        <!-- Swingarm & suspension -->
        <path d="M -10 -40 L -25 -110 L 0 -130 L 25 -110 L 10 -40 Z" fill="#253041" stroke="#3b4b63" stroke-width="2" />

        <!-- Subframe & Tail Unit -->
        <path d="M -30 -140 L -45 -220 L 0 -270 L 45 -220 L 30 -140 Z" fill="#1a2332" stroke="#ff6b3d" stroke-width="2.5" />

        <!-- Exhaust silencer on right side (check clearance!) -->
        <rect
          x="32"
          y="-130"
          width="24"
          height="75"
          rx="6"
          :fill="isScraping ? '#ff5c6c' : '#2b3648'"
          :stroke="isScraping ? '#ff5c6c' : '#718096'"
          stroke-width="2"
        />
        <!-- Footpeg indicator -->
        <line
          x1="30"
          y1="-80"
          x2="55"
          y2="-80"
          :stroke="isScraping ? '#ff5c6c' : '#e2e8f0'"
          stroke-width="4"
          stroke-linecap="round"
        />

        <!-- Chassis centerline -->
        <line x1="0" y1="0" x2="0" y2="-290" stroke="rgba(255, 179, 71, 0.5)" stroke-width="1.8" stroke-dasharray="6 3" />
      </g>

      <!-- Migrating Contact Patch marker on the ground -->
      <g :transform="`translate(${cpX}, ${groundY})`">
        <ellipse cx="0" cy="0" rx="14" ry="4" fill="#ff6b3d" filter="url(#glow)" />
        <circle cx="0" cy="0" r="3" fill="#ffffff" />
        <!-- Contact patch migration dimension line -->
        <line :x1="-cpOffsetPx" y1="18" x2="0" y2="18" stroke="#ffb347" stroke-width="1.5" />
        <circle :cx="-cpOffsetPx" cy="18" r="2" fill="#ffb347" />
        <circle cx="0" cy="18" r="2" fill="#ffb347" />
        <text :x="-cpOffsetPx / 2" y="32" fill="#ffb347" font-size="10.5" text-anchor="middle" font-family="monospace">
          Δy = {{ telemetry.contactPatchOffsetMm.toFixed(1) }} mm
        </text>
      </g>

      <!-- Rider Silhouette (Hang-off offset into turn) -->
      <g v-if="riderHangOffCm > 0">
        <!-- Offset connector line -->
        <line :x1="bikeCoGX" :y1="bikeCoGY" :x2="riderCoGX" :y2="riderCoGY" stroke="#ffcf5c" stroke-width="1.5" stroke-dasharray="2 3" />
        <!-- Rider torso & helmet -->
        <circle :cx="riderCoGX" :cy="riderCoGY - 25" r="14" fill="#3182ce" stroke="#63b3ed" stroke-width="2" />
        <ellipse :cx="riderCoGX" :cy="riderCoGY" rx="18" ry="22" fill="rgba(49, 130, 206, 0.45)" stroke="#63b3ed" stroke-width="2" />
        <text :x="riderCoGX" :y="riderCoGY + 34" fill="#63b3ed" font-size="10" text-anchor="middle">
          Rider ({{ riderHangOffCm }}cm hang-off)
        </text>
      </g>

      <!-- System CoG marker & Force Vectors -->
      <g :transform="`translate(${bikeCoGX}, ${bikeCoGY})`">
        <!-- CoG symbol -->
        <circle cx="0" cy="0" r="9" fill="#0b0f17" stroke="#ffcf5c" stroke-width="2.5" />
        <path d="M 0 -9 A 9 9 0 0 1 9 0 L 0 0 Z" fill="#ffcf5c" />
        <path d="M 0 9 A 9 9 0 0 1 -9 0 L 0 0 Z" fill="#ffcf5c" />
        <text x="14" y="4" fill="#ffcf5c" font-size="11" font-weight="600">CoG System</text>

        <!-- Gravity force vector (straight down) -->
        <line x1="0" y1="0" x2="0" :y2="gravityVecLen" stroke="#3ddc97" stroke-width="2.5" marker-end="url(#arrow-gravity)" />
        <text x="-8" :y="gravityVecLen + 15" fill="#3ddc97" font-size="10.5" font-weight="bold">mg (Gravity)</text>

        <!-- Centrifugal force vector (outwards to right) -->
        <line x1="0" y1="0" :x2="centrifugalVecLen" y2="0" stroke="#ff6b3d" stroke-width="2.5" marker-end="url(#arrow-cf)" />
        <text :x="centrifugalVecLen + 8" y="-4" fill="#ff6b3d" font-size="10.5" font-weight="bold">
          Fc ({{ telemetry.lateralAccelG.toFixed(2) }}G)
        </text>
      </g>
    </svg>

    <div class="vis-footer">
      <div class="legend-item"><span class="swatch green"></span> Gravity Torque</div>
      <div class="legend-item"><span class="swatch orange"></span> Centrifugal Torque</div>
      <div class="legend-item"><span class="swatch yellow"></span> Lean Angle Arc</div>
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
  background: #090d14;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.svg-label { fill: #718096; font-size: 11px; font-weight: 500; }
.svg-label-dim { fill: #4a5568; font-size: 10px; }

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
.swatch.blue { background: #63b3ed; }
</style>
