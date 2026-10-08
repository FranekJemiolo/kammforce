/**
 * Phase 5: Crash Kinematics & Gear Simulation
 *
 * Implements kinetic energy dissipation and slide distance/duration
 * using the Work-Energy Theorem for low-side motorcycle slides.
 *
 * Work-Energy Theorem:
 *   W = F_friction * d = 0.5 * m * v^2
 *   mu_k * m * g * d = 0.5 * m * v^2
 *   => d = v^2 / (2 * mu_k * g)
 *   => t = v / (mu_k * g)
 */

export interface GearMaterial {
  id: string;
  name: string;
  mu_k: number;
  description: string;
  meltingRisk: boolean;
  abrasionResistanceLevel: 'Extreme' | 'High' | 'Moderate' | 'Poor';
  burnThroughTimeSecAt100Kmh: number;
  recommendedUse: string;
}

/**
 * Kinetic friction coefficients (mu_k) of gear contact materials on asphalt.
 */
export const GEAR_MATERIALS: Record<string, GearMaterial> = {
  kangaroo_leather: {
    id: 'kangaroo_leather',
    name: 'Kangaroo Leather (MotoGP Grade 0.9-1.0mm)',
    mu_k: 0.5,
    description: 'Dense fibril structure provides extreme tensile strength, superior abrasion resistance, and controlled slide deceleration.',
    meltingRisk: false,
    abrasionResistanceLevel: 'Extreme',
    burnThroughTimeSecAt100Kmh: 12.0,
    recommendedUse: 'FIM MotoGP, WorldSBK & Championship Track Days',
  },
  cowhide_leather: {
    id: 'cowhide_leather',
    name: 'Cowhide Leather (Track Grade 1.2-1.4mm)',
    mu_k: 0.45,
    description: 'Gold standard track armor. High structural integrity prevents tearing while smoothly absorbing frictional heat.',
    meltingRisk: false,
    abrasionResistanceLevel: 'High',
    burnThroughTimeSecAt100Kmh: 7.5,
    recommendedUse: 'Club Racing, Track Days & Fast Road Riding',
  },
  cordura_textile: {
    id: 'cordura_textile',
    name: 'Cordura Textile (500D / 1000D Polyamide)',
    mu_k: 0.35,
    description: 'Slides farther due to low surface friction, but high frictional heat risks melting synthetic fibers into the skin.',
    meltingRisk: true,
    abrasionResistanceLevel: 'Moderate',
    burnThroughTimeSecAt100Kmh: 2.5,
    recommendedUse: 'Street Touring & Commuting (Sub-100 km/h)',
  },
  kevlar_denim: {
    id: 'kevlar_denim',
    name: 'Kevlar-Lined Denim (Aramid Weave)',
    mu_k: 0.4,
    description: 'Aramid reinforcement shields skin from initial burn-through, providing good tear resistance for urban road riding.',
    meltingRisk: false,
    abrasionResistanceLevel: 'Moderate',
    burnThroughTimeSecAt100Kmh: 3.8,
    recommendedUse: 'Urban Street Riding & Commuting',
  },
  street_denim: {
    id: 'street_denim',
    name: 'Regular Street Denim (100% Cotton Jeans)',
    mu_k: 0.7,
    description: 'Dangerously high friction coefficient grabs rough asphalt, inducing violent high-G tumbling and shredding in under 0.3s.',
    meltingRisk: false,
    abrasionResistanceLevel: 'Poor',
    burnThroughTimeSecAt100Kmh: 0.2,
    recommendedUse: 'NOT RECOMMENDED FOR MOTORCYCLE RIDING',
  },
  plastic_slider: {
    id: 'plastic_slider',
    name: 'TPU / Delrin Plastic Armor Sliders',
    mu_k: 0.2,
    description: 'Low-friction sacrificial pucks at knees, shoulders, and palms prevent gear grabbing the track and promote a flat, stable slide.',
    meltingRisk: false,
    abrasionResistanceLevel: 'High',
    burnThroughTimeSecAt100Kmh: 15.0,
    recommendedUse: 'Knee Pucks, Elbow Sliders & Palm Impact Armor',
  },
};

