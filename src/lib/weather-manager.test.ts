import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchWeather } from './weather-manager';
import { cache } from './cache';
import * as weather from './weather';
import * as hkoWeather from './hko-weather';

vi.mock('./cache', () => ({
  cache: {
    get: vi.fn(),
    set: vi.fn()
  }
}));

vi.mock('./weather', () => ({
  getWeather: vi.fn()
}));

vi.mock('./hko-weather', () => ({
  isInHongKong: vi.fn(),
  getHKODailyAndWarnings: vi.fn()
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
    expect(cache.set).toHaveBeenCalled();
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
    expect(cache.set).toHaveBeenCalled();
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
    expect(cache.set).toHaveBeenCalled();
  });
});
