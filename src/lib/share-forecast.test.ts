import { describe, it, expect } from 'vitest';
import { buildForecastShareText } from './share-forecast';
import type { DailyForecast } from '@/lib/weather';

function day(overrides: Partial<DailyForecast> = {}): DailyForecast {
  const date = new Date('2026-09-19T04:00:00Z'); // Sat Sep 19, noon HKT
  return {
    date,
    temperatureMax: 28,
    temperatureMin: 24,
    weatherCode: 0,
    windSpeedMax: 12,
    windDirectionDominant: 90,
    precipitationProbabilityMax: 0,
    sunrise: date,
    sunset: date,
    ...overrides,
  };
}

const EN_STRINGS: Record<string, string> = {
  'weather.desc.clearSky': 'Clear sky',
  'weather.desc.lightRain': 'Light rain',
  'share.header': 'Weather in {0} for the coming days:',
  'share.rainChance': '{0}% rain',
};

const TC_STRINGS: Record<string, string> = {
  'weather.desc.lightRain': '微雨',
  'share.header': '{0}未來幾日天氣：',
  'share.rainChance': '降雨 {0}%',
};

describe('buildForecastShareText', () => {
  it('builds a header, one line per day, and the app link', () => {
    const text = buildForecastShareText({
      cityName: 'Hong Kong',
      days: [
        day(),
        day({
          date: new Date('2026-09-20T04:00:00Z'),
          weatherCode: 61,
          precipitationProbabilityMax: 60,
        }),
      ],
      units: 'metric',
      language: 'en',
      timezone: 'Asia/Hong_Kong',
      translate: (key) => EN_STRINGS[key] ?? key,
      url: 'https://example.com',
    });

    const lines = text.split('\n');
    expect(lines[0]).toBe('Weather in Hong Kong for the coming days:');
    expect(lines[2]).toContain('☀️');
    expect(lines[2]).toContain('Clear sky');
    expect(lines[2]).toContain('24–28°C');
    expect(lines[2]).not.toContain('% rain');
    expect(lines[3]).toContain('🌧️');
    expect(lines[3]).toContain('Light rain');
    expect(lines[3]).toContain('60% rain');
    expect(lines[lines.length - 1]).toBe('https://example.com');
  });

  it('converts temperatures to the display unit system', () => {
    const text = buildForecastShareText({
      cityName: 'Hong Kong',
      days: [day()],
      units: 'us',
      language: 'en',
      timezone: 'Asia/Hong_Kong',
      translate: (key) => EN_STRINGS[key] ?? key,
    });
    expect(text).toContain('75–82°F');
    expect(text).not.toContain('°C');
  });

  it('maps HKO PSR levels to a rain percentage', () => {
    const text = buildForecastShareText({
      cityName: 'Hong Kong',
      days: [day({ precipitationProbabilityRaw: 'Med High' })],
      units: 'metric',
      language: 'en',
      timezone: 'Asia/Hong_Kong',
      translate: (key) => EN_STRINGS[key] ?? key,
    });
    expect(text).toContain('70% rain');
  });

  it('renders the message in the active language', () => {
    const text = buildForecastShareText({
      cityName: '香港',
      days: [day({ weatherCode: 61, precipitationProbabilityMax: 60 })],
      units: 'metric',
      language: 'tc',
      timezone: 'Asia/Hong_Kong',
      translate: (key) => TC_STRINGS[key] ?? key,
    });
    expect(text).toContain('香港未來幾日天氣：');
    expect(text).toContain('微雨');
    expect(text).toContain('降雨 60%');
    // zh-HK renders the Sat Sep 19 fixture as "19/9（週六）"
    expect(text).toContain('19/9');
    expect(text).toContain('週六');
  });

  it('formats string dates from the persisted (JSON) snapshot', () => {
    const text = buildForecastShareText({
      cityName: 'Hong Kong',
      days: [day({ date: '2026-09-19T04:00:00.000Z' as unknown as Date })],
      units: 'metric',
      language: 'en',
      timezone: 'Asia/Hong_Kong',
      translate: (key) => EN_STRINGS[key] ?? key,
    });
    expect(text).toContain('9/19');
    expect(text).not.toContain('2026-09-19T');
  });
});