export interface SlidePhysicsResult {
  initialVelocityMs: number;
  initialVelocityKmh: number;
  mu_k: number;
  slideDistanceMeters: number;     // d = v^2 / (2 * mu_k * g)
  slideDurationSeconds: number;    // t = v / (mu_k * g)
  decelerationG: number;           // a = mu_k (in Gs)
  decelerationMs2: number;         // a = mu_k * g (in m/s^2)
  tumbleRisk: boolean;             // true if mu_k > 0.6
  kineticEnergyJoules?: number;    // 0.5 * m * v^2
  averageThermalPowerWatts?: number; // KE / t
}

/**
 * Calculates slide distance, duration, deceleration and tumble risk
 * using the Work-Energy Theorem for an asphalt low-side slide.
 *
 * @param initialVelocityMs Crash entry velocity in m/s
 * @param mu_k Kinetic friction coefficient between gear and track surface
 * @param riderMassKg Optional rider mass in kg for energy/thermal calculations
 * @param g Gravitational acceleration (defaults to 9.81 m/s^2 per specification)
 */
export function calculateSlidePhysics(
  initialVelocityMs: number,
  mu_k: number,
  riderMassKg?: number,
  g = 9.81,
): SlidePhysicsResult {
  const v = Math.max(0, initialVelocityMs);
  const mu = Math.max(0.01, mu_k);

  // Work-Energy Theorem: 0.5 * m * v^2 = mu_k * m * g * d => d = v^2 / (2 * mu_k * g)
  const slideDistanceMeters = (v * v) / (2 * mu * g);

  // Kinematic deceleration time: v = a * t => t = v / (mu_k * g)
  const slideDurationSeconds = v > 0 ? v / (mu * g) : 0;

  const decelerationMs2 = mu * g;
  const decelerationG = mu; // Deceleration in Gs equals mu_k

  // A friction coefficient > 0.6 causes material to snag against asphalt irregularities,
  // converting kinetic energy into rotational momentum and violent tumbling.
  const tumbleRisk = mu > 0.6;

  let kineticEnergyJoules: number | undefined;
  let averageThermalPowerWatts: number | undefined;

  if (riderMassKg && riderMassKg > 0) {
    kineticEnergyJoules = 0.5 * riderMassKg * v * v;
    if (slideDurationSeconds > 0) {
      averageThermalPowerWatts = kineticEnergyJoules / slideDurationSeconds;
    }
  }

  return {
    initialVelocityMs: v,
    initialVelocityKmh: v * 3.6,
    mu_k: mu,
    slideDistanceMeters,
    slideDurationSeconds,
    decelerationG,
    decelerationMs2,
    tumbleRisk,
    kineticEnergyJoules,
    averageThermalPowerWatts,
  };
}

export interface HighSidePhysicsResult {
  initialVelocityMs: number;
  initialVelocityKmh: number;
  leanAngleDeg: number;
  slipAngleDeg: number;
  ejectionVelocityMs: number;
  verticalLaunchVelocityMs: number;
  horizontalFlightVelocityMs: number;
  apexHeightMeters: number;
  airborneDurationSeconds: number;
  flightDistanceMeters: number;
  groundImpactVelocityMs: number;
  groundImpactVelocityKmh: number;
  groundImpactSeverityG: number;
  postImpactSlideDistanceMeters: number;
  totalCrashDistanceMeters: number;
  tumbleRisk: boolean;
  riderKineticEnergyJoules: number;
}

