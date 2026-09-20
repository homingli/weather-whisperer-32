// Tests for the MSC nowcast time derivation (GeoMet WMS steps).
//
// The step times must track the HRDPS publishing cadence: runs at 00/06/12/18Z
// with a ~2h publish lag (verified 2026-08-07 at 00:54Z/01:23Z: 18Z still the
// latest run while 00Z had not yet been published). A regression that shifts
// steps by an hour would show the wrong forecast hour on the map.

import { describe, it, expect } from 'vitest';
import {
  determineLatestRun,
  buildMscStepTimes,
  formatStepTime,
  formatObservationTime,
  vancouverTimeZoneAbbr,
  vancouverBboxMercator,
  buildProbeUrl,
} from './msc-wms';
import { MSC } from './constants';

const utc = (iso: string): Date => new Date(iso);

describe('determineLatestRun', () => {
  it('picks the 00Z run when well past its publish lag', () => {
    // 03:00Z — the 00Z run has been publishing for 3h.
    expect(determineLatestRun(utc('2026-08-06T03:00:00Z')).toISOString()).toBe('2026-08-06T00:00:00.000Z');
  });

  it('picks the 06Z run in the 06-12Z window', () => {
    expect(determineLatestRun(utc('2026-08-06T08:30:00Z')).toISOString()).toBe('2026-08-06T06:00:00.000Z');
  });

  it('picks the 12Z run in the 12-18Z window', () => {
    expect(determineLatestRun(utc('2026-08-06T14:00:00Z')).toISOString()).toBe('2026-08-06T12:00:00.000Z');
  });

  it('picks the 18Z run in the 18-24Z window', () => {
    expect(determineLatestRun(utc('2026-08-06T23:00:00Z')).toISOString()).toBe('2026-08-06T18:00:00.000Z');
  });

  it('accounts for the publish lag at 00:00-01:59Z (00Z not yet published)', () => {
    // At 00:54Z the 00Z run was not yet on the server; the latest is 18Z
    // the previous day (verified against dd.weather.gc.ca 2026-08-07).
    expect(determineLatestRun(utc('2026-08-07T00:54:00Z')).toISOString()).toBe('2026-08-06T18:00:00.000Z');
    expect(determineLatestRun(utc('2026-08-07T01:30:00Z')).toISOString()).toBe('2026-08-06T18:00:00.000Z');
  });

  it('rolls to the previous day when the lag crosses midnight', () => {
    expect(determineLatestRun(utc('2026-08-07T00:10:00Z')).toISOString()).toBe('2026-08-06T18:00:00.000Z');
  });

  it('picks the 00Z run right at the 2h boundary', () => {
    // Exactly 2h after 00Z — the lag rule treats it as published.
    expect(determineLatestRun(utc('2026-08-06T02:00:00Z')).toISOString()).toBe('2026-08-06T00:00:00.000Z');
  });

  it('handles month/year rollover', () => {
    expect(determineLatestRun(utc('2026-01-01T00:30:00Z')).toISOString()).toBe('2025-12-31T18:00:00.000Z');
  });
});

describe('buildMscStepTimes', () => {
  it('returns the next 6 hours from now, spaced 1h apart, in MapServer time format', () => {
    // 08:30Z → next full hour is 09:00Z → steps 09:00..14:00Z.
    const { runStart, steps } = buildMscStepTimes(utc('2026-08-06T08:30:00Z'));
    expect(runStart.toISOString()).toBe('2026-08-06T06:00:00.000Z');
    expect(steps).toHaveLength(MSC.STEP_HOURS.length);
    expect(steps[0]).toBe('2026-08-06T09:00:00Z'); // next full hour
    expect(steps[1]).toBe('2026-08-06T10:00:00Z');
    expect(steps[5]).toBe('2026-08-06T14:00:00Z');
  });

  it('never serves a past hour (GeoMet rolling window starts ~now-3h)', () => {
    // 15:45Z → first step 16:00Z, strictly in the future.
    const { steps } = buildMscStepTimes(utc('2026-08-07T15:45:00Z'));
    expect(steps[0]).toBe('2026-08-07T16:00:00Z');
    for (const s of steps) {
      expect(new Date(s).getTime()).toBeGreaterThan(new Date('2026-08-07T15:45:00Z').getTime());
    }
  });

  it('steps are strict MapServer time strings (%Y-%m-%dT%H:%M:%SZ, no ms)', () => {
    // GeoMet's time parser rejects milliseconds — verified "Date format
    // error ... Expecting: '%Y-%m-%dT%H:%M:%SZ'" with .000Z input.
    const { steps } = buildMscStepTimes(utc('2026-08-06T23:00:00Z'));
    for (const s of steps) {
      expect(s).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/);
    }
  });

  it('steps cross the midnight boundary correctly', () => {
    // 23:30Z → next full hour 00:00Z (next day) → 00:00..05:00Z.
    const { runStart, steps } = buildMscStepTimes(utc('2026-08-06T23:30:00Z'));
    expect(runStart.toISOString()).toBe('2026-08-06T18:00:00.000Z');
    expect(steps[0]).toBe('2026-08-07T00:00:00Z');
    expect(steps[5]).toBe('2026-08-07T05:00:00Z');
  });
});

