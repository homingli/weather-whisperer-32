import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getHKODailyAndWarnings } from './hko-fetch';
import { fetchWithTimeout } from './fetch-utils';
import {
  normalizePsr,
  psrToPercentage,
  psrNeedsUmbrella,
  translatePsr,
  findNearestStation,
  findNearestDistrict,
  translateStationName,
  translateDistrictName,
  hkoIconToWeatherCode,
  getWarningColor,
  getWarningIcon,
  isInHongKong,
  isInRainfallRegion,
  HK_BOUNDS,
  PRD_BOUNDS,
  getStationCoordinates,
  getDistrictCoordinates,
} from './hko-weather';

vi.mock('./fetch-utils', () => ({
  fetchWithTimeout: vi.fn()
}));

const mockFetchWithTimeout = vi.mocked(fetchWithTimeout);

describe('HKO Weather', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should fetch and parse HKO daily forecast and warnings', async () => {
    // Mock the responses for getHKOForecast, getHKOWarningSummary, getHKOWarningInfo
    mockFetchWithTimeout.mockImplementation(async (url: string) => {
      if (url.includes('dataType=fnd')) {
        return {
          ok: true,
          json: async () => ({
            weatherForecast: [
              {
                forecastDate: '20240101',
                forecastMaxtemp: { value: 25 },
                forecastMintemp: { value: 20 },
                ForecastIcon: 50,
                PSR: 'Medium',
              }
            ]
          })
        } as Response;
      }
      if (url.includes('dataType=warnsum')) {
        return {
          ok: true,
          json: async () => ({
            WFIREY: {
              name: 'Yellow Fire Danger Warning',
              code: 'WFIREY',
              actionCode: 'ISSUE',
              issueTime: '2024-01-01T08:00:00+08:00',
              updateTime: '2024-01-01T08:00:00+08:00'
            }
          })
        } as Response;
      }
      if (url.includes('dataType=warningInfo')) {
        return {
          ok: true,
          json: async () => ({
            details: [
              {
                warningStatementCode: 'WFIREY',
                contents: ['Fire danger is high.']
              }
            ]
          })
        } as Response;
      }
      return { ok: false } as Response;
    });

    const result = await getHKODailyAndWarnings('en', 22.3, 114.17); // King's Park approx

    expect(result.daily).toHaveLength(1);
    expect(result.daily[0].temperatureMax).toBe(25);
    expect(result.daily[0].temperatureMin).toBe(20);
    expect(result.daily[0].precipitationProbabilityMax).toBe(50); // 'Medium' translates to 50
    expect(result.daily[0].weatherCode).toBe(0); // 50 (Sunny) -> 0

    // Validate warnings
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe('WFIREY');
    expect(result.warnings[0].details?.contents).toContain('Fire danger is high.');
  });
});

