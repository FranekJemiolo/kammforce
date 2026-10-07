import type { CompoundGrip, SurfaceCondition, TireProfile } from './types';

/**
 * Parses tire dimension strings like "190_55_17", "120/70-17", "180/60ZR17", or "200_55_17".
 * Computes:
 * - outer rolling radius Ro
 * - toroidal cross-section crown radius rt (Cossalter tire model)
 */
export function parseTireSize(rawSize: string): TireProfile {
  const clean = rawSize.trim().replace(/zr/i, '').replace(/r/i, '');
  const match = clean.match(/(\d{2,3})[\/_ -](\d{2})[\/_ -](\d{2})/);

  let widthMm = 180;
  let aspectRatio = 55;
  let rimDiameterIn = 17;

  if (match) {
    widthMm = parseInt(match[1], 10);
    aspectRatio = parseInt(match[2], 10);
    rimDiameterIn = parseInt(match[3], 10);
  }

  // Sidewall height H = W * (AR / 100)
  const sidewallHeightMm = widthMm * (aspectRatio / 100);
  const rimRadiusMm = (rimDiameterIn * 25.4) / 2;
  const outerRadiusMm = rimRadiusMm + sidewallHeightMm;

  // Crown cross-section curvature radius rt (m):
  // According to Cossalter (Motorcycle Dynamics, Table 2.2), motorcycle radial tires
  // have a crown curvature radius rt of approx 50mm (front) to 65mm (190 rear),
  // scaling with tire width (rt ~ 0.345 * W).
  const crownRadiusMm = widthMm * 0.345;

  return {
    raw: rawSize,
    widthMm,
    aspectRatio,
    rimDiameterIn,
    outerRadiusM: outerRadiusMm / 1000,
    crownRadiusM: crownRadiusMm / 1000,
  };
}

export const SURFACE_COMPOUNDS: Record<SurfaceCondition, CompoundGrip> = {
  dry_track_slick: {
    condition: 'dry_track_slick',
    label: 'Dry Track Slick (Warm / Optimum)',
    muPeak: 1.45,
    camberStiffnessCoeff: 0.95,
  },
  dry_track_supersport: {
    condition: 'dry_track_supersport',
    label: 'Dry Track DOT Race / Supercorsa SC',
    muPeak: 1.25,
    camberStiffnessCoeff: 0.88,
  },
  dry_street_sport: {
    condition: 'dry_street_sport',
    label: 'Dry Street Sport (Clean Asphalt)',
    muPeak: 1.05,
    camberStiffnessCoeff: 0.80,
  },
  wet_track: {
    condition: 'wet_track',
    label: 'Wet Track Racing Tire',
    muPeak: 0.82,
    camberStiffnessCoeff: 0.65,
  },
  wet_street: {
    condition: 'wet_street',
    label: 'Wet Street (Damp Roadway)',
    muPeak: 0.58,
    camberStiffnessCoeff: 0.48,
  },
  greasy_cold: {
    condition: 'greasy_cold',
    label: 'Cold Asphalt / Greasy Surface',
    muPeak: 0.42,
    camberStiffnessCoeff: 0.35,
  },
};

export const STANDARD_TIRE_SIZES = [
  // 12-inch Mini-Moto (Honda Grom, Monkey, Z125)
  { label: '120/70-12 (Mini-Moto 12" Front)', value: '120_70_12' },
  { label: '130/70-12 (Mini-Moto 12" Rear)', value: '130_70_12' },

  // 17-inch Lightweight (50cc, 125cc, 300-400cc)
  { label: '90/80-17 (50cc Moped / Light Front)', value: '90_80_17' },
  { label: '100/80-17 (125cc Sport Front)', value: '100_80_17' },
  { label: '110/70 ZR17 (300-400cc Track Front)', value: '110_70_17' },
  { label: '120/70 ZR17 (Front Superbike Standard)', value: '120_70_17' },
  { label: '110/80-17 (50cc Lightweight Rear)', value: '110_80_17' },
  { label: '130/70-17 (50cc/125cc Rear)', value: '130_70_17' },
  { label: '140/70-17 (250-300cc Rear)', value: '140_70_17' },
  { label: '150/60 ZR17 (400cc/RC390 Rear)', value: '150_60_17' },

  // 17-inch Middleweight to Superbike (600cc to 1000cc+)
  { label: '160/60 ZR17 (650cc / Supermoto Rear)', value: '160_60_17' },
  { label: '170/60 ZR17 (Sport-Touring / Boxer Rear)', value: '170_60_17' },
  { label: '180/55 ZR17 (Supersport 600cc / Naked Rear)', value: '180_55_17' },
  { label: '180/60 ZR17 (Track 600cc Rear)', value: '180_60_17' },
  { label: '190/50 ZR17 (Early Litrebike Rear)', value: '190_50_17' },
  { label: '190/55 ZR17 (Superbike Standard Rear)', value: '190_55_17' },
  { label: '200/55 ZR17 (Superbike Modern Rear)', value: '200_55_17' },
  { label: '200/60 ZR17 (MotoAmerica/WSBK Slick)', value: '200_60_17' },

  // Adventure & Cruiser
  { label: '120/70 R19 (Adventure 19" Front)', value: '120_70_19' },
  { label: '90/90-21 (Rally/Enduro 21" Front)', value: '90_90_21' },
  { label: '150/70 R18 (Rally/Adventure 18" Rear)', value: '150_70_18' },
  { label: '130/90-16 (Cruiser 16" Front)', value: '130_90_16' },
  { label: '150/80-16 (Cruiser 16" Rear)', value: '150_80_16' },
];
