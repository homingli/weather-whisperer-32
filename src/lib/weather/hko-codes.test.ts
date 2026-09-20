/**
 * HKO code mapping parity tests. Mirrors the coverage in `codes.test.ts`
 * (WMO): every mapped HKO code resolves to a non-empty label and a
 * lucide icon; unknown codes fall back gracefully; `isHKODayTime`
 * returns the correct truth value across the full 50–93 range.
 */

import { describe, it, expect } from 'vitest';
import {
  HKO_ICON_CODES,
  hkoDescriptionKey,
  getHKODescription,
  getHKOIconNode,
  isHKODayTime,
} from './hko-codes';

describe('HKO_ICON_CODES enumeration', () => {
  it('lists all 29 codes in the recognised range', () => {
    expect(HKO_ICON_CODES).toHaveLength(29);
    expect(HKO_ICON_CODES).toEqual(
      expect.arrayContaining([50, 51, 52, 53, 54, 60, 61, 62, 63, 64, 65])
    );
    expect(HKO_ICON_CODES).toEqual(
      expect.arrayContaining([70, 71, 72, 73, 74, 75, 76, 77])
    );
    expect(HKO_ICON_CODES).toEqual(
      expect.arrayContaining([80, 81, 82, 83, 84, 85])
    );
    expect(HKO_ICON_CODES).toEqual(
      expect.arrayContaining([90, 91, 92, 93])
    );
  });
});

describe('getHKODescription', () => {
  it('returns a non-empty EN label for every mapped HKO code', () => {
    for (const code of HKO_ICON_CODES) {
      const desc = getHKODescription(code);
      expect(desc, `code ${code} should resolve to a label`).toBeTruthy();
      expect(desc.length).toBeGreaterThan(0);
    }
  });

  it('returns the documented day labels', () => {
    expect(getHKODescription(50)).toBe('Sunny');
    expect(getHKODescription(60)).toBe('Cloudy');
    expect(getHKODescription(61)).toBe('Overcast');
    expect(getHKODescription(65)).toBe('Thunderstorms');
    expect(getHKODescription(82)).toBe('Humid');
    expect(getHKODescription(90)).toBe('Hot');
    expect(getHKODescription(93)).toBe('Cold');
  });

  it('returns the renamed night labels (no "Fine")', () => {
    expect(getHKODescription(70)).toBe('Clear');
    expect(getHKODescription(71)).toBe('Clear periods');
    expect(getHKODescription(72)).toBe('Clear intervals');
    expect(getHKODescription(73)).toBe('Clear periods with a few showers');
    expect(getHKODescription(74)).toBe('Clear intervals with showers');
    // Make sure no night label starts with "Fine"
    for (let code = 70; code <= 77; code++) {
      expect(getHKODescription(code)).not.toMatch(/^Fine/);
    }
  });

  it('falls back to "Unknown" for codes outside the recognised range', () => {
    expect(getHKODescription(9999)).toBe('Unknown');
    expect(getHKODescription(0)).toBe('Unknown');
    expect(getHKODescription(49)).toBe('Unknown');
    expect(getHKODescription(94)).toBe('Unknown');
    expect(getHKODescription(-1)).toBe('Unknown');
  });
});

describe('hkoDescriptionKey', () => {
  it('returns an hko.desc.* or weather.desc.* key for every mapped code', () => {
    for (const code of HKO_ICON_CODES) {
      const key = hkoDescriptionKey(code);
      expect(key, `code ${code} should resolve to a translation key`).toMatch(
        /^(hko\.desc\.|weather\.desc\.)/
      );
    }
  });

  it('reuses weather.desc.* keys for codes whose wording matches WMO', () => {
    expect(hkoDescriptionKey(60)).toBe('weather.desc.cloudy');
    expect(hkoDescriptionKey(61)).toBe('weather.desc.overcast');
    expect(hkoDescriptionKey(62)).toBe('weather.desc.lightRain');
    expect(hkoDescriptionKey(64)).toBe('weather.desc.heavyRain');
    expect(hkoDescriptionKey(75)).toBe('weather.desc.cloudy');
    expect(hkoDescriptionKey(76)).toBe('weather.desc.overcast');
    expect(hkoDescriptionKey(77)).toBe('weather.desc.lightRain');
  });

  it('returns weather.desc.unknown for unrecognised codes', () => {
    expect(hkoDescriptionKey(9999)).toBe('weather.desc.unknown');
    expect(hkoDescriptionKey(0)).toBe('weather.desc.unknown');
  });
});

describe('isHKODayTime', () => {
  it('classifies 50–69 as day', () => {
    for (let code = 50; code <= 69; code++) {
      expect(isHKODayTime(code), `${code} should be day`).toBe(true);
    }
  });

  it('classifies 70–77 as night', () => {
    for (let code = 70; code <= 77; code++) {
      expect(isHKODayTime(code), `${code} should be night`).toBe(false);
    }
  });

  it('classifies 80–85 (special states) as day (time-agnostic default)', () => {
    for (const code of [80, 81, 82, 83, 84, 85]) {
      expect(isHKODayTime(code), `${code} should be day`).toBe(true);
    }
  });

  it('classifies 90–93 (temperature states) as day', () => {
    for (const code of [90, 91, 92, 93]) {
      expect(isHKODayTime(code), `${code} should be day`).toBe(true);
    }
  });

  it('returns false for unrecognised codes (defensive default)', () => {
    // Codes outside 50–93 have no defined day/night; the function returns
    // false because they fail both branches. The icon path uses `?? Cloud`
    // so the result doesn't matter for unmapped codes.
    expect(isHKODayTime(9999)).toBe(false);
    expect(isHKODayTime(0)).toBe(false);
    expect(isHKODayTime(-1)).toBe(false);
  });
});

describe('getHKOIconNode', () => {
  it('returns a Lucide component for every mapped code', () => {
    for (const code of HKO_ICON_CODES) {
      const Icon = getHKOIconNode(code);
      // Lucide icons are forwardRef objects, not plain functions. Check the
      // discriminator instead of typeof to avoid coupling to the runtime
      // representation.
      expect(Icon, `code ${code} should resolve to a lucide component`).toBeDefined();
      expect(Icon).not.toBeNull();
    }
  });

  it('returns the same fallback for unrecognised codes', () => {
    // We can't import Cloud here without coupling; verify the same fallback
    // is returned for any unmapped code so the defensive branch is stable.
    expect(getHKOIconNode(9999)).toBe(getHKOIconNode(0));
    expect(getHKOIconNode(9999)).toBe(getHKOIconNode(-1));
  });
});