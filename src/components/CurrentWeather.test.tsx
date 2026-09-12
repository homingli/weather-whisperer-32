import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { CurrentWeather } from './CurrentWeather';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { UnitsProvider, useUnits } from '@/contexts/UnitsContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { CurrentWeather as CurrentWeatherType, HourlyForecast as HourlyForecastType, DailyForecast as DailyForecastType } from '@/lib/weather';

const mockWeather: CurrentWeatherType = {
  temperature: 20,
  apparentTemperature: 18,
  humidity: 60,
  uvIndex: 5,
  weatherCode: 0,
  windSpeed: 25,
  windDirection: 180,
  precipitation: 0,
  precipitationProbability: 0,
  isDay: true,
};

const mockHourly: HourlyForecastType[] = Array(24).fill(0).map((_, i) => ({
  time: new Date(2024, 0, 8, i),
  temperature: 20,
  weatherCode: 0,
  windSpeed: 25,
  windDirection: 180,
  precipitationProbability: 0,
  precipitation: 0,
  isDay: true,
}));

describe('CurrentWeather Component', () => {
  beforeEach(() => {
    // LocalClock moved out of this card; the per-second timer is no longer
    // the concern of CurrentWeather. See LocalClock.test.tsx for the
    // timezone / ticking behaviour.
    vi.useFakeTimers();
    // Reset the units preference so tests start in metric mode. The
    // localStorage mock persists across tests in the same file otherwise.
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderWithLanguage = (ui: React.ReactElement) => {
    return render(
      <LanguageProvider>
        <UnitsProvider>
          {ui}
        </UnitsProvider>
      </LanguageProvider>
    );
  };

  it('renders hero temperature with bare ° by default (metric)', () => {
    // Hero shows "18°" — the unit context (°C vs °F) is implicit from the
    // temperature caption below and the menu selection.
    renderWithLanguage(
      <CurrentWeather
        weather={mockWeather}
        hourlyForecast={mockHourly}
        timezone="UTC"
        headline={{ source: 'om' }}
      />
    );
    expect(screen.getByText('18°')).toBeInTheDocument();
  });

  it('renders hero temperature with bare ° in us mode (Fahrenheit)', () => {
    function UnitProbe() {
      const { setUnits } = useUnits();
      return (
        <button data-testid="flip-us" onClick={() => setUnits('us')}>flip</button>
      );
    }
    render(
      <LanguageProvider>
        <UnitsProvider>
          <UnitProbe />
          <CurrentWeather
            weather={mockWeather}
            hourlyForecast={mockHourly}
            timezone="UTC"
            headline={{ source: 'om' }}
          />
        </UnitsProvider>
      </LanguageProvider>
    );
    act(() => {
      screen.getByTestId('flip-us').click();
    });
    // 18°C = 64.4°F → rounds to 64°
    expect(screen.getByText('64°')).toBeInTheDocument();
  });

  it('renders wind speed label in km/h by default and mph in us mode', () => {
    // windSpeed: 10 km/h → "10" with "km/h" label. In us → 10 * 0.621371 ≈ 6 mph.
    const { rerender, container } = renderWithLanguage(
      <CurrentWeather
        weather={mockWeather}
        hourlyForecast={mockHourly}
        timezone="UTC"
        headline={{ source: 'om' }}
      />
    );
    // Container text contains "km/h" for the wind unit label (and possibly
    // other places, but at minimum the wind speed row).
    expect(container.textContent).toContain('km/h');

    function FlipProbe() {
      const { setUnits } = useUnits();
      return <button data-testid="flip-us-2" onClick={() => setUnits('us')}>flip</button>;
    }
    rerender(
      <LanguageProvider>
        <UnitsProvider>
          <FlipProbe />
          <CurrentWeather
            weather={mockWeather}
            hourlyForecast={mockHourly}
            timezone="UTC"
            headline={{ source: 'om' }}
          />
        </UnitsProvider>
      </LanguageProvider>
    );
    act(() => {
      screen.getByTestId('flip-us-2').click();
    });
    expect(container.textContent).toContain('mph');
    expect(container.textContent).not.toContain('km/h');
  });

  it('renders precipitation in mm by default and in inches in us mode', () => {
    const wetWeather = { ...mockWeather, precipitation: 5 }; // 5 mm
    const { rerender, container } = renderWithLanguage(
      <CurrentWeather
        weather={wetWeather}
        hourlyForecast={mockHourly}
        timezone="UTC"
        headline={{ source: 'om' }}
      />
    );
    // metric: "5.0" + "mm" label
    expect(container.textContent).toContain('5.0');
    expect(container.textContent).toContain('mm');

    function FlipProbe() {
      const { setUnits } = useUnits();
      return <button data-testid="flip-us-3" onClick={() => setUnits('us')}>flip</button>;
    }
    rerender(
      <LanguageProvider>
        <UnitsProvider>
          <FlipProbe />
          <CurrentWeather
            weather={wetWeather}
            hourlyForecast={mockHourly}
            timezone="UTC"
            headline={{ source: 'om' }}
          />
        </UnitsProvider>
      </LanguageProvider>
    );
    act(() => {
      screen.getByTestId('flip-us-3').click();
    });
    // 5 mm * 0.0393701 ≈ 0.1969 → "0.20" with "in"
    expect(container.textContent).toContain('0.20');
    expect(container.textContent).toContain('in');
  });

  it('precipitation band lookup is correct in US mode (5 mm lights 0.08–0.2 in, not 0.2–0.4 in)', () => {
    // Regression: bandIndex was previously computed against the metric
    // RAINFALL_BANDS array (5 mm step) and reused as the index into
    // RAINFALL_BANDS_US (0.2 in step). 5 mm = 0.197 in is in the
    // "0.08–0.2 in" band (index 1), not "0.2–0.4 in" (index 2).
    const wetWeather = { ...mockWeather, precipitation: 5 };
    function FlipProbe() {
      const { setUnits } = useUnits();
      return <button data-testid="flip-us-4" onClick={() => setUnits('us')}>flip</button>;
    }
    const { container } = render(
      <LanguageProvider>
        <UnitsProvider>
          <FlipProbe />
          <CurrentWeather
            weather={wetWeather}
            hourlyForecast={mockHourly}
            timezone="UTC"
            headline={{ source: 'om' }}
          />
        </UnitsProvider>
      </LanguageProvider>
    );
    act(() => {
      screen.getByTestId('flip-us-4').click();
    });
    // aria-label for the bar includes the band name.
    expect(container.querySelector('[aria-label*="0.08"]')).toBeTruthy();
    expect(container.querySelector('[aria-label*="0.2 – 0.4 in"]')).toBeNull();
  });

  it('uses exact sun timestamps in the sun strip after sunrise and when switching timezone/location', () => {
    vi.setSystemTime(new Date('2024-01-08T06:10:00Z'));
    const daily = (sunrise: Date | string, sunset: Date | string): DailyForecastType => ({
      date: new Date('2024-01-08T00:00:00Z'),
      temperatureMax: 20,
      temperatureMin: 10,
      weatherCode: 0,
      windSpeedMax: 10,
      windDirectionDominant: 180,
      precipitationProbabilityMax: 0,
      sunrise: sunrise as Date,
      sunset: sunset as Date,
    });
    const staleDay = { ...mockWeather, isDay: false };
    const { container, rerender } = renderWithLanguage(
      <CurrentWeather
        weather={staleDay}
        hourlyForecast={mockHourly}
        dailyForecast={daily(new Date('2024-01-08T06:00:00Z'), new Date('2024-01-08T18:00:00Z'))}
        timezone="UTC"
        headline={{ source: 'om' }}
      />
    );

    expect(container.textContent).toContain('Sunset');
    expect(container.textContent).toContain('in 11h 50m');
    expect(container.textContent).toContain('06:00 PM');

    rerender(
      <LanguageProvider>
        <UnitsProvider>
          <CurrentWeather
            weather={staleDay}
            hourlyForecast={mockHourly}
            dailyForecast={daily('2024-01-07T14:00:00Z', '2024-01-08T02:00:00Z')}
            tomorrowSunrise="2024-01-08T14:00:00Z"
            timezone="America/Los_Angeles"
            headline={{ source: 'om' }}
          />
        </UnitsProvider>
      </LanguageProvider>
    );

    expect(container.textContent).toContain('Sunrise');
    expect(container.textContent).toContain('in 7h 50m');
    expect(container.textContent).toContain('06:00 AM');
  });

  // ── Phase 3 + 5: HKO headline swap ───────────────────────────────────
  // The headline icon +
  // label swap to HKO-native phrasing when the `weather-manager` reports
  // `headline.source === 'hko'` with a valid `hkoIconCode`. The OM path
  // is unchanged.
  describe('HKO headline swap', () => {
    it('renders "Sunny" for hkoIconCode=50 (headline.source=hko)', () => {
      const { container } = renderWithLanguage(
        <CurrentWeather
          weather={mockWeather}
          hourlyForecast={mockHourly}
          timezone="UTC"
          headline={{ source: 'hko', hkoIconCode: 50 }}
        />
      );
      // Both the visible label and the aria-label on the icon read "Sunny".
      expect(container.textContent).toContain('Sunny');
      expect(container.querySelector('[aria-label="Sunny"]')).toBeTruthy();
    });

    it('renders "Humid" for hkoIconCode=82 (special state, no WMO equivalent)', () => {
      const { container } = renderWithLanguage(
        <CurrentWeather
          weather={mockWeather}
          hourlyForecast={mockHourly}
          timezone="UTC"
          headline={{ source: 'hko', hkoIconCode: 82 }}
        />
      );
      expect(container.textContent).toContain('Humid');
      expect(container.querySelector('[aria-label="Humid"]')).toBeTruthy();
    });

    it('renders "Clear" for hkoIconCode=70 (night variant renamed from "Fine")', () => {
      const { container } = renderWithLanguage(
        <CurrentWeather
          weather={mockWeather}
          hourlyForecast={mockHourly}
          timezone="UTC"
          headline={{ source: 'hko', hkoIconCode: 70 }}
        />
      );
      // Plan Decision 8: drop HKO's "Fine" in favour of natural English.
      expect(container.textContent).toContain('Clear');
      expect(container.textContent).not.toContain('Fine');
      expect(container.querySelector('[aria-label="Clear"]')).toBeTruthy();
    });

    it('renders "Hot" for hkoIconCode=90 (temperature state, no WMO equivalent)', () => {
      const { container } = renderWithLanguage(
        <CurrentWeather
          weather={mockWeather}
          hourlyForecast={mockHourly}
          timezone="UTC"
          headline={{ source: 'hko', hkoIconCode: 90 }}
        />
      );
      expect(container.textContent).toContain('Hot');
      expect(container.querySelector('[aria-label="Hot"]')).toBeTruthy();
    });

    it('falls through to the WMO path when headline.source is "om"', () => {
      // mockWeather.weatherCode = 0 → "Clear sky". Verifies the OM path
      // still works after the refactor.
      const { container } = renderWithLanguage(
        <CurrentWeather
          weather={mockWeather}
          hourlyForecast={mockHourly}
          timezone="UTC"
          headline={{ source: 'om' }}
        />
      );
      expect(container.textContent).toContain('Clear sky');
      expect(container.querySelector('[aria-label="Clear sky"]')).toBeTruthy();
    });

    it('falls through to the WMO path when source is "hko" but hkoIconCode is null (degraded)', () => {
      // Defensive: weather-manager only writes source=hko when icon[0] is
      // a finite non-9999 integer, but consumers shouldn't crash if a
      // malformed payload arrives. Verify the OM path still renders.
      const { container } = renderWithLanguage(
        <CurrentWeather
          weather={mockWeather}
          hourlyForecast={mockHourly}
          timezone="UTC"
          headline={{ source: 'hko', hkoIconCode: null }}
        />
      );
      expect(container.textContent).toContain('Clear sky');
    });
  });

  // ── Phase 4: TC locale render parity ────────────────────────────────
  // The hko.desc.* keys must produce natural HK Traditional Chinese on the
  // headline. Tests assert the seeded TC values resolve under language='tc'.
  describe('TC locale render', () => {
    it('renders "天晴" (sunny) when the HKO headline is active and language is tc', () => {
      function LangProbe() {
        const { setLanguage } = useLanguage();
        return <button data-testid="flip-tc" onClick={() => setLanguage('tc')}>tc</button>;
      }
      const { container } = render(
        <LanguageProvider>
          <UnitsProvider>
            <LangProbe />
            <CurrentWeather
              weather={mockWeather}
              hourlyForecast={mockHourly}
              timezone="UTC"
              headline={{ source: 'hko', hkoIconCode: 50 }}
            />
          </UnitsProvider>
        </LanguageProvider>
      );
      act(() => {
        screen.getByTestId('flip-tc').click();
      });
      expect(container.textContent).toContain('天晴');
      expect(container.querySelector('[aria-label="天晴"]')).toBeTruthy();
    });

    it('renders "潮濕" (humid) for the special-state code 82 under tc', () => {
      function LangProbe() {
        const { setLanguage } = useLanguage();
        return <button data-testid="flip-tc-2" onClick={() => setLanguage('tc')}>tc</button>;
      }
      const { container } = render(
        <LanguageProvider>
          <UnitsProvider>
            <LangProbe />
            <CurrentWeather
              weather={mockWeather}
              hourlyForecast={mockHourly}
              timezone="UTC"
              headline={{ source: 'hko', hkoIconCode: 82 }}
            />
          </UnitsProvider>
        </LanguageProvider>
      );
      act(() => {
        screen.getByTestId('flip-tc-2').click();
      });
      expect(container.textContent).toContain('潮濕');
      expect(container.querySelector('[aria-label="潮濕"]')).toBeTruthy();
    });

    it('renders the night clear (70) as "天晴" under tc, not the English "Fine" wording', () => {
      // Plan Decision 8: drop "Fine". Under TC the parallel to "Sunny" is
      // also 天晴 — HKO uses the same character in both halves; the day/night
      // distinction is encoded in the lucide icon (Sun ↔ Moon), not in the
      // Chinese label.
      function LangProbe() {
        const { setLanguage } = useLanguage();
        return <button data-testid="flip-tc-3" onClick={() => setLanguage('tc')}>tc</button>;
      }
      const { container } = render(
        <LanguageProvider>
          <UnitsProvider>
            <LangProbe />
            <CurrentWeather
              weather={mockWeather}
              hourlyForecast={mockHourly}
              timezone="UTC"
              headline={{ source: 'hko', hkoIconCode: 70 }}
            />
          </UnitsProvider>
        </LanguageProvider>
      );
      act(() => {
        screen.getByTestId('flip-tc-3').click();
      });
      expect(container.textContent).toContain('天晴');
    });

    it('localizes the UV band label under tc (uv 9 → 甚高, not "Very High")', () => {
      // Regression: the UV chip used to render English band labels ("LOW" /
      // "MODERATE" / …) regardless of the active language. uv 9 sits in the
      // "Very High" band (8–10), a string unique enough to assert cleanly.
      function LangProbe() {
        const { setLanguage } = useLanguage();
        return <button data-testid="flip-tc-uv" onClick={() => setLanguage('tc')}>tc</button>;
      }
      const { container } = render(
        <LanguageProvider>
          <UnitsProvider>
            <LangProbe />
            <CurrentWeather
              weather={{ ...mockWeather, uvIndex: 9 }}
              hourlyForecast={mockHourly}
              timezone="UTC"
              headline={{ source: 'om' }}
            />
          </UnitsProvider>
        </LanguageProvider>
      );
      act(() => {
        screen.getByTestId('flip-tc-uv').click();
      });
      expect(container.textContent).toContain('甚高');
      expect(container.textContent).not.toContain('Very High');
    });
  });

  // ── Quiet shelf: below-threshold metrics stay expanded ───────────────
  // Thresholds live in QUIET (src/lib/constants.ts). mockWeather defaults:
  // precip 0 → quiet, humidity 60 → quiet (inclusive band edge), uv 5 →
  // full widget, wind 10 → full widget.
  describe('quiet shelf', () => {
    const renderWeather = (weather: CurrentWeatherType) =>
      renderWithLanguage(
        <CurrentWeather
          weather={weather}
          hourlyForecast={mockHourly}
          timezone="UTC"
          headline={{ source: 'om' }}
        />
      );

    it('shows below-threshold metrics expanded; the rest stay full widgets', () => {
      const { container } = renderWeather(mockWeather);
      expect(screen.getByTestId('quiet-precip')).toBeInTheDocument();
      expect(screen.getByTestId('quiet-humidity')).toBeInTheDocument();
      expect(screen.queryByTestId('quiet-uv')).toBeNull();
      expect(screen.queryByTestId('quiet-wind')).toBeNull();
      // Full UvChip still renders (uv 5 → "Moderate" band label).
      expect(container.textContent).toContain('Moderate');
      // Expanded values are visible and remain labelled for assistive tech.
      expect(screen.getByTestId('quiet-precip')).toHaveAttribute('aria-label', 'Precip.: 0.0 mm');
      expect(screen.getByTestId('quiet-humidity')).toHaveAttribute('aria-label', 'Humidity: 60%');
      expect(screen.getByTestId('quiet-precip')).toHaveTextContent('Precip. 0.0 mm');
    });

    it('renders the shelf alone when every metric is quiet (grid hidden)', () => {
      const calm = { ...mockWeather, uvIndex: 2, humidity: 45, windSpeed: 2 };
      const { container } = renderWeather(calm);
      expect(screen.getByTestId('quiet-precip')).toBeInTheDocument();
      expect(screen.getByTestId('quiet-uv')).toBeInTheDocument();
      expect(screen.getByTestId('quiet-humidity')).toBeInTheDocument();
      expect(screen.getByTestId('quiet-wind')).toBeInTheDocument();
      expect(screen.getByTestId('quiet-uv')).toHaveAttribute('aria-label', 'UV Index: 2.0');
      expect(screen.getByTestId('quiet-wind')).toHaveAttribute('aria-label', 'Wind: 2 km/h');
      // No full widgets: the WindCompass arrow (aria-labelled "Wind direction
      // toward …") is the most distinctive full-widget marker.
      expect(container.querySelector('[aria-label^="Wind direction toward"]')).toBeNull();
    });

    it('treats boundary values as needing attention (uv 3, wind 20, humidity outside 30–60)', () => {
      const boundary = { ...mockWeather, uvIndex: 3, humidity: 29, windSpeed: 20 };
      renderWeather(boundary);
      expect(screen.queryByTestId('quiet-uv')).toBeNull();
      expect(screen.queryByTestId('quiet-humidity')).toBeNull();
      expect(screen.queryByTestId('quiet-wind')).toBeNull();
      // precip 0 is still quiet.
      expect(screen.getByTestId('quiet-precip')).toBeInTheDocument();
    });

    it('empty data keeps the legacy 4-widget grid with dashes and no shelf', () => {
      const empty: CurrentWeatherType = {
        temperature: -999,
        apparentTemperature: -999,
        humidity: -999,
        uvIndex: null,
        weatherCode: 0,
        windSpeed: -999,
        windDirection: 0,
        precipitation: -999,
        precipitationProbability: -999,
        isDay: true,
      };
      const { container } = renderWeather(empty);
      expect(screen.queryByTestId('quiet-precip')).toBeNull();
      expect(screen.queryByTestId('quiet-uv')).toBeNull();
      expect(screen.queryByTestId('quiet-humidity')).toBeNull();
      expect(screen.queryByTestId('quiet-wind')).toBeNull();
      expect(container.textContent).toContain('—');
    });

    it('keeps quiet values visible without hover state', () => {
      renderWeather(mockWeather);
      const precip = screen.getByTestId('quiet-precip');
      expect(precip).toHaveTextContent('Precip. 0.0 mm');
      expect(precip).not.toHaveAttribute('aria-expanded');
    });
  });

  // ── Temperature caption: H/L + 3h trend (replaces the range bar) ────
  // The old full-width range bar (low ─ current ─ high with a position
  // marker) is gone. In its place one muted line under the hero: today's
  // high/low plus the air-temperature trend from the current hour to ~3h
  // later ("3° warmer by 03:00 PM"). Flat within a whole degree renders a
  // dash rather than a bogus "0°" claim.
  describe('temperature caption', () => {
    // Hourly temps on 2024-01-08, expressed as UTC instants so the
    // "by {time}" readout is deterministic under timezone="UTC" regardless
    // of the test runner's local timezone.
    const hourlyFrom = (temps: number[], startHourUtc: number): HourlyForecastType[] =>
      temps.map((temp, i) => ({
        ...mockHourly[0],
        time: new Date(Date.UTC(2024, 0, 8, startHourUtc + i)),
        temperature: temp,
      }));
    const dayWithRange = (min: number, max: number): DailyForecastType => ({
      date: new Date(Date.UTC(2024, 0, 8)),
      temperatureMax: max,
      temperatureMin: min,
      weatherCode: 0,
      windSpeedMax: 10,
      windDirectionDominant: 180,
      precipitationProbabilityMax: 0,
      // Epoch-0 sun times: toValidSunDate treats them as no-data, so the
      // sun strip stays hidden and the caption assertions stay unambiguous.
      sunrise: new Date(0),
      sunset: new Date(0),
    });
    const summaryCard = (props: Partial<React.ComponentProps<typeof CurrentWeather>> = {}) =>
      renderWithLanguage(
        <CurrentWeather
          weather={mockWeather}
          hourlyForecast={hourlyFrom([20, 21, 22, 23], 12)}
          dailyForecast={dayWithRange(10, 30)}
          timezone="UTC"
          headline={{ source: 'om' }}
          {...props}
        />
      );

    // Freeze "now" one hour before the fixture window (12:00 UTC) so the
    // trend guard (the +3h target must still be in the future, else the
    // payload is a stale persisted snapshot) passes deterministically.
    beforeEach(() => {
      vi.setSystemTime(new Date('2024-01-08T11:00:00Z'));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('shows today L/H and a warming trend against the +3h clock time', () => {
      summaryCard();
      const summary = screen.getByTestId('temp-summary');
      expect(summary).toHaveTextContent('H 30°C');
      expect(summary).toHaveTextContent('L 10°C');
      // hourly[0] = 20 °C, hourly[3] = 23 °C → 3° warmer. hourly[3] sits
      // at 15:00 UTC → "03:00 PM".
      expect(screen.getByTestId('temp-trend')).toHaveTextContent('3° warmer by 03:00 PM');
      // aria carries the same sentence for screen readers.
      expect(summary).toHaveAttribute('aria-label', 'L 10°C, H 30°C, 3° warmer by 03:00 PM');
    });

    it('converts the delta and H/L to whole degrees in us mode', () => {
      function FlipProbe() {
        const { setUnits } = useUnits();
        return <button data-testid="flip-us-caption" onClick={() => setUnits('us')}>flip</button>;
      }
      render(
        <LanguageProvider>
          <UnitsProvider>
            <FlipProbe />
            <CurrentWeather
              weather={mockWeather}
              hourlyForecast={hourlyFrom([20, 21, 22, 23], 12)}
              dailyForecast={dayWithRange(10, 30)}
              timezone="UTC"
              headline={{ source: 'om' }}
            />
          </UnitsProvider>
        </LanguageProvider>
      );
      act(() => {
        screen.getByTestId('flip-us-caption').click();
      });
      // 20 °C → 68 °F, 23 °C → 73 °F → 5° warmer; range 10–30 °C → 50–86 °F.
      expect(screen.getByTestId('temp-trend')).toHaveTextContent('5° warmer by 03:00 PM');
      const summary = screen.getByTestId('temp-summary');
      expect(summary).toHaveTextContent('H 86°F');
      expect(summary).toHaveTextContent('L 50°F');
    });

    it('shows a dash (not a bogus 0°) when the 3h trend is flat', () => {
      summaryCard({ hourlyForecast: hourlyFrom([20, 20, 20, 20], 12) });
      const summary = screen.getByTestId('temp-summary');
      // The dash is decorative; assistive tech gets the meaning both from
      // an sr-only "no change" copy and from the group's aria-label.
      expect(screen.getByTestId('temp-trend')).toHaveTextContent('–');
      expect(screen.getByTestId('temp-trend')).toHaveTextContent('no change');
      expect(screen.getByText('–')).toHaveAttribute('aria-hidden', 'true');
      expect(summary).toHaveAttribute('role', 'group');
      expect(summary).toHaveAccessibleName('L 10°C, H 30°C, no change');
      expect(summary.textContent).not.toContain('warmer');
    });

    it('shows a cooling trend with cooler copy when the delta is negative', () => {
      summaryCard({ hourlyForecast: hourlyFrom([23, 22, 21, 20], 12) });
      expect(screen.getByTestId('temp-trend')).toHaveTextContent('3° cooler by 03:00 PM');
      expect(screen.getByTestId('temp-summary'))
        .toHaveAccessibleName('L 10°C, H 30°C, 3° cooler by 03:00 PM');
    });

    it('clamps the comparison to the last hour when the horizon is short', () => {
      // Only 2 hours of nowcast: hourly[0] = 20 vs hourly[1] = 25 at 13:00 UTC.
      summaryCard({ hourlyForecast: hourlyFrom([20, 25], 12) });
      expect(screen.getByTestId('temp-trend')).toHaveTextContent('5° warmer by 01:00 PM');
    });

    it('computes the trend when hourly times hydrate from localStorage as ISO strings', () => {
      // The query cache persists hourly entries as JSON, so on a hard refresh
      // (cache rehydration) `time` is an ISO string, not the Date the live
      // parser produces. Regression: hourlyTrendDelta used to call
      // time.getTime() directly and crashed with "getTime is not a function".
      const stringTimes = hourlyFrom([20, 21, 22, 23], 12)
        .map((hour, i) => ({ ...hour, time: `2024-01-08T${12 + i}:00:00.000Z` })) as unknown as HourlyForecastType[];
      summaryCard({ hourlyForecast: stringTimes });
      expect(screen.getByTestId('temp-trend')).toHaveTextContent('3° warmer by 03:00 PM');
      expect(screen.getByTestId('temp-summary')).toHaveAccessibleName('L 10°C, H 30°C, 3° warmer by 03:00 PM');
    });

    it('omits the trend clause when fewer than two hours remain', () => {
      summaryCard({ hourlyForecast: hourlyFrom([20], 12) });
      const summary = screen.getByTestId('temp-summary');
      expect(summary).toHaveTextContent('H 30°C');
      expect(summary).toHaveTextContent('L 10°C');
      expect(screen.queryByTestId('temp-trend')).toBeNull();
      expect(summary).toHaveAccessibleName('L 10°C, H 30°C');
    });

    it('omits the trend clause when the +3h window has already passed (stale cache)', () => {
      // Snapshot hours end at 07:00 UTC, before the frozen "now" of 11:00 UTC
      // — e.g. a persisted offline payload hours old. Claiming "warmer by
      // 07:00 AM" after the fact would be a lie, so only H/L renders.
      summaryCard({ hourlyForecast: hourlyFrom([20, 21, 22, 23], 4) });
      const summary = screen.getByTestId('temp-summary');
      expect(screen.queryByTestId('temp-trend')).toBeNull();
      expect(summary).toHaveTextContent('H 30°C');
      expect(summary).toHaveAccessibleName('L 10°C, H 30°C');
    });

    it('renders tc copy with 24h target time and localized H/L and trend', () => {
      function FlipTc() {
        const { setLanguage } = useLanguage();
        return <button data-testid="flip-tc-caption" onClick={() => setLanguage('tc')}>tc</button>;
      }
      render(
        <LanguageProvider>
          <UnitsProvider>
            <FlipTc />
            <CurrentWeather
              weather={mockWeather}
              hourlyForecast={hourlyFrom([20, 21, 22, 23], 12)}
              dailyForecast={dayWithRange(10, 30)}
              timezone="UTC"
              headline={{ source: 'om' }}
            />
          </UnitsProvider>
        </LanguageProvider>
      );
      act(() => {
        screen.getByTestId('flip-tc-caption').click();
      });
      // 高/低 labels, 24h "15:00", TC trend string "至 15:00 升 3°".
      const summary = screen.getByTestId('temp-summary');
      expect(summary).toHaveTextContent('高 30°C');
      expect(summary).toHaveTextContent('低 10°C');
      expect(screen.getByTestId('temp-trend')).toHaveTextContent('至 15:00 升 3°');
      expect(summary).toHaveAccessibleName('低 10°C, 高 30°C, 至 15:00 升 3°');
    });

    it('renders no caption when the data is empty', () => {
      const empty: CurrentWeatherType = {
        temperature: -999,
        apparentTemperature: -999,
        humidity: -999,
        uvIndex: null,
        weatherCode: 0,
        windSpeed: -999,
        windDirection: 0,
        precipitation: -999,
        precipitationProbability: -999,
        isDay: true,
      };
      summaryCard({ weather: empty });
      expect(screen.queryByTestId('temp-summary')).toBeNull();
    });
  });

  // ── Sun-cycle progress strip (issue #97) ─────────────────────────────
  // The strip shows the active sun phase (daylight or night) as a bar, the
  // time left until it ends, and the boundary times. It replaced the old
  // standalone Sunrise/Sunset countdown stat.
  describe('sun cycle progress strip', () => {
    const daily = (sunrise: Date | string, sunset: Date | string): DailyForecastType => ({
      date: new Date('2024-01-08T00:00:00Z'),
      temperatureMax: 20,
      temperatureMin: 10,
      weatherCode: 0,
      windSpeedMax: 10,
      windDirectionDominant: 180,
      precipitationProbabilityMax: 0,
      sunrise: sunrise as Date,
      sunset: sunset as Date,
    });
    const sunCard = (props: Partial<React.ComponentProps<typeof CurrentWeather>> = {}) =>
      renderWithLanguage(
        <CurrentWeather
          weather={mockWeather}
          hourlyForecast={mockHourly}
          timezone="UTC"
          headline={{ source: 'om' }}
          {...props}
        />
      );

    it('shows daylight bar from sunrise to sunset at noon with time left', () => {
      vi.setSystemTime(new Date('2024-01-08T12:00:00Z'));
      const { container } = sunCard({
        dailyForecast: daily(new Date('2024-01-08T06:00:00Z'), new Date('2024-01-08T18:00:00Z')),
      });
      const strip = screen.getByTestId('sun-progress');
      expect(strip).toHaveAttribute('data-phase', 'day');
      expect(strip).toHaveTextContent('Daylight');
      // Time left until sunset (18:00 − 12:00).
      expect(strip).toHaveTextContent('in 6h');
      expect(strip).toHaveTextContent('Sunrise 06:00 AM');
      expect(strip).toHaveTextContent('Sunset 06:00 PM');
      // The old standalone countdown stat was removed — the strip is now the
      // single place that reports the lead time alongside the sun bar.
      expect(container.textContent).toContain('in 6h');
    });

    it('flips to a night bar (sunset → next sunrise) after dark', () => {
      vi.setSystemTime(new Date('2024-01-08T21:00:00Z'));
      sunCard({
        dailyForecast: daily(new Date('2024-01-08T06:00:00Z'), new Date('2024-01-08T18:00:00Z')),
        tomorrowSunrise: '2024-01-09T06:00:00Z',
      });
      const strip = screen.getByTestId('sun-progress');
      expect(strip).toHaveAttribute('data-phase', 'night');
      expect(strip).toHaveTextContent('Night');
      // Time left until tomorrow's sunrise (06:00 + 24h − 21:00).
      expect(strip).toHaveTextContent('in 9h');
      expect(strip).toHaveTextContent('Sunset 06:00 PM');
      expect(strip).toHaveTextContent('Sunrise 06:00 AM');
    });

    it('spans the pre-dawn night back to yesterday\'s sunset', () => {
      vi.setSystemTime(new Date('2024-01-08T03:00:00Z'));
      sunCard({
        dailyForecast: daily(new Date('2024-01-08T06:00:00Z'), new Date('2024-01-08T18:00:00Z')),
      });
      const strip = screen.getByTestId('sun-progress');
      expect(strip).toHaveAttribute('data-phase', 'night');
      // Yesterday's sunset ≈ today 18:00 − 24h; time left until 06:00 today.
      expect(strip).toHaveTextContent('in 3h');
      expect(strip).toHaveTextContent('Sunset 06:00 PM');
      expect(strip).toHaveTextContent('Sunrise 06:00 AM');
    });

    it('hides the strip without sun data or when the span is inverted (polar)', () => {
      vi.setSystemTime(new Date('2024-01-08T12:00:00Z'));
      // Polar edge case: sunset ≤ sunrise (midnight sun / polar night).
      sunCard({
        dailyForecast: daily(new Date('2024-01-08T18:00:00Z'), new Date('2024-01-08T06:00:00Z')),
      });
      expect(screen.queryByTestId('sun-progress')).toBeNull();

      // No daily forecast at all (hero-only data).
      sunCard();
      expect(screen.queryByTestId('sun-progress')).toBeNull();
    });

    it('localizes captions and formats 24h boundary times under tc', () => {
      vi.setSystemTime(new Date('2024-01-08T12:00:00Z'));
      function LangProbe() {
        const { setLanguage } = useLanguage();
        return <button data-testid="flip-tc-sun" onClick={() => setLanguage('tc')}>tc</button>;
      }
      render(
        <LanguageProvider>
          <UnitsProvider>
            <LangProbe />
            <CurrentWeather
              weather={mockWeather}
              hourlyForecast={mockHourly}
              dailyForecast={daily(new Date('2024-01-08T06:00:00Z'), new Date('2024-01-08T18:00:00Z'))}
              timezone="UTC"
              headline={{ source: 'om' }}
            />
          </UnitsProvider>
        </LanguageProvider>
      );
      act(() => {
        screen.getByTestId('flip-tc-sun').click();
      });
      const strip = screen.getByTestId('sun-progress');
      expect(strip).toHaveTextContent('白天');
      expect(strip).toHaveTextContent('6小時後');
      expect(strip).toHaveTextContent('日出 06:00');
      expect(strip).toHaveTextContent('日落 18:00');
    });
  });
});
