import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildWidgetPayload,
  loadWarningIconImage,
  syncWeatherWidget,
} from './widget-bridge';
import type { WeatherData } from '@/lib/weather';
import type { HKOWarning } from '@/lib/hko-types';

const { saveMock } = vi.hoisted(() => ({ saveMock: vi.fn() }));

// syncWeatherWidget no-ops off-native; force the native path so the
// bridge orchestration (icon render → save) is testable in jsdom.
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => ({ save: saveMock }),
}));

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
    const p = buildWidgetPayload(makeData(), t, 'metric', now);
    expect(p.temperature).toBe('26°');
    expect(p.rain).toBe('💧 45%');
  });

  it('prefers the HKO PSR raw value over the percentage', () => {
    const data = makeData();
    data.current.precipitationProbabilityRaw = 'Medium Low';
    expect(buildWidgetPayload(data, t, 'metric', now).rain).toBe('💧 Medium Low');
  });

  it('maps WMO code and isDay to an icon', () => {
    const p = buildWidgetPayload(makeData(), t, 'metric', now);
    // WMO 61 (rain), daytime → the rain emoji from getWeatherIcon
    expect(p.icon).toBe('🌧️');
  });

  it('resolves condition through the HKO headline path when active', () => {
    const data = makeData({ headline: { source: 'hko', hkoIconCode: 63 } });
    const p = buildWidgetPayload(data, t, 'metric', now);
    expect(p.condition).toContain('hko.desc.');
  });

  it('resolves condition through the WMO path otherwise', () => {
    const p = buildWidgetPayload(makeData(), t, 'metric', now);
    expect(p.condition).toContain('weather.');
  });

  it('shows today-in-the-past sunrise as tomorrow, with lead time', () => {
    const p = buildWidgetPayload(makeData(), t, 'metric', now);
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
    const p = buildWidgetPayload(data, t, 'metric', now);
    expect(p.sunrise).toBe('');
    expect(p.sunriseIn).toBe('');
  });

  it('drops cancelled warnings and badges the first active one', () => {
    const data = makeData();
    data.warnings = [warning('WRAINA'), { ...warning('TC8'), actionCode: 'CANCEL' }];
    const p = buildWidgetPayload(data, t, 'metric', now);
    expect(p.warning).toBe('widget.badge.WRAINA');
    expect(p.warningUrgent).toBe(false);
  });

  it('uses the TC shorthand and urgent tone for signal no. 8', () => {
    const data = makeData();
    data.warnings = [warning('TC8NE', 'No. 8 Northeast Gale or Storm Signal')];
    const p = buildWidgetPayload(data, t, 'metric', now);
    expect(p.warning).toBe('T8');
    expect(p.warningUrgent).toBe(true);
  });

  it('uses translated shorthands for common non-TC warnings', () => {
    const data = makeData();
    data.warnings = [warning('WTS', 'Thunderstorm Warning')];
    expect(buildWidgetPayload(data, t, 'metric', now).warning).toBe('widget.badge.WTS');
  });

  it('marks red fire danger urgent via its real warnsum code', () => {
    const data = makeData();
    data.warnings = [warning('WFIRER', 'Fire Danger Warning (Red)')];
    const p = buildWidgetPayload(data, t, 'metric', now);
    expect(p.warning).toBe('widget.badge.WFIRER');
    expect(p.warningUrgent).toBe(true);
  });

  it('defaults sun clocks to Hong Kong time on the HKO fallback path', () => {
    // HKO path carries no WeatherData.timezone; sunrise given in UTC must
    // render in Asia/Hong_Kong (+8), independent of the runner's zone.
    const data = makeData({ headline: { source: 'hko', hkoIconCode: 60 } });
    data.daily[0].sunrise = new Date('2026-10-21T22:33:00Z'); // 06:33 HKT Oct 22
    const p = buildWidgetPayload(data, t, 'metric', now);
    expect(p.sunrise).toBe('06:33');
  });

  it('falls back to the warning name for unmapped codes', () => {
    const data = makeData();
    data.warnings = [warning('XYZZY', 'Mystery Warning')];
    expect(buildWidgetPayload(data, t, 'metric', now).warning).toBe('Mystery');
  });

  it('leaves the warning empty when none are active', () => {
    const p = buildWidgetPayload(makeData(), t, 'metric', now);
    expect(p.warning).toBe('');
    expect(p.warningUrgent).toBe(false);
  });

  it('stamps the update time under the widget.updated key', () => {
    const p = buildWidgetPayload(makeData(), t, 'metric', now);
    expect(p.updatedAt).toBe('widget.updated');
  });

  it("converts temperature to the user's unit system", () => {
    // 26.4 °C → 80 °F
    expect(buildWidgetPayload(makeData(), t, 'us', now).temperature).toBe('80°');
  });
});

describe('syncWeatherWidget', () => {
  beforeEach(() => {
    saveMock.mockReset();
    saveMock.mockResolvedValue(undefined);
  });

  const now = new Date('2026-10-21T09:00:00');
  const savedPayload = () => JSON.parse(saveMock.mock.calls[0][0].payload);

  it('does not render an icon for codes without a real mapping', async () => {
    // getWarningIcon would fall back to the generic ts.gif — the guard must
    // send these to the text badge instead.
    await expect(loadWarningIconImage('XYZZY')).resolves.toBeUndefined();
  });

  it('drops an older sync whose icon render finishes after a newer one', async () => {
    let releaseSlow!: (value: string | undefined) => void;
    const slowGate = new Promise<string | undefined>(resolve => {
      releaseSlow = resolve;
    });
    const staleData = makeData();
    staleData.warnings = [warning('WRAINA')];
    syncWeatherWidget(staleData, t, 'metric', now, () => slowGate);

    const newerData = makeData();
    newerData.current.temperature = 30;
    syncWeatherWidget(newerData, t, 'metric', now, async () => undefined);

    await vi.waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    releaseSlow(undefined);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(savedPayload().temperature).toBe('30°');
  });

  it('hands the rendered warning icon to the bridge when a warning is active', async () => {
    const data = makeData();
    data.warnings = [warning('WRAINA')];
    syncWeatherWidget(data, t, 'metric', now, async () => 'data:image/png;base64,AAA');
    await vi.waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(savedPayload().warningIcon).toBe('data:image/png;base64,AAA');
  });

  it('falls back to the text badge when icon rendering fails', async () => {
    const data = makeData();
    data.warnings = [warning('WRAINA')];
    syncWeatherWidget(data, t, 'metric', now, async () => undefined);
    await vi.waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    const payload = savedPayload();
    expect(payload.warningIcon).toBeUndefined();
    expect(payload.warning).toBe('widget.badge.WRAINA');
  });

  it('does not attempt icon rendering without an active warning', async () => {
    const loader = vi.fn(async () => 'data:image/png;base64,AAA');
    syncWeatherWidget(makeData(), t, 'metric', now, loader);
    await vi.waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(loader).not.toHaveBeenCalled();
  });
});
