import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { CurrentWeather } from './CurrentWeather';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { UnitsProvider, useUnits } from '@/contexts/UnitsContext';
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
      />
    );

    expect(screen.getByText(/NO/i)).toBeInTheDocument();
  });

  it('renders hero temperature with bare ° by default (metric)', () => {
    // Hero shows "18°" — the unit context is implicit from the range bar above
    // and the menu selection.
    renderWithLanguage(
      <CurrentWeather weather={mockWeather} hourlyForecast={mockHourly} timezone="UTC" />
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
          <CurrentWeather weather={mockWeather} hourlyForecast={mockHourly} timezone="UTC" />
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
      <CurrentWeather weather={mockWeather} hourlyForecast={mockHourly} timezone="UTC" />
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
          <CurrentWeather weather={mockWeather} hourlyForecast={mockHourly} timezone="UTC" />
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
      <CurrentWeather weather={wetWeather} hourlyForecast={mockHourly} timezone="UTC" />
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
          <CurrentWeather weather={wetWeather} hourlyForecast={mockHourly} timezone="UTC" />
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
          <CurrentWeather weather={wetWeather} hourlyForecast={mockHourly} timezone="UTC" />
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
});
