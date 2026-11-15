import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  WIDGET_SCHEMA,
  buildWidgetPayload,
  loadWarningIconImage,
  syncWeatherWidget,
} from './widget-bridge';
import { getSunTimes } from '@/lib/solar-times';
import type { WeatherData } from '@/lib/weather';
import type { HKOWarning } from '@/lib/hko-types';

const { saveMock } = vi.hoisted(() => ({ saveMock: vi.fn() }));

// syncWeatherWidget no-ops off-native; force the native path so the
// bridge orchestration (icon render → save) is testable in jsdom.
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
  registerPlugin: () => ({ save: saveMock }),
}));

/** Identity-style translator: always passes the key through, so tests can
 *  assert on the exact translation keys the payload builder resolves. */
const t = (key: string) => key;

// HK coordinates — the widget's sun cell now computes locally (solar-times),
// so tests pin the published reference day 2026-11-15 (sunrise 06:35 / sunset
// 17:40 HKT, locked by solar-times.test.ts against timeanddate.com).
const HK = { latitude: 22.319, longitude: 114.169 };
const fmtHkt = (d: Date): string =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Hong_Kong',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);

function makeData(overrides: Partial<WeatherData> = {}): WeatherData {
  const now = new Date('2026-11-15T01:00:00Z'); // 09:00 HKT
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
      },
      {
        date: new Date('2026-11-16T00:00:00Z'),
        temperatureMax: 28,
        temperatureMin: 24,
        weatherCode: 3,
        windSpeedMax: 18,
        windDirectionDominant: 90,
        precipitationProbabilityMax: 40,
      },
    ],
    timezone: 'Asia/Hong_Kong',
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
  const now = new Date('2026-11-15T01:00:00Z'); // 09:00 HKT

  it('leads with the feels-like temperature and formats rain probability', () => {
    const p = buildWidgetPayload(makeData(), t, 'metric', now);
    // apparentTemperature 30, not the 26.4 measured value
    expect(p.temperature).toBe('30°');
    expect(p.rain).toBe('💧 45%');
  });

  it('prefers the HKO PSR raw value over the percentage', () => {
    const data = makeData();
    data.current.precipitationProbabilityRaw = 'Medium Low';
    expect(buildWidgetPayload(data, t, 'metric', now).rain).toBe('💧 Medium Low');
  });

  it('raises the umbrella with the absolute start time when rain is expected', () => {
    const data = makeData();
    // minutely windows end at `time`: 0.5 mm in (09:15, 09:30] → rain from 09:15.
    // Absolute clock, not "in 15m" — the widget cannot tick between syncs.
    data.minutely = [{ time: new Date('2026-11-15T01:30:00Z'), precipitation: 0.5 }];
    const p = buildWidgetPayload(data, t, 'metric', now);
    expect(p.rain).toBe('☂️ 09:15');
    expect(p.rainIcon).toBe('☂️');
  });

  it('raises the umbrella when the current window is already wet', () => {
    const data = makeData();
    data.minutely = [{ time: new Date('2026-11-15T01:10:00Z'), precipitation: 0.5 }];
    expect(buildWidgetPayload(data, t, 'metric', now).rain).toBe('☂️ sun.now');
  });

  it('keeps the probability cell when the series is dry', () => {
    const data = makeData();
    data.minutely = [{ time: new Date('2026-11-15T01:30:00Z'), precipitation: 0 }];
    expect(buildWidgetPayload(data, t, 'metric', now).rain).toBe('💧 45%');
  });

  it('carries the bare verdict glyph for the alerts-only widget', () => {
    // Dry: droplet, not umbrella. The glyph must exist even when `rain`'s
    // text half is empty-capable (empty PSR), so the alerts widget never
    // renders a blank cell.
    const dry = buildWidgetPayload(makeData(), t, 'metric', now);
    expect(dry.rainIcon).toBe('💧');
    const wet = makeData();
    wet.minutely = [{ time: new Date('2026-11-15T01:10:00Z'), precipitation: 0.5 }];
    expect(buildWidgetPayload(wet, t, 'metric', now).rainIcon).toBe('☂️');
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

  it('shows the coming sunset during the day (published reference time)', () => {
    const p = buildWidgetPayload(makeData(), t, 'metric', now, HK);
    // 09:00 HKT and isDay — today's 17:40 sunset (timeanddate 2026-11-15) is ahead
    expect(p.sunTime).toBe('🌇 17:40');
    expect(p.sunIn).toBe('sun.inHoursMinutes');
  });

  it("shows the next sunrise at night, rolling to tomorrow once today's passed", () => {
    const data = makeData();
    data.current.isDay = false;
    const p = buildWidgetPayload(data, t, 'metric', now, HK);
    // today's 06:35 sunrise already passed at 09:00 → tomorrow's sunrise
    const tomorrow = getSunTimes(HK.latitude, HK.longitude, new Date('2026-11-16T01:00:00Z'), 480);
    expect(p.sunTime).toBe(`🌅 ${fmtHkt(tomorrow.sunrise!)}`);
    expect(p.sunIn).toBe('sun.inHoursMinutes');
  });

  it('leaves the sun cell empty without a location (no city selected)', () => {
    const p = buildWidgetPayload(makeData(), t, 'metric', now);
    expect(p.sunTime).toBe('');
    expect(p.sunIn).toBe('');
  });

  it('leaves the sun cell empty in polar night (no sun events)', () => {
    const p = buildWidgetPayload(
      makeData(),
      t,
      'metric',
      new Date('2026-12-21T11:00:00Z'), // 12:00 CET — Tromsø polar night
      { latitude: 69.649, longitude: 18.955 },
    );
    expect(p.sunTime).toBe('');
    expect(p.sunIn).toBe('');
  });

  it('drops cancelled warnings and carries every active one', () => {
    const data = makeData();
    data.warnings = [
      warning('WRAINA'),
      { ...warning('TC8'), actionCode: 'CANCEL' },
      warning('WTS', 'Thunderstorm Warning'),
    ];
    const p = buildWidgetPayload(data, t, 'metric', now);
    expect(p.warnings.map(w => w.badge)).toEqual(['widget.badge.WRAINA', 'widget.badge.WTS']);
    expect(p.warnings[0].urgent).toBe(false);
  });

  it('uses the TC shorthand and urgent tone for signal no. 8', () => {
    const data = makeData();
    data.warnings = [warning('TC8NE', 'No. 8 Northeast Gale or Storm Signal')];
    const p = buildWidgetPayload(data, t, 'metric', now);
    expect(p.warnings[0].badge).toBe('T8');
    expect(p.warnings[0].urgent).toBe(true);
  });

  it('carries all active warnings, urgent ones first with feed order kept', () => {
    const data = makeData();
    data.warnings = [
      warning('WRAINA'),
      warning('TC8NE', 'No. 8 Northeast Gale or Storm Signal'),
      warning('WTS', 'Thunderstorm Warning'),
      warning('WFIRER', 'Fire Danger Warning (Red)'),
    ];
    const p = buildWidgetPayload(data, t, 'metric', now);
    expect(p.warnings.map(w => w.code)).toEqual(['TC8NE', 'WFIRER', 'WRAINA', 'WTS']);
    expect(p.warnings.every(w => w.urgent === ['TC8NE', 'WFIRER'].includes(w.code))).toBe(true);
  });

  it('uses translated shorthands for common non-TC warnings', () => {
    const data = makeData();
    data.warnings = [warning('WTS', 'Thunderstorm Warning')];
    expect(buildWidgetPayload(data, t, 'metric', now).warnings[0].badge).toBe('widget.badge.WTS');
  });

  it('marks red fire danger urgent via its real warnsum code', () => {
    const data = makeData();
    data.warnings = [warning('WFIRER', 'Fire Danger Warning (Red)')];
    const p = buildWidgetPayload(data, t, 'metric', now);
    expect(p.warnings[0].badge).toBe('widget.badge.WFIRER');
    expect(p.warnings[0].urgent).toBe(true);
  });

  it('defaults sun clocks to Hong Kong time on the HKO fallback path', () => {
    // HKO path carries no WeatherData.timezone; the solar math must use
    // Asia/Hong_Kong (+8) for the local calendar day, independent of the
    // runner's zone. Same coords as the reference test → same published time.
    const data = makeData({ headline: { source: 'hko', hkoIconCode: 60 }, timezone: undefined });
    const p = buildWidgetPayload(data, t, 'metric', now, HK);
    expect(p.sunTime).toBe('🌇 17:40');
  });

  it('falls back to the warning name for unmapped codes', () => {
    const data = makeData();
    data.warnings = [warning('XYZZY', 'Mystery Warning')];
    expect(buildWidgetPayload(data, t, 'metric', now).warnings[0].badge).toBe('Mystery');
  });

  it('carries no warnings when none are active', () => {
    const p = buildWidgetPayload(makeData(), t, 'metric', now);
    expect(p.warnings).toEqual([]);
  });

  it('stamps the update time under the widget.updated key', () => {
    const p = buildWidgetPayload(makeData(), t, 'metric', now);
    expect(p.updatedAt).toBe('widget.updated');
  });

  it("converts temperature to the user's unit system", () => {
    // 30 °C feels-like → 86 °F
    expect(buildWidgetPayload(makeData(), t, 'us', now).temperature).toBe('86°');
  });
});

