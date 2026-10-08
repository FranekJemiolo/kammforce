import { describe, expect, it } from 'vitest';
import { calculateHighSidePhysics, calculateLowSidePhysics, calculateSlidePhysics, GEAR_MATERIALS } from '../kinematics';

describe('Crash Kinematics & Gear Simulation', () => {
  it('correctly maps gear materials to friction coefficients', () => {
    expect(GEAR_MATERIALS.kangaroo_leather.mu_k).toBe(0.5);
    expect(GEAR_MATERIALS.cowhide_leather.mu_k).toBe(0.45);
    expect(GEAR_MATERIALS.cordura_textile.mu_k).toBe(0.35);
    expect(GEAR_MATERIALS.kevlar_denim.mu_k).toBe(0.4);
    expect(GEAR_MATERIALS.street_denim.mu_k).toBe(0.7);
    expect(GEAR_MATERIALS.plastic_slider.mu_k).toBe(0.2);
  });

  it('calculates slide distance and duration using Work-Energy theorem', () => {
    // 100 km/h = 27.7778 m/s
    const v = 100 / 3.6;
    const mu = 0.5; // Kangaroo leather
    const g = 9.81;

    const res = calculateSlidePhysics(v, mu, 80, g);

    // d = v^2 / (2 * mu * g) = (27.7778)^2 / (2 * 0.5 * 9.81) = 771.605 / 9.81 ~ 78.65 m
    expect(res.slideDistanceMeters).toBeCloseTo(78.65, 1);

    // t = v / (mu * g) = 27.7778 / (0.5 * 9.81) = 27.7778 / 4.905 ~ 5.66 s
    expect(res.slideDurationSeconds).toBeCloseTo(5.66, 1);

    expect(res.decelerationG).toBe(0.5);
    expect(res.tumbleRisk).toBe(false);
  });

  it('triggers tumbleRisk warning when mu_k > 0.6', () => {
    const v = 80 / 3.6;
    const denimRes = calculateSlidePhysics(v, GEAR_MATERIALS.street_denim.mu_k);
    expect(denimRes.tumbleRisk).toBe(true);

    const leatherRes = calculateSlidePhysics(v, GEAR_MATERIALS.cowhide_leather.mu_k);
    expect(leatherRes.tumbleRisk).toBe(false);

    const sliderRes = calculateSlidePhysics(v, GEAR_MATERIALS.plastic_slider.mu_k);
    expect(sliderRes.tumbleRisk).toBe(false);
  });

  it('calculates kinetic energy and thermal dissipation power for given rider mass', () => {
    // v = 30 m/s (108 km/h), mass = 80 kg
    // KE = 0.5 * 80 * 900 = 36,000 J (36 kJ)
    const res = calculateSlidePhysics(30, 0.45, 80);
    expect(res.kineticEnergyJoules).toBe(36000);
    expect(res.averageThermalPowerWatts).toBeGreaterThan(0);
  });

  it('handles zero velocity safely', () => {
    const res = calculateSlidePhysics(0, 0.5);
    expect(res.slideDistanceMeters).toBe(0);
    expect(res.slideDurationSeconds).toBe(0);
    expect(res.tumbleRisk).toBe(false);
  });

  it('calculates High-Side crash catapult apex height and flight distance', () => {
    // 120 km/h = 33.33 m/s, lean 52 deg, slip angle 22 deg
    const v = 120 / 3.6;
    const res = calculateHighSidePhysics(v, 52, 22, 78, 200, 0.45);

    // Ejection apex height should be significantly above seat height (> 1.5m)
    expect(res.apexHeightMeters).toBeGreaterThan(1.5);
    expect(res.airborneDurationSeconds).toBeGreaterThan(0.5);
    expect(res.flightDistanceMeters).toBeGreaterThan(10);
    expect(res.groundImpactVelocityKmh).toBeGreaterThan(100);
    expect(res.totalCrashDistanceMeters).toBeGreaterThan(res.flightDistanceMeters);
  });

  it('calculates Low-Side crash separation distance between bike and rider', () => {
    // 100 km/h = 27.78 m/s, lean 50 deg
    const v = 100 / 3.6;
    const res = calculateLowSidePhysics(v, 50, 'front', 78, 200, 0.45);

    // Bike fairings slide on lower friction (mu ~ 0.28) than leathers (mu = 0.45),
    // so bike slides farther than rider
    expect(res.bikeSlideDistanceMeters).toBeGreaterThan(res.riderSlideDistanceMeters);
    expect(res.separationDistanceMeters).toBeGreaterThan(10);
    expect(res.dropDurationSeconds).toBeGreaterThan(0.1);
  });
});
