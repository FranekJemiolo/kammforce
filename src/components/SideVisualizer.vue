<script setup lang="ts">
import { computed } from 'vue';
import type { MotorcycleConfig } from '../physics/types';

const props = defineProps<{
  bike: MotorcycleConfig;
  riderMassKg: number;
}>();

const groundY = 320;
// Coordinate space: 640 wide x 380 tall
// Rear axle at X = 130, front axle at X = 130 + (wheelbaseMm * scale)
// Average wheelbase ~1430mm. Let 1400mm = 360px => scale = 360 / 1400 ~ 0.257 px/mm
const rearAxleX = 130;
const scale = computed(() => 370 / (props.bike.wheelbaseMm || 1420));
const frontAxleX = computed(() => rearAxleX + props.bike.wheelbaseMm * scale.value);

// Axle height above ground (17" wheel + 55 profile tire radius ~ 315mm -> 81px)
const axleHeightPx = 80;
const axleY = groundY - axleHeightPx;
const wheelRadiusPx = axleHeightPx;

// CoG position
// Horizontal CoG typically ~52% of wheelbase from rear axle (front weight bias 52/48)
const cogX = computed(() => rearAxleX + props.bike.wheelbaseMm * 0.52 * scale.value);
const cogHeightPx = computed(() => props.bike.cogHeightMm * scale.value);
const cogY = computed(() => groundY - cogHeightPx.value);

// Steering Head / Rake
const headstockX = computed(() => frontAxleX.value - 45);
const headstockY = groundY - 195;
</script>

