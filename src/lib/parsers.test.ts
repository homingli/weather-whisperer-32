/**
 * Tolerant-parser behavior tests. The contract:
 *   - completely unparseable input (not an object, or critical structure
 *     missing) -> `data: null`
 *   - partial shape drift (a field is the wrong type) -> typed `data` with
 *     a safe default at that field, plus a path in `warnings`
 *   - empty inputs and missing optional fields degrade silently
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseHKOForecast,
  parseHKOWarningSummary,
  parseHKOCurrentWeather,
  parseOpenMeteoForecast,
  parseNominatimSearch,
  parseNominatimReverse,
  logParseWarnings,
} from './parsers';

describe('parseHKOForecast', () => {
  it('returns null when input is not an object', () => {
    const r = parseHKOForecast('not an object');
    expect(r.data).toBeNull();
    expect(r.warnings).toContain('root (object)');
  });

  it('returns null when weatherForecast is missing', () => {
    const r = parseHKOForecast({ generalSituation: 'fine' });
    expect(r.data).toBeNull();
    expect(r.warnings).toContain('weatherForecast (array)');
  });

  it('accepts a well-formed response and returns no warnings', () => {
    const r = parseHKOForecast({
      generalSituation: 'fine',
      weatherForecast: [
        {
          forecastDate: '20260802',
          week: 'Sunday',
          forecastWind: 'light',
          forecastWeather: 'sunny',
          forecastMaxtemp: { value: 30, unit: 'C' },
          forecastMintemp: { value: 25, unit: 'C' },
          forecastMaxrh: { value: 80, unit: '%' },
          forecastMinrh: { value: 60, unit: '%' },
          ForecastIcon: 50,
          PSR: 'Low',
        },
      ],
      updateTime: '2026-08-02T10:00:00+08:00',
    });
    expect(r.warnings).toEqual([]);
    expect(r.data?.weatherForecast).toHaveLength(1);
    expect(r.data?.weatherForecast[0].forecastMaxtemp.value).toBe(30);
  });

  it('uses defaults for missing fields and records the paths in warnings', () => {
    const r = parseHKOForecast({
      weatherForecast: [
        {
          forecastDate: '20260802',
          forecastMaxtemp: { value: 30 },
          forecastMintemp: { value: 25 },
          // missing: week, forecastWind, forecastWeather, forecastMaxrh,
          // forecastMinrh, ForecastIcon, PSR
        },
      ],
    });
    expect(r.data).not.toBeNull();
    expect(r.data?.weatherForecast[0].week).toBe('');
    expect(r.data?.weatherForecast[0].ForecastIcon).toBe(0);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('drops a forecast item that is missing the critical date/temp fields', () => {
    const r = parseHKOForecast({
      weatherForecast: [
        { forecastDate: '20260802', forecastMaxtemp: { value: 30 }, forecastMintemp: { value: 25 } },
        { forecastDate: '20260803' }, // missing temps
        'not an object',
      ],
    });
    expect(r.data?.weatherForecast).toHaveLength(1);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe('parseHKOWarningSummary', () => {
  it('returns an empty object when input is not an object', () => {
    const r = parseHKOWarningSummary(null);
    expect(r.data).toEqual({});
    expect(r.warnings).toContain('root (object)');
  });

  it('keeps well-formed warnings and drops malformed ones', () => {
    const r = parseHKOWarningSummary({
      WRAIN: { name: 'Amber Rainstorm', code: 'WRAIN', actionCode: 'ISSUE', issueTime: 't', updateTime: 't' },
      BAD: { name: 'No code here' }, // missing code + actionCode
      ALSO_BAD: 'not an object',
    });
    expect(Object.keys(r.data!)).toEqual(['WRAIN']);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe('parseHKOCurrentWeather', () => {
  it('returns null when temperature.data is missing', () => {
    const r = parseHKOCurrentWeather({ humidity: { data: [{ place: 'X', value: 50, unit: '%' }], recordTime: '' } });
    expect(r.data).toBeNull();
  });

  it('accepts a minimal response and tolerates missing optional fields', () => {
    const r = parseHKOCurrentWeather({
      temperature: { data: [{ place: 'HKO', value: 25, unit: 'C' }], recordTime: 't' },
      humidity: { data: [{ place: 'HKO', value: 70, unit: '%' }], recordTime: 't' },
    });
    expect(r.data).not.toBeNull();
    expect(r.data?.temperature.data[0].value).toBe(25);
    expect(r.data?.rainfall.data).toEqual([]);
    expect(r.data?.icon).toEqual([]);
    expect(r.warnings).toContain('rainfall (object)');
  });
});

describe('parseOpenMeteoForecast', () => {
  it('returns null when current/hourly/daily is missing', () => {
    const r = parseOpenMeteoForecast({ current: {} });
    expect(r.data).toBeNull();
  });

  it('accepts a minimal current and uses zero defaults for the rest', () => {
    const r = parseOpenMeteoForecast({
      current: { temperature_2m: 20 },
      hourly: { time: [0], temperature_2m: [20] },
      daily: { time: [0] },
    });
    expect(r.data).not.toBeNull();
    expect(r.data?.current.temperature).toBe(20);
    expect(r.data?.current.humidity).toBe(0);
    expect(r.data?.hourly).toHaveLength(1);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe('parseNominatimSearch', () => {
  it('returns empty array when results is missing', () => {
    const r = parseNominatimSearch({});
    expect(r.data).toEqual([]);
  });

  it('drops rows that are missing required fields', () => {
    const r = parseNominatimSearch({
      results: [
        { name: 'Hong Kong', latitude: 22.3, longitude: 114.2, country: 'HK' },
        { name: 'Bad', latitude: 'not a number', longitude: 114, country: 'HK' },
        null,
      ],
    });
    expect(r.data).toHaveLength(1);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('keeps rows that only have country_code (Open-Meteo omits country for HK)', () => {
    const r = parseNominatimSearch({
      results: [
        { name: 'Kowloon', latitude: 22.31667, longitude: 114.18333, country_code: 'HK', feature_code: 'PPLX' },
        { name: 'Tokyo', latitude: 35.6895, longitude: 139.69171, country: 'Japan', country_code: 'JP' },
      ],
    });
    expect(r.data).toEqual([
      { name: 'Kowloon', latitude: 22.31667, longitude: 114.18333, country: 'HK' },
      { name: 'Tokyo', latitude: 35.6895, longitude: 139.69171, country: 'Japan' },
    ]);
    expect(r.warnings).toEqual([]);
  });

  it('drops rows with neither country nor country_code', () => {
    const r = parseNominatimSearch({
      results: [{ name: 'Nowhere', latitude: 0, longitude: 0 }],
    });
    expect(r.data).toEqual([]);
    expect(r.warnings).toEqual(['results[0] missing country and country_code — dropped']);
  });
});

describe('parseNominatimReverse', () => {
  it('returns a Current Location fallback when address is missing', () => {
    const r = parseNominatimReverse({}, { latitude: 22, longitude: 114 });
    expect(r.data?.name).toBe('Current Location');
    expect(r.warnings).toContain('address (object)');
  });

  it('reads city from the address object', () => {
    const r = parseNominatimReverse({ address: { city: 'Hong Kong', country: 'HK' } }, { latitude: 22, longitude: 114 });
    expect(r.data?.name).toBe('Hong Kong');
    expect(r.data?.country).toBe('HK');
  });
});

describe('logParseWarnings', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('does nothing when warnings is empty', () => {
    logParseWarnings('test', []);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('logs a single summary line for non-empty warnings', () => {
    logParseWarnings('test', ['a (string)', 'b (number)', 'c (array)']);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/test shape drift: 3 field/);
  });

  it('caps the path list at 5 and reports overflow count', () => {
    logParseWarnings('test', ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    expect(warnSpy.mock.calls[0][0]).toMatch(/\+2 more/);
  });
});
