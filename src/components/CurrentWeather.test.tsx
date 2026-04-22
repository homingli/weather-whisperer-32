import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
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
    vi.useFakeTimers();
    // Set system time to 2024-01-08 12:00:00 UTC
    const date = new Date(Date.UTC(2024, 0, 8, 12, 0, 0));
    vi.setSystemTime(date);
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

  it('renders correctly for Hong Kong (GMT+8)', () => {
    renderWithLanguage(
      <CurrentWeather 
        weather={mockWeather} 
        hourlyForecast={mockHourly} 
        locationName="Hong Kong"
        timezone="Asia/Hong_Kong" 
      />
    );

    // HK time should be 12:00 + 8h = 20:00
    // The component uses Intl.DateTimeFormat with the provided timezone and 12-hour clock for English
    expect(screen.getByText(/0?8:00:00 PM/i)).toBeInTheDocument();
    expect(screen.getByText(/Monday, January 8, 2024/i)).toBeInTheDocument();
  });

  it('renders correctly for New York (GMT-5)', () => {
    renderWithLanguage(
      <CurrentWeather 
        weather={mockWeather} 
        hourlyForecast={mockHourly} 
        locationName="New York"
        timezone="America/New_York" 
      />
    );

    // NY time should be 12:00 - 5h = 07:00
    expect(screen.getByText(/0?7:00:00 AM/i)).toBeInTheDocument();
  });

  it('updates time every second', () => {
    renderWithLanguage(
      <CurrentWeather 
        weather={mockWeather} 
        hourlyForecast={mockHourly} 
        locationName="London"
        timezone="Europe/London" 
      />
    );

    expect(screen.getByText(/12:00:00 PM/i)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText(/12:00:01 PM/i)).toBeInTheDocument();
  });

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