/**
 * Calculates High-Side crash catapult dynamics.
 *
 * When rear tire traction breaks into an over-rotated yaw slip angle and suddenly
 * regains adhesion (throttle chop or surface bite), the motorcycle pivots violently around
 * its tire contact patch. Roll momentum and compressed suspension recoil launch the rider
 * up and over the bike in a high-arcing parabolic ejection.
 */
export function calculateHighSidePhysics(
  initialVelocityMs: number,
  leanAngleDeg: number,
  slipAngleDeg = 20,
  riderMassKg = 78,
  bikeMassKg = 200,
  mu_k = 0.45,
  g = 9.81,
): HighSidePhysicsResult {
  const v = Math.max(5, initialVelocityMs);
  const leanRad = (Math.max(25, Math.min(68, leanAngleDeg)) * Math.PI) / 180;
  const slipRad = (Math.max(5, Math.min(45, slipAngleDeg)) * Math.PI) / 180;

  const hSeatM = 0.82; // seat height above tarmac
  const hCogM = 0.61;  // combined CoG height

  // Grip snap reaction impulse torque: T = F_lateral * h_cog
  const peakMuAsphalt = 1.25;
  const totalMass = riderMassKg + bikeMassKg;
  const lateralImpulseForceN = peakMuAsphalt * totalMass * g;
  const rollInertiaKgM2 = (1 / 3) * bikeMassKg * (hCogM ** 2) + riderMassKg * (hSeatM ** 2);
  const rollAccelRadS2 = (lateralImpulseForceN * hCogM) / rollInertiaKgM2;

  // Angular roll snap velocity at ejection
  const rollAngularVel = Math.min(10.0, Math.sqrt(2 * rollAccelRadS2 * leanRad * 0.8));

  // Suspension recoil catapult boost: stored spring potential in rear shock
  const shockPreloadBoostMs = Math.min(3.5, 1.2 + (slipAngleDeg / 20) * 1.5);

  // Ejection velocity vector
  const ejectionVelocityMs = rollAngularVel * hSeatM + shockPreloadBoostMs;

  // Catapult launch angle upward and outward over high side (typically 55 deg to 72 deg)
  const launchAngleRad = (Math.min(75, 52 + (slipAngleDeg * 0.5)) * Math.PI) / 180;

  const verticalLaunchVelocityMs = ejectionVelocityMs * Math.sin(launchAngleRad);
  const forwardFlightVelocityMs = v * Math.cos(slipRad * 0.4) + ejectionVelocityMs * Math.cos(launchAngleRad) * 0.35;

  // Apex altitude above tarmac: h_apex = h_seat + (v_y^2 / 2g)
  const apexHeightMeters = hSeatM + (verticalLaunchVelocityMs ** 2) / (2 * g);

  // Airborne flight time until body hits tarmac: t = (v_y + sqrt(v_y^2 + 2*g*h_seat)) / g
  const airborneDurationSeconds = (verticalLaunchVelocityMs + Math.sqrt(verticalLaunchVelocityMs ** 2 + 2 * g * hSeatM)) / g;

  // Flight distance traveled through the air before initial ground impact
  const flightDistanceMeters = forwardFlightVelocityMs * airborneDurationSeconds;

  // Impact velocity when rider hits asphalt
  const groundImpactVelocityMs = Math.sqrt(forwardFlightVelocityMs ** 2 + 2 * g * apexHeightMeters);
  const groundImpactVelocityKmh = groundImpactVelocityMs * 3.6;

  // Estimated peak impact deceleration G (over body compression distance ~0.08m)
  const impactDeflectionM = 0.08;
  const verticalImpactVelocityMs = Math.sqrt(2 * g * apexHeightMeters);
  const groundImpactSeverityG = Math.round((verticalImpactVelocityMs ** 2) / (2 * impactDeflectionM * g));

  // Post-impact slide on tarmac using Work-Energy Theorem for remaining horizontal velocity
  const postImpactSlideDistanceMeters = (forwardFlightVelocityMs ** 2) / (2 * Math.max(0.05, mu_k) * g);
  const totalCrashDistanceMeters = flightDistanceMeters + postImpactSlideDistanceMeters;

  const tumbleRisk = mu_k > 0.6 || apexHeightMeters > 2.0;
  const riderKineticEnergyJoules = 0.5 * riderMassKg * (v ** 2);

  return {
    initialVelocityMs: v,
    initialVelocityKmh: v * 3.6,
    leanAngleDeg,
    slipAngleDeg,
    ejectionVelocityMs,
    verticalLaunchVelocityMs,
    horizontalFlightVelocityMs: forwardFlightVelocityMs,
    apexHeightMeters,
    airborneDurationSeconds,
    flightDistanceMeters,
    groundImpactVelocityMs,
    groundImpactVelocityKmh,
    groundImpactSeverityG,
    postImpactSlideDistanceMeters,
    totalCrashDistanceMeters,
    tumbleRisk,
    riderKineticEnergyJoules,
  };
}

