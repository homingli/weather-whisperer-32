import { describe, expect, it } from 'vitest';
import { buildWidgetPayload } from './widget-bridge';
import type { WeatherData } from '@/lib/weather';
import type { HKOWarning } from '@/lib/hko-types';

/** Identity-style translator: always passes the key through, so tests can
 *  assert on the exact translation keys the payload builder resolves. */
const t = (key: string) => key;

function makeData(overrides: Partial<WeatherData> = {}): WeatherData {
  const now = new Date('2026-10-21T09:00:00');
  return {
    headline: { source: 'om' },
    current: {
      temperature: 26.4,
      apparentTemperature: 30,
      humidity: 80,
      uvIndex: 5,
      weatherCode: 61,
      windSpeed: 12,
      windDirection: 90,
      precipitation: 0.2,
      precipitationProbability: 45,
      isDay: true,
    },
    hourly: [],
    daily: [
      {
        date: now,
        temperatureMax: 29,
        temperatureMin: 24,
        weatherCode: 61,
        windSpeedMax: 20,
        windDirectionDominant: 90,
        precipitationProbabilityMax: 60,
        sunrise: new Date('2026-10-21T06:32:00'),
        sunset: new Date('2026-10-21T18:04:00'),
      },
      {
        date: new Date('2026-10-22T00:00:00'),
        temperatureMax: 28,
        temperatureMin: 24,
        weatherCode: 3,
        windSpeedMax: 18,
        windDirectionDominant: 90,
        precipitationProbabilityMax: 40,
        sunrise: new Date('2026-10-22T06:33:00'),
        sunset: new Date('2026-10-22T18:03:00'),
      },
    ],
    ...overrides,
  } as WeatherData;
}

function warning(code: string, name = 'Frost Warning'): HKOWarning {
  return {
    name,
    code,
    actionCode: 'ISSUE',
    issueTime: '2026-10-21T08:00:00Z',
    updateTime: '2026-10-21T08:00:00Z',
  };
}

describe('buildWidgetPayload', () => {
  const now = new Date('2026-10-21T09:00:00');

  it('rounds temperature and formats rain probability', () => {
    const p = buildWidgetPayload(makeData(), t, now);
    expect(p.temperature).toBe('26°');
    expect(p.rain).toBe('💧 45%');
  });

  it('prefers the HKO PSR raw value over the percentage', () => {
    const data = makeData();
    data.current.precipitationProbabilityRaw = 'Medium Low';
    expect(buildWidgetPayload(data, t, now).rain).toBe('💧 Medium Low');
  });

  it('maps WMO code and isDay to an icon', () => {
    const p = buildWidgetPayload(makeData(), t, now);
    expect(p.icon).not.toBe('');
  });

  it('resolves condition through the HKO headline path when active', () => {
    const data = makeData({ headline: { source: 'hko', hkoIconCode: 63 } });
    const p = buildWidgetPayload(data, t, now);
    expect(p.condition).toContain('hko.desc.');
  });

  it('resolves condition through the WMO path otherwise', () => {
    const p = buildWidgetPayload(makeData(), t, now);
    expect(p.condition).toContain('weather.');
  });

  it('shows today-in-the-past sunrise as tomorrow, with lead time', () => {
    const p = buildWidgetPayload(makeData(), t, now);
    // now is 09:00 — today's sunrise passed, next is tomorrow 06:33
    expect(p.sunrise).toBe('06:33');
    expect(p.sunriseIn).toBe('sun.inHoursMinutes');
    // sunset is still ahead today
    expect(p.sunset).toBe('18:04');
    expect(p.sunsetIn).toBe('sun.inHoursMinutes');
  });

  it('skips epoch-0 sentinel sun times from the HKO fallback', () => {
    const data = makeData();
    data.daily[0].sunrise = new Date(0);
    data.daily[1].sunrise = new Date(0);
    const p = buildWidgetPayload(data, t, now);
    expect(p.sunrise).toBe('');
    expect(p.sunriseIn).toBe('');
  });

  it('drops cancelled warnings and badges the first active one', () => {
    const data = makeData();
    data.warnings = [warning('WRAIN'), { ...warning('TC8'), actionCode: 'CANCEL' }];
    const p = buildWidgetPayload(data, t, now);
    expect(p.warning).toBe('widget.badge.WRAIN');
    expect(p.warningUrgent).toBe(false);
  });

  it('uses the TC shorthand and urgent tone for signal no. 8', () => {
    const data = makeData();
    data.warnings = [warning('TC8NE', 'No. 8 Northeast Gale or Storm Signal')];
    const p = buildWidgetPayload(data, t, now);
    expect(p.warning).toBe('T8');
    expect(p.warningUrgent).toBe(true);
  });

  it('falls back to the warning name for unmapped codes', () => {
    const data = makeData();
    data.warnings = [warning('WFIRE', 'Fire Danger Warning')];
    expect(buildWidgetPayload(data, t, now).warning).toBe('Fire');
  });

  it('leaves the warning empty when none are active', () => {
    const p = buildWidgetPayload(makeData(), t, now);
    expect(p.warning).toBe('');
    expect(p.warningUrgent).toBe(false);
  });

  it('stamps the update time under the widget.updated key', () => {
    const p = buildWidgetPayload(makeData(), t, now);
    expect(p.updatedAt).toBe('widget.updated');
  });
});
