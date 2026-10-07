<script setup lang="ts">
import { computed } from 'vue';
import type { PhysicsResult } from '../physics/types';

const props = defineProps<{
  telemetry: PhysicsResult;
  longitudinalG: number;
}>();

const emit = defineEmits<{
  (e: 'update:longitudinalG', val: number): void;
}>();

// SVG coordinates: 340 wide, 340 tall
// Center at (170, 170)
const cx = 170;
const cy = 170;
const radiusPx = 125; // Radius corresponding to 100% friction limit (1.0)

// Normalized coordinates on the traction ellipse:
// Lateral demand (X axis): Fy / Fy,max
const latRatio = computed(() => props.telemetry.gripUtilizationPct / 100);
// Longitudinal demand (Y axis): Fx / Fx,max
const longRatio = computed(() => props.longitudinalG);

// Position of operating point on the plot
// Lateral to the right (turning right)
const ptX = computed(() => cx + Math.min(1.4, latRatio.value) * radiusPx);
// Longitudinal: Accelerate = Up (-Y), Trail Braking = Down (+Y)
const ptY = computed(() => cy - Math.max(-1.4, Math.min(1.4, longRatio.value)) * radiusPx);

// Combined vector length
const combinedRatio = computed(() => {
  const x = latRatio.value;
  const y = longRatio.value;
  return Math.sqrt(x * x + y * y);
});

const isExceeded = computed(() => combinedRatio.value >= 1.0);
const isNearLimit = computed(() => combinedRatio.value >= 0.88);
const statusClass = computed(() => (isExceeded.value ? 'bad' : isNearLimit.value ? 'warn' : 'ok'));

// Force calculations in Newtons
const lateralForceN = computed(() => Math.round(props.telemetry.requiredLateralForceN));
const longForceN = computed(() => Math.round(props.telemetry.normalForceN * Math.abs(props.longitudinalG)));
const totalForceN = computed(() => Math.round(Math.sqrt(lateralForceN.value ** 2 + longForceN.value ** 2)));

function setLongitudinalG(val: number) {
  emit('update:longitudinalG', val);
}
</script>