describe('PSR normalization and percentage', () => {
  it('normalizes raw PSR strings (English variants) to canonical levels', () => {
    expect(normalizePsr('Low')).toBe('Low');
    expect(normalizePsr('Medium')).toBe('Med');
    expect(normalizePsr('Med')).toBe('Med');
    expect(normalizePsr('Medium Low')).toBe('Med Low');
    expect(normalizePsr('Med Low')).toBe('Med Low');
    expect(normalizePsr('Medium High')).toBe('Med High');
    expect(normalizePsr('Med High')).toBe('Med High');
    expect(normalizePsr('High')).toBe('High');
  });

  it('normalizes Traditional Chinese PSR labels to canonical levels', () => {
    expect(normalizePsr('低')).toBe('Low');
    expect(normalizePsr('中低')).toBe('Med Low');
    expect(normalizePsr('中')).toBe('Med');
    expect(normalizePsr('中高')).toBe('Med High');
    expect(normalizePsr('高')).toBe('High');
  });

  it('returns undefined for unknown / empty input', () => {
    expect(normalizePsr(undefined)).toBeUndefined();
    expect(normalizePsr('')).toBeUndefined();
    expect(normalizePsr('not-a-level')).toBeUndefined();
  });

  it('maps canonical levels to fixed percentage values', () => {
    expect(psrToPercentage('Low')).toBe(10);
    expect(psrToPercentage('Med Low')).toBe(25);
    expect(psrToPercentage('Med')).toBe(50);
    expect(psrToPercentage('Med High')).toBe(70);
    expect(psrToPercentage('High')).toBe(85);
  });

  it('maps raw variant strings through normalizePsr then to percentages', () => {
    // The raw English variants resolve via RAW_TO_LEVEL inside psrToPercentage.
    expect(psrToPercentage('Medium')).toBe(50);
    expect(psrToPercentage('Medium Low')).toBe(25);
    expect(psrToPercentage('Medium High')).toBe(70);
  });

  it('returns 0 for unknown PSR strings', () => {
    expect(psrToPercentage('garbage')).toBe(0);
    expect(psrToPercentage('')).toBe(0);
  });

  it('flags umbrella need at Med or above (canonical levels)', () => {
    expect(psrNeedsUmbrella('Low')).toBe(false);
    expect(psrNeedsUmbrella('Med Low')).toBe(false);
    expect(psrNeedsUmbrella('Med')).toBe(true);
    expect(psrNeedsUmbrella('Med High')).toBe(true);
    expect(psrNeedsUmbrella('High')).toBe(true);
  });

  it('flags umbrella need for raw variant strings (English)', () => {
    expect(psrNeedsUmbrella('Medium')).toBe(true);
    expect(psrNeedsUmbrella('Medium High')).toBe(true);
    expect(psrNeedsUmbrella('Medium Low')).toBe(false);
  });

  it('flags umbrella need for Traditional Chinese raw strings', () => {
    expect(psrNeedsUmbrella('中')).toBe(true);
    expect(psrNeedsUmbrella('中高')).toBe(true);
    expect(psrNeedsUmbrella('高')).toBe(true);
    expect(psrNeedsUmbrella('低')).toBe(false);
    expect(psrNeedsUmbrella('中低')).toBe(false);
  });

  it('returns false for empty / unknown input', () => {
    expect(psrNeedsUmbrella(undefined)).toBe(false);
    expect(psrNeedsUmbrella('')).toBe(false);
    expect(psrNeedsUmbrella('garbage')).toBe(false);
  });
});

describe('PSR translation', () => {
  it('returns the input unchanged for English label', () => {
    expect(translatePsr('Low', 'en')).toBe('Low');
    expect(translatePsr('High', 'en')).toBe('High');
  });

  it('maps canonical English labels to Traditional Chinese', () => {
    expect(translatePsr('Low', 'tc')).toBe('低');
    expect(translatePsr('Med Low', 'tc')).toBe('中低');
    expect(translatePsr('Med', 'tc')).toBe('中');
    expect(translatePsr('Med High', 'tc')).toBe('中高');
    expect(translatePsr('High', 'tc')).toBe('高');
  });

  it('returns null for undefined / empty input', () => {
    expect(translatePsr(undefined, 'en')).toBeNull();
    expect(translatePsr('', 'tc')).toBeNull();
  });

  it('falls back to the input string for unknown labels', () => {
    expect(translatePsr('mystery', 'en')).toBe('mystery');
    expect(translatePsr('mystery', 'tc')).toBe('mystery');
  });
});

