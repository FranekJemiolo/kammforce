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
const radiusPx = 130; // Radius corresponding to 100% friction limit (1.0)

// Normalized coordinates on the traction ellipse:
// Lateral demand (X axis): Fy / Fy,max
const latRatio = computed(() => props.telemetry.gripUtilizationPct / 100);
// Longitudinal demand (Y axis): Fx / Fx,max
const longRatio = computed(() => {
  // If user is braking (negative G) or throttle (positive G)
  return props.longitudinalG;
});

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

function setLongitudinalG(val: number) {
  emit('update:longitudinalG', val);
}
</script>

<template>
  <div class="kamm-card">
    <div class="kamm-header">
      <div class="title-wrap">
        <span class="kamm-title">Kamm Traction Circle</span>
        <span class="badge" :class="statusClass">
          {{ isExceeded ? 'TRACTION LIMIT EXCEEDED' : isNearLimit ? 'NEAR EDGE OF GRIP' : 'IN GRIP ENVELOPE' }}
        </span>
      </div>
      <div class="kamm-metric">
        <span class="k">Grip Utilization:</span>
        <span class="v" :class="statusClass">{{ (combinedRatio * 100).toFixed(1) }}%</span>
      </div>
    </div>

    <svg viewBox="0 0 340 340" class="kamm-canvas">
      <defs>
        <radialGradient id="kamm-bg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#141c2b" />
          <stop offset="70%" stop-color="#0f1522" />
          <stop offset="100%" stop-color="#090d15" />
        </radialGradient>
        <filter id="kamm-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      <!-- Background disc -->
      <circle :cx="cx" :cy="cy" :r="radiusPx + 20" fill="url(#kamm-bg)" stroke="#1e2736" stroke-width="1.5" />

      <!-- Concentric grip circles (25%, 50%, 75%, 100%) -->
      <circle :cx="cx" :cy="cy" :r="radiusPx * 0.25" fill="none" stroke="rgba(255,255,255,0.06)" stroke-dasharray="2 3" />
      <circle :cx="cx" :cy="cy" :r="radiusPx * 0.50" fill="none" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3 3" />
      <circle :cx="cx" :cy="cy" :r="radiusPx * 0.75" fill="none" stroke="rgba(255,255,255,0.12)" stroke-dasharray="3 3" />

      <!-- 100% Kamm Circle limit boundary -->
      <circle
        :cx="cx"
        :cy="cy"
        :r="radiusPx"
        fill="rgba(61, 220, 151, 0.04)"
        :stroke="isExceeded ? '#ff5c6c' : '#3ddc97'"
        stroke-width="2.5"
      />

      <!-- Coordinate crosshairs -->
      <line :x1="cx - radiusPx - 15" :y1="cy" :x2="cx + radiusPx + 15" :y2="cy" stroke="rgba(255,255,255,0.15)" stroke-width="1" />
      <line :x1="cx" :y1="cy - radiusPx - 15" :x2="cx" :y2="cy + radiusPx + 15" stroke="rgba(255,255,255,0.15)" stroke-width="1" />

      <!-- Axis Labels -->
      <text :x="cx" y="24" fill="#a0aec0" font-size="10" text-anchor="middle" font-weight="600">▲ ACCELERATION (+Gx)</text>
      <text :x="cx" y="330" fill="#a0aec0" font-size="10" text-anchor="middle" font-weight="600">▼ TRAIL BRAKING (-Gx)</text>
      <text :x="cx + radiusPx + 2" :y="cy - 6" fill="#a0aec0" font-size="9" text-anchor="end">CORNERING (Fy) ►</text>

      <!-- Danger zone ring (>100%) -->
      <circle
        :cx="cx"
        :cy="cy"
        :r="radiusPx * 1.15"
        fill="none"
        stroke="rgba(255, 92, 108, 0.25)"
        stroke-width="1.5"
        stroke-dasharray="4 4"
      />

      <!-- Vector from origin to operating point -->
      <line
        :x1="cx"
        :y1="cy"
        :x2="ptX"
        :y2="ptY"
        :stroke="statusClass === 'bad' ? '#ff5c6c' : statusClass === 'warn' ? '#ffcf5c' : '#ff6b3d'"
        stroke-width="2.5"
      />

      <!-- Current Operating Point (animated dot) -->
      <circle
        :cx="ptX"
        :cy="ptY"
        r="8"
        :fill="statusClass === 'bad' ? '#ff5c6c' : statusClass === 'warn' ? '#ffcf5c' : '#ff6b3d'"
        filter="url(#kamm-glow)"
      />
      <circle :cx="ptX" :cy="ptY" r="3.5" fill="#ffffff" />
    </svg>

    <!-- Longitudinal G Control (Trail braking vs Throttle) -->
    <div class="kamm-controls">
      <div class="control-label-row">
        <span>Combined Throttle / Braking</span>
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
        <span>-1.2G Hard Braking</span>
        <span @click="setLongitudinalG(0)" class="reset-link">Neutral 0G</span>
        <span>+1.0G Full Throttle</span>
      </div>
    </div>

    <div class="reserve-badge">
      <span class="reserve-k">Available Longitudinal Reserve:</span>
      <span class="reserve-v">{{ telemetry.availableLongitudinalG.toFixed(2) }} G</span>
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

.kamm-canvas {
  width: 100%;
  height: auto;
  max-height: 340px;
}

.kamm-controls {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 12px;
  padding: 0.8rem;
  border: 1px solid var(--border);
}

.control-label-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.78rem;
  color: var(--muted);
}
.value-highlight {
  font-weight: 600;
  color: var(--accent-2);
}

input[type="range"] {
  width: 100%;
  accent-color: var(--accent);
  cursor: pointer;
}

.range-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.68rem;
  color: var(--muted);
}
.reset-link {
  cursor: pointer;
  text-decoration: underline;
  color: var(--accent-2);
}

.reserve-badge {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
  padding: 0.5rem 0.8rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  border: 1px solid var(--border);
}
.reserve-k { color: var(--muted); }
.reserve-v { font-weight: 700; color: var(--ok); font-size: 0.95rem; }
</style>
