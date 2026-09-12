import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchWeather } from './weather-manager';
import { getWeather as getOpenMeteoWeather } from './weather';
import { isInHongKong, getHKODailyAndWarnings, getHKOCurrentWeather, buildHKOWeatherData, fetchHKOWeatherData } from './hko-weather';
import type { WeatherData, DailyForecast, CurrentWeather, HourlyForecast } from './weather';

vi.mock('./weather', () => ({
  getWeather: vi.fn(),
}));

vi.mock('./hko-weather', () => ({
  isInHongKong: vi.fn(),
  getHKODailyAndWarnings: vi.fn(),
  getHKOCurrentWeather: vi.fn(),
  buildHKOWeatherData: vi.fn(),
  fetchHKOWeatherData: vi.fn(),
}));

const mockGetOpenMeteo = vi.mocked(getOpenMeteoWeather);
const mockGetHKODaily = vi.mocked(getHKODailyAndWarnings);
const mockGetHKOCurrent = vi.mocked(getHKOCurrentWeather);
const mockBuildHKO = vi.mocked(buildHKOWeatherData);
const mockFetchHKO = vi.mocked(fetchHKOWeatherData);
const mockIsInHK = vi.mocked(isInHongKong);

// King's Park approx
const HK_LAT = 22.3119;
const HK_LON = 114.1728;
// Shenzhen
const NON_HK_LAT = 22.54;
const NON_HK_LON = 114.05;

function makeOpenMeteoData(overrides: Partial<WeatherData> = {}): WeatherData {
  const current: CurrentWeather = {
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
  };
  const hourly: HourlyForecast[] = Array.from({ length: 8 }, (_, i) => ({
    time: new Date(2024, 0, 8, i),
    temperature: 25,
    weatherCode: 0,
    windSpeed: 10,
    windDirection: 180,
    precipitationProbability: 20,
    precipitation: 0,
    isDay: true,
  }));
  const daily: DailyForecast[] = Array.from({ length: 7 }, (_, i) => ({
    date: new Date(2024, 0, 8 + i),
    temperatureMax: 28,
    temperatureMin: 22,
    weatherCode: 0,
    windSpeedMax: 10,
    windDirectionDominant: 180,
    precipitationProbabilityMax: 20,
    sunrise: new Date(2024, 0, 8 + i, 6, 0),
    sunset: new Date(2024, 0, 8 + i, 18, 0),
  }));
  return {
    headline: { source: 'om' as const },
    current,
    hourly,
    daily,
    timezone: 'Asia/Hong_Kong',
    ...overrides,
  };
}

function makeHkoDaily(): Awaited<ReturnType<typeof getHKODailyAndWarnings>> {
  return {
    daily: [{
      date: new Date(2024, 0, 8),
      temperatureMax: 26,
      temperatureMin: 21,
      weatherCode: 0,
      // Real HKO shape: no wind, no sun times → parser seeds 0 / epoch-0
      // placeholders, which the manager backfills from Open-Meteo.
      windSpeedMax: 0,
      windDirectionDominant: 0,
      precipitationProbabilityMax: 40,
      precipitationProbabilityRaw: 'Med',
      sunrise: new Date(0),
      sunset: new Date(0),
    }],
    warnings: [{ code: 'WFIREY', name: 'Yellow Fire', actionCode: 'ISSUE', issueTime: 't', updateTime: 't' }],
    nearestStation: "King's Park",
    nearestDistrict: 'Yau Tsim Mong',
    timezone: 'Asia/Hong_Kong',
  };
}

function makeHkoCurrent(): Awaited<ReturnType<typeof getHKOCurrentWeather>> {
  return {
    temperature: { data: [{ place: "King's Park", value: 25, unit: 'C' }], recordTime: 't' },
    humidity: { data: [{ place: "King's Park", value: 70, unit: '%' }], recordTime: 't' },
    rainfall: { data: [], startTime: 't', endTime: 't' },
    icon: [50],
    iconUpdateTime: 't',
    updateTime: 't',
  };
}

