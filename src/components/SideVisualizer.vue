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
// Average wheelbase ~1430mm. Let 1400mm = 370px => scale ~ 0.259 px/mm
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
const headstockX = computed(() => frontAxleX.value - 48);
const headstockY = groundY - 195;
</script>

<template>
  <div class="side-vis-wrap">
    <div class="vis-header">
      <div class="title-wrap">
        <span class="vis-title">Chassis CAD Blueprint &amp; CoG Height</span>
        <span class="badge info">SIDE CALIBRATION RULER</span>
      </div>
      <div class="specs-row">
        <span>Wheelbase: <strong>{{ bike.wheelbaseMm }} mm</strong></span>
        <span>CoG Height h: <strong>{{ bike.cogHeightMm }} mm</strong></span>
        <span>Total Mass: <strong>{{ bike.massKg + riderMassKg }} kg</strong></span>
        <span>Weight Split: <strong>52% F / 48% R</strong></span>
      </div>
    </div>

    <svg viewBox="0 0 640 380" class="side-canvas" preserveAspectRatio="xMidYMid meet">
      <defs>
        <!-- Blueprint Grid Pattern -->
        <pattern id="cad-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <rect width="20" height="20" fill="#080d16" />
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.035)" stroke-width="0.8" />
          <circle cx="20" cy="20" r="0.8" fill="rgba(255,255,255,0.07)" />
        </pattern>

        <!-- Asphalt side surface -->
        <pattern id="asphalt-side" width="20" height="20" patternUnits="userSpaceOnUse">
          <rect width="20" height="20" fill="#101520" />
          <circle cx="4" cy="5" r="1.2" fill="#1b2333" />
          <circle cx="14" cy="12" r="1.4" fill="#171e2e" />
          <circle cx="9" cy="18" r="0.9" fill="#252f44" />
        </pattern>

        <!-- Titanium rainbow heat bluing gradient for exhaust -->
        <linearGradient id="exhaust-heat" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#cbd5e1" />
          <stop offset="35%" stop-color="#f6ad55" />
          <stop offset="65%" stop-color="#b794f4" />
          <stop offset="85%" stop-color="#63b3ed" />
          <stop offset="100%" stop-color="#4fd1c5" />
        </linearGradient>

        <!-- Öhlins yellow spring -->
        <linearGradient id="spring-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ecc94b" />
          <stop offset="50%" stop-color="#f6e05e" />
          <stop offset="100%" stop-color="#d69e2e" />
        </linearGradient>

        <!-- Carbon muffler wrap -->
        <pattern id="carbon-muffler" width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="4" fill="#1a202c" />
          <line x1="0" y1="0" x2="4" y2="4" stroke="#2d3748" stroke-width="1" />
        </pattern>

        <!-- Arrow markers for calibration rulers -->
        <marker id="ruler-arrow-start" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 10 1 L 0 5 L 10 9 z" fill="#ffb347" />
        </marker>
        <marker id="ruler-arrow-end" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#ffb347" />
        </marker>
      </defs>

      <!-- Background CAD grid -->
      <rect width="640" height="380" fill="url(#cad-grid)" />

      <!-- Track ground plane -->
      <rect x="0" :y="groundY" width="640" height="60" fill="url(#asphalt-side)" />
      <line x1="0" :y1="groundY" x2="640" :y2="groundY" stroke="#2d3748" stroke-width="2" />
      <text x="20" :y="groundY + 22" fill="#718096" font-size="10" font-family="monospace">Datum Plane: Track Surface (y=0)</text>

      <!-- REAR WHEEL ASSEMBLY (Axle at rearAxleX, axleY) -->
      <g :transform="`translate(${rearAxleX}, ${axleY})`">
        <!-- Tire Outer Tread Profile -->
        <circle cx="0" cy="0" :r="wheelRadiusPx" fill="#121722" stroke="#2d3748" stroke-width="4.5" />
        <circle cx="0" cy="0" :r="wheelRadiusPx - 8" fill="#18202d" stroke="#1f293d" stroke-width="2" />
        <!-- 17-inch Lightweight Forged Rim -->
        <circle cx="0" cy="0" :r="wheelRadiusPx * 0.68" fill="#090d14" stroke="#e53e3e" stroke-width="2" />
        <!-- Split 5-Spoke Pattern -->
        <line x1="0" :y1="-wheelRadiusPx * 0.65" x2="0" :y2="wheelRadiusPx * 0.65" stroke="#718096" stroke-width="2.5" />
        <line :x1="-wheelRadiusPx * 0.6" :y1="-wheelRadiusPx * 0.25" :x2="wheelRadiusPx * 0.6" :y2="wheelRadiusPx * 0.25" stroke="#718096" stroke-width="2.5" />
        <line :x1="-wheelRadiusPx * 0.45" :y1="wheelRadiusPx * 0.5" :x2="wheelRadiusPx * 0.45" :y2="-wheelRadiusPx * 0.5" stroke="#718096" stroke-width="2.5" />
        <!-- Rear Drilled Brake Disc & Hub -->
        <circle cx="0" cy="0" :r="wheelRadiusPx * 0.38" fill="none" stroke="#cbd5e1" stroke-width="2.5" stroke-dasharray="4 2" />
        <circle cx="0" cy="0" r="7" fill="#ffffff" stroke="#2d3748" stroke-width="2" />
      </g>

      <!-- FRONT WHEEL ASSEMBLY (Axle at frontAxleX, axleY) -->
      <g :transform="`translate(${frontAxleX}, ${axleY})`">
        <!-- Front Tire Outer Tread -->
        <circle cx="0" cy="0" :r="wheelRadiusPx" fill="#121722" stroke="#2d3748" stroke-width="4.5" />
        <circle cx="0" cy="0" :r="wheelRadiusPx - 8" fill="#18202d" stroke="#1f293d" stroke-width="2" />
        <!-- Front 17-inch Rim -->
        <circle cx="0" cy="0" :r="wheelRadiusPx * 0.68" fill="#090d14" stroke="#e53e3e" stroke-width="2" />
        <!-- Split 5-Spoke Pattern -->
        <line x1="0" :y1="-wheelRadiusPx * 0.65" x2="0" :y2="wheelRadiusPx * 0.65" stroke="#718096" stroke-width="2.5" />
        <line :x1="-wheelRadiusPx * 0.6" :y1="-wheelRadiusPx * 0.25" :x2="wheelRadiusPx * 0.6" :y2="wheelRadiusPx * 0.25" stroke="#718096" stroke-width="2.5" />
        <line :x1="-wheelRadiusPx * 0.45" :y1="wheelRadiusPx * 0.5" :x2="wheelRadiusPx * 0.45" :y2="-wheelRadiusPx * 0.5" stroke="#718096" stroke-width="2.5" />
        <!-- Dual Front 330mm Floating Rotors -->
        <circle cx="0" cy="0" :r="wheelRadiusPx * 0.52" fill="none" stroke="#e2e8f0" stroke-width="3" stroke-dasharray="5 2" />
        <!-- Brembo Radial Caliper -->
        <rect x="-18" y="-38" width="12" height="24" rx="2" fill="#e53e3e" stroke="#fff" stroke-width="0.8" />
        <circle cx="0" cy="0" r="7" fill="#ffffff" stroke="#2d3748" stroke-width="2" />
      </g>

      <!-- SWINGARM & REAR SUSPENSION LINKAGE -->
      <!-- Curved Banana Swingarm with Under-Bracing -->
      <path
        :d="`M ${rearAxleX} ${axleY}
           Q ${rearAxleX + 65} ${axleY - 10} ${rearAxleX + 130} ${axleY - 18}
           L ${rearAxleX + 130} ${axleY + 12}
           Q ${rearAxleX + 65} ${axleY + 8} ${rearAxleX} ${axleY} Z`"
        fill="#334155"
        stroke="#64748b"
        stroke-width="2"
      />
      <!-- Chain Drive Line -->
      <line :x1="rearAxleX" :y1="axleY" :x2="rearAxleX + 125" :y2="axleY - 10" stroke="#f59e0b" stroke-width="2.2" stroke-dasharray="6 3" />
      <!-- Rear Sprocket Teeth Profile -->
      <circle :cx="rearAxleX" :cy="axleY" :r="wheelRadiusPx * 0.32" fill="none" stroke="#f59e0b" stroke-width="1.8" stroke-dasharray="2 3" />

      <!-- Öhlins Monoshock Coil Spring & Piggyback Reservoir -->
      <rect :x="rearAxleX + 115" :y="axleY - 55" width="10" height="42" rx="3" fill="url(#spring-grad)" stroke="#d69e2e" stroke-width="1.2" />
      <rect :x="rearAxleX + 112" :y="axleY - 68" width="16" height="12" rx="2" fill="#ecc94b" stroke="#b7791f" stroke-width="1" />

      <!-- ENGINE BLOCK & TRANSMISSION (Central low-slung mass) -->
      <path
        :d="`M ${rearAxleX + 125} ${axleY - 20}
           L ${rearAxleX + 125} ${groundY - 30}
           L ${frontAxleX - 100} ${groundY - 30}
           L ${frontAxleX - 70} ${headstockY + 50}
           L ${rearAxleX + 160} ${headstockY + 45}
           Z`"
        fill="#1e293b"
        stroke="#475569"
        stroke-width="1.8"
      />
      <!-- Circular Clutch Cover -->
      <circle :cx="rearAxleX + 155" :cy="groundY - 60" r="18" fill="#0f172a" stroke="#94a3b8" stroke-width="1.5" />
      <circle :cx="rearAxleX + 155" :cy="groundY - 60" r="6" fill="#cbd5e1" />
      <!-- Cylinder Bank & Cooling Fin Ribs -->
      <line :x1="frontAxleX - 95" :y1="groundY - 70" :x2="frontAxleX - 75" :y2="headstockY + 65" stroke="#64748b" stroke-width="2" />
      <line :x1="frontAxleX - 108" :y1="groundY - 65" :x2="frontAxleX - 88" :y2="headstockY + 70" stroke="#64748b" stroke-width="2" />

      <!-- TITANIUM EXHAUST SYSTEM (Headers -> Collector -> Akrapovič Muffler) -->
      <!-- Exhaust Headers Snaking Down from Cylinder Head -->
      <path
        :d="`M ${frontAxleX - 78} ${headstockY + 75}
           Q ${frontAxleX - 72} ${groundY - 45} ${frontAxleX - 95} ${groundY - 22}
           L ${rearAxleX + 130} ${groundY - 22}`"
        fill="none"
        stroke="url(#exhaust-heat)"
        stroke-width="6"
        stroke-linecap="round"
      />
      <!-- Akrapovič Carbon & Titanium Muffler -->
      <path
        :d="`M ${rearAxleX + 130} ${groundY - 22}
           L ${rearAxleX + 40} ${groundY - 58}`"
        stroke="url(#carbon-muffler)"
        stroke-width="12"
        stroke-linecap="round"
      />
      <circle :cx="rearAxleX + 38" :cy="groundY - 59" r="6" fill="#4fd1c5" stroke="#cbd5e1" stroke-width="1.5" />

      <!-- ALUMINUM TWIN-SPAR PERIMETER FRAME (Deltabox Structure) -->
      <polygon
        :points="`${rearAxleX + 130},${axleY - 20} ${headstockX},${headstockY} ${headstockX - 18},${headstockY + 34} ${rearAxleX + 142},${axleY + 14}`"
        fill="#334155"
        stroke="#94a3b8"
        stroke-width="2.5"
      />
      <!-- Frame Weight-Saving Spar Cutouts -->
      <polygon
        :points="`${rearAxleX + 160},${axleY - 10} ${headstockX - 25},${headstockY + 20} ${headstockX - 35},${headstockY + 45} ${rearAxleX + 165},${axleY + 5}`"
        fill="#1e293b"
        stroke="#475569"
        stroke-width="1"
      />

      <!-- INVERTED FRONT FORKS & STEERING HEAD -->
      <!-- Triple Clamps -->
      <rect :x="headstockX - 6" :y="headstockY - 10" width="14" height="24" rx="2" fill="#64748b" stroke="#cbd5e1" stroke-width="1" />
      <!-- Upper Fork Stanchions (Kashima Gold) -->
      <line
        :x1="headstockX"
        :y1="headstockY - 5"
        :x2="headstockX + (frontAxleX - headstockX) * 0.55"
        :y2="headstockY + (axleY - headstockY) * 0.55"
        stroke="#d69e2e"
        stroke-width="10"
        stroke-linecap="round"
      />
      <!-- Lower Fork Sliders (Chrome) -->
      <line
        :x1="headstockX + (frontAxleX - headstockX) * 0.5"
        :y1="headstockY + (axleY - headstockY) * 0.5"
        :x2="frontAxleX"
        :y2="axleY"
        stroke="#e2e8f0"
        stroke-width="7"
        stroke-linecap="round"
      />
      <!-- Steering Head Rake Angle Axis Line (Projected to ground) -->
      <line
        :x1="headstockX - 10"
        :y1="headstockY - 40"
        :x2="frontAxleX + 12"
        :y2="groundY"
        stroke="rgba(236, 201, 75, 0.4)"
        stroke-width="1.2"
        stroke-dasharray="3 3"
      />

      <!-- FUEL TANK, AIRBOX & SEAT COWL -->
      <!-- Ergonomic Sculpted Fuel Tank -->
      <path
        :d="`M ${headstockX} ${headstockY}
           Q ${headstockX - 45} ${headstockY - 42} ${rearAxleX + 185} ${headstockY - 30}
           L ${rearAxleX + 165} ${headstockY + 28}
           Z`"
        fill="#e53e3e"
        stroke="#ff6b3d"
        stroke-width="2.5"
      />
      <!-- Fuel Cap -->
      <circle :cx="headstockX - 45" :cy="headstockY - 26" r="5" fill="#1e293b" stroke="#cbd5e1" stroke-width="1" />

      <!-- Solo Race Seat & Aerodynamic Tail Cowl -->
      <path
        :d="`M ${rearAxleX + 168} ${headstockY + 12}
           L ${rearAxleX + 42} ${headstockY - 14}
           L ${rearAxleX + 68} ${headstockY + 34}
           Z`"
        fill="#1e293b"
        stroke="#e53e3e"
        stroke-width="2"
      />
      <!-- Rider Seat Pad -->
      <path
        :d="`M ${rearAxleX + 165} ${headstockY + 12}
           Q ${rearAxleX + 140} ${headstockY + 10} ${rearAxleX + 115} ${headstockY + 2}`"
        fill="none"
        stroke="#0f172a"
        stroke-width="8"
        stroke-linecap="round"
      />

      <!-- Clip-on Handlebars & Racing Dashboard Cluster -->
      <rect :x="headstockX - 12" :y="headstockY - 24" width="16" height="10" rx="2" fill="#0f172a" stroke="#38b2ac" stroke-width="1" />
      <line :x1="headstockX" :y1="headstockY - 8" :x2="headstockX - 18" :y2="headstockY - 22" stroke="#718096" stroke-width="5" stroke-linecap="round" />

      <!-- RIDER TUCK PROFILE (Full Aerodynamic Sprint Position) -->
      <!-- Spine & Aerodynamic Speed Hump -->
      <path
        :d="`M ${rearAxleX + 145} ${headstockY + 5}
           Q ${rearAxleX + 140} ${headstockY - 55} ${headstockX - 12} ${headstockY - 50}`"
        fill="none"
        stroke="#2563eb"
        stroke-width="22"
        stroke-linecap="round"
      />
      <!-- Aerodynamic Speed Hump -->
      <polygon
        :points="`${rearAxleX + 130},${headstockY - 20} ${rearAxleX + 105},${headstockY - 5} ${rearAxleX + 120},${headstockY + 5}`"
        fill="#1e3a8a"
        stroke="#3b82f6"
        stroke-width="1"
      />
      <!-- Helmet in Full Tuck behind Windscreen -->
      <ellipse :cx="headstockX + 10" :cy="headstockY - 65" rx="18" ry="16" fill="#1e3a8a" stroke="#60a5fa" stroke-width="2.5" />
      <path :d="`M ${headstockX + 14} ${headstockY - 68} q 14 0 16 6`" fill="none" stroke="#38b2ac" stroke-width="3.5" stroke-linecap="round" />
      <!-- Arms tucked gripping clip-on -->
      <path
        :d="`M ${headstockX - 15} ${headstockY - 45}
           Q ${headstockX - 22} ${headstockY - 15} ${headstockX - 14} ${headstockY - 20}`"
        fill="none"
        stroke="#1d4ed8"
        stroke-width="12"
        stroke-linecap="round"
      />

      <!-- CENTER OF GRAVITY (CoG) MARKER & PULSING RETICLE -->
      <g :transform="`translate(${cogX}, ${cogY})`">
        <!-- Outer Glowing Target Circle -->
        <circle cx="0" cy="0" r="14" fill="none" stroke="#ffcf5c" stroke-width="1" stroke-dasharray="3 3" />
        <!-- Inner Segmented Quadrant Target Disc -->
        <circle cx="0" cy="0" r="10" fill="#0b0f17" stroke="#ffcf5c" stroke-width="2" />
        <path d="M 0 -10 A 10 10 0 0 1 10 0 L 0 0 Z" fill="#ffcf5c" />
        <path d="M 0 10 A 10 10 0 0 1 -10 0 L 0 0 Z" fill="#ffcf5c" />
        <circle cx="0" cy="0" r="2" fill="#ffffff" />
        <!-- Label HUD -->
        <text x="18" y="4" fill="#ffcf5c" font-size="11" font-weight="700" font-family="monospace">
          CoG Height: {{ bike.cogHeightMm }}mm
        </text>
      </g>

      <!-- GROUND-TO-COG VERTICAL HEIGHT RULER (h) -->
      <line :x1="cogX" :y1="groundY" :x2="cogX" :y2="cogY" stroke="#ffcf5c" stroke-width="1.8" stroke-dasharray="3 3" />
      <line
        :x1="cogX - 48"
        :y1="groundY"
        :x2="cogX - 48"
        :y2="cogY"
        stroke="#ffb347"
        stroke-width="1.6"
        marker-start="url(#ruler-arrow-start)"
        marker-end="url(#ruler-arrow-end)"
      />
      <text :x="cogX - 56" :y="groundY - (cogHeightPx / 2)" fill="#ffb347" font-size="11" font-family="monospace" text-anchor="end" font-weight="700">
        h = {{ bike.cogHeightMm }} mm
      </text>

      <!-- WHEELBASE HORIZONTAL CALIBRATION RULER (L) -->
      <g :transform="`translate(0, ${groundY + 34})`">
        <!-- Ruler Line with Dual Arrows -->
        <line
          :x1="rearAxleX"
          y1="0"
          :x2="frontAxleX"
          y2="0"
          stroke="#ffb347"
          stroke-width="2"
          marker-start="url(#ruler-arrow-start)"
          marker-end="url(#ruler-arrow-end)"
        />
        <!-- Vertical Projection Drop Lines from Axles -->
        <line :x1="rearAxleX" y1="-28" :x2="rearAxleX" y2="12" stroke="#64748b" stroke-width="1" stroke-dasharray="2 2" />
        <line :x1="frontAxleX" y1="-28" :x2="frontAxleX" y2="12" stroke="#64748b" stroke-width="1" stroke-dasharray="2 2" />
        <!-- Center Wheelbase Dimension Tag -->
        <text :x="(rearAxleX + frontAxleX) / 2" y="-6" fill="#ffb347" font-size="11.5" font-weight="700" text-anchor="middle" font-family="monospace">
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
  flex-wrap: wrap;
  font-size: 0.75rem;
  color: var(--muted);
}
.specs-row strong {
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.side-canvas {
  width: 100%;
  height: auto;
  max-height: 400px;
  background: #080d16;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.07);
}
</style>
