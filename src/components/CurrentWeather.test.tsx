import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { CurrentWeather } from './CurrentWeather';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { UnitsProvider, useUnits } from '@/contexts/UnitsContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { CurrentWeather as CurrentWeatherType, HourlyForecast as HourlyForecastType } from '@/lib/weather';

const mockWeather: CurrentWeatherType = {
  temperature: 20,
  apparentTemperature: 18,
  humidity: 60,
  uvIndex: 5,
  weatherCode: 0,
  windSpeed: 10,
  windDirection: 180,
  precipitation: 0,
  precipitationProbability: 0,
  isDay: true,
};

const mockHourly: HourlyForecastType[] = Array(24).fill(0).map((_, i) => ({
  time: new Date(2024, 0, 8, i),
  temperature: 20,
  weatherCode: 0,
  windSpeed: 10,
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

  it('displays "Needs Umbrella" when raining', () => {
    const rainyWeather = { ...mockWeather, precipitation: 5 };
    renderWithLanguage(
      <CurrentWeather
        weather={rainyWeather}
        hourlyForecast={mockHourly}
        locationName="London"
        timezone="Europe/London"
        headline={{ source: 'om' }}
      />
    );

    // Using "YES" as the text for umbrella needed in English
    expect(screen.getByText(/YES/i)).toBeInTheDocument();
  });

  it('displays "No Umbrella" when clear', () => {
    renderWithLanguage(
      <CurrentWeather
        weather={mockWeather}
        hourlyForecast={mockHourly}
        locationName="London"
        timezone="Europe/London"
        headline={{ source: 'om' }}
      />
    );

    expect(screen.getByText(/NO/i)).toBeInTheDocument();
  });

  it('renders hero temperature with bare ° by default (metric)', () => {
    // Hero shows "18°" — the unit context is implicit from the range bar above
    // and the menu selection.
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
  });

  // ── Quiet shelf: below-threshold metrics collapse to icon chips ──────
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

    it('collapses only below-threshold metrics into chips; the rest stay full widgets', () => {
      const { container } = renderWeather(mockWeather);
      expect(screen.getByTestId('quiet-precip')).toBeInTheDocument();
      expect(screen.getByTestId('quiet-humidity')).toBeInTheDocument();
      expect(screen.queryByTestId('quiet-uv')).toBeNull();
      expect(screen.queryByTestId('quiet-wind')).toBeNull();
      // Full UvChip still renders (uv 5 → "Moderate" band label).
      expect(container.textContent).toContain('Moderate');
      // Collapsed values stay in the a11y tree via the chip aria-labels.
      expect(screen.getByTestId('quiet-precip')).toHaveAttribute('aria-label', 'Precipitation: 0.0 mm');
      expect(screen.getByTestId('quiet-humidity')).toHaveAttribute('aria-label', 'Humidity: 60%');
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

    it('treats boundary values as needing attention (uv 3, wind 5, humidity outside 30–60)', () => {
      const boundary = { ...mockWeather, uvIndex: 3, humidity: 29, windSpeed: 5 };
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

    it('reveals on hover after 150ms, hides 350ms after the pointer leaves', () => {
      renderWeather(mockWeather);
      const chip = screen.getByTestId('quiet-precip');
      expect(chip).toHaveAttribute('aria-expanded', 'false');
      act(() => { fireEvent.mouseEnter(chip); });
      // Debounced: not revealed before 150ms.
      act(() => { vi.advanceTimersByTime(149); });
      expect(chip).toHaveAttribute('aria-expanded', 'false');
      act(() => { vi.advanceTimersByTime(1); });
      expect(chip).toHaveAttribute('aria-expanded', 'true');
      act(() => { fireEvent.mouseLeave(chip); });
      act(() => { vi.advanceTimersByTime(349); });
      expect(chip).toHaveAttribute('aria-expanded', 'true');
      act(() => { vi.advanceTimersByTime(1); });
      expect(chip).toHaveAttribute('aria-expanded', 'false');
    });

    it('tap pins the value for touch users; a second tap unpins', () => {
      renderWeather(mockWeather);
      const chip = screen.getByTestId('quiet-precip');
      // jsdom click fires no mouse/focus events — a clean tap simulation.
      act(() => { fireEvent.click(chip); });
      act(() => { vi.advanceTimersByTime(150); });
      expect(chip).toHaveAttribute('aria-expanded', 'true');
      // Pinned state survives indefinitely (no auto-hide).
      act(() => { vi.advanceTimersByTime(10_000); });
      expect(chip).toHaveAttribute('aria-expanded', 'true');
      act(() => { fireEvent.click(chip); });
      act(() => { vi.advanceTimersByTime(350); });
      expect(chip).toHaveAttribute('aria-expanded', 'false');
    });

    it('keyboard focus reveals the value (WCAG 1.4.13) and blur hides it', () => {
      renderWeather(mockWeather);
      const chip = screen.getByTestId('quiet-humidity');
      act(() => { fireEvent.focus(chip); });
      act(() => { vi.advanceTimersByTime(150); });
      expect(chip).toHaveAttribute('aria-expanded', 'true');
      act(() => { fireEvent.blur(chip); });
      act(() => { vi.advanceTimersByTime(350); });
      expect(chip).toHaveAttribute('aria-expanded', 'false');
    });
  });
});