<template>
  <div class="kamm-card">
    <div class="kamm-header">
      <div class="title-wrap">
        <span class="kamm-title">Kamm Friction Ellipse &amp; Grip Limits</span>
        <span class="badge" :class="statusClass">
          {{ isExceeded ? 'TRACTION LIMIT EXCEEDED' : isNearLimit ? 'NEAR EDGE OF GRIP' : 'IN GRIP ENVELOPE' }}
        </span>
      </div>
      <div class="kamm-metric">
        <span class="k">Grip Utilization:</span>
        <span class="v" :class="statusClass">{{ (combinedRatio * 100).toFixed(1) }}%</span>
      </div>
    </div>

    <!-- Segmented LED Bar Indicator -->
    <div class="led-bar-track">
      <div
        class="led-bar-fill"
        :class="statusClass"
        :style="{ width: `${Math.min(100, combinedRatio * 100)}%` }"
      ></div>
      <div class="led-marker limit" style="left: 100%"></div>
      <div class="led-marker warn" style="left: 88%"></div>
    </div>

    <svg viewBox="0 0 340 340" class="kamm-canvas">
      <defs>
        <radialGradient id="kamm-bg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#141c2c" />
          <stop offset="60%" stop-color="#0e1420" />
          <stop offset="100%" stop-color="#080c14" />
        </radialGradient>
        <radialGradient id="safe-zone-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="rgba(61, 220, 151, 0.12)" />
          <stop offset="75%" stop-color="rgba(61, 220, 151, 0.05)" />
          <stop offset="100%" stop-color="rgba(255, 207, 92, 0.08)" />
        </radialGradient>
        <filter id="kamm-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <!-- Marker arrow for force vector -->
        <marker id="kamm-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" :fill="statusClass === 'bad' ? '#ff5c6c' : statusClass === 'warn' ? '#ffcf5c' : '#ff6b3d'" />
        </marker>
      </defs>

      <!-- Background Radar Disc -->
      <circle :cx="cx" :cy="cy" :r="radiusPx + 24" fill="url(#kamm-bg)" stroke="#1e2736" stroke-width="1.5" />

      <!-- Radial Compass Degree Ticks (Every 30 degrees) -->
      <g stroke="rgba(255,255,255,0.06)" stroke-width="1">
        <line v1="1" :x1="cx - radiusPx - 10" :y1="cy" :x2="cx + radiusPx + 10" :y2="cy" />
        <line :x1="cx" :y1="cy - radiusPx - 10" :x2="cx" :y2="cy + radiusPx + 10" />
        <line :x1="cx - (radiusPx * 0.86)" :y1="cy - (radiusPx * 0.5)" :x2="cx + (radiusPx * 0.86)" :y2="cy + (radiusPx * 0.5)" />
        <line :x1="cx - (radiusPx * 0.86)" :y1="cy + (radiusPx * 0.5)" :x2="cx + (radiusPx * 0.86)" :y2="cy - (radiusPx * 0.5)" />
        <line :x1="cx - (radiusPx * 0.5)" :y1="cy - (radiusPx * 0.86)" :x2="cx + (radiusPx * 0.5)" :y2="cy + (radiusPx * 0.86)" />
        <line :x1="cx - (radiusPx * 0.5)" :y1="cy + (radiusPx * 0.86)" :x2="cx + (radiusPx * 0.5)" :y2="cy - (radiusPx * 0.86)" />
      </g>

      <!-- Concentric G-force radar rings (0.25g, 0.50g, 0.75g) -->
      <circle :cx="cx" :cy="cy" :r="radiusPx * 0.25" fill="none" stroke="rgba(255,255,255,0.07)" stroke-dasharray="2 3" />
      <text :x="cx + 3" :y="cy - (radiusPx * 0.25) - 3" fill="#4a5568" font-size="8.5" font-family="monospace">0.25g</text>

      <circle :cx="cx" :cy="cy" :r="radiusPx * 0.50" fill="none" stroke="rgba(255,255,255,0.09)" stroke-dasharray="3 3" />
      <text :x="cx + 3" :y="cy - (radiusPx * 0.50) - 3" fill="#4a5568" font-size="8.5" font-family="monospace">0.50g</text>

      <circle :cx="cx" :cy="cy" :r="radiusPx * 0.75" fill="none" stroke="rgba(255,255,255,0.12)" stroke-dasharray="3 3" />
      <text :x="cx + 3" :y="cy - (radiusPx * 0.75) - 3" fill="#4a5568" font-size="8.5" font-family="monospace">0.75g</text>

      <!-- Safe Grip Basin (Inside 100% boundary) -->
      <circle :cx="cx" :cy="cy" :r="radiusPx" fill="url(#safe-zone-grad)" />

      <!-- 100% Kamm Traction Boundary Limit -->
      <circle
        :cx="cx"
        :cy="cy"
        :r="radiusPx"
        fill="none"
        :stroke="isExceeded ? '#ff5c6c' : '#3ddc97'"
        stroke-width="2.5"
      />
      <text :x="cx + radiusPx - 2" :y="cy - 6" fill="#3ddc97" font-size="9" text-anchor="end" font-weight="700" font-family="monospace">1.00g LIMIT</text>

      <!-- Danger Loss-of-Grip Zone (>100%) -->
      <circle
        :cx="cx"
        :cy="cy"
        :r="radiusPx * 1.15"
        fill="none"
        stroke="rgba(255, 92, 108, 0.3)"
        stroke-width="1.5"
        stroke-dasharray="4 4"
      />

      <!-- Component Projection Lines (X and Y components) -->
      <line :x1="cx" :y1="ptY" :x2="ptX" :y2="ptY" stroke="rgba(255,255,255,0.15)" stroke-dasharray="2 2" />
      <line :x1="ptX" :y1="cy" :x2="ptX" :y2="ptY" stroke="rgba(255,255,255,0.15)" stroke-dasharray="2 2" />

      <!-- Vector from origin to operating point -->
      <line
        :x1="cx"
        :y1="cy"
        :x2="ptX"
        :y2="ptY"
        :stroke="statusClass === 'bad' ? '#ff5c6c' : statusClass === 'warn' ? '#ffcf5c' : '#ff6b3d'"
        stroke-width="2.5"
        marker-end="url(#kamm-arrow)"
      />

      <!-- Current Operating Point (animated glowing reticle) -->
      <circle
        :cx="ptX"
        :cy="ptY"
        r="8"
        :fill="statusClass === 'bad' ? '#ff5c6c' : statusClass === 'warn' ? '#ffcf5c' : '#ff6b3d'"
        filter="url(#kamm-glow)"
      />
      <circle :cx="ptX" :cy="ptY" r="3.5" fill="#ffffff" />

      <!-- Axis Labels -->
      <text :x="cx" y="18" fill="#a0aec0" font-size="10" text-anchor="middle" font-weight="700" font-family="monospace">▲ ACCELERATION (+Gx)</text>
      <text :x="cx" y="332" fill="#a0aec0" font-size="10" text-anchor="middle" font-weight="700" font-family="monospace">▼ TRAIL BRAKING (-Gx)</text>
      <text :x="cx + radiusPx + 16" :y="cy + 4" fill="#a0aec0" font-size="9" text-anchor="start" font-weight="700" font-family="monospace">CORNERING ►</text>
    </svg>

    <!-- Longitudinal G Slider Control (Trail braking vs Throttle) -->
    <div class="kamm-controls">
      <div class="control-label-row">
        <span>Combined Throttle / Trail-Braking</span>
        <span class="value-highlight">
          {{ longitudinalG > 0 ? `+${longitudinalG.toFixed(2)} G Accel` : longitudinalG < 0 ? `${longitudinalG.toFixed(2)} G Brake` : 'Neutral (0.00 G)' }}
        </span>
      </div>
      <input
        type="range"
        min="-1.2"
        max="1.0"
        step="0.05"
        :value="longitudinalG"
        @input="setLongitudinalG(Number(($event.target as HTMLInputElement).value))"
      />
      <div class="range-labels">
        <span>-1.2G Heavy Trail Brake</span>
        <span @click="setLongitudinalG(0)" class="reset-link">Neutral 0.0G</span>
        <span>+1.0G Power-On Exit</span>
      </div>
    </div>

    <!-- Live Force Breakdown Telemetry Chips -->
    <div class="force-telemetry-grid">
      <div class="chip-item">
        <span class="chip-label">Lateral Grip Fy</span>
        <span class="chip-val">{{ lateralForceN }} N</span>
      </div>
      <div class="chip-item">
        <span class="chip-label">Longitudinal Fx</span>
        <span class="chip-val">{{ longForceN }} N</span>
      </div>
      <div class="chip-item">
        <span class="chip-label">Total Load Fnet</span>
        <span class="chip-val">{{ totalForceN }} N</span>
      </div>
      <div class="chip-item">
        <span class="chip-label">Grip Reserve</span>
        <span class="chip-val" :class="telemetry.availableLongitudinalG <= 0.05 ? 'bad' : 'ok'">
          {{ telemetry.availableLongitudinalG.toFixed(2) }} G
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kamm-card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  backdrop-filter: blur(14px);
}

