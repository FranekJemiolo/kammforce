import { GRAVITY, MS_TO_KMH, RAD_TO_DEG } from './constants';
import { evaluateGripLimits } from './pacejka';
import { calculateCombinedCoG } from './rider';
import { parseTireSize, SURFACE_COMPOUNDS } from './tires';
import { solveToroidalLeanAngle } from './toroid';
import type { CompoundGrip, CornerScenario, MotorcycleConfig, PhysicsResult, RiderConfig } from './types';

export function solveCornerTelemetry(
  bike: MotorcycleConfig,
  rider: RiderConfig,
  scenario: CornerScenario,
  compoundOrCondition?: CompoundGrip | string
): PhysicsResult {
  const speedMs = Math.max(0.1, scenario.speedMs);
  const radiusM = Math.max(1, scenario.radiusM);
  const longitudinalG = scenario.longitudinalAccelG ?? 0;

  // Resolve compound
  let compound: CompoundGrip;
  if (typeof compoundOrCondition === 'object' && compoundOrCondition !== null) {
    compound = compoundOrCondition;
  } else if (typeof compoundOrCondition === 'string' && compoundOrCondition in SURFACE_COMPOUNDS) {
    compound = SURFACE_COMPOUNDS[compoundOrCondition as keyof typeof SURFACE_COMPOUNDS];
  } else {
    compound = SURFACE_COMPOUNDS.dry_track_supersport;
  }

  // Parse rear tire
  const rearTire = parseTireSize(bike.rearTireSize);

  // Rider & Bike combined CoG
  const combined = calculateCombinedCoG(bike, rider);

  // Kinematics
  const lateralAccelMs2 = (speedMs * speedMs) / radiusM;
  const lateralAccelG = lateralAccelMs2 / GRAVITY;
  const turnRateDegS = (speedMs / radiusM) * RAD_TO_DEG;

  // Solve toroidal lean equation with rider hang-off
  const toroidResult = solveToroidalLeanAngle(
    lateralAccelMs2,
    combined.effectiveHeightM,
    rearTire.crownRadiusM,
    combined.lateralOffsetM
  );

  // Also solve without rider hang-off to determine exact hang-off savings
  const zeroHangOffResult = solveToroidalLeanAngle(
    lateralAccelMs2,
    combined.effectiveHeightM,
    rearTire.crownRadiusM,
    0
  );
  const hangOffSavingsDeg = Math.max(0, zeroHangOffResult.bikeLeanDeg - toroidResult.bikeLeanDeg);

  // System CoG lean angle (vector from contact patch to CoG)
  const systemLeanDeg = Math.atan2(lateralAccelMs2, GRAVITY) * RAD_TO_DEG;

  // Evaluate grip limits using Pacejka '94 with Camber Thrust
  const grip = evaluateGripLimits(
    combined.totalMassKg,
    lateralAccelMs2,
    toroidResult.bikeLeanDeg,
    compound,
    longitudinalG
  );

  // Mechanical limit check
  const isScrapingHardParts = toroidResult.bikeLeanDeg >= bike.maxMechLeanDeg;
  const isTractionLoss = grip.isLowsideTractionLoss;
  const isCombinedGripExceeded = grip.isKammLimitExceeded;

  let safetyStatus: PhysicsResult['safetyStatus'] = 'optimal';
  let statusMessage = 'Operating safely within envelope.';

  if (isTractionLoss) {
    safetyStatus = 'lowside';
    statusMessage = `Low-side crash! Lateral grip exceeded (${grip.gripUtilizationPct.toFixed(1)}% of traction limit).`;
  } else if (isCombinedGripExceeded) {
    safetyStatus = longitudinalG > 0 ? 'highside' : 'lowside';
    statusMessage = `Traction break on Kamm circle (${grip.kammUtilizationPct.toFixed(1)}% limit) from combined cornering & ${longitudinalG > 0 ? 'throttle' : 'trail-braking'}.`;
  } else if (isScrapingHardParts) {
    safetyStatus = 'scraping';
    statusMessage = `Hard part contact! Lean angle (${toroidResult.bikeLeanDeg.toFixed(1)}°) exceeds mechanical limit (${bike.maxMechLeanDeg}°).`;
  } else if (grip.gripUtilizationPct > 85 || toroidResult.bikeLeanDeg > bike.maxMechLeanDeg - 3) {
    safetyStatus = 'warning';
    statusMessage = 'Warning: Approaching traction or ground clearance limits.';
  }

  return {
    speedMs,
    speedKmh: speedMs * MS_TO_KMH,
    radiusM,
    turnRateDegS,
    lateralAccelMs2,
    lateralAccelG,

    pointMassLeanDeg: toroidResult.pointMassLeanDeg,
    toroidalBikeLeanDeg: toroidResult.bikeLeanDeg,
    systemLeanDeg,
    leanAngleDeltaDeg: toroidResult.leanDeltaDeg,
    hangOffSavingsDeg,

    contactPatchOffsetMm: toroidResult.contactPatchOffsetM * 1000,
    crownRadiusMm: rearTire.crownRadiusM * 1000,

    normalForceN: grip.normalForceN,
    requiredLateralForceN: grip.requiredLateralForceN,
    camberThrustN: grip.camberThrustN,
    slipAngleRequiredForceN: grip.slipForceRequiredN,
    peakLateralForceN: grip.peakLateralForceN,
    gripUtilizationPct: grip.gripUtilizationPct,
    availableLongitudinalG: grip.availableLongitudinalG,

    isScrapingHardParts,
    isTractionLoss,
    isCombinedGripExceeded,
    safetyStatus,
    statusMessage,
  };
}
