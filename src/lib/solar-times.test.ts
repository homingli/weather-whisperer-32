import { describe, expect, it } from 'vitest';
import { getSunTimes, getZoneOffsetMinutes } from './solar-times';

/**
 * Step-0 verification gate: these references are PUBLISHED values, captured
 * 2026-11-15 (timeanddate.com city pages; HK solstices from the widely
 * published HKO-consistent tables). Tolerance ±2 min — the NOAA equations
 * are documented at ±1–2 min vs Open-Meteo's NREL SPA, and sunrise/sunset
 * consumers in this app tolerate 10+ min (twilight). If these fail beyond
 * tolerance, the implementation is wrong: do not wire consumers until fixed.
 */

/** An instant that falls on `y-m-d` noon in the given UTC offset (minutes). */
const localNoon = (y: number, m: number, d: number, tzMin: number): Date =>
  new Date(Date.UTC(y, m - 1, d, 12, 0) - tzMin * 60000);

/** Parse a reference ISO instant and assert |actual − expected| ≤ tolMin. */
function expectCloseTo(actual: Date | null, iso: string, tolMin = 2): void {
  expect(actual).not.toBeNull();
  const diff = Math.abs((actual as Date).getTime() - new Date(iso).getTime()) / 60000;
  expect(diff).toBeLessThanOrEqual(tolMin);
}

const HK = { lat: 22.319, lon: 114.169, tz: 480 }; // UTC+8, no DST

describe('getSunTimes — published reference values', () => {
  it('Hong Kong 2026-11-15: 06:35/17:40 HKT (timeanddate.com, captured live)', () => {
    const t = getSunTimes(HK.lat, HK.lon, localNoon(2026, 11, 15, HK.tz), HK.tz);
    expectCloseTo(t.sunrise, '2026-11-14T22:35:00Z'); // 06:35 HKT
    expectCloseTo(t.sunset, '2026-11-15T09:40:00Z'); // 17:40 HKT
  });

  it('Hong Kong 2026-06-21 solstice: 05:40/19:10 HKT (timeanddate.com, captured live)', () => {
    const t = getSunTimes(HK.lat, HK.lon, localNoon(2026, 6, 21, HK.tz), HK.tz);
    expectCloseTo(t.sunrise, '2026-06-20T21:40:00Z');
    expectCloseTo(t.sunset, '2026-06-21T11:10:00Z');
  });

  it('Hong Kong 2026-12-21 solstice: 06:58/17:44 HKT (timeanddate.com, captured live)', () => {
    const t = getSunTimes(HK.lat, HK.lon, localNoon(2026, 12, 21, HK.tz), HK.tz);
    expectCloseTo(t.sunrise, '2026-12-20T22:58:00Z');
    expectCloseTo(t.sunset, '2026-12-21T09:44:00Z');
  });

  it('London 2026-11-15: 07:18/16:11 GMT (timeanddate.com, captured live)', () => {
    const t = getSunTimes(51.507, -0.128, localNoon(2026, 11, 15, 0), 0);
    expectCloseTo(t.sunrise, '2026-11-15T07:18:00Z');
    expectCloseTo(t.sunset, '2026-11-15T16:11:00Z');
  });

  it('Reykjavik 2026-11-15: 09:56/16:27 GMT (timeanddate.com, captured live)', () => {
    const t = getSunTimes(64.146, -21.942, localNoon(2026, 11, 15, 0), 0);
    expectCloseTo(t.sunrise, '2026-11-15T09:56:00Z');
    expectCloseTo(t.sunset, '2026-11-15T16:27:00Z');
  });
});

describe('getSunTimes — polar and ordering edge cases', () => {
  it('Tromsø 2026-12-21: polar night — sun never rises', () => {
    const t = getSunTimes(69.649, 18.955, localNoon(2026, 12, 21, 60), 60);
    expect(t.sunrise).toBeNull();
    expect(t.sunset).toBeNull();
  });

  it('Tromsø 2026-06-21: midnight sun — sun never sets', () => {
    const t = getSunTimes(69.649, 18.955, localNoon(2026, 6, 21, 120), 120);
    expect(t.sunrise).toBeNull();
    expect(t.sunset).toBeNull();
  });

  it('HK sunrise precedes sunset; June day is longer than December day', () => {
    const june = getSunTimes(HK.lat, HK.lon, localNoon(2026, 6, 21, HK.tz), HK.tz);
    const dec = getSunTimes(HK.lat, HK.lon, localNoon(2026, 12, 21, HK.tz), HK.tz);
    expect(june.sunrise!.getTime()).toBeLessThan(june.sunset!.getTime());
    expect(dec.sunrise!.getTime()).toBeLessThan(dec.sunset!.getTime());
    const juneLen = june.sunset!.getTime() - june.sunrise!.getTime();
    const decLen = dec.sunset!.getTime() - dec.sunrise!.getTime();
    expect(juneLen).toBeGreaterThan(decLen);
  });

  it('far-east longitude: sunrise UTC instant falls on the previous UTC date', () => {
    // HK 06:35 HKT = 22:35Z the day before — must not wrap to the wrong date.
    const t = getSunTimes(HK.lat, HK.lon, localNoon(2026, 11, 15, HK.tz), HK.tz);
    expect(t.sunrise!.getUTCDate()).toBe(14);
    expect(t.sunrise!.getUTCMonth()).toBe(10);
  });
});

describe('getZoneOffsetMinutes', () => {
  it('returns the zone offset, DST-aware', () => {
    expect(getZoneOffsetMinutes('Asia/Hong_Kong', new Date('2026-06-21T04:00:00Z'))).toBe(480);
    expect(getZoneOffsetMinutes('America/New_York', new Date('2026-07-15T12:00:00Z'))).toBe(-240); // EDT
    expect(getZoneOffsetMinutes('America/New_York', new Date('2026-01-15T12:00:00Z'))).toBe(-300); // EST
  });

  it('falls back to the device offset for an invalid zone', () => {
    const at = new Date('2026-11-15T04:00:00Z');
    expect(getZoneOffsetMinutes('Not/AZone', at)).toBe(-at.getTimezoneOffset());
  });

  it('uses the device offset when no zone is given', () => {
    const at = new Date('2026-11-15T04:00:00Z');
    expect(getZoneOffsetMinutes(undefined, at)).toBe(-at.getTimezoneOffset());
  });
});
