<script setup lang="ts">
import { computed } from 'vue';
import type { PhysicsResult } from '../physics/types';

const props = defineProps<{
  telemetry: PhysicsResult;
  maxMechLeanDeg: number;
  riderHangOffCm: number;
}>();

const groundY = 380;
const originX = 300;
const pxPerMeter = 320;

const bikeLeanRad = computed(() => (props.telemetry.toroidalBikeLeanDeg * Math.PI) / 180);
const cpOffsetPx = computed(() => (props.telemetry.contactPatchOffsetMm / 1000) * pxPerMeter);
const cpX = computed(() => originX + cpOffsetPx.value);

// Crown radius of front tire (typically 120/70 -> rt ~ 45mm)
const frontRtPx = 0.045 * pxPerMeter;

// Knee slider position (hangs off on inside of turn toward right)
const kneeHangOffPx = computed(() => (props.riderHangOffCm / 100) * pxPerMeter * 1.6);
const kneeX = computed(() => cpX.value + 35 * Math.sin(bikeLeanRad.value) + kneeHangOffPx.value * Math.cos(bikeLeanRad.value * 0.5));
// Knee touches track surface when hanging off at steep lean
const kneeNominalY = computed(() => groundY - 110 * Math.cos(bikeLeanRad.value) + 40 * Math.sin(bikeLeanRad.value));
const kneeY = computed(() => Math.min(groundY - 6, Math.max(groundY - 140, kneeNominalY.value)));
const kneeClearanceMm = computed(() => Math.max(0, Math.round((groundY - kneeY.value) * (1000 / pxPerMeter))));

const isKneeDown = computed(() => kneeClearanceMm.value <= 15);
const isScraping = computed(() => props.telemetry.isScrapingHardParts);
</script>

