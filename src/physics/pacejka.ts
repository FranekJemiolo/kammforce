import { DEG_TO_RAD, GRAVITY, RAD_TO_DEG } from './constants';
import type { CompoundGrip } from './types';

export interface PacejkaCoefficients {
  B: number; // Stiffness factor
  C: number; // Shape factor
  D: number; // Peak factor (mu * Fz)
  E: number; // Curvature factor
}

export interface GripEvaluation {
  normalForceN: number;          // Fz
  requiredLateralForceN: number; // M * ay
  peakLateralForceN: number;     // F_y,max
  camberThrustN: number;         // F_y,gamma
  slipForceRequiredN: number;    // F_y,alpha
  estimatedSlipAngleDeg: number; // Estimated tire slip angle alpha
  gripUtilizationPct: number;    // (F_y,req / F_y,max) * 100
  longitudinalForceN: number;    // F_x
  peakLongitudinalForceN: number;// F_x,max
  kammUtilizationPct: number;    // Combined sqrt((Fx/Fx_max)^2 + (Fy/Fy_max)^2) * 100
  availableLongitudinalG: number;// Remaining G-force for braking or throttle
  isLowsideTractionLoss: boolean;
  isKammLimitExceeded: boolean;
}

/**
 * Standard Pacejka Magic Formula function y(x) = D * sin(C * atan(B*x - E*(B*x - atan(B*x))))
 */
export function magicFormula(x: number, B: number, C: number, D: number, E: number): number {
  const Bx = B * x;
  return D * Math.sin(C * Math.atan(Bx - E * (Bx - Math.atan(Bx))));
}

/**
 * Computes motorcycle tire grip limits, camber thrust, slip angle, and Kamm traction ellipse.
 *
 * @param totalMassKg Total system mass (bike + rider)
 * @param lateralAccelMs2 Lateral acceleration (m/s^2)
 * @param bikeLeanDeg Motorcycle frame lean angle (degrees)
 * @param compound Tire compound and track grip properties
 * @param longitudinalAccelG Longitudinal braking or throttle acceleration (in Gs, e.g. -0.4 for trail braking)
 */
export function evaluateGripLimits(
  totalMassKg: number,
  lateralAccelMs2: number,
  bikeLeanDeg: number,
  compound: CompoundGrip,
  longitudinalAccelG = 0
): GripEvaluation {
  const g = GRAVITY;
  const m = totalMassKg;
  const ay = Math.max(0, lateralAccelMs2);
  const leanRad = bikeLeanDeg * DEG_TO_RAD;

  // Normal load Fz through the tires in steady cornering (vector sum of gravity and centrifugal force)
  const normalForceN = m * Math.sqrt(g * g + ay * ay);

  // Required lateral turning force
  const requiredLateralForceN = m * ay;

  // Peak available lateral grip (D = mu_peak * Fz)
  const peakLateralForceN = compound.muPeak * normalForceN;

  // Camber Thrust (Fy,gamma):
  // Leaned motorcycle tires act as rolling cones, generating camber thrust proportional to
  // camber stiffness and sin(camber angle).
  const camberThrustN = normalForceN * compound.camberStiffnessCoeff * Math.sin(leanRad);

  // Remaining lateral force required from tire carcass slip angle
  const slipForceRequiredN = Math.max(0, requiredLateralForceN - camberThrustN);

  // Estimate slip angle alpha via inverse Magic Formula approximation:
  // Pacejka '94 typical parameters for sport/race motorcycle tires:
  // C ~ 1.35, E ~ -0.1, B*C*D ~ 25 * Fz (cornering stiffness in rad^-1)
  const C = 1.35;
  const E = -0.1;
  const D = Math.max(1, peakLateralForceN - camberThrustN * 0.4);
  const B = 18.0; // cornering stiffness factor

  // Approximate inverse: alpha approx (slipForce / (B * C * D)) for small slip
  const ratio = Math.min(0.999, slipForceRequiredN / D);
  const estimatedSlipAngleRad = Math.asin(ratio) / (B * C);
  const estimatedSlipAngleDeg = Math.max(0, estimatedSlipAngleRad * RAD_TO_DEG);

  // Grip utilization (lateral percentage of peak limit)
  const gripUtilizationPct = peakLateralForceN > 0 ? (requiredLateralForceN / peakLateralForceN) * 100 : 0;

  // Longitudinal force (throttle or braking)
  const longitudinalForceN = Math.abs(longitudinalAccelG) * m * g;
  const peakLongitudinalForceN = compound.muPeak * normalForceN;

  // Combined Kamm Circle (Traction Ellipse):
  // (Fx / Fx_max)^2 + (Fy / Fy_max)^2 <= 1.0
  const latRatio = peakLateralForceN > 0 ? requiredLateralForceN / peakLateralForceN : 0;
  const longRatio = peakLongitudinalForceN > 0 ? longitudinalForceN / peakLongitudinalForceN : 0;
  const kammCombined = Math.sqrt(latRatio * latRatio + longRatio * longRatio);
  const kammUtilizationPct = kammCombined * 100;

  // Remaining available longitudinal acceleration reserve while sustaining current lateral force
  const availableLongitudinalReserveRatio = Math.sqrt(Math.max(0, 1 - latRatio * latRatio));
  const availableLongitudinalForceN = peakLongitudinalForceN * availableLongitudinalReserveRatio;
  const availableLongitudinalG = (availableLongitudinalForceN / (m * g));

  const isLowsideTractionLoss = gripUtilizationPct >= 100;
  const isKammLimitExceeded = kammUtilizationPct >= 100;

  return {
    normalForceN,
    requiredLateralForceN,
    peakLateralForceN,
    camberThrustN,
    slipForceRequiredN,
    estimatedSlipAngleDeg,
    gripUtilizationPct,
    longitudinalForceN,
    peakLongitudinalForceN,
    kammUtilizationPct,
    availableLongitudinalG,
    isLowsideTractionLoss,
    isKammLimitExceeded,
  };
}