// The native renderer refuses any payload whose schema differs (a payload
// left over from a previous build renders as the "open the app" hint, not
// as half-blank cells). These keep the three places the number lives —
// TS constant, Java constant, emulator fixtures — from drifting apart.
describe('widget schema lockstep', () => {
  const root = join(__dirname, '..', '..');

  it('stamps every payload with the current schema', () => {
    expect(buildWidgetPayload(makeData(), t, 'metric', new Date()).schema).toBe(WIDGET_SCHEMA);
  });

  it('matches WeatherWidgetPlugin.SCHEMA on the Android side', () => {
    const java = readFileSync(
      join(root, 'android/app/src/main/java/com/weatherwhisperer/app/WeatherWidgetPlugin.java'),
      'utf8'
    );
    const match = java.match(/static final int SCHEMA = (\d+);/);
    expect(match, 'SCHEMA constant missing from WeatherWidgetPlugin.java').not.toBeNull();
    expect(Number(match![1])).toBe(WIDGET_SCHEMA);
  });

  it('keeps the emulator fixtures on the current schema with known keys only', () => {
    const dir = join(root, 'scripts/emu/fixtures');
    const knownKeys = new Set(Object.keys(buildWidgetPayload(makeData(), t, 'metric', new Date())));
    const fixtures = readdirSync(dir).filter(f => f.endsWith('.json'));
    expect(fixtures.length).toBeGreaterThan(0);
    for (const file of fixtures) {
      const payload = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Record<string, unknown>;
      // The one deliberate exception: the pre-schema payload that must
      // render as the empty hint.
      if (file === 'old-schema-v1.json') {
        expect(payload.schema).toBeUndefined();
        continue;
      }
      expect(payload.schema, file).toBe(WIDGET_SCHEMA);
      for (const key of Object.keys(payload)) {
        expect(knownKeys.has(key), `${file}: unknown key "${key}"`).toBe(true);
      }
    }
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

  it('gives up on an icon that never settles instead of blocking the save', async () => {
    // jsdom never fires Image load events — exactly the hang the timeout
    // guards against; without it the whole widget save would be skipped.
    await expect(loadWarningIconImage('WRAINA', 48, 20)).resolves.toBeUndefined();
  });

  it('drops an older sync whose icon render finishes after a newer one', async () => {
    let releaseSlow!: (value: string | undefined) => void;
    const slowGate = new Promise<string | undefined>(resolve => {
      releaseSlow = resolve;
    });
    const staleData = makeData();
    staleData.warnings = [warning('WRAINA')];
    syncWeatherWidget(staleData, t, 'metric', now, undefined, () => slowGate);

    const newerData = makeData();
    newerData.current.apparentTemperature = 35;
    syncWeatherWidget(newerData, t, 'metric', now, undefined, async () => undefined);

    await vi.waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    releaseSlow(undefined);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(savedPayload().temperature).toBe('35°');
  });

  it('hands the rendered warning icon to the bridge when a warning is active', async () => {
    const data = makeData();
    data.warnings = [warning('WRAINA')];
    syncWeatherWidget(data, t, 'metric', now, undefined, async () => 'data:image/png;base64,AAA');
    await vi.waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(savedPayload().warnings[0].icon).toBe('data:image/png;base64,AAA');
  });

  it('renders an icon for each active warning onto its own cell', async () => {
    const data = makeData();
    data.warnings = [warning('WRAINA'), warning('TC8NE', 'No. 8 Northeast Gale or Storm Signal')];
    syncWeatherWidget(data, t, 'metric', now, undefined, async code => `data:image/png;base64,${code}`);
    await vi.waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    const warnings = savedPayload().warnings as Array<{ code: string; icon?: string }>;
    // Urgent first: TC8NE leads, WRAINA trails — icons land on their own cell.
    expect(warnings.map(w => w.code)).toEqual(['TC8NE', 'WRAINA']);
    expect(warnings.map(w => w.icon)).toEqual([
      'data:image/png;base64,TC8NE',
      'data:image/png;base64,WRAINA',
    ]);
  });

  it('falls back to the text badge when icon rendering fails', async () => {
    const data = makeData();
    data.warnings = [warning('WRAINA')];
    syncWeatherWidget(data, t, 'metric', now, undefined, async () => undefined);
    await vi.waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    const payload = savedPayload();
    expect(payload.warnings[0].icon).toBeUndefined();
    expect(payload.warnings[0].badge).toBe('widget.badge.WRAINA');
  });

  it('does not attempt icon rendering without an active warning', async () => {
    const loader = vi.fn(async () => 'data:image/png;base64,AAA');
    syncWeatherWidget(makeData(), t, 'metric', now, undefined, loader);
    await vi.waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(loader).not.toHaveBeenCalled();
  });
});
