import { describe, it, expect } from 'vitest';
import { buildForecastShareText, buildHourlyForecastShareText } from './share-forecast';
import type { DailyForecast, HourlyForecast } from '@/lib/weather';

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
  'share.hourlyHeader': 'Weather in {0} for the coming hours (as of {1}):',
  'share.rainChance': '{0}% rain',
};

const TC_STRINGS: Record<string, string> = {
  'weather.desc.lightRain': '微雨',
  'share.header': '{0}未來幾日天氣：',
  'share.hourlyHeader': '{0}未來幾小時天氣（截至 {1}）：',
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

function hour(overrides: Partial<HourlyForecast> = {}): HourlyForecast {
  return {
    time: new Date('2026-09-19T07:00:00Z'), // 3 PM HKT
    temperature: 28,
    weatherCode: 0,
    windSpeed: 12,
    windDirection: 90,
    precipitationProbability: 0,
    precipitation: 0,
    isDay: true,
    ...overrides,
  };
}

// Fixed "as of" instant so the header is deterministic: 2:45 PM HKT.
const NOW = new Date('2026-09-19T06:45:00Z');

describe('buildHourlyForecastShareText', () => {
  it('anchors the header with the as-of time, one line per hour, and the app link', () => {
    const text = buildHourlyForecastShareText({
      cityName: 'Hong Kong',
      hours: [
        hour(),
        hour({
          time: new Date('2026-09-19T08:00:00Z'),
          weatherCode: 61,
          temperature: 26,
          precipitationProbability: 60,
        }),
      ],
      units: 'metric',
      language: 'en',
      timezone: 'Asia/Hong_Kong',
      translate: (key) => EN_STRINGS[key] ?? key,
      url: 'https://example.com',
      now: NOW,
    });

    const lines = text.split('\n');
    expect(lines[0]).toBe('Weather in Hong Kong for the coming hours (as of 2:45 PM):');
    expect(lines[2]).toBe('☀️ 3 PM · Clear sky · 28°C');
    expect(lines[3]).toBe('🌧️ 4 PM · Light rain · 26°C · 60% rain');
    expect(lines[lines.length - 1]).toBe('https://example.com');
  });

  it('picks the day or night emoji from isDay', () => {
    const text = buildHourlyForecastShareText({
      cityName: 'Hong Kong',
      hours: [hour({ time: new Date('2026-09-19T16:00:00Z'), isDay: false })], // midnight HKT
      units: 'metric',
      language: 'en',
      timezone: 'Asia/Hong_Kong',
      translate: (key) => EN_STRINGS[key] ?? key,
      now: NOW,
    });
    expect(text).toContain('🌙 12 AM · Clear sky · 28°C');
  });

  it('converts temperatures to the display unit system', () => {
    const text = buildHourlyForecastShareText({
      cityName: 'Hong Kong',
      hours: [hour()],
      units: 'us',
      language: 'en',
      timezone: 'Asia/Hong_Kong',
      translate: (key) => EN_STRINGS[key] ?? key,
      now: NOW,
    });
    expect(text).toContain('82°F');
    expect(text).not.toContain('°C');
  });

  it('renders the message in the active language', () => {
    const text = buildHourlyForecastShareText({
      cityName: '香港',
      hours: [hour({ weatherCode: 61, precipitationProbability: 60 })],
      units: 'metric',
      language: 'tc',
      timezone: 'Asia/Hong_Kong',
      translate: (key) => TC_STRINGS[key] ?? key,
      now: NOW,
    });
    expect(text).toContain('香港未來幾小時天氣（截至 下午2:45）：');
    expect(text).toContain('微雨');
    expect(text).toContain('降雨 60%');
    // zh-HK renders the 3 PM fixture as "下午3時"
    expect(text).toContain('下午3時');
  });

  it('formats string times from the persisted (JSON) snapshot', () => {
    const text = buildHourlyForecastShareText({
      cityName: 'Hong Kong',
      hours: [hour({ time: '2026-09-19T07:00:00.000Z' as unknown as Date })],
      units: 'metric',
      language: 'en',
      timezone: 'Asia/Hong_Kong',
      translate: (key) => EN_STRINGS[key] ?? key,
      now: NOW,
    });
    expect(text).toContain('3 PM');
    expect(text).not.toContain('2026-09-19T');
  });
});
