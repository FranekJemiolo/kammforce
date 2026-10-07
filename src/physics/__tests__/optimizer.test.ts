import { describe, expect, it } from 'vitest';
import { solveSpeedForTargetLean, solveHangOffForLeanSafety } from '../optimizer';
import { solveCornerTelemetry } from '../solver';
import type { MotorcycleConfig, RiderConfig } from '../types';

describe('Analytical Lean Angle Optimizers', () => {
  const bike: MotorcycleConfig = {
    id: 'yam_yzf_r1_2024',
    name: 'Yamaha YZF-R1',
    wheelbaseMm: 1405,
    massKg: 201,
    cogHeightMm: 610,
    maxMechLeanDeg: 56,
    frontTireSize: '120_70_17',
    rearTireSize: '190_55_17',
  };

  const rider: RiderConfig = {
    massKg: 78,
    hangOffCm: 15,
  };

  it('solves exact speed to achieve target lean angle and matches forward solver', () => {
    const targetLean = 52.0; // 52 degrees
    const radiusM = 45; // 45m radius

    const opt = solveSpeedForTargetLean(bike, rider, targetLean, radiusM, 'dry_track_supersport');
    expect(opt.requiredSpeedKmh).toBeGreaterThan(60);
    expect(opt.requiredSpeedKmh).toBeLessThan(140);

    // Verify consistency with the forward toroidal solver
    const forward = solveCornerTelemetry(bike, rider, { speedMs: opt.requiredSpeedMs, radiusM }, 'dry_track_supersport');
    expect(forward.toroidalBikeLeanDeg).toBeCloseTo(targetLean, 1);
  });

  it('solves required hang-off to maintain lean below target limit', () => {
    // High lateral accel (1.4g)
    const ay = 9.80665 * 1.4;
    const targetBikeLean = 48.0;

    const neededHangOffCm = solveHangOffForLeanSafety(bike, rider, ay, targetBikeLean);
    expect(neededHangOffCm).toBeGreaterThan(0);
    expect(neededHangOffCm).toBeLessThanOrEqual(35);
  });
});
