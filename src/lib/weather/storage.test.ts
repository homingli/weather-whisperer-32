import { describe, it, expect, beforeEach } from 'vitest';
import {
  readLastKnownWeather,
  writeLastKnownWeather,
  clearLastKnownWeather,
  makeCityId,
} from './storage';
import { STORAGE_KEYS } from '../constants';
import type { WeatherData } from './types';

function makeWeather(overrides: Partial<WeatherData> = {}): WeatherData {
  return {
    current: {
      temperature: 25,
      apparentTemperature: 27,
      humidity: 70,
      uvIndex: 5,
      weatherCode: 0,
      windSpeed: 10,
      windDirection: 180,
      precipitation: 0,
      precipitationProbability: 20,
      isDay: true,
    },
    hourly: [],
    daily: [],
    ...overrides,
  };
}

describe('weather/storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('makeCityId', () => {
    it('rounds to 2 decimal places for stable cross-render keying', () => {
      expect(makeCityId(22.3119, 114.1728)).toBe('22.31,114.17');
      expect(makeCityId(22.31, 114.17)).toBe('22.31,114.17');
      // Floating-point jitter below the rounding threshold collapses.
      expect(makeCityId(22.31191, 114.17281)).toBe('22.31,114.17');
    });

    it('differs for distant cities', () => {
      expect(makeCityId(22.31, 114.17)).not.toBe(makeCityId(22.54, 114.05));
    });
  });

  describe('writeLastKnownWeather / readLastKnownWeather', () => {
    it('round-trips a fresh payload for the same city', () => {
      const cityId = makeCityId(22.31, 114.17);
      const data = makeWeather({ sources: { om: { ok: true, cachedAt: 12345, ttlMs: 5000, isExpired: false } } });
      writeLastKnownWeather(cityId, 'en', data);

      const result = readLastKnownWeather(cityId);
      expect(result).not.toBeNull();
      expect(result?.v).toBe(1);
      expect(result?.cityId).toBe(cityId);
      expect(result?.lang).toBe('en');
      expect(typeof result?.fetchedAt).toBe('number');
      expect(result?.data.sources?.om?.cachedAt).toBe(12345);
    });

    it('returns null when nothing is stored', () => {
      expect(readLastKnownWeather('22.31,114.17')).toBeNull();
    });

    it('returns null for a different city (no cross-city paint)', () => {
      writeLastKnownWeather('22.31,114.17', 'en', makeWeather());
      expect(readLastKnownWeather('22.54,114.05')).toBeNull();
    });

    it('drops the envelope on parse error', () => {
      localStorage.setItem(STORAGE_KEYS.LAST_KNOWN, '{ not json');
      expect(readLastKnownWeather('22.31,114.17')).toBeNull();
    });

    it('drops the envelope on version mismatch', () => {
      localStorage.setItem(
        STORAGE_KEYS.LAST_KNOWN,
        JSON.stringify({
          v: 999,
          cityId: '22.31,114.17',
          lang: 'en',
          fetchedAt: Date.now(),
          data: makeWeather(),
        })
      );
      expect(readLastKnownWeather('22.31,114.17')).toBeNull();
    });

    it('drops the envelope when fetchedAt is missing or wrong type', () => {
      localStorage.setItem(
        STORAGE_KEYS.LAST_KNOWN,
        JSON.stringify({
          v: 1,
          cityId: '22.31,114.17',
          lang: 'en',
          data: makeWeather(),
        })
      );
      expect(readLastKnownWeather('22.31,114.17')).toBeNull();
    });

    it('drops the envelope when data is missing', () => {
      localStorage.setItem(
        STORAGE_KEYS.LAST_KNOWN,
        JSON.stringify({
          v: 1,
          cityId: '22.31,114.17',
          lang: 'en',
          fetchedAt: Date.now(),
        })
      );
      expect(readLastKnownWeather('22.31,114.17')).toBeNull();
    });

    it('persists the language flag', () => {
      const cityId = makeCityId(22.31, 114.17);
      writeLastKnownWeather(cityId, 'tc', makeWeather());
      expect(readLastKnownWeather(cityId)?.lang).toBe('tc');
    });
  });

  describe('clearLastKnownWeather', () => {
    it('removes the stored envelope', () => {
      const cityId = makeCityId(22.31, 114.17);
      writeLastKnownWeather(cityId, 'en', makeWeather());
      expect(readLastKnownWeather(cityId)).not.toBeNull();
      clearLastKnownWeather();
      expect(readLastKnownWeather(cityId)).toBeNull();
    });

    it('is a no-op when nothing is stored', () => {
      expect(() => clearLastKnownWeather()).not.toThrow();
    });
  });
});