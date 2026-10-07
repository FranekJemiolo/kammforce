import { describe, expect, it } from 'vitest';
import { GRAVITY } from '../constants';
import { evaluateGripLimits, magicFormula } from '../pacejka';
import { SURFACE_COMPOUNDS } from '../tires';

describe('Pacejka 94 & Camber Thrust Grip Limits', () => {
  it('magicFormula evaluates peak near D for typical values', () => {
    const val = magicFormula(0.1, 15, 1.3, 2000, -0.1);
    expect(val).toBeGreaterThan(1000);
    expect(val).toBeLessThan(2500);
  });

  it('generates significant camber thrust when leaned', () => {
    const mass = 280; // 200kg bike + 80kg rider
    const ay = GRAVITY * 0.8;
    const leanDeg = 45;
    const compound = SURFACE_COMPOUNDS.dry_track_supersport;

    const evalRes = evaluateGripLimits(mass, ay, leanDeg, compound, 0);

    expect(evalRes.camberThrustN).toBeGreaterThan(1000);
    // Camber thrust takes over a substantial portion of required force
    expect(evalRes.camberThrustN).toBeLessThan(evalRes.requiredLateralForceN * 1.5);
    expect(evalRes.gripUtilizationPct).toBeLessThan(100);
    expect(evalRes.isLowsideTractionLoss).toBe(false);
  });

  it('detects low-side when grip utilization exceeds 100%', () => {
    const mass = 280;
    // 1.8g on wet street (mu ~ 0.58) must exceed grip
    const ay = GRAVITY * 1.8;
    const compound = SURFACE_COMPOUNDS.wet_street;

    const evalRes = evaluateGripLimits(mass, ay, 50, compound, 0);

    expect(evalRes.gripUtilizationPct).toBeGreaterThan(100);
    expect(evalRes.isLowsideTractionLoss).toBe(true);
  });

  it('calculates Kamm circle reserve properly under trail-braking', () => {
    const mass = 280;
    const ay = GRAVITY * 0.7; // Moderate cornering
    const compound = SURFACE_COMPOUNDS.dry_track_supersport;

    const noBraking = evaluateGripLimits(mass, ay, 40, compound, 0);
    const withBraking = evaluateGripLimits(mass, ay, 40, compound, -0.4);

    expect(withBraking.kammUtilizationPct).toBeGreaterThan(noBraking.kammUtilizationPct);
    expect(noBraking.availableLongitudinalG).toBeGreaterThan(0.5);
  });
});