.kamm-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.title-wrap {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.kamm-title {
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
.badge.warn { background: rgba(255, 207, 92, 0.15); color: var(--warn); border: 1px solid rgba(255, 207, 92, 0.4); }
.badge.bad { background: rgba(255, 92, 108, 0.2); color: var(--bad); border: 1px solid rgba(255, 92, 108, 0.5); }

.kamm-metric {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-size: 0.75rem;
}
.kamm-metric .k { color: var(--muted); }
.kamm-metric .v { font-weight: 700; font-size: 1rem; font-variant-numeric: tabular-nums; }
.kamm-metric .v.ok { color: var(--ok); }
.kamm-metric .v.warn { color: var(--warn); }
.kamm-metric .v.bad { color: var(--bad); }

.led-bar-track {
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  position: relative;
  overflow: visible;
}
.led-bar-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.2s ease, background 0.2s ease;
}
.led-bar-fill.ok { background: linear-gradient(90deg, #3ddc97, #4fd1c5); }
.led-bar-fill.warn { background: linear-gradient(90deg, #3ddc97, #ffcf5c); }
.led-bar-fill.bad { background: linear-gradient(90deg, #ffcf5c, #ff5c6c); }

.led-marker {
  position: absolute;
  top: -2px;
  width: 2px;
  height: 10px;
  background: rgba(255, 255, 255, 0.3);
}
.led-marker.limit { background: #ff5c6c; }
.led-marker.warn { background: #ffcf5c; }

.kamm-canvas {
  width: 100%;
  height: auto;
  max-height: 340px;
  background: #080c14;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.07);
}

.kamm-controls {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.control-label-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: var(--muted);
}

.value-highlight {
  color: var(--text);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.range-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.68rem;
  color: var(--muted);
}
.reset-link {
  color: var(--accent);
  cursor: pointer;
  text-decoration: underline;
}

.force-telemetry-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
  padding-top: 0.25rem;
}
.chip-item {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 0.45rem 0.55rem;
  display: flex;
  flex-direction: column;
}
.chip-label {
  font-size: 0.65rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.chip-val {
  font-size: 0.82rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--text);
  margin-top: 0.15rem;
}
.chip-val.ok { color: var(--ok); }
.chip-val.bad { color: var(--bad); }

@media (max-width: 640px) {
  .force-telemetry-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