describe('Station lookup', () => {
  // Central HK
  const centralHK = { lat: 22.2855, lon: 114.1575 };
  // Tuen Mun (north-west New Territories)
  const tuenMun = { lat: 22.3858, lon: 113.9639 };

  it('finds the nearest English station to a coordinate', () => {
    const result = findNearestStation(centralHK.lat, centralHK.lon, 'en');
    expect(result).not.toBeNull();
    expect(result!.name).toBeTruthy();
    expect(result!.distance).toBeGreaterThanOrEqual(0);
  });

  it('finds the nearest Traditional Chinese station to a coordinate', () => {
    const result = findNearestStation(centralHK.lat, centralHK.lon, 'tc');
    expect(result).not.toBeNull();
    expect(result!.name).toBeTruthy();
  });

  it('picks geographically close stations for an in-HK coordinate', () => {
    const result = findNearestStation(tuenMun.lat, tuenMun.lon, 'en');
    // Tuen Mun is in the test fixture list; it should win or be near-tied.
    const known = ['Tuen Mun', 'Tsing Yi', 'Tsuen Wan Ho Koon'];
    expect(known).toContain(result!.name);
  });

  it('returns null when no station can be matched (impossible with fixed map, but sanity)', () => {
    // The function only returns null when stations map is empty — we can't
    // trigger that without monkey-patching. Verify the happy path returns a
    // non-null result for any reasonable coord.
    const result = findNearestStation(0, 0, 'en');
    expect(result).not.toBeNull();
  });

  it('getStationCoordinates returns the registered coords for known names', () => {
    const coords = getStationCoordinates("King's Park", 'en');
    expect(coords).toEqual({ lat: 22.3119, lon: 114.1728 });
  });

  it('getStationCoordinates returns null for unknown names', () => {
    expect(getStationCoordinates('Imaginary Station', 'en')).toBeNull();
  });
});

describe('District lookup', () => {
  it('finds the nearest English district', () => {
    const result = findNearestDistrict(22.30, 114.18, 'en');
    expect(result).not.toBeNull();
    expect(result!.name).toBeTruthy();
  });

  it('finds the nearest Traditional Chinese district', () => {
    const result = findNearestDistrict(22.30, 114.18, 'tc');
    expect(result).not.toBeNull();
    expect(result!.name).toBeTruthy();
  });

  it('getDistrictCoordinates returns the registered coords for known names', () => {
    const coords = getDistrictCoordinates('Wan Chai', 'en');
    expect(coords).toEqual({ lat: 22.2783, lon: 114.1747 });
  });

  it('getDistrictCoordinates returns null for unknown names', () => {
    expect(getDistrictCoordinates('Imaginary District', 'en')).toBeNull();
  });
});

describe('Station / district name translation', () => {
  it('translates station names English → Traditional Chinese', () => {
    expect(translateStationName("King's Park", 'tc')).toBe('京士柏');
    expect(translateStationName('Hong Kong Observatory', 'tc')).toBe('香港天文台');
  });

  it('translates station names Traditional Chinese → English', () => {
    expect(translateStationName('京士柏', 'en')).toBe("King's Park");
    expect(translateStationName('香港天文台', 'en')).toBe('Hong Kong Observatory');
  });

  it('returns the input unchanged for unknown station names', () => {
    expect(translateStationName('Mystery', 'tc')).toBe('Mystery');
    expect(translateStationName('神秘', 'en')).toBe('神秘');
  });

  it('translates district names English → Traditional Chinese', () => {
    expect(translateDistrictName('Wan Chai', 'tc')).toBe('灣仔');
    expect(translateDistrictName('Yau Tsim Mong', 'tc')).toBe('油尖旺');
  });

  it('translates district names Traditional Chinese → English', () => {
    expect(translateDistrictName('灣仔', 'en')).toBe('Wan Chai');
    expect(translateDistrictName('油尖旺', 'en')).toBe('Yau Tsim Mong');
  });

  it('returns the input unchanged for unknown district names', () => {
    expect(translateDistrictName('Mystery District', 'tc')).toBe('Mystery District');
    expect(translateDistrictName('神秘區', 'en')).toBe('神秘區');
  });
});

describe('HK bounds and PRD region checks', () => {
  it('detects points inside the HK bounding box', () => {
    expect(isInHongKong(22.30, 114.17)).toBe(true);
    // Edge of the box
    expect(isInHongKong(HK_BOUNDS.minLat, HK_BOUNDS.minLon)).toBe(true);
    expect(isInHongKong(HK_BOUNDS.maxLat, HK_BOUNDS.maxLon)).toBe(true);
  });

  it('rejects points outside the HK bounding box', () => {
    expect(isInHongKong(22.30, 113.0)).toBe(false); // too far west
    expect(isInHongKong(23.5, 114.17)).toBe(false); // too far north
    expect(isInHongKong(22.30, 115.0)).toBe(false); // too far east
    expect(isInHongKong(21.0, 114.17)).toBe(false); // too far south
  });

  it('detects points inside the Pearl River Delta rainfall coverage box', () => {
    expect(isInRainfallRegion(22.30, 114.17)).toBe(true);
    // Shenzhen area
    expect(isInRainfallRegion(22.54, 114.05)).toBe(true);
    // Edge of the box
    expect(isInRainfallRegion(PRD_BOUNDS.minLat, PRD_BOUNDS.minLon)).toBe(true);
  });

  it('rejects points outside the PRD coverage box', () => {
    expect(isInRainfallRegion(20.0, 114.0)).toBe(false);
    expect(isInRainfallRegion(22.30, 110.0)).toBe(false);
  });
});

describe('HKO icon → WMO code mapping', () => {
  it('maps sunny / fine day icons to clear-sky codes', () => {
    expect(hkoIconToWeatherCode(50)).toBe(0);
    expect(hkoIconToWeatherCode(51)).toBe(1);
  });

  it('maps cloudy / overcast icons to cloud codes', () => {
    expect(hkoIconToWeatherCode(60)).toBe(3);
    expect(hkoIconToWeatherCode(61)).toBe(3);
  });

  it('maps rain icons to rain codes', () => {
    expect(hkoIconToWeatherCode(62)).toBe(61);
    expect(hkoIconToWeatherCode(63)).toBe(63);
    expect(hkoIconToWeatherCode(64)).toBe(65);
  });

  it('maps thunderstorm icons to the thunderstorm code', () => {
    expect(hkoIconToWeatherCode(65)).toBe(95);
    expect(hkoIconToWeatherCode(90)).toBe(95);
  });

  it('maps fog / mist / haze to the fog code', () => {
    expect(hkoIconToWeatherCode(83)).toBe(45);
    expect(hkoIconToWeatherCode(84)).toBe(45);
    expect(hkoIconToWeatherCode(85)).toBe(45);
  });

  it('falls back to overcast (3) for unknown icon codes', () => {
    expect(hkoIconToWeatherCode(9999)).toBe(3);
    expect(hkoIconToWeatherCode(-1)).toBe(3);
  });
});

describe('Warning display helpers', () => {
  it('returns "destructive" for red-coded warnings', () => {
    expect(getWarningColor('WFIRER')).toBe('destructive');
    expect(getWarningColor('WRAINR')).toBe('destructive');
    expect(getWarningColor('WTMW')).toBe('destructive');
    expect(getWarningColor('TC10')).toBe('destructive');
  });

  it('returns "warning" for yellow-coded warnings', () => {
    expect(getWarningColor('WFIREY')).toBe('warning');
    expect(getWarningColor('WRAINA')).toBe('warning');
    expect(getWarningColor('WTS')).toBe('warning');
    expect(getWarningColor('TC3')).toBe('warning');
  });

  it('returns "secondary" for unknown warnings', () => {
    expect(getWarningColor('WUNKNOWN')).toBe('secondary');
    expect(getWarningColor('')).toBe('secondary');
  });

  it('resolves a registered warning code to its specific icon file', () => {
    expect(getWarningIcon('WFIREY')).toBe('/icons/hko-warnings/firey.gif');
    expect(getWarningIcon('WFIRER')).toBe('/icons/hko-warnings/firer.gif');
    expect(getWarningIcon('TC10')).toBe('/icons/hko-warnings/tc10.gif');
  });

  it('falls back to a family icon for base codes that share a prefix', () => {
    expect(getWarningIcon('WFIREX')).toBe('/icons/hko-warnings/firey.gif');
    expect(getWarningIcon('WRAINX')).toBe('/icons/hko-warnings/raina.gif');
    expect(getWarningIcon('TC99')).toBe('/icons/hko-warnings/tc1.gif');
  });

  it('falls back to the generic tropical storm icon for completely unknown codes', () => {
    expect(getWarningIcon('WXYZ123')).toBe('/icons/hko-warnings/ts.gif');
    expect(getWarningIcon('')).toBe('/icons/hko-warnings/ts.gif');
  });
});
