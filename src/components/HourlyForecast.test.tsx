import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, act } from '@testing-library/react';
import { HourlyForecast } from './HourlyForecast';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { UnitsProvider, useUnits } from '@/contexts/UnitsContext';
import { HourlyForecast as HourlyForecastType, DailyForecast as DailyForecastType } from '@/lib/weather';
import { MockChartProps } from '@/test/mockChartProps';

// Track chart renders so we can assert on the data passed to Recharts.
type ChartCapture = Record<string, unknown>;
const renderedChartData: ChartCapture[] = [];

vi.mock('recharts', async () => {
  const React = (await import('react')) as typeof import('react');
  const OriginalModule = (await vi.importActual('recharts')) as typeof import('recharts');
  return {
    ...OriginalModule,
    ResponsiveContainer: ({ children }: MockChartProps) => <div data-testid="chart-container">{children}</div>,
    LineChart: ({ data, children, ticks }: MockChartProps) => {
      renderedChartData.push(...((data ?? []) as ChartCapture[]));
      if (ticks) renderedChartData.push({ ticks });
      // Use React.Children to properly render all child elements.
      const renderedChildren: ReactNode[] = [];
      React.Children.forEach(children, (child) => {
        renderedChildren.push(child);
      });
      return <div data-testid="line-chart">{renderedChildren}</div>;
    },
    Line: () => null,
    XAxis: () => <div data-testid="x-axis" />,
    YAxis: () => <div data-testid="y-axis" />,
    Tooltip: () => null,
    ReferenceArea: () => <div data-testid="ref-area" />,
    ReferenceLine: ({ label }: { label?: { value: unknown } }) => {
      if (label) renderedChartData.push({ refLineLabel: label.value });
      return <svg data-testid="ref-line" />;
    },
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
  beforeEach(() => {
    renderedChartData.length = 0;
    localStorage.clear();
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

  it('renders title correctly', () => {
    renderWithLanguage(<HourlyForecast forecast={mockHourlyData} />);
    expect(screen.getByText(/HOURLY FORECAST/i)).toBeInTheDocument();
  });

  it('renders the localized "next N hours" kicker', () => {
    renderWithLanguage(<HourlyForecast forecast={mockHourlyData} />);
    expect(screen.getByText(/the next \d+ hours/i)).toBeInTheDocument();
  });

  it('handles empty forecast gracefully — renders title and chart container without crashing', () => {
    renderWithLanguage(<HourlyForecast forecast={[]} />);
    expect(screen.getByText(/HOURLY FORECAST/i)).toBeInTheDocument();
    // Chart container still renders (ResponsiveContainer mock always returns a div).
    expect(screen.getByTestId('chart-container')).toBeInTheDocument();
    // No ReferenceArea for day/night when there's no data.
    expect(screen.queryByTestId('ref-area')).not.toBeInTheDocument();
  });

  it('renders the LineChart with chart data derived from hourly forecast', () => {
    renderWithLanguage(<HourlyForecast forecast={mockHourlyData} />);

    // The chart container and SVG elements should render.
    expect(screen.getByTestId('chart-container')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    expect(screen.getByTestId('x-axis')).toBeInTheDocument();
    // Two YAxis (left = temperature, right = rain chance).
    expect(screen.getAllByTestId('y-axis')).toHaveLength(2);

    // chartData should have one entry per hourly slot, each with the expected keys.
    // mockHourlyData has 2 entries; the component slices to first 8.
    expect(renderedChartData.length).toBeGreaterThanOrEqual(2);
    const firstEntry = renderedChartData[0] as Record<string, unknown>;
    expect(firstEntry).toHaveProperty('temperature');
    expect(firstEntry).toHaveProperty('rainChance');
    expect(firstEntry).toHaveProperty('windSpeed');
    expect(firstEntry).toHaveProperty('isDay');
    expect(firstEntry).toHaveProperty('displayTime');
    // temperature should be a number (component rounds it).
    expect(typeof firstEntry.temperature).toBe('number');
  });

  it('renders day/night ReferenceArea bands when daily prop is provided', () => {
    // daily with sunrise before noon and sunset after noon for the forecast window.
    const mockDaily: DailyForecastType[] = [
      {
        date: new Date('2024-01-08'),
        temperatureMax: 28,
        temperatureMin: 22,
        weatherCode: 0,
        windSpeedMax: 10,
        windDirectionDominant: 180,
        precipitationProbabilityMax: 20,
        sunrise: new Date('2024-01-08T06:00:00Z'),
        sunset: new Date('2024-01-08T18:00:00Z'),
      },
    ];

    renderWithLanguage(<HourlyForecast forecast={mockHourlyData} daily={mockDaily} />);

    // With hourly isDay data spanning 12–13 UTC and sunrise at 06:00 UTC,
    // dayNightAreas produces at least one ReferenceArea.
    const refAreas = screen.getAllByTestId('ref-area');
    expect(refAreas.length).toBeGreaterThan(0);
  });

  it('renders sunrise/sunset ReferenceLine markers when daily covers the forecast window', () => {
    // Extended hourly data covering 12:00–19:00 UTC so the forecast window
    // (12:00–20:00) includes sunset at 18:00 UTC.
    const extendedHourly: HourlyForecastType[] = Array.from({ length: 8 }, (_, i) => ({
      time: new Date(`2024-01-08T${(12 + i).toString().padStart(2, '0')}:00:00Z`),  // 12:00–19:00 UTC
      temperature: 25,
      weatherCode: 0,
      windSpeed: 10,
      windDirection: 180,
      precipitationProbability: 10,
      precipitation: 0,
      isDay: true,
    }));
    // sunrise at 06:00 UTC (before the 12:00 window start) and sunset at 18:00 UTC (inside).
    const mockDaily: DailyForecastType[] = [
      {
        date: new Date('2024-01-08'),
        temperatureMax: 28,
        temperatureMin: 22,
        weatherCode: 0,
        windSpeedMax: 10,
        windDirectionDominant: 180,
        precipitationProbabilityMax: 20,
        sunrise: new Date('2024-01-08T06:00:00Z'),
        sunset: new Date('2024-01-08T18:00:00Z'),
      },
    ];

    renderWithLanguage(<HourlyForecast forecast={extendedHourly} daily={mockDaily} />);

    // The chart renders, and ReferenceArea bands appear for day/night.
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    expect(screen.getAllByTestId('ref-area').length).toBeGreaterThanOrEqual(1);

    // Verify that ReferenceLine was called with label props for the sun events.
    // The mock captures label values in renderedChartData so we can assert
    // on them without depending on SVG rendering in jsdom.
    const capturedSunEvents = renderedChartData.filter(
      (e) => 'refLineLabel' in e
    );
    expect(capturedSunEvents.length).toBeGreaterThanOrEqual(1);
    // Each captured sun event label is a formatted time string (e.g. "6:00 PM").
    const firstLabel = capturedSunEvents[0]?.refLineLabel;
    expect(firstLabel).toMatch(/\d{1,2}:\d{2}\s*[AP]M/i);
  });

  it('accepts and propagates timezone prop without crashing', () => {
    // The component should render identically regardless of timezone — it formats
    // the displayTime string per slot using formatInTimezone. This test verifies
    // the component renders without throwing regardless of the IANA timezone.
    const { container: hkContainer } = renderWithLanguage(
      <HourlyForecast forecast={mockHourlyData} timezone="Asia/Hong_Kong" />,
    );
    const { container: tokyoContainer } = renderWithLanguage(
      <HourlyForecast forecast={mockHourlyData} timezone="Asia/Tokyo" />,
    );

    // Both renders should succeed with a chart container.
    expect(hkContainer.querySelector('[data-testid="chart-container"]')).toBeTruthy();
    expect(tokyoContainer.querySelector('[data-testid="chart-container"]')).toBeTruthy();
  });

  it('renders sr-only table cells in metric by default and in us when units=us', () => {
    // 20°C → 20°C, 68°F. 10 km/h → 10 km/h, 6 mph.
    function FlipProbe() {
      const { setUnits } = useUnits();
      return <button data-testid="hf-flip-us" onClick={() => setUnits('us')}>flip</button>;
    }
    const { container } = render(
      <LanguageProvider>
        <UnitsProvider>
          <FlipProbe />
          <HourlyForecast forecast={mockHourlyData} />
        </UnitsProvider>
      </LanguageProvider>
    );
    // Metric: "20°C" and "km/h" appear in sr-only cells.
    const srTable = container.querySelector('table.sr-only');
    expect(srTable).toBeTruthy();
    expect(srTable!.textContent).toContain('20°C');
    expect(srTable!.textContent).toContain('km/h');

    act(() => {
      screen.getByTestId('hf-flip-us').click();
    });
    expect(srTable!.textContent).toContain('68°F');
    expect(srTable!.textContent).toContain('mph');
  });
});
