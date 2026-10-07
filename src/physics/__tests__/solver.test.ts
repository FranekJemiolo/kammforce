import { describe, expect, it } from 'vitest';
import { solveCornerTelemetry } from '../solver';
import type { MotorcycleConfig, RiderConfig } from '../types';

describe('Unified Corner Telemetry Solver', () => {
  const bikeR1: MotorcycleConfig = {
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
    hangOffCm: 18,
  };

  it('calculates full telemetry for a typical track hairpin', () => {
    // 80 km/h = 22.22 m/s through a 35m radius turn
    const res = solveCornerTelemetry(
      bikeR1,
      rider,
      { speedMs: 22.22, radiusM: 35, longitudinalAccelG: 0 },
      'dry_track_supersport'
    );

    expect(res.speedKmh).toBeCloseTo(80, 0);
    expect(res.lateralAccelG).toBeGreaterThan(1.2);
    expect(res.lateralAccelG).toBeLessThan(1.6);
    expect(res.toroidalBikeLeanDeg).toBeGreaterThan(45);
    expect(res.toroidalBikeLeanDeg).toBeLessThan(58);
    expect(res.hangOffSavingsDeg).toBeGreaterThan(1.5);
    expect(res.contactPatchOffsetMm).toBeGreaterThan(40);
    expect(res.gripUtilizationPct).toBeGreaterThan(60);
  });

  it('triggers hard part scrape warning when lean exceeds mechanical limit', () => {
    // Extreme high-speed sweep exceeding 56 deg
    const res = solveCornerTelemetry(
      bikeR1,
      { massKg: 75, hangOffCm: 0 }, // no hang-off
      { speedMs: 38, radiusM: 50 }, // 38 m/s = 136 km/h, ay = 28.88 m/s^2 (~2.9g -> impossible lean)
      'dry_track_slick'
    );

    expect(res.toroidalBikeLeanDeg).toBeGreaterThan(bikeR1.maxMechLeanDeg);
    expect(res.isScrapingHardParts).toBe(true);
    expect(res.safetyStatus).toBe('scraping');
  });

  it('triggers low-side warning on greasy road', () => {
    const res = solveCornerTelemetry(
      bikeR1,
      rider,
      { speedMs: 25, radiusM: 40 }, // ~1.6g on cold greasy asphalt
      'greasy_cold'
    );

    expect(res.isTractionLoss).toBe(true);
    expect(res.safetyStatus).toBe('lowside');
  });
});
