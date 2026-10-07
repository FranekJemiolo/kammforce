import type { MotorcycleConfig, RiderConfig } from './types';

export interface CombinedCoG {
  totalMassKg: number;
  /** Effective vertical height of combined CoG above ground in upright motorcycle frame (m) */
  effectiveHeightM: number;
  /** Lateral offset of combined CoG relative to motorcycle centerline (m, positive toward inside of turn) */
  lateralOffsetM: number;
  /** Percentage of total system mass contributed by the rider */
  riderMassPct: number;
}

/**
 * Calculates 2D system Center of Gravity coordinates factoring in rider hang-off.
 * When the rider shifts body mass toward the inside of the turn (hangOffCm > 0),
 * the combined center of mass shifts laterally inward by lateralOffsetM and drops slightly.
 */
export function calculateCombinedCoG(bike: MotorcycleConfig, rider: RiderConfig): CombinedCoG {
  const bikeMass = Math.max(50, bike.massKg);
  const riderMass = Math.max(30, rider.massKg);
  const totalMass = bikeMass + riderMass;

  const bikeCoGHeightM = bike.cogHeightMm / 1000;
  const seatedOffsetM = rider.seatedHeightOffsetM ?? 0.28;
  const nominalRiderHeightM = bikeCoGHeightM + seatedOffsetM;

  // Hang-off offset in meters (0 to 0.35m = 0 to 35cm)
  const hangOffM = Math.max(0, Math.min(0.40, rider.hangOffCm / 100));

  // When hanging off (knee/elbow down), the rider's torso drops toward the tank and inside
  const verticalDropM = hangOffM > 0 ? 0.08 * (hangOffM / 0.35) : 0;
  const actualRiderHeightM = nominalRiderHeightM - verticalDropM;

  // System CoG in upright motorcycle reference frame:
  // Z-axis: upwards from ground along bike centerline
  // Y-axis: horizontal inside toward the turn
  const effectiveHeightM = (bikeMass * bikeCoGHeightM + riderMass * actualRiderHeightM) / totalMass;
  const lateralOffsetM = (riderMass * hangOffM) / totalMass;

  return {
    totalMassKg: totalMass,
    effectiveHeightM,
    lateralOffsetM,
    riderMassPct: (riderMass / totalMass) * 100,
  };
}
