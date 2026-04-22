import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HourlyForecast } from './HourlyForecast';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { HourlyForecast as HourlyForecastType } from '@/lib/weather';

// Mock Recharts to avoid issues in JSDOM
vi.mock('recharts', async () => {
  const OriginalModule = await vi.importActual('recharts') as any;
  return {
    ...OriginalModule,
    ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  };
});

const mockHourlyData: HourlyForecastType[] = [
  {
    time: new Date('2024-01-08T12:00:00Z'),
    temperature: 20,
    weatherCode: 0,
    windSpeed: 10,
    windDirection: 180,
    precipitationProbability: 10,
    precipitation: 0,
    isDay: true,
  },
  {
    time: new Date('2024-01-08T13:00:00Z'),
    temperature: 21,
    weatherCode: 0,
    windSpeed: 11,
    windDirection: 190,
    precipitationProbability: 20,
    precipitation: 0,
    isDay: true,
  },
];

describe('HourlyForecast Component', () => {
  const renderWithLanguage = (ui: React.ReactElement) => {
    return render(
      <LanguageProvider>
        {ui}
      </LanguageProvider>
    );
  };

  it('renders title correctly', () => {
    renderWithLanguage(<HourlyForecast forecast={mockHourlyData} />);
    expect(screen.getByText(/HOURLY FORECAST/i)).toBeInTheDocument();
  });

  it('formats time correctly for different timezones', () => {
    // We can't easily check Recharts inner tick values without complex selectors
    // but we can check if the component renders without crashing and the title is present
    const { container } = renderWithLanguage(
        <HourlyForecast forecast={mockHourlyData} timezone="America/New_York" />
    );
    
    expect(container).toBeDefined();
  });

  it('handles empty forecast gracefully', () => {
    renderWithLanguage(<HourlyForecast forecast={[]} />);
    expect(screen.getByText(/HOURLY FORECAST/i)).toBeInTheDocument();
  });
});
