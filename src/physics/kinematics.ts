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
