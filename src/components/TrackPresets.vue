<script setup lang="ts">
export interface TrackCorner {
  track: string;
  name: string;
  country: string;
  speedKmh: number;
  radiusM: number;
  description: string;
  defaultLongitudinalG?: number;
  trackPath: string;
  apexX: number;
  apexY: number;
}

const PRESETS: TrackCorner[] = [
  {
    track: 'Mugello',
    name: 'Correntaio (Turn 12)',
    country: 'Italy 🇮🇹',
    speedKmh: 95,
    radiusM: 42,
    description: 'Downhill tightening right-hander requiring sustained edge grip.',
    defaultLongitudinalG: -0.15,
    trackPath: 'M 25,65 L 120,65 Q 148,65 142,48 Q 135,32 115,32 L 80,32 Q 62,32 72,18 Q 82,8 108,12 L 132,16 Q 152,22 150,42 L 148,58 Q 145,78 122,78 L 42,78 Q 20,78 25,65 Z',
    apexX: 145,
    apexY: 55,
  },
  {
    track: 'Mugello',
    name: 'Arrabbiata 1 (Turn 8)',
    country: 'Italy 🇮🇹',
    speedKmh: 165,
    radiusM: 85,
    description: 'High-speed uphill blind right-hand sweeper under full compression.',
    defaultLongitudinalG: 0.1,
    trackPath: 'M 25,65 L 120,65 Q 148,65 142,48 Q 135,32 115,32 L 80,32 Q 62,32 72,18 Q 82,8 108,12 L 132,16 Q 152,22 150,42 L 148,58 Q 145,78 122,78 L 42,78 Q 20,78 25,65 Z',
    apexX: 115,
    apexY: 32,
  },
  {
    track: 'Laguna Seca',
    name: 'Andretti Hairpin (Turn 2)',
    country: 'USA 🇺🇸',
    speedKmh: 68,
    radiusM: 26,
    description: 'Double-apex heavy trail-braking hairpin after the front straight.',
    defaultLongitudinalG: -0.35,
    trackPath: 'M 30,62 L 138,62 Q 162,62 155,42 Q 148,25 125,25 L 72,25 Q 52,25 62,14 Q 72,6 94,8 L 118,14 Q 134,18 132,28 Q 118,44 102,44 L 48,46 Q 22,46 30,62 Z',
    apexX: 154,
    apexY: 38,
  },
  {
    track: 'Laguna Seca',
    name: 'The Corkscrew (Turn 8)',
    country: 'USA 🇺🇸',
    speedKmh: 78,
    radiusM: 32,
    description: 'Blind crest left-to-right drop with dramatic 5.5-story elevation change.',
    defaultLongitudinalG: -0.2,
    trackPath: 'M 30,62 L 138,62 Q 162,62 155,42 Q 148,25 125,25 L 72,25 Q 52,25 62,14 Q 72,6 94,8 L 118,14 Q 134,18 132,28 Q 118,44 102,44 L 48,46 Q 22,46 30,62 Z',
    apexX: 125,
    apexY: 22,
  },
  {
    track: 'Phillip Island',
    name: 'Stoner Corner (Turn 3)',
    country: 'Australia 🇦🇺',
    speedKmh: 205,
    radiusM: 115,
    description: 'Terrifying 5th-gear left-hand sweep right next to the Southern Ocean.',
    defaultLongitudinalG: 0.25,
    trackPath: 'M 25,48 Q 25,18 55,16 L 112,16 Q 142,16 148,32 Q 152,52 128,62 L 82,72 Q 58,78 42,66 Q 25,56 25,48 Z',
    apexX: 140,
    apexY: 24,
  },
  {
    track: 'Circuit of the Americas',
    name: 'Turn 1 Hairpin',
    country: 'USA 🇺🇸',
    speedKmh: 62,
    radiusM: 24,
    description: 'Steep 133-foot uphill climb into a blind 130-degree apex.',
    defaultLongitudinalG: -0.4,
    trackPath: 'M 25,72 L 52,18 Q 62,10 76,22 L 105,45 Q 130,62 152,52 Q 165,42 150,28 L 118,22 Q 92,22 105,72 L 40,75 Q 22,75 25,72 Z',
    apexX: 60,
    apexY: 12,
  },
  {
    track: 'Circuit of the Americas',
    name: 'Carousel (Turn 17-18)',
    country: 'USA 🇺🇸',
    speedKmh: 138,
    radiusM: 68,
    description: 'Endless multi-radius right-hand carousel testing tire endurance.',
    defaultLongitudinalG: 0.05,
    trackPath: 'M 25,72 L 52,18 Q 62,10 76,22 L 105,45 Q 130,62 152,52 Q 165,42 150,28 L 118,22 Q 92,22 105,72 L 40,75 Q 22,75 25,72 Z',
    apexX: 148,
    apexY: 48,
  },
  {
    track: 'Circuit de Barcelona-Catalunya',
    name: 'Curvone Renault (Turn 3)',
    country: 'Spain 🇪🇸',
    speedKmh: 172,
    radiusM: 108,
    description: 'Long high-load right turn stressing the right tire shoulder.',
    defaultLongitudinalG: 0.15,
    trackPath: 'M 22,70 L 132,70 Q 155,70 150,48 Q 145,22 120,22 L 86,22 Q 66,22 76,38 Q 90,52 116,52 L 130,52 Q 146,52 140,32 L 126,16 Q 102,10 72,18 L 38,42 Q 18,58 22,70 Z',
    apexX: 148,
    apexY: 38,
  },
];

