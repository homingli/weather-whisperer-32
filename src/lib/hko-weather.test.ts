import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getHKODailyAndWarnings } from './hko-weather';
import { fetchWithTimeout } from './fetch-utils';

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
