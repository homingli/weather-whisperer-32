import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchWeather } from './weather-manager';
import { cache } from './cache';
import * as weather from './weather';
import * as hkoWeather from './hko-weather';

vi.mock('./cache', () => ({
  cache: {
    get: vi.fn(),
    set: vi.fn(),
    getRaw: vi.fn()
  }
}));

vi.mock('./weather', () => ({
  getWeather: vi.fn()
}));

vi.mock('./hko-weather', () => ({
  isInHongKong: vi.fn(),
  getHKODailyAndWarnings: vi.fn(),
  fetchHKOWeatherData: vi.fn()
}));

describe('Weather Manager', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return cached weather if available', async () => {
    const mockCacheGet = vi.mocked(cache.get);
    mockCacheGet.mockReturnValue({ current: { temperature: 20 } });

    const result = await fetchWeather(22.3, 114.17);
    expect(result.current.temperature).toBe(20);
    expect(weather.getWeather).not.toHaveBeenCalled();
    expect(hkoWeather.getHKODailyAndWarnings).not.toHaveBeenCalled();
  });

  it('should fetch Open-Meteo only if not in HK', async () => {
    vi.mocked(hkoWeather.isInHongKong).mockReturnValue(false);
    const mockGetWeather = vi.mocked(weather.getWeather);
    mockGetWeather.mockResolvedValue({ current: { temperature: 15 } } as any);

    const result = await fetchWeather(51.5, -0.1); // London
    expect(result.current.temperature).toBe(15);
    expect(mockGetWeather).toHaveBeenCalledWith(51.5, -0.1);
    expect(hkoWeather.getHKODailyAndWarnings).not.toHaveBeenCalled();
    expect(cache.set).toHaveBeenCalledWith(expect.any(String), expect.any(Object));
  });

  it('should fetch hybrid data if in HK', async () => {
    vi.mocked(hkoWeather.isInHongKong).mockReturnValue(true);
    
    const mockOMData = {
      current: { temperature: 22 },
      daily: [{ sunrise: new Date(1), sunset: new Date(2) }]
    };
    vi.mocked(weather.getWeather).mockResolvedValue(mockOMData as any);

    const mockHKOData = {
      daily: [{ temperatureMax: 30, sunrise: new Date(0), sunset: new Date(0) }],
      warnings: [{ code: 'WFIREY', name: 'Yellow Fire Danger' }],
      nearestStation: "King's Park",
      nearestDistrict: 'Yau Tsim Mong'
    };
    vi.mocked(hkoWeather.getHKODailyAndWarnings).mockResolvedValue(mockHKOData as any);

    const result = await fetchWeather(22.3, 114.17);
    
    expect(result.current.temperature).toBe(22); // From OM
    expect(result.daily[0].temperatureMax).toBe(30); // From HKO
    expect(result.daily[0].sunrise).toEqual(new Date(1)); // Sunrise taken from OM
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings![0].code).toBe('WFIREY');
    expect(result.nearestStation).toBe("King's Park");
    expect(cache.set).toHaveBeenCalledWith(expect.any(String), expect.any(Object));
  });

  it('should fallback to Open-Meteo if HKO fails', async () => {
    vi.mocked(hkoWeather.isInHongKong).mockReturnValue(true);
    
    const mockOMData = {
      current: { temperature: 22 },
      daily: [{ temperatureMax: 25 }]
    };
    vi.mocked(weather.getWeather).mockResolvedValue(mockOMData as any);
    vi.mocked(hkoWeather.getHKODailyAndWarnings).mockRejectedValue(new Error('HKO failed'));

    const result = await fetchWeather(22.3, 114.17);
    
    expect(result.daily[0].temperatureMax).toBe(25); // Fallback to OM
    expect(result.warnings).toBeUndefined();
    expect(cache.set).toHaveBeenCalledWith(expect.any(String), expect.any(Object), 60000);
  });

  it('should fallback to HKO-only if Open-Meteo fails in HK', async () => {
    vi.mocked(hkoWeather.isInHongKong).mockReturnValue(true);
    vi.mocked(weather.getWeather).mockRejectedValue(new Error('Open-Meteo failed'));
    
    const mockHKOOnlyData = {
      current: { temperature: 26 },
      daily: [{ temperatureMax: 29 }],
      isFallback: true,
      fallbackSource: 'HKO'
    };
    vi.mocked(hkoWeather.fetchHKOWeatherData).mockResolvedValue(mockHKOOnlyData as any);

    const result = await fetchWeather(22.3, 114.17);
    
    expect(hkoWeather.fetchHKOWeatherData).toHaveBeenCalledWith(22.3, 114.17, 'en');
    expect(result.current.temperature).toBe(26);
    expect(result.isFallback).toBe(true);
    expect(result.fallbackSource).toBe('HKO');
    expect(cache.set).toHaveBeenCalledWith(expect.any(String), expect.any(Object), 60000);
  });

  it('should fallback to expired cache if all else fails', async () => {
    vi.mocked(hkoWeather.isInHongKong).mockReturnValue(false);
    vi.mocked(weather.getWeather).mockRejectedValue(new Error('Open-Meteo failed'));
    
    const mockExpiredCache = {
      data: {
        current: { temperature: 18 },
        daily: [{ temperatureMax: 22 }]
      },
      timestamp: Date.now() - 1000 * 60 * 60
    };
    vi.mocked(cache.getRaw).mockReturnValue(mockExpiredCache as any);

    const result = await fetchWeather(51.5, -0.1);
    
    expect(result.current.temperature).toBe(18);
    expect(result.isFallback).toBe(true);
    expect(result.fallbackSource).toBe('cache');
  });
});