<template>
  <div class="front-vis-wrap">
    <div class="vis-header">
      <div class="title-wrap">
        <span class="vis-title">Front Dynamic Lean &amp; Knee-Down View</span>
        <span class="badge" :class="isScraping ? 'bad' : isKneeDown ? 'warn' : 'ok'">
          {{ isScraping ? 'HARD PART SCRAPING' : isKneeDown ? 'KNEE DOWN (TOUCHING)' : 'AERO ENVELOPE' }}
        </span>
      </div>
      <div class="knee-badge">
        <span class="k">Knee Clearance:</span>
        <span class="v" :class="isKneeDown ? 'accent' : 'ok'">{{ isKneeDown ? '0 mm (Puck down)' : `${kneeClearanceMm} mm` }}</span>
      </div>
    </div>

    <svg viewBox="0 0 600 440" class="front-canvas" preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id="asphalt-front" width="16" height="16" patternUnits="userSpaceOnUse">
          <rect width="16" height="16" fill="#131822" />
          <circle cx="4" cy="4" r="1" fill="#1d2535" />
          <circle cx="12" cy="10" r="1.2" fill="#182030" />
          <circle cx="8" cy="14" r="0.8" fill="#222c3e" />
        </pattern>
        <filter id="headlight-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <linearGradient id="windshield-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#4fd1c5" stop-opacity="0.75" />
          <stop offset="100%" stop-color="#234e52" stop-opacity="0.3" />
        </linearGradient>
      </defs>

      <!-- Upright center guideline -->
      <line :x1="originX" y1="40" :x2="originX" :y2="groundY" stroke="rgba(255,255,255,0.1)" stroke-dasharray="3 4" />

      <!-- Track ground plane -->
      <rect x="0" :y="groundY" width="600" height="60" fill="url(#asphalt-front)" />
      <line x1="0" :y1="groundY" x2="600" :y2="groundY" stroke="#2d3748" stroke-width="2.5" />
      <text x="24" :y="groundY + 22" fill="#718096" font-size="11">Track Apex Surface</text>

      <!-- Leaned Front Assembly (Motorcycle Frame, Forks, Wheel, Headlights) -->
      <g :transform="`translate(${cpX}, ${groundY}) rotate(${telemetry.toroidalBikeLeanDeg})`">
        <!-- Front tire crown contact -->
        <ellipse cx="0" :cy="-frontRtPx" :rx="frontRtPx * 0.85" :ry="frontRtPx" fill="#171e28" stroke="#334155" stroke-width="2.5" />
        <circle cx="0" :cy="-frontRtPx * 2" r="18" fill="none" stroke="#ff6b3d" stroke-width="2" />

        <!-- Dual Inverted Fork Stanchions -->
        <line x1="-16" y1="-70" x2="-16" y2="-230" stroke="#cbd5e1" stroke-width="7" stroke-linecap="round" />
        <line x1="16" y1="-70" x2="16" y2="-230" stroke="#cbd5e1" stroke-width="7" stroke-linecap="round" />
        <line x1="-16" y1="-140" x2="-16" y2="-230" stroke="#ecc94b" stroke-width="9" stroke-linecap="round" />
        <line x1="16" y1="-140" x2="16" y2="-230" stroke="#ecc94b" stroke-width="9" stroke-linecap="round" />

        <!-- Front Fender -->
        <path d="M -22 -100 Q 0 -115 22 -100" fill="none" stroke="#ff6b3d" stroke-width="5" stroke-linecap="round" />

        <!-- Lower Triple Clamp -->
        <rect x="-26" y="-235" width="52" height="10" rx="3" fill="#334155" />

        <!-- Front Aerodynamic Nose Cowling -->
        <path
          d="M 0 -310 L -46 -260 L -62 -220 L -30 -195 L 0 -210 L 30 -195 L 62 -220 L 46 -260 Z"
          fill="#1a202c"
          stroke="#ff6b3d"
          stroke-width="2.5"
        />

        <!-- Clear Racing Windshield -->
        <path d="M 0 -355 L -26 -305 L 0 -290 L 26 -305 Z" fill="url(#windshield-grad)" stroke="#4fd1c5" stroke-width="1.5" />

        <!-- Aggressive Twin LED Headlights (glowing) -->
        <path d="M -40 -245 L -16 -240 L -32 -252 Z" fill="#63b3ed" filter="url(#headlight-glow)" />
        <path d="M 40 -245 L 16 -240 L 32 -252 Z" fill="#63b3ed" filter="url(#headlight-glow)" />
        <circle cx="-28" cy="-244" r="3" fill="#ffffff" />
        <circle cx="28" cy="-244" r="3" fill="#ffffff" />

        <!-- Central Ram-Air Intake -->
        <polygon points="-10,-230 10,-230 6,-242 -6,-242" fill="#0b0f17" stroke="#4a5568" stroke-width="1" />

        <!-- Clip-on Handlebars with Bar-End Guards -->
        <line x1="-70" y1="-265" x2="-22" y2="-250" stroke="#718096" stroke-width="5" stroke-linecap="round" />
        <line x1="70" y1="-265" x2="22" y2="-250" stroke="#718096" stroke-width="5" stroke-linecap="round" />
        <circle cx="-70" cy="-265" r="5" fill="#e2e8f0" />
        <circle cx="70" cy="-265" r="5" fill="#e2e8f0" />
        <!-- Brake lever guard (right side) -->
        <path d="M 68 -265 L 85 -260 L 82 -250" fill="none" stroke="#ff6b3d" stroke-width="2.5" />

        <!-- Footpegs -->
        <line x1="-35" y1="-95" x2="-58" y2="-95" stroke="#a0aec0" stroke-width="4" stroke-linecap="round" />
        <line x1="35" y1="-95" x2="58" y2="-95" :stroke="isScraping ? '#ff5c6c' : '#a0aec0'" stroke-width="4" stroke-linecap="round" />
      </g>

      <!-- Rider Front Anatomy (Helmet, Torso hanging off, Knee Puck) -->
      <!-- Rider shifts to the inside of the turn (to the right when leaning right) -->
      <g v-if="riderHangOffCm > 0">
        <!-- Helmet tucked behind screen -->
        <circle
          :cx="cpX + 32 * Math.sin(bikeLeanRad) + (kneeHangOffPx * 0.45)"
          :cy="groundY - 330 * Math.cos(bikeLeanRad)"
          r="16"
          fill="#3182ce"
          stroke="#63b3ed"
          stroke-width="2.5"
        />
        <!-- Visor -->
        <path
          :d="`M ${cpX + 32 * Math.sin(bikeLeanRad) + (kneeHangOffPx * 0.45) - 4} ${groundY - 330 * Math.cos(bikeLeanRad) - 2}
             q 14 0 16 6`"
          fill="none"
          stroke="#1a202c"
          stroke-width="4"
          stroke-linecap="round"
        />

        <!-- Leaning Upper Torso & Leathers -->
        <path
          :d="`M ${cpX + 10} ${groundY - 260 * Math.cos(bikeLeanRad)}
             Q ${kneeX - 20} ${groundY - 210} ${kneeX} ${kneeY - 40}
             L ${kneeX + 25} ${kneeY - 25}
             Q ${kneeX + 10} ${groundY - 250} ${cpX + 45} ${groundY - 290 * Math.cos(bikeLeanRad)} Z`"
          fill="rgba(49, 130, 206, 0.45)"
          stroke="#63b3ed"
          stroke-width="2"
        />

        <!-- Knee Puck & Leg Slider (Touching track surface) -->
        <g :transform="`translate(${kneeX}, ${kneeY})`">
          <!-- Knee armor cup -->
          <ellipse cx="0" cy="-6" rx="14" ry="12" fill="#2b6cb0" stroke="#90cdf4" stroke-width="2" />
          <!-- Replaceable Knee Slider Puck -->
          <rect
            x="-8"
            y="-2"
            width="18"
            height="10"
            rx="3"
            :fill="isKneeDown ? '#ffcf5c' : '#ffffff'"
            :stroke="isKneeDown ? '#ff6b3d' : '#cbd5e1'"
            stroke-width="2"
          />
          <!-- Spark particles if knee down -->
          <g v-if="isKneeDown">
            <circle cx="12" cy="4" r="2" fill="#ffb347" />
            <circle cx="18" cy="8" r="1.5" fill="#ff6b3d" />
            <circle cx="22" cy="12" r="1" fill="#ffcf5c" />
          </g>
          <text x="22" y="2" fill="#90cdf4" font-size="10" font-weight="600">
            Knee Slider
          </text>
        </g>

        <!-- Knee ground clearance dimension line -->
        <line :x1="kneeX" :y1="kneeY" :x2="kneeX" :y2="groundY" stroke="#63b3ed" stroke-width="1.5" stroke-dasharray="2 2" />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.front-vis-wrap {
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

.knee-badge {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
}
.knee-badge .k { color: var(--muted); }
.knee-badge .v { font-weight: 700; font-variant-numeric: tabular-nums; }
.knee-badge .v.ok { color: var(--ok); }
.knee-badge .v.accent { color: var(--accent-2); }

.front-canvas {
  width: 100%;
  height: auto;
  max-height: 400px;
  background: #090d14;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}
</style>
