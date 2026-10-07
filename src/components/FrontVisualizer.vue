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

const bikeLeanDeg = computed(() => props.telemetry.toroidalBikeLeanDeg);
const bikeLeanRad = computed(() => (bikeLeanDeg.value * Math.PI) / 180);
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

// Mechanical lean limit line
const maxMechRad = computed(() => (props.maxMechLeanDeg * Math.PI) / 180);
</script>

<template>
  <div class="front-vis-wrap">
    <div class="vis-header">
      <div class="title-wrap">
        <span class="vis-title">Front Dynamic Aero &amp; Knee-Down View</span>
        <span class="badge" :class="isScraping ? 'bad' : isKneeDown ? 'warn' : 'ok'">
          {{ isScraping ? 'HARD PART SCRAPING' : isKneeDown ? 'KNEE DOWN (TOUCHING)' : 'AERO ENVELOPE' }}
        </span>
      </div>
      <div class="header-badges">
        <div class="knee-badge">
          <span class="k">Lean Angle:</span>
          <span class="v accent">{{ bikeLeanDeg.toFixed(1) }}°</span>
        </div>
        <div class="knee-badge">
          <span class="k">Knee Clearance:</span>
          <span class="v" :class="isKneeDown ? 'warn' : 'ok'">{{ isKneeDown ? '0 mm (TOUCHING)' : `${kneeClearanceMm} mm` }}</span>
        </div>
      </div>
    </div>

    <svg viewBox="0 0 600 440" class="front-canvas" preserveAspectRatio="xMidYMid meet">
      <defs>
        <!-- Carbon fiber twill pattern -->
        <pattern id="carbon-fiber" width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#151921" />
          <path d="M0 3 L3 0 L6 3 L3 6 Z" fill="#202735" />
          <line x1="0" y1="0" x2="6" y2="6" stroke="#0f1218" stroke-width="0.8" />
        </pattern>

        <!-- Asphalt front surface -->
        <pattern id="asphalt-front" width="20" height="20" patternUnits="userSpaceOnUse">
          <rect width="20" height="20" fill="#121722" />
          <circle cx="4" cy="5" r="1.2" fill="#1c2436" />
          <circle cx="15" cy="14" r="1.4" fill="#171e2e" />
          <circle cx="10" cy="18" r="0.9" fill="#263147" />
        </pattern>

        <!-- Kerb pattern (red and white track curbing) -->
        <pattern id="kerb-rumble" width="36" height="24" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="18" height="24" fill="#e53e3e" />
          <rect x="18" y="0" width="18" height="24" fill="#edf2f7" />
          <line x1="0" y1="0" x2="36" y2="0" stroke="#718096" stroke-width="1.5" />
        </pattern>

        <!-- Headlight neon beam glow -->
        <filter id="headlight-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>

        <!-- Iridium tinted visor gradient -->
        <linearGradient id="iridium-visor" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#38b2ac" />
          <stop offset="50%" stop-color="#9f7aea" />
          <stop offset="100%" stop-color="#ed64a6" />
        </linearGradient>

        <!-- Windshield gradient -->
        <linearGradient id="windshield-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#319795" stop-opacity="0.8" />
          <stop offset="100%" stop-color="#1d4044" stop-opacity="0.3" />
        </linearGradient>

        <!-- Gold titanium nitride fork coating -->
        <linearGradient id="fork-gold" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#d69e2e" />
          <stop offset="50%" stop-color="#f6e05e" />
          <stop offset="100%" stop-color="#b7791f" />
        </linearGradient>

        <!-- Brembo brake disc stainless steel -->
        <linearGradient id="disc-steel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#e2e8f0" />
          <stop offset="50%" stop-color="#718096" />
          <stop offset="100%" stop-color="#cbd5e1" />
        </linearGradient>

        <!-- Spark glow filter -->
        <filter id="spark-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      <!-- Upright zero-degree reference axis -->
      <line :x1="originX" y1="40" :x2="originX" :y2="groundY" stroke="rgba(255,255,255,0.12)" stroke-dasharray="3 4" />
      <text :x="originX + 6" y="55" fill="#718096" font-size="10" font-family="monospace">0° Upright</text>

      <!-- Track ground plane & asphalt -->
      <rect x="0" :y="groundY" width="600" height="60" fill="url(#asphalt-front)" />
      <line x1="0" :y1="groundY" x2="600" :y2="groundY" stroke="#2d3748" stroke-width="2" />

      <!-- Inside Apex Kerb (on the right side when leaning right) -->
      <rect x="420" :y="groundY - 4" width="180" height="18" fill="url(#kerb-rumble)" stroke="#a0aec0" stroke-width="1" />
      <text x="440" :y="groundY + 32" fill="#a0aec0" font-size="10" font-family="monospace">Apex Kerb Rumble</text>

      <!-- Ground Contact Patch lateral migration indicator -->
      <g :transform="`translate(${cpX}, ${groundY})`">
        <!-- Glowing tire footprint oval -->
        <ellipse cx="0" cy="0" rx="14" ry="4" fill="rgba(79, 209, 197, 0.3)" stroke="#4fd1c5" stroke-width="1.5" />
        <!-- Migration arrow from centerline -->
        <line :x1="originX - cpX" y1="12" x2="0" y2="12" stroke="#4fd1c5" stroke-width="1.5" stroke-dasharray="2 2" />
        <text :x="(originX - cpX) / 2" y="24" fill="#4fd1c5" font-size="9" text-anchor="middle" font-family="monospace">
          Δy = {{ telemetry.contactPatchOffsetMm.toFixed(0) }}mm
        </text>
      </g>

      <!-- Lean Angle Degree Protractor Gauge Arc -->
      <g :transform="`translate(${originX}, ${groundY})`">
        <!-- Guide circle arc -->
        <path d="M 0 -240 A 240 240 0 0 1 170 -170" fill="none" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3 3" />
        <!-- Active lean angle radius line -->
        <line
          x1="0"
          y1="0"
          :x2="240 * Math.sin(bikeLeanRad)"
          :y2="-240 * Math.cos(bikeLeanRad)"
          stroke="rgba(255, 107, 61, 0.6)"
          stroke-width="1.5"
          stroke-dasharray="4 2"
        />
        <!-- Arc wedge -->
        <text
          :x="140 * Math.sin(bikeLeanRad / 2)"
          :y="-140 * Math.cos(bikeLeanRad / 2)"
          fill="#ff6b3d"
          font-size="11"
          font-weight="700"
          font-family="monospace"
        >
          {{ bikeLeanDeg.toFixed(1) }}°
        </text>
      </g>

      <!-- Mechanical Lean Clearance Wedge Indicator -->
      <g :transform="`translate(${cpX}, ${groundY})`">
        <line
          x1="0"
          y1="0"
          :x2="260 * Math.sin(maxMechRad)"
          :y2="-260 * Math.cos(maxMechRad)"
          stroke="rgba(255, 92, 108, 0.45)"
          stroke-width="1.5"
          stroke-dasharray="3 3"
        />
        <text
          :x="260 * Math.sin(maxMechRad) + 6"
          :y="-260 * Math.cos(maxMechRad)"
          fill="#ff5c6c"
          font-size="9"
          font-family="monospace"
        >
          Mech Limit {{ maxMechLeanDeg }}°
        </text>
      </g>

      <!-- LEANED MOTORCYCLE FRONT ASSEMBLY (Rotates around shifted contact patch) -->
      <g :transform="`translate(${cpX}, ${groundY}) rotate(${telemetry.toroidalBikeLeanDeg})`">
        <!-- Front Tire Crown Contact Profile (120/70-17 radial tire) -->
        <ellipse cx="0" :cy="-frontRtPx" :rx="frontRtPx * 0.88" :ry="frontRtPx" fill="#121720" stroke="#2d3748" stroke-width="3" />
        <ellipse cx="0" :cy="-frontRtPx" :rx="frontRtPx * 0.72" :ry="frontRtPx * 0.85" fill="#18202c" />

        <!-- Front Wheel Rim & Spokes (17-inch lightweight forged alloy) -->
        <circle cx="0" cy="-80" r="42" fill="#0d1117" stroke="#4a5568" stroke-width="3.5" />
        <circle cx="0" cy="-80" r="14" fill="#2d3748" stroke="#cbd5e1" stroke-width="2" />
        <!-- Dual 330mm Drilled Floating Brake Rotors -->
        <circle cx="-16" cy="-80" r="32" fill="none" stroke="url(#disc-steel)" stroke-width="4" stroke-dasharray="6 3" />
        <circle cx="16" cy="-80" r="32" fill="none" stroke="url(#disc-steel)" stroke-width="4" stroke-dasharray="6 3" />

        <!-- Brembo Stylema Radial Calipers (Red anodized) -->
        <rect x="-24" y="-94" width="8" height="28" rx="2" fill="#e53e3e" stroke="#fff" stroke-width="0.8" />
        <rect x="16" y="-94" width="8" height="28" rx="2" fill="#e53e3e" stroke="#fff" stroke-width="0.8" />

        <!-- Inverted Öhlins Front Fork Stanchions -->
        <!-- Lower Chrome Sliders -->
        <line x1="-18" y1="-70" x2="-18" y2="-170" stroke="#e2e8f0" stroke-width="8" stroke-linecap="round" />
        <line x1="18" y1="-70" x2="18" y2="-170" stroke="#e2e8f0" stroke-width="8" stroke-linecap="round" />
        <!-- Upper Kashima Gold Outer Tubes -->
        <line x1="-18" y1="-150" x2="-18" y2="-245" stroke="url(#fork-gold)" stroke-width="11" stroke-linecap="round" />
        <line x1="18" y1="-150" x2="18" y2="-245" stroke="url(#fork-gold)" stroke-width="11" stroke-linecap="round" />

        <!-- Front Carbon Fiber Fender -->
        <path d="M -26 -108 Q 0 -130 26 -108" fill="none" stroke="url(#carbon-fiber)" stroke-width="8" stroke-linecap="round" />
        <path d="M -26 -108 Q 0 -130 26 -108" fill="none" stroke="#ff6b3d" stroke-width="1.5" />

        <!-- Billet Aluminum Lower Triple Tree Clamp -->
        <rect x="-28" y="-242" width="56" height="12" rx="3" fill="#2d3748" stroke="#4a5568" stroke-width="1" />

        <!-- MotoGP Downforce Aerodynamic Winglets (protruding left & right) -->
        <!-- Left Winglet -->
        <path d="M -46 -245 L -85 -235 L -80 -225 L -42 -232 Z" fill="url(#carbon-fiber)" stroke="#ff6b3d" stroke-width="1.5" />
        <!-- Right Winglet (inside of corner, generates downforce) -->
        <path d="M 46 -245 L 85 -235 L 80 -225 L 42 -232 Z" fill="url(#carbon-fiber)" stroke="#ff6b3d" stroke-width="1.5" />

        <!-- Front Fairing Nose Cowling (Aggressive Superbike Styling) -->
        <path
          d="M 0 -325 L -52 -270 L -68 -225 L -34 -195 L 0 -212 L 34 -195 L 68 -225 L 52 -270 Z"
          fill="#171c26"
          stroke="#ff6b3d"
          stroke-width="2.5"
        />
        <!-- Fairing accent side vents -->
        <polygon points="-48,-245 -58,-225 -38,-215" fill="#0b0e14" stroke="#4a5568" stroke-width="1" />
        <polygon points="48,-245 58,-225 38,-215" fill="#0b0e14" stroke="#4a5568" stroke-width="1" />

        <!-- Clear Racing Double-Bubble Windscreen -->
        <path d="M 0 -370 L -28 -315 L 0 -300 L 28 -315 Z" fill="url(#windshield-grad)" stroke="#4fd1c5" stroke-width="1.8" />
        <path d="M -12 -335 L 0 -360 L 12 -335" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1" />

        <!-- Central Ram-Air Air Intake Duct -->
        <polygon points="-12,-232 12,-232 8,-248 -8,-248" fill="#090d14" stroke="#718096" stroke-width="1.2" />

        <!-- High-Intensity LED Projector Headlights with DRL Eyebrows -->
        <!-- Left Light -->
        <path d="M -44 -250 L -18 -246 L -34 -258 Z" fill="#63b3ed" filter="url(#headlight-glow)" />
        <circle cx="-32" cy="-250" r="4" fill="#ffffff" />
        <!-- Right Light -->
        <path d="M 44 -250 L 18 -246 L 34 -258 Z" fill="#63b3ed" filter="url(#headlight-glow)" />
        <circle cx="32" cy="-250" r="4" fill="#ffffff" />

        <!-- Clip-on Racing Handlebars with Billet Lever Guards -->
        <line x1="-74" y1="-272" x2="-24" y2="-258" stroke="#718096" stroke-width="6" stroke-linecap="round" />
        <line x1="74" y1="-272" x2="24" y2="-258" stroke="#718096" stroke-width="6" stroke-linecap="round" />
        <circle cx="-74" cy="-272" r="5" fill="#e2e8f0" />
        <circle cx="74" cy="-272" r="5" fill="#e2e8f0" />
        <!-- Right Lever Guard (Brake side - MotoGP regulation) -->
        <path d="M 72 -272 L 92 -268 L 88 -254" fill="none" stroke="#ff6b3d" stroke-width="2.5" stroke-linecap="round" />

        <!-- Footpegs & Exhaust Can Clearance Check -->
        <line x1="-38" y1="-95" x2="-62" y2="-95" stroke="#a0aec0" stroke-width="5" stroke-linecap="round" />
        <line x1="38" y1="-95" x2="62" y2="-95" :stroke="isScraping ? '#ff5c6c' : '#a0aec0'" stroke-width="5" stroke-linecap="round" />

        <!-- Dynamic Scraping Sparks if Footpeg / Fairing touches track -->
        <g v-if="isScraping" filter="url(#spark-glow)">
          <circle cx="64" cy="-90" r="3" fill="#ffcf5c" />
          <circle cx="72" cy="-82" r="2.5" fill="#ff6b3d" />
          <circle cx="80" cy="-76" r="2" fill="#ffb347" />
          <line x1="62" y1="-95" x2="85" y2="-75" stroke="#ffcf5c" stroke-width="1.8" />
          <line x1="62" y1="-95" x2="78" y2="-88" stroke="#ff5c6c" stroke-width="1.2" />
        </g>
      </g>

      <!-- RIDER ANATOMY & KNEE-DOWN DRAGGING ON TRACK -->
      <g v-if="riderHangOffCm > 0">
        <!-- Helmet tucked in cornering roll (aerodynamic spoiler) -->
        <g :transform="`translate(${cpX + 32 * Math.sin(bikeLeanRad) + (kneeHangOffPx * 0.45)}, ${groundY - 330 * Math.cos(bikeLeanRad)})`">
          <!-- Helmet Shell -->
          <ellipse cx="0" cy="0" rx="18" ry="16" fill="#1e3a8a" stroke="#3b82f6" stroke-width="2.5" />
          <!-- Aerodynamic Rear Spoiler -->
          <polygon points="-12,-8 12,-8 16,-16 -16,-16" fill="#172554" stroke="#60a5fa" stroke-width="1" />
          <!-- Iridium Tinted Visor with Glare -->
          <path d="M -6 2 Q 8 6 16 0 Q 14 -8 4 -6 Z" fill="url(#iridium-visor)" stroke="#ffffff" stroke-width="0.8" />
        </g>

        <!-- Leaning Upper Torso & Dainese Leather Suit -->
        <path
          :d="`M ${cpX + 12} ${groundY - 265 * Math.cos(bikeLeanRad)}
             Q ${kneeX - 25} ${groundY - 215} ${kneeX} ${kneeY - 45}
             L ${kneeX + 28} ${kneeY - 25}
             Q ${kneeX + 12} ${groundY - 255} ${cpX + 50} ${groundY - 295 * Math.cos(bikeLeanRad)} Z`"
          fill="rgba(30, 58, 138, 0.55)"
          stroke="#3b82f6"
          stroke-width="2.5"
        />

        <!-- Shoulder Titanium Armor Slider -->
        <ellipse
          :cx="cpX + 28 * Math.sin(bikeLeanRad) + (kneeHangOffPx * 0.6)"
          :cy="groundY - 275 * Math.cos(bikeLeanRad)"
          rx="10"
          ry="7"
          fill="#cbd5e1"
          stroke="#94a3b8"
          stroke-width="1.5"
        />

        <!-- Knee Slider Cup & Replaceable Puck -->
        <g :transform="`translate(${kneeX}, ${kneeY})`">
          <!-- Knee Armor Cap -->
          <ellipse cx="0" cy="-6" rx="15" ry="12" fill="#1e3a8a" stroke="#60a5fa" stroke-width="2" />
          <!-- Puck (Turns glowing yellow/orange when touching track) -->
          <rect
            x="-8"
            y="-2"
            width="20"
            height="11"
            rx="3"
            :fill="isKneeDown ? '#f6ad55' : '#ffffff'"
            :stroke="isKneeDown ? '#dd6b20' : '#cbd5e1'"
            stroke-width="2"
          />

          <!-- Knee Down Sparks flying on track -->
          <g v-if="isKneeDown" filter="url(#spark-glow)">
            <circle cx="16" cy="5" r="2.8" fill="#ffcf5c" />
            <circle cx="24" cy="9" r="2.2" fill="#ff6b3d" />
            <circle cx="32" cy="14" r="1.5" fill="#fbd38d" />
            <line x1="10" y1="2" x2="28" y2="10" stroke="#ffcf5c" stroke-width="1.6" />
          </g>

          <text x="24" y="0" fill="#90cdf4" font-size="10" font-weight="700" font-family="monospace">
            {{ isKneeDown ? 'PUCK DRAGGING' : 'KNEE SLIDER' }}
          </text>
        </g>

        <!-- Knee Ground Clearance Dimension Callout Line -->
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

.header-badges {
  display: flex;
  align-items: center;
  gap: 0.9rem;
}

.knee-badge {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
}
.knee-badge .k { color: var(--muted); }
.knee-badge .v { font-weight: 700; font-variant-numeric: tabular-nums; }
.knee-badge .v.ok { color: var(--ok); }
.knee-badge .v.warn { color: var(--warn); }
.knee-badge .v.accent { color: var(--accent-2); }

.front-canvas {
  width: 100%;
  height: auto;
  max-height: 420px;
  background: #080c14;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.07);
}
</style>
