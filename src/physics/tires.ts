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
  { label: '120/70 ZR17 (Front Standard)', value: '120_70_17' },
  { label: '160/60 ZR17 (Rear Lightweight)', value: '160_60_17' },
  { label: '180/55 ZR17 (Rear Supersport)', value: '180_55_17' },
  { label: '180/60 ZR17 (Rear Track 600cc)', value: '180_60_17' },
  { label: '190/50 ZR17 (Rear Early Litrebike)', value: '190_50_17' },
  { label: '190/55 ZR17 (Rear Superbike Standard)', value: '190_55_17' },
  { label: '200/55 ZR17 (Rear Superbike Modern)', value: '200_55_17' },
  { label: '200/60 ZR17 (Rear MotoAmerica/WSBK)', value: '200_60_17' },
];
