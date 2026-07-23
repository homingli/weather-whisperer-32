import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CurrentWeather } from './CurrentWeather';
import { LanguageProvider } from '@/contexts/LanguageContext';
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
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderWithLanguage = (ui: React.ReactElement) => {
    return render(
      <LanguageProvider>
        {ui}
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
});