const emit = defineEmits<{
  (e: 'select', corner: TrackCorner): void;
}>();
</script>

<template>
  <div class="presets-wrap">
    <div class="presets-header">
      <span class="presets-title">Famous Circuit Corner Presets</span>
      <span class="hint">Click any corner to load telemetry geometry and track friction limits:</span>
    </div>

    <div class="presets-grid">
      <button
        v-for="c in PRESETS"
        :key="`${c.track}-${c.name}`"
        type="button"
        class="preset-card"
        @click="emit('select', c)"
      >
        <div class="card-layout">
          <!-- Mini Track Layout SVG -->
          <div class="mini-track-wrap">
            <svg viewBox="0 0 175 85" class="mini-track-svg">
              <defs>
                <filter :id="`glow-${c.track}-${c.name}`" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>
              <!-- Circuit ribbon -->
              <path
                :d="c.trackPath"
                fill="none"
                stroke="rgba(255, 255, 255, 0.12)"
                stroke-width="5"
                stroke-linejoin="round"
                stroke-linecap="round"
              />
              <path
                :d="c.trackPath"
                fill="none"
                stroke="#1e293b"
                stroke-width="3"
                stroke-linejoin="round"
                stroke-linecap="round"
              />
              <!-- Highlighted Apex Marker with Pulse Ring -->
              <circle
                :cx="c.apexX"
                :cy="c.apexY"
                r="7"
                fill="none"
                stroke="#ff6b3d"
                stroke-width="1.5"
                opacity="0.75"
              />
              <circle
                :cx="c.apexX"
                :cy="c.apexY"
                r="3.5"
                fill="#ff6b3d"
                :filter="`url(#glow-${c.track}-${c.name})`"
              />
              <circle :cx="c.apexX" :cy="c.apexY" r="1.5" fill="#ffffff" />
            </svg>
          </div>

          <div class="card-info">
            <div class="card-top">
              <span class="track-name">{{ c.track }}</span>
              <span class="country-tag">{{ c.country }}</span>
            </div>
            <div class="corner-name">{{ c.name }}</div>
            <div class="corner-specs">
              <span class="speed-spec">{{ c.speedKmh }} km/h</span>
              <span class="sep">·</span>
              <span class="radius-spec">R = {{ c.radiusM }}m</span>
              <span v-if="c.defaultLongitudinalG" class="trail-tag">
                {{ c.defaultLongitudinalG < 0 ? `${c.defaultLongitudinalG}G Trail` : `+${c.defaultLongitudinalG}G Exit` }}
              </span>
            </div>
            <p class="corner-desc">{{ c.description }}</p>
          </div>
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.presets-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.presets-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.presets-title {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--muted);
  font-weight: 600;
}

.hint {
  font-size: 0.72rem;
  color: var(--muted);
}

.presets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 0.75rem;
}

.preset-card {
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 0.75rem 0.85rem;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  flex-direction: column;
}

.preset-card:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 107, 61, 0.5);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}

.card-layout {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.mini-track-wrap {
  width: 100%;
  height: 60px;
  background: #080c14;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mini-track-svg {
  width: 100%;
  height: 100%;
}

.card-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.72rem;
}

.track-name {
  color: var(--accent);
  font-weight: 700;
  letter-spacing: 0.02em;
}

.country-tag {
  color: var(--muted);
  font-size: 0.75rem;
}

.corner-name {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text);
}

.corner-specs {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  margin-top: 0.1rem;
}

.speed-spec {
  color: var(--text);
  font-weight: 600;
}

.sep {
  color: var(--muted);
}

.radius-spec {
  color: #ffcf5c;
  font-weight: 600;
}

.trail-tag {
  margin-left: auto;
  font-size: 0.65rem;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  background: rgba(99, 179, 237, 0.15);
  color: #90cdf4;
  font-weight: 600;
}

.corner-desc {
  font-size: 0.7rem;
  color: var(--muted);
  line-height: 1.35;
  margin: 0.2rem 0 0;
}
</style>