describe('fetchWeather orchestration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('isInHongKong boundary cases', () => {
    it('skips HKO entirely for non-HK coordinates', async () => {
      mockIsInHK.mockReturnValue(false);
      const omData = makeOpenMeteoData();
      mockGetOpenMeteo.mockResolvedValue(omData);

      const result = await fetchWeather(NON_HK_LAT, NON_HK_LON);

      // Orchestrator now attaches `sources` to every return, so the result
      // is a new object. Verify the OM data is preserved and the sources
      // field is populated correctly.
      expect(result.current).toBe(omData.current);
      expect(result.hourly).toBe(omData.hourly);
      expect(result.daily).toBe(omData.daily);
      expect(result.sources?.om?.ok).toBe(true);
      expect(result.sources?.hko).toBeUndefined();
      expect(mockGetHKODaily).not.toHaveBeenCalled();
      expect(mockGetHKOCurrent).not.toHaveBeenCalled();
    });

    it('routes HKO fetches for HK coordinates', async () => {
      mockIsInHK.mockReturnValue(true);
      mockGetOpenMeteo.mockResolvedValue(makeOpenMeteoData());
      mockGetHKODaily.mockResolvedValue(makeHkoDaily());

      await fetchWeather(HK_LAT, HK_LON);

      expect(mockGetHKODaily).toHaveBeenCalledWith('en', HK_LAT, HK_LON);
    });
  });

  describe('lang parameter flow', () => {
    it("forwards lang='tc' to HKO daily", async () => {
      mockIsInHK.mockReturnValue(true);
      mockGetOpenMeteo.mockResolvedValue(makeOpenMeteoData());
      mockGetHKODaily.mockResolvedValue(makeHkoDaily());

      await fetchWeather(HK_LAT, HK_LON, 'tc');

      expect(mockGetHKODaily).toHaveBeenCalledWith('tc', HK_LAT, HK_LON);
    });

    it("forwards lang='tc' to HKO current weather when OM fails", async () => {
      mockIsInHK.mockReturnValue(true);
      mockGetOpenMeteo.mockRejectedValue(new Error('OM boom'));
      mockGetHKODaily.mockResolvedValue(makeHkoDaily());
      mockGetHKOCurrent.mockResolvedValue(makeHkoCurrent());
      mockBuildHKO.mockImplementation(async (_current, dailyAndWarnings, _lat, _lon, _lang) => {
        return {
          headline: { source: 'hko' as const, hkoIconCode: _current.icon?.[0] ?? null },
          current: { ...makeOpenMeteoData().current, temperature: 99 },
          hourly: [],
          daily: dailyAndWarnings.daily,
          warnings: dailyAndWarnings.warnings,
          timezone: 'Asia/Hong_Kong',
          nearestStation: dailyAndWarnings.nearestStation,
          nearestDistrict: dailyAndWarnings.nearestDistrict,
          isFallback: true,
          fallbackSource: 'HKO' as const,
        };
      });

      await fetchWeather(HK_LAT, HK_LON, 'tc');

      expect(mockGetHKOCurrent).toHaveBeenCalledWith('tc');
      expect(mockBuildHKO).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        HK_LAT,
        HK_LON,
        'tc',
      );
    });
  });

  describe('parallel Promise.all branches', () => {
    it('reports progress for openMeteo and hko on the HK happy path', async () => {
      mockIsInHK.mockReturnValue(true);
      mockGetOpenMeteo.mockResolvedValue(makeOpenMeteoData());
      mockGetHKODaily.mockResolvedValue(makeHkoDaily());

      const events: Array<[string, string]> = [];
      await fetchWeather(HK_LAT, HK_LON, 'en', (service, status) => {
        events.push([service, status]);
      });

      expect(events).toEqual(
        expect.arrayContaining([
          ['openMeteo', 'fetching'],
          ['hko', 'fetching'],
          ['openMeteo', 'success'],
          ['hko', 'success'],
        ]),
      );
    });

    it('merges HKO daily + current into OM data and reports hkoFailed: false on the happy path', async () => {
      mockIsInHK.mockReturnValue(true);
      const omData = makeOpenMeteoData({
        current: { ...makeOpenMeteoData().current, temperature: 24 },
      });
      mockGetOpenMeteo.mockResolvedValue(omData);
      const hkoDaily = makeHkoDaily();
      mockGetHKODaily.mockResolvedValue(hkoDaily);
      mockGetHKOCurrent.mockResolvedValue(makeHkoCurrent()); // temp = 25

      const result = await fetchWeather(HK_LAT, HK_LON);

      // HKO current wins for the today temperature bar/marker (25, not OM's 24);
      // OM current keeps everything else and survives the spread.
      expect(result.current.temperature).toBe(25); // HKO reading
      expect(result.current.humidity).toBe(omData.current.humidity);
      expect(result.hourly).toEqual(omData.hourly);
      expect(result.daily).toHaveLength(1);
      expect(result.daily[0].temperatureMax).toBe(26); // HKO value
      expect(result.daily[0].sunrise).toEqual(omData.daily[0].sunrise);
      expect(result.warnings).toEqual(hkoDaily.warnings);
      expect(result.nearestStation).toBe(hkoDaily.nearestStation);
      expect(result.nearestDistrict).toBe(hkoDaily.nearestDistrict);
      expect((result as { hkoFailed?: boolean }).hkoFailed).toBeUndefined();
    });

    it('backfills HKO daily wind placeholders from Open-Meteo', async () => {
      mockIsInHK.mockReturnValue(true);
      const omData = makeOpenMeteoData();
      mockGetOpenMeteo.mockResolvedValue(omData);
      mockGetHKODaily.mockResolvedValue(makeHkoDaily()); // wind 0 / sun epoch-0
      mockGetHKOCurrent.mockResolvedValue(makeHkoCurrent());

      const result = await fetchWeather(HK_LAT, HK_LON);

      // HKO wins for temp + PSR ...
      expect(result.daily[0].temperatureMax).toBe(26);
      expect(result.daily[0].precipitationProbabilityMax).toBe(40);
      // ... but the 0 wind placeholders are backfilled from OM, not leaked
      // into the at-a-glance strip / daily cards as "0 km/h".
      expect(result.daily[0].windSpeedMax).toBe(omData.daily[0].windSpeedMax);
      expect(result.daily[0].windDirectionDominant).toBe(omData.daily[0].windDirectionDominant);
      expect(result.daily[0].windSpeedMax).toBeGreaterThan(0);
    });

    it('falls back to OM current temperature when HKO current fetch fails in the merged path', async () => {
      mockIsInHK.mockReturnValue(true);
      const omData = makeOpenMeteoData({
        current: { ...makeOpenMeteoData().current, temperature: 24 },
      });
      mockGetOpenMeteo.mockResolvedValue(omData);
      mockGetHKODaily.mockResolvedValue(makeHkoDaily());
      mockGetHKOCurrent.mockRejectedValue(new Error('HKO current boom'));

      const result = await fetchWeather(HK_LAT, HK_LON);

      // OM temperature preserved (HKO daily still wins for daily/warnings).
      expect(result.current.temperature).toBe(24);
      expect(result.daily[0].temperatureMax).toBe(26);
      expect(result.warnings).toBeDefined();
      expect((result as { hkoFailed?: boolean }).hkoFailed).toBeUndefined();
    });

    it('reports hkoFailed: true when OM succeeds but HKO daily fails', async () => {
      mockIsInHK.mockReturnValue(true);
      mockGetOpenMeteo.mockResolvedValue(makeOpenMeteoData());
      mockGetHKODaily.mockRejectedValue(new Error('HKO daily boom'));

      const result = await fetchWeather(HK_LAT, HK_LON);

      expect((result as { hkoFailed?: boolean }).hkoFailed).toBe(true);
      // OM data is otherwise preserved.
      expect(result.current.temperature).toBe(25);
    });

    it('falls back to HKO-only when OM fails and HKO daily succeeds', async () => {
      mockIsInHK.mockReturnValue(true);
      mockGetOpenMeteo.mockRejectedValue(new Error('OM down'));
      const hkoDaily = makeHkoDaily();
      mockGetHKODaily.mockResolvedValue(hkoDaily);
      const hkoCurrent = makeHkoCurrent();
      mockGetHKOCurrent.mockResolvedValue(hkoCurrent);
      mockBuildHKO.mockImplementation(async (current, dailyAndWarnings) => {
        return {
          headline: { source: 'hko' as const, hkoIconCode: current.icon?.[0] ?? null },
          current: {
            temperature: 25,
            apparentTemperature: 27,
            humidity: 70,
            uvIndex: 5,
            weatherCode: 0,
            windSpeed: 10,
            windDirection: 180,
            precipitation: 0,
            precipitationProbability: 40,
            precipitationProbabilityRaw: 'Med',
            isDay: true,
          },
          hourly: [],
          daily: dailyAndWarnings.daily,
          warnings: dailyAndWarnings.warnings,
          timezone: 'Asia/Hong_Kong',
          nearestStation: dailyAndWarnings.nearestStation,
          nearestDistrict: dailyAndWarnings.nearestDistrict,
          isFallback: true,
          fallbackSource: 'HKO' as const,
        };
      });

      const result = await fetchWeather(HK_LAT, HK_LON);

      expect(mockGetHKOCurrent).toHaveBeenCalledWith('en');
      expect(mockBuildHKO).toHaveBeenCalled();
      expect(result.isFallback).toBe(true);
      expect(result.fallbackSource).toBe('HKO');
      // buildHKO output is returned as-is (temperature=25, 99 was never used).
      expect(result.current.temperature).toBe(25);
    });

    it('throws when both OM and the HKO-only fallback fail (HK path)', async () => {
      mockIsInHK.mockReturnValue(true);
      mockGetOpenMeteo.mockRejectedValue(new Error('OM down'));
      mockGetHKODaily.mockResolvedValue(makeHkoDaily());
      // getHKOCurrent throws -> buildHKO never runs -> secondary fallback triggers.
      mockGetHKOCurrent.mockRejectedValue(new Error('HKO current down'));
      mockFetchHKO.mockRejectedValue(new Error('HKO full down'));

      await expect(fetchWeather(HK_LAT, HK_LON)).rejects.toThrow(
        'Both Open-Meteo and HKO APIs failed',
      );
    });

    it('uses fetchHKOWeatherData as the secondary fallback when OM and HKO-daily both fail', async () => {
      mockIsInHK.mockReturnValue(true);
      mockGetOpenMeteo.mockRejectedValue(new Error('OM down'));
      mockGetHKODaily.mockRejectedValue(new Error('HKO daily down'));
      const hkoFallback = makeOpenMeteoData({ isFallback: true, fallbackSource: 'HKO' });
      mockFetchHKO.mockResolvedValue(hkoFallback);

      const result = await fetchWeather(HK_LAT, HK_LON);

      expect(mockFetchHKO).toHaveBeenCalledWith(HK_LAT, HK_LON, 'en');
      // The orchestrator wraps the fallback with `sources` metadata, so the
      // returned object is a fresh spread — verify the fields are preserved.
      expect(result.current).toBe(hkoFallback.current);
      expect(result.isFallback).toBe(true);
      expect(result.fallbackSource).toBe('HKO');
      expect(result.sources?.om?.ok).toBe(false);
      expect(result.sources?.hko?.ok).toBe(true);
    });

    it('throws when OM fails for a non-HK coordinate (no HKO fallback)', async () => {
      mockIsInHK.mockReturnValue(false);
      mockGetOpenMeteo.mockRejectedValue(new Error('OM down'));

      await expect(fetchWeather(NON_HK_LAT, NON_HK_LON)).rejects.toThrow(
        'Open-Meteo API failed',
      );
    });

    it('reports openMeteo error progress event on failure', async () => {
      mockIsInHK.mockReturnValue(false);
      mockGetOpenMeteo.mockRejectedValue(new Error('OM down'));

      const events: Array<[string, string]> = [];
      await expect(
        fetchWeather(NON_HK_LAT, NON_HK_LON, 'en', (s, st) => events.push([s, st])),
      ).rejects.toThrow();

      // Non-HK path: openMeteo fetching -> parallel openMeteo error + hko 'not applicable' error
      // (order between the two parallel errors is non-deterministic).
      expect(events).toEqual(
        expect.arrayContaining([
          ['openMeteo', 'fetching'],
          ['openMeteo', 'error'],
          ['hko', 'error'],
        ]),
      );
    });

    it('skips hko fetching progress on non-HK coordinates (reports hko=error)', async () => {
      mockIsInHK.mockReturnValue(false);
      mockGetOpenMeteo.mockResolvedValue(makeOpenMeteoData());

      const events: Array<[string, string]> = [];
      await fetchWeather(NON_HK_LAT, NON_HK_LON, 'en', (s, st) => events.push([s, st]));

      expect(events).toEqual([
        ['openMeteo', 'fetching'],
        ['hko', 'error'],  // "not applicable"
        ['openMeteo', 'success'],
      ]);
    });
  });

  // ── Phase 2: headline propagation ───────────────────────────────
  // The headline
  // field is always present on the merged record. source is 'hko' only
  // when the HKO current fetch succeeded AND its icon field is a finite
  // integer other than the 9999 sentinel.
  describe('headline propagation', () => {
    beforeEach(() => {
      mockIsInHK.mockReturnValue(true);
      mockGetOpenMeteo.mockResolvedValue(makeOpenMeteoData());
      mockGetHKODaily.mockResolvedValue(makeHkoDaily());
    });

    it('writes headline.source=hko when HKO current icon is [50]', async () => {
      mockGetHKOCurrent.mockResolvedValue(makeHkoCurrent()); // icon: [50]
      const result = await fetchWeather(HK_LAT, HK_LON);
      expect(result.headline).toEqual({ source: 'hko', hkoIconCode: 50 });
    });

    it('writes headline.source=hko with the actual code when HKO reports 82 (Humid)', async () => {
      mockGetHKOCurrent.mockResolvedValue({ ...makeHkoCurrent(), icon: [82] });
      const result = await fetchWeather(HK_LAT, HK_LON);
      expect(result.headline).toEqual({ source: 'hko', hkoIconCode: 82 });
    });

    it('falls back to source=om when the HKO icon is the 9999 sentinel', async () => {
      mockGetHKOCurrent.mockResolvedValue({ ...makeHkoCurrent(), icon: [9999] });
      const result = await fetchWeather(HK_LAT, HK_LON);
      expect(result.headline).toEqual({ source: 'om' });
    });

    it('falls back to source=om when the HKO icon array is empty', async () => {
      mockGetHKOCurrent.mockResolvedValue({ ...makeHkoCurrent(), icon: [] });
      const result = await fetchWeather(HK_LAT, HK_LON);
      expect(result.headline).toEqual({ source: 'om' });
    });

    it('falls back to source=om when the HKO current fetch fails', async () => {
      mockGetHKOCurrent.mockRejectedValue(new Error('HKO current boom'));
      const result = await fetchWeather(HK_LAT, HK_LON);
      expect(result.headline).toEqual({ source: 'om' });
    });

    it('writes source=om on the non-HK path regardless of any HKO state', async () => {
      mockIsInHK.mockReturnValue(false);
      mockGetOpenMeteo.mockResolvedValue(makeOpenMeteoData());
      const result = await fetchWeather(NON_HK_LAT, NON_HK_LON);
      expect(result.headline).toEqual({ source: 'om' });
    });

    it('writes source=om on the partial path (OM ok, HKO failed)', async () => {
      mockGetHKODaily.mockRejectedValue(new Error('HKO daily boom'));
      const result = await fetchWeather(HK_LAT, HK_LON);
      expect(result.headline).toEqual({ source: 'om' });
    });
  });
});