<template>
  <div class="side-vis-wrap">
    <div class="vis-header">
      <div class="title-wrap">
        <span class="vis-title">Chassis Geometry &amp; CoG Height Profile</span>
        <span class="badge info">SIDE CALIBRATION RULER</span>
      </div>
      <div class="specs-row">
        <span>Wheelbase: <strong>{{ bike.wheelbaseMm }} mm</strong></span>
        <span>CoG Height: <strong>{{ bike.cogHeightMm }} mm</strong></span>
        <span>Total Mass: <strong>{{ bike.massKg + riderMassKg }} kg</strong></span>
      </div>
    </div>

    <svg viewBox="0 0 640 380" class="side-canvas" preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id="asphalt-side" width="16" height="16" patternUnits="userSpaceOnUse">
          <rect width="16" height="16" fill="#131822" />
          <circle cx="4" cy="4" r="1" fill="#1d2535" />
          <circle cx="12" cy="10" r="1.2" fill="#182030" />
        </pattern>
        <marker id="ruler-arrow-start" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 10 1 L 0 5 L 10 9 z" fill="#ffb347" />
        </marker>
        <marker id="ruler-arrow-end" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#ffb347" />
        </marker>
      </defs>

      <!-- Track ground plane -->
      <rect x="0" :y="groundY" width="640" height="60" fill="url(#asphalt-side)" />
      <line x1="0" :y1="groundY" x2="640" :y2="groundY" stroke="#2d3748" stroke-width="2.5" />

      <!-- Rear Wheel & Tire -->
      <g :transform="`translate(${rearAxleX}, ${axleY})`">
        <!-- Outer Tire -->
        <circle cx="0" cy="0" :r="wheelRadiusPx" fill="#171e28" stroke="#334155" stroke-width="4" />
        <!-- Rim -->
        <circle cx="0" cy="0" :r="wheelRadiusPx * 0.65" fill="#0b0f17" stroke="#ff6b3d" stroke-width="2" />
        <!-- Brake Rotor & Hub -->
        <circle cx="0" cy="0" :r="wheelRadiusPx * 0.35" fill="none" stroke="#64748b" stroke-width="2" stroke-dasharray="3 3" />
        <circle cx="0" cy="0" r="5" fill="#ffffff" />
      </g>

      <!-- Front Wheel & Tire -->
      <g :transform="`translate(${frontAxleX}, ${axleY})`">
        <circle cx="0" cy="0" :r="wheelRadiusPx" fill="#171e28" stroke="#334155" stroke-width="4" />
        <circle cx="0" cy="0" :r="wheelRadiusPx * 0.65" fill="#0b0f17" stroke="#ff6b3d" stroke-width="2" />
        <!-- Dual Front 330mm Rotors -->
        <circle cx="0" cy="0" :r="wheelRadiusPx * 0.48" fill="none" stroke="#94a3b8" stroke-width="2.5" stroke-dasharray="4 2" />
        <circle cx="0" cy="0" r="5" fill="#ffffff" />
      </g>

      <!-- Swingarm (Rear axle to pivot) -->
      <line
        :x1="rearAxleX"
        :y1="axleY"
        :x2="rearAxleX + 130"
        :y2="axleY - 20"
        stroke="#475569"
        stroke-width="12"
        stroke-linecap="round"
      />
      <!-- Chain drive -->
      <line :x1="rearAxleX" :y1="axleY" :x2="rearAxleX + 130" :y2="axleY - 20" stroke="#f59e0b" stroke-width="2.5" stroke-dasharray="5 3" />

      <!-- Twin-spar Aluminum Frame -->
      <polygon
        :points="`${rearAxleX + 130},${axleY - 20} ${headstockX},${headstockY} ${headstockX - 15},${headstockY + 30} ${rearAxleX + 140},${axleY + 15}`"
        fill="#1e293b"
        stroke="#64748b"
        stroke-width="2"
      />

      <!-- Inverted Front Forks (Headstock to front axle) -->
      <line
        :x1="headstockX"
        :y1="headstockY"
        :x2="frontAxleX"
        :y2="axleY"
        stroke="#ecc94b"
        stroke-width="9"
        stroke-linecap="round"
      />

      <!-- Fuel Tank & Airbox Cowling -->
      <path
        :d="`M ${headstockX} ${headstockY}
           Q ${headstockX - 45} ${headstockY - 35} ${rearAxleX + 175} ${headstockY - 25}
           L ${rearAxleX + 160} ${headstockY + 25}
           Z`"
        fill="#ff6b3d"
        stroke="#ffb347"
        stroke-width="2"
      />

      <!-- Aerodynamic Tail Unit & Solo Seat -->
      <path
        :d="`M ${rearAxleX + 160} ${headstockY + 10}
           L ${rearAxleX + 45} ${headstockY - 10}
           L ${rearAxleX + 75} ${headstockY + 30}
           Z`"
        fill="#1e293b"
        stroke="#ff6b3d"
        stroke-width="2"
      />

      <!-- Exhaust Silencer -->
      <path
        :d="`M ${rearAxleX + 140} ${groundY - 35}
           L ${rearAxleX + 45} ${groundY - 55}`"
        stroke="#94a3b8"
        stroke-width="8"
        stroke-linecap="round"
      />

      <!-- Rider Silhouette in Track Tuck -->
      <!-- Hump & Back -->
      <path
        :d="`M ${rearAxleX + 155} ${headstockY + 5}
           Q ${rearAxleX + 150} ${headstockY - 50} ${headstockX - 10} ${headstockY - 45}`"
        fill="none"
        stroke="#3182ce"
        stroke-width="20"
        stroke-linecap="round"
      />
      <!-- Racing Helmet -->
      <circle :cx="headstockX + 10" :cy="headstockY - 60" r="17" fill="#2b6cb0" stroke="#90cdf4" stroke-width="2" />

      <!-- Center of Gravity Marker (CoG) -->
      <g :transform="`translate(${cogX}, ${cogY})`">
        <circle cx="0" cy="0" r="10" fill="#0b0f17" stroke="#ffcf5c" stroke-width="2.5" />
        <path d="M 0 -10 A 10 10 0 0 1 10 0 L 0 0 Z" fill="#ffcf5c" />
        <path d="M 0 10 A 10 10 0 0 1 -10 0 L 0 0 Z" fill="#ffcf5c" />
        <text x="14" y="4" fill="#ffcf5c" font-size="11" font-weight="700">CoG ({{ bike.cogHeightMm }} mm)</text>
      </g>

      <!-- Height Ruler: Ground to CoG (Vertical Dimension) -->
      <line :x1="cogX" :y1="groundY" :x2="cogX" :y2="cogY" stroke="#ffcf5c" stroke-width="1.8" stroke-dasharray="3 3" />
      <line :x1="cogX - 45" :y1="groundY" :x2="cogX - 45" :y2="cogY" stroke="#ffb347" stroke-width="1.5" marker-start="url(#ruler-arrow-start)" marker-end="url(#ruler-arrow-end)" />
      <text :x="cogX - 52" :y="groundY - (cogHeightPx / 2)" fill="#ffb347" font-size="10.5" font-family="monospace" text-anchor="end">
        h = {{ bike.cogHeightMm }} mm
      </text>

      <!-- Wheelbase Ruler: Rear Axle to Front Axle (Horizontal Dimension) -->
      <g :transform="`translate(0, ${groundY + 32})`">
        <line :x1="rearAxleX" y1="0" :x2="frontAxleX" y2="0" stroke="#ffb347" stroke-width="1.8" marker-start="url(#ruler-arrow-start)" marker-end="url(#ruler-arrow-end)" />
        <line :x1="rearAxleX" y1="-25" :x2="rearAxleX" y2="10" stroke="#64748b" stroke-width="1" stroke-dasharray="2 2" />
        <line :x1="frontAxleX" y1="-25" :x2="frontAxleX" y2="10" stroke="#64748b" stroke-width="1" stroke-dasharray="2 2" />
        <text :x="(rearAxleX + frontAxleX) / 2" y="-6" fill="#ffb347" font-size="11" font-weight="600" text-anchor="middle" font-family="monospace">
          Wheelbase L = {{ bike.wheelbaseMm }} mm
        </text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.side-vis-wrap {
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
  align-items: center;
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

.badge.info {
  background: rgba(99, 179, 237, 0.15);
  color: #90cdf4;
  border: 1px solid rgba(99, 179, 237, 0.35);
  font-size: 0.68rem;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  font-weight: 700;
}

.specs-row {
  display: flex;
  gap: 0.9rem;
  font-size: 0.75rem;
  color: var(--muted);
}
.specs-row strong {
  color: var(--text);
}

.side-canvas {
  width: 100%;
  height: auto;
  max-height: 400px;
  background: #090d14;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}
</style>