describe('formatStepTime', () => {
  it('formats HH:MM in Vancouver local time (PDT in summer)', () => {
    // America/Vancouver is UTC-7 during DST (PDT).
    expect(formatStepTime('2026-08-06T19:00:00.000Z')).toBe('12:00');
    expect(formatStepTime('2026-08-07T00:00:00.000Z')).toBe('17:00');
    expect(formatStepTime('2026-08-07T05:30:00.000Z')).toBe('22:30');
  });

  it('applies PST (UTC-8) outside DST', () => {
    expect(formatStepTime('2026-01-01T00:00:00.000Z')).toBe('16:00');
  });

  it('passes through unparseable input', () => {
    expect(formatStepTime('garbage')).toBe('garbage');
  });
});

describe('formatObservationTime', () => {
  it('formats YYYY-MM-DD HH:MM in Vancouver local time', () => {
    expect(formatObservationTime('2026-08-06T18:00:00.000Z')).toBe('2026-08-06 11:00');
    expect(formatObservationTime('2026-01-01T00:00:00.000Z')).toBe('2025-12-31 16:00');
  });

  it('passes through unparseable input', () => {
    expect(formatObservationTime('nope')).toBe('nope');
  });
});

describe('vancouverTimeZoneAbbr', () => {
  it('returns PDT in summer and PST in winter', () => {
    expect(vancouverTimeZoneAbbr('2026-08-06T18:00:00.000Z')).toBe('PDT');
    expect(vancouverTimeZoneAbbr('2026-01-01T00:00:00.000Z')).toBe('PST');
  });
});

describe('vancouverBboxMercator', () => {
  it('produces a valid EPSG:3857 bbox for the Vancouver box', () => {
    const { minX, minY, maxX, maxY } = vancouverBboxMercator();
    expect(minX).toBeLessThan(maxX);
    expect(minY).toBeLessThan(maxY);
    // Vancouver lon -124..-122.3 → x around -13.8M (verified against a live
    // GeoMet GetMap request: BBOX=-13805433.9,6261721.4,-13613282.6,6342203.8).
    expect(minX).toBeGreaterThan(-13_900_000);
    expect(minX).toBeLessThan(-13_800_000);
    expect(maxX).toBeGreaterThan(-13_700_000);
    expect(maxX).toBeLessThan(-13_600_000);
    // lat 48.9..49.5 → y around 6.26-6.36M.
    expect(minY).toBeGreaterThan(6_200_000);
    expect(minY).toBeLessThan(6_300_000);
    expect(maxY).toBeGreaterThan(6_300_000);
    expect(maxY).toBeLessThan(6_400_000);
  });
});

describe('buildProbeUrl', () => {
  it('builds a 256×256 EPSG:3857 GetMap request for a step time', () => {
    const url = buildProbeUrl('2026-08-06T09:00:00Z');
    expect(url.startsWith('https://geo.weather.gc.ca/geomet?')).toBe(true);
    expect(url).toContain('service=WMS');
    expect(url).toContain('request=GetMap');
    expect(url).toContain('version=1.3.0');
    expect(url).toContain('crs=EPSG:3857');
    expect(url).toContain('width=256&height=256');
    expect(url).toContain(`layers=${MSC.LAYER}`);
    expect(url).toContain(`styles=${MSC.STYLE}`);
    expect(url).toContain('transparent=true&format=image/png');
    // The step time is URL-encoded (the WMS `time` param is a strict
    // MapServer instant "YYYY-MM-DDTHH:00:00Z").
    expect(url).toContain(`time=${encodeURIComponent('2026-08-06T09:00:00Z')}`);
  });

  it('encodes the bbox to 2 decimals and keeps it ordered', () => {
    const url = buildProbeUrl('2026-08-06T09:00:00Z');
    const bbox = url.match(/bbox=([^&]+)/)?.[1];
    expect(bbox).toBeDefined();
    const parts = (bbox as string).split(',').map(Number);
    expect(parts).toHaveLength(4);
    // Every value is fixed to 2 decimals (matches the live-verified bbox
    // -13805433.9,6261721.4,-13613282.6,6342203.8).
    for (const p of parts) {
      expect(String(p)).toMatch(/^-?\d+\.\d{2}$/);
    }
    expect(parts[0]).toBeLessThan(parts[2]); // minX < maxX
    expect(parts[1]).toBeLessThan(parts[3]); // minY < maxY
  });
});
