import { GRAVITY, RAD_TO_DEG } from './constants';

export interface ToroidSolveResult {
  /** True motorcycle frame lean angle theta in radians */
  bikeLeanRad: number;
  /** True motorcycle frame lean angle theta in degrees */
  bikeLeanDeg: number;
  /** Naive point mass lean angle in degrees: atan(v^2 / gR) */
  pointMassLeanDeg: number;
  /** Difference in degrees: (bikeLeanDeg - pointMassLeanDeg) */
  leanDeltaDeg: number;
  /** Number of Newton-Raphson iterations to reach convergence */
  iterations: number;
  /** Lateral contact patch shift in meters: rt * sin(theta) */
  contactPatchOffsetM: number;
  /** True if converged to tolerance */
  converged: boolean;
}

/**
 * Solves the transcendental Cossalter Toroidal Tire Roll Equation for lean angle theta:
 *
 *   g * [ (h - rt)*sin(theta) + y_off*cos(theta) ]
 *   = ay * [ rt + (h - rt)*cos(theta) - y_off*sin(theta) ]
 *
 * Uses Newton-Raphson root-finding.
 *
 * @param lateralAccelMs2 Lateral acceleration ay = v^2 / R (m/s^2)
 * @param cogHeightM Height of combined CoG above ground in upright frame (m)
 * @param crownRadiusM Crown cross-section curvature radius rt of tire (m)
 * @param lateralOffsetM Lateral offset of CoG toward inside of turn due to rider hang-off (m)
 * @param maxIterations Maximum iterations (default 30)
 * @param tolerance Convergence tolerance in radians (default 1e-7)
 */
export function solveToroidalLeanAngle(
  lateralAccelMs2: number,
  cogHeightM: number,
  crownRadiusM: number,
  lateralOffsetM = 0,
  maxIterations = 30,
  tolerance = 1e-7
): ToroidSolveResult {
  const ay = Math.max(0, lateralAccelMs2);
  const g = GRAVITY;

  // Point mass naive angle
  const pointMassRad = Math.atan2(ay, g);
  const pointMassLeanDeg = pointMassRad * RAD_TO_DEG;

  if (ay === 0) {
    return {
      bikeLeanRad: 0,
      bikeLeanDeg: 0,
      pointMassLeanDeg: 0,
      leanDeltaDeg: 0,
      iterations: 0,
      contactPatchOffsetM: 0,
      converged: true,
    };
  }

  const deltaH = Math.max(0.1, cogHeightM - crownRadiusM);
  const rt = crownRadiusM;
  const yOff = Math.max(0, lateralOffsetM);

  // Initial guess: point mass angle adjusted slightly for tire width
  let theta = Math.min(Math.PI / 2 - 0.05, Math.max(0.01, pointMassRad * 1.05));
  let iter = 0;
  let converged = false;

  for (; iter < maxIterations; iter++) {
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);

    // Gravity arm (horizontal distance from contact patch to CoG)
    const armG = deltaH * sinT + yOff * cosT;
    // Centrifugal arm (vertical distance from contact patch to CoG)
    const armC = rt + deltaH * cosT - yOff * sinT;

    // f(theta) = g * armG - ay * armC = 0
    const f = g * armG - ay * armC;

    if (Math.abs(f) < tolerance) {
      converged = true;
      break;
    }

    // Derivative f'(theta):
    // d(armG)/d(theta) = deltaH * cosT - yOff * sinT
    // d(armC)/d(theta) = -deltaH * sinT - yOff * cosT
    // f'(theta) = g * (deltaH * cosT - yOff * sinT) + ay * (deltaH * sinT + yOff * cosT)
    const df = g * (deltaH * cosT - yOff * sinT) + ay * (deltaH * sinT + yOff * cosT);

    if (Math.abs(df) < 1e-9) {
      // Degenerate derivative, apply small bisection step
      theta += f > 0 ? -0.01 : 0.01;
      continue;
    }

    const step = f / df;
    let nextTheta = theta - step;

    // Keep theta within physically valid roll angle bounds [0, 80 deg]
    if (nextTheta < 0) nextTheta = 0.001;
    if (nextTheta > (85 * Math.PI) / 180) nextTheta = (85 * Math.PI) / 180;

    if (Math.abs(nextTheta - theta) < tolerance) {
      theta = nextTheta;
      converged = true;
      break;
    }

    theta = nextTheta;
  }

  const bikeLeanDeg = theta * RAD_TO_DEG;
  const contactPatchOffsetM = rt * Math.sin(theta);

  return {
    bikeLeanRad: theta,
    bikeLeanDeg,
    pointMassLeanDeg,
    leanDeltaDeg: bikeLeanDeg - pointMassLeanDeg,
    iterations: iter,
    contactPatchOffsetM,
    converged,
  };
}