export interface LowSidePhysicsResult {
  initialVelocityMs: number;
  initialVelocityKmh: number;
  leanAngleDeg: number;
  tireLost: 'front' | 'rear';
  dropDurationSeconds: number;
  riderSlideDistanceMeters: number;
  riderSlideDurationSeconds: number;
  bikeSlideDistanceMeters: number;
  bikeSlideDurationSeconds: number;
  separationDistanceMeters: number;
  decelerationG: number;
  tumbleRisk: boolean;
  kineticEnergyJoules: number;
  averageThermalPowerWatts: number;
}

/**
 * Calculates Low-Side crash dynamics where the front or rear tire washes out,
 * causing the motorcycle to drop inward onto its chassis/fairing.
 */
export function calculateLowSidePhysics(
  initialVelocityMs: number,
  leanAngleDeg: number,
  tireLost: 'front' | 'rear' = 'front',
  riderMassKg = 78,
  bikeMassKg = 200,
  mu_rider = 0.45,
  g = 9.81,
): LowSidePhysicsResult {
  const v = Math.max(0, initialVelocityMs);
  const leanRad = (Math.max(20, Math.min(68, leanAngleDeg)) * Math.PI) / 180;
  const hCogM = 0.61;

  // Drop time from loss of support to ground contact: t_drop = sqrt(2 * h * (1 - sin(theta)) / g)
  const dropDurationSeconds = Math.max(0.12, Math.sqrt((2 * hCogM * (1 - Math.sin(leanRad))) / g));

  // Rider slide calculation via Work-Energy Theorem
  const riderPhys = calculateSlidePhysics(v, mu_rider, riderMassKg, g);

  // Bike fairing & frame sliders friction coefficient on tarmac is typically 0.26 - 0.32
  const mu_bike = 0.28;
  const bikePhys = calculateSlidePhysics(v, mu_bike, bikeMassKg, g);

  // Separation distance between bike and rider (bike slides farther due to slippery fairings)
  const separationDistanceMeters = Math.max(0, bikePhys.slideDistanceMeters - riderPhys.slideDistanceMeters);

  return {
    initialVelocityMs: v,
    initialVelocityKmh: v * 3.6,
    leanAngleDeg,
    tireLost,
    dropDurationSeconds,
    riderSlideDistanceMeters: riderPhys.slideDistanceMeters,
    riderSlideDurationSeconds: riderPhys.slideDurationSeconds,
    bikeSlideDistanceMeters: bikePhys.slideDistanceMeters,
    bikeSlideDurationSeconds: bikePhys.slideDurationSeconds,
    separationDistanceMeters,
    decelerationG: riderPhys.decelerationG,
    tumbleRisk: riderPhys.tumbleRisk,
    kineticEnergyJoules: riderPhys.kineticEnergyJoules ?? 0,
    averageThermalPowerWatts: riderPhys.averageThermalPowerWatts ?? 0,
  };
}
