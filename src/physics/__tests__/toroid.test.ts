import { describe, expect, it } from 'vitest';
import { GRAVITY } from '../constants';
import { parseTireSize } from '../tires';
import { solveToroidalLeanAngle } from '../toroid';

describe('Toroidal Roll Equation & Newton-Raphson Solver', () => {
  it('solves 1.0g turn: point mass is 45.0 deg, 190-section tire requires ~49 deg', () => {
    // 1.0g cornering acceleration: ay = g
    const ay = GRAVITY;
    const tire = parseTireSize('190_55_17');
    // Combined CoG height of motorcycle + seated rider (h ~ 700-710mm)
    const systemCoGHeightM = 0.71;

    const result = solveToroidalLeanAngle(ay, systemCoGHeightM, tire.crownRadiusM, 0);

    expect(result.converged).toBe(true);
    expect(result.pointMassLeanDeg).toBeCloseTo(45.0, 1);
    // As explicitly specified in the context doc line 646:
    // "a standard 1.0g turn equals exactly 45° for a point mass, but requires ~49° with a 190-section rear track tire"
    expect(result.bikeLeanDeg).toBeGreaterThan(48.2);
    expect(result.bikeLeanDeg).toBeLessThan(49.8);
    expect(result.leanDeltaDeg).toBeGreaterThan(3.5);
    expect(result.contactPatchOffsetM).toBeGreaterThan(0.04);
  });

  it('reduces to 0 deg when lateral acceleration is 0', () => {
    const result = solveToroidalLeanAngle(0, 0.61, 0.095, 0);
    expect(result.bikeLeanDeg).toBe(0);
    expect(result.pointMassLeanDeg).toBe(0);
    expect(result.converged).toBe(true);
  });

  it('demonstrates that rider hang-off reduces bike lean angle', () => {
    const ay = GRAVITY * 0.9; // 0.9g turn
    const h = 0.65;
    const rt = 0.094;

    const noHang = solveToroidalLeanAngle(ay, h, rt, 0);
    // 15cm system CoG offset from rider hanging off
    const withHang = solveToroidalLeanAngle(ay, h, rt, 0.06);

    expect(withHang.bikeLeanDeg).toBeLessThan(noHang.bikeLeanDeg);
    const savings = noHang.bikeLeanDeg - withHang.bikeLeanDeg;
    expect(savings).toBeGreaterThan(2.0);
  });

  it('converges in fewer than 10 iterations across the entire speed envelope', () => {
    const accelerations = [1.0, 3.0, 5.0, 8.0, 9.8, 12.0, 14.0];
    for (const ay of accelerations) {
      const res = solveToroidalLeanAngle(ay, 0.62, 0.09, 0.03);
      expect(res.converged).toBe(true);
      expect(res.iterations).toBeLessThan(10);
    }
  });
});
