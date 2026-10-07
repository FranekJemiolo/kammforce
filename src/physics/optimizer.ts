import { DEG_TO_RAD, GRAVITY, MS_TO_KMH } from './constants';
import { calculateCombinedCoG } from './rider';
import { parseTireSize, SURFACE_COMPOUNDS } from './tires';
import type { CompoundGrip, MotorcycleConfig, RiderConfig, SurfaceCondition } from './types';

export interface TargetLeanSolveResult {
  targetLeanDeg: number;
  requiredLateralAccelMs2: number;
  requiredLateralAccelG: number;
  requiredSpeedMs: number;
  requiredSpeedKmh: number;
  requiredRadiusM: number;
  isGripFeasible: boolean;
  gripDemandPct: number;
  limitingFactor: 'mechanical' | 'traction';
}

/**
 * Solves the exact closed-form lateral acceleration ay required to produce target lean angle theta.
 * From Cossalter's Toroidal Roll Equation:
 *   g * [ (h - rt)*sin(theta) + y_off*cos(theta) ] = ay * [ rt + (h - rt)*cos(theta) - y_off*sin(theta) ]
 *
 *   => ay = g * [ (h - rt)*sin(theta) + y_off*cos(theta) ] / [ rt + (h - rt)*cos(theta) - y_off*sin(theta) ]
 */
export function solveLateralAccelForLeanAngle(
  bike: MotorcycleConfig,
  rider: RiderConfig,
  targetLeanDeg: number
): number {
  const thetaRad = targetLeanDeg * DEG_TO_RAD;
  const rearTire = parseTireSize(bike.rearTireSize);
  const combined = calculateCombinedCoG(bike, rider);

  const deltaH = Math.max(0.05, combined.effectiveHeightM - rearTire.crownRadiusM);
  const rt = rearTire.crownRadiusM;
  const yOff = combined.lateralOffsetM;

  const sinT = Math.sin(thetaRad);
  const cosT = Math.cos(thetaRad);

  const num = GRAVITY * (deltaH * sinT + yOff * cosT);
  const den = rt + deltaH * cosT - yOff * sinT;

  if (den <= 0.001) {
    // Extreme lean beyond physical upright equilibrium
    return GRAVITY * 4.0;
  }

  return num / den;
}

/**
 * Calculates the exact speed required to reach targetLeanDeg for a given corner radius R.
 */
export function solveSpeedForTargetLean(
  bike: MotorcycleConfig,
  rider: RiderConfig,
  targetLeanDeg: number,
  radiusM: number,
  compoundOrCondition?: CompoundGrip | SurfaceCondition
): TargetLeanSolveResult {
  const R = Math.max(1, radiusM);
  const ay = solveLateralAccelForLeanAngle(bike, rider, targetLeanDeg);
  const speedMs = Math.sqrt(Math.max(0, ay * R));
  const speedKmh = speedMs * MS_TO_KMH;

  // Check surface grip feasibility
  let muPeak = 1.25;
  if (typeof compoundOrCondition === 'object' && compoundOrCondition?.muPeak) {
    muPeak = compoundOrCondition.muPeak;
  } else if (typeof compoundOrCondition === 'string' && compoundOrCondition in SURFACE_COMPOUNDS) {
    muPeak = SURFACE_COMPOUNDS[compoundOrCondition as SurfaceCondition].muPeak;
  }

  const maxAyGrip = muPeak * GRAVITY;
  const gripDemandPct = (ay / maxAyGrip) * 100;
  const isGripFeasible = gripDemandPct <= 100;
  const limitingFactor = isGripFeasible ? 'mechanical' : 'traction';

  return {
    targetLeanDeg,
    requiredLateralAccelMs2: ay,
    requiredLateralAccelG: ay / GRAVITY,
    requiredSpeedMs: speedMs,
    requiredSpeedKmh: speedKmh,
    requiredRadiusM: R,
    isGripFeasible,
    gripDemandPct,
    limitingFactor,
  };
}

/**
 * Calculates the exact corner radius required to reach targetLeanDeg for a given speed.
 */
export function solveRadiusForTargetLean(
  bike: MotorcycleConfig,
  rider: RiderConfig,
  targetLeanDeg: number,
  speedMs: number
): number {
  const ay = solveLateralAccelForLeanAngle(bike, rider, targetLeanDeg);
  if (ay <= 0.01) return 9999;
  return (speedMs * speedMs) / ay;
}

/**
 * Calculates required rider hang-off (cm) to reduce bike lean to safeMarginDeg below mechanical limit.
 */
export function solveHangOffForLeanSafety(
  bike: MotorcycleConfig,
  rider: RiderConfig,
  lateralAccelMs2: number,
  targetBikeLeanDeg: number
): number {
  const thetaRad = targetBikeLeanDeg * DEG_TO_RAD;
  const rearTire = parseTireSize(bike.rearTireSize);
  const bikeMass = bike.massKg;
  const riderMass = rider.massKg;
  const totalMass = bikeMass + riderMass;

  const hBike = bike.cogHeightMm / 1000;
  const hRider = hBike + (rider.seatedHeightOffsetM ?? 0.28);
  const hEff = (bikeMass * hBike + riderMass * hRider) / totalMass;
  const deltaH = hEff - rearTire.crownRadiusM;
  const rt = rearTire.crownRadiusM;

  const sinT = Math.sin(thetaRad);
  const cosT = Math.cos(thetaRad);
  const g = GRAVITY;
  const ay = lateralAccelMs2;

  // Torque balance:
  // g * [ deltaH*sinT + yOff*cosT ] = ay * [ rt + deltaH*cosT - yOff*sinT ]
  // yOff * (g*cosT + ay*sinT) = ay*(rt + deltaH*cosT) - g*deltaH*sinT
  const num = ay * (rt + deltaH * cosT) - g * deltaH * sinT;
  const den = g * cosT + ay * sinT;

  if (den <= 0.01) return 0;
  const yOffM = Math.max(0, num / den);

  // yOff = (riderMass * hangOffM) / totalMass => hangOffM = yOff * totalMass / riderMass
  const hangOffM = (yOffM * totalMass) / riderMass;
  return Math.min(35, Math.max(0, Math.round(hangOffM * 100)));
}
