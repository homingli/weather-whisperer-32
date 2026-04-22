import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CurrentWeather } from '@/components/CurrentWeather';
import { HourlyForecast } from '@/components/HourlyForecast';
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
  time: new Date(Date.UTC(2024, 0, 8, i)),
  temperature: 20,
  weatherCode: 0,
  windSpeed: 10,
  windDirection: 180,
  precipitationProbability: 0,
  precipitation: 0,
  isDay: true,
}));

describe('Location and Time Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const date = new Date(Date.UTC(2024, 0, 8, 12, 0, 0));
    vi.setSystemTime(date);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('coordinates timezone display across components', () => {
    const timezone = 'Asia/Tokyo'; // GMT+9
    
    render(
      <LanguageProvider>
        <div data-testid="dashboard">
          <CurrentWeather 
            weather={mockWeather} 
            hourlyForecast={mockHourly} 
            timezone={timezone} 
          />
          <HourlyForecast 
            forecast={mockHourly} 
            timezone={timezone} 
          />
        </div>
      </LanguageProvider>
    );

    // Current time in Tokyo should be 12:00 + 9h = 21:00 (which is 09:00:00 PM)
    expect(screen.getByText(/0?9:00:00 PM/i)).toBeInTheDocument();
    
    // Hourly Title should be present
    expect(screen.getByText(/HOURLY FORECAST/i)).toBeInTheDocument();
  });
});
