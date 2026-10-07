<script setup lang="ts">
export interface TrackCorner {
  track: string;
  name: string;
  country: string;
  speedKmh: number;
  radiusM: number;
  description: string;
  defaultLongitudinalG?: number;
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
  },
  {
    track: 'Mugello',
    name: 'Arrabbiata 1 (Turn 8)',
    country: 'Italy 🇮🇹',
    speedKmh: 165,
    radiusM: 85,
    description: 'High-speed uphill blind right-hand sweeper under full compression.',
    defaultLongitudinalG: 0.1,
  },
  {
    track: 'Laguna Seca',
    name: 'Andretti Hairpin (Turn 2)',
    country: 'USA 🇺🇸',
    speedKmh: 68,
    radiusM: 26,
    description: 'Double-apex heavy trail-braking hairpin after the front straight.',
    defaultLongitudinalG: -0.35,
  },
  {
    track: 'Laguna Seca',
    name: 'The Corkscrew (Turn 8)',
    country: 'USA 🇺🇸',
    speedKmh: 78,
    radiusM: 32,
    description: 'Blind crest left-to-right drop with dramatic 5.5-story elevation change.',
    defaultLongitudinalG: -0.2,
  },
  {
    track: 'Phillip Island',
    name: 'Stoner Corner (Turn 3)',
    country: 'Australia 🇦🇺',
    speedKmh: 205,
    radiusM: 115,
    description: 'Terrifying 5th-gear left-hand sweep right next to the Southern Ocean.',
    defaultLongitudinalG: 0.25,
  },
  {
    track: 'Circuit of the Americas',
    name: 'Turn 1 Hairpin',
    country: 'USA 🇺🇸',
    speedKmh: 62,
    radiusM: 24,
    description: 'Steep 133-foot uphill climb into a blind 130-degree apex.',
    defaultLongitudinalG: -0.4,
  },
  {
    track: 'Circuit of the Americas',
    name: 'Carousel (Turn 17-18)',
    country: 'USA 🇺🇸',
    speedKmh: 138,
    radiusM: 68,
    description: 'Endless multi-radius right-hand carousel testing tire endurance.',
    defaultLongitudinalG: 0.05,
  },
  {
    track: 'Circuit de Barcelona-Catalunya',
    name: 'Curvone Renault (Turn 3)',
    country: 'Spain 🇪🇸',
    speedKmh: 172,
    radiusM: 108,
    description: 'Long high-load right turn stressing the right tire shoulder.',
    defaultLongitudinalG: 0.15,
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
      <span class="hint">Click a corner to load real telemetry geometry</span>
    </div>
    <div class="presets-grid">
      <button
        v-for="c in PRESETS"
        :key="`${c.track}-${c.name}`"
        type="button"
        class="preset-card"
        @click="emit('select', c)"
      >
        <div class="card-top">
          <span class="track-name">{{ c.track }}</span>
          <span class="country-tag">{{ c.country }}</span>
        </div>
        <div class="corner-name">{{ c.name }}</div>
        <div class="corner-specs">
          <span>{{ c.speedKmh }} km/h</span>
          <span class="sep">·</span>
          <span>R = {{ c.radiusM }}m</span>
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
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.65rem;
}

.preset-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.75rem 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
}

.preset-card:hover {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 107, 61, 0.4);
  transform: translateY(-2px);
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.72rem;
  color: var(--muted);
}

.corner-name {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.corner-specs {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  color: var(--accent-2);
  font-weight: 500;
}

.sep { color: var(--border); }
</style>
