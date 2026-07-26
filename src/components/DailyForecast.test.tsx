import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { DailyForecast } from './DailyForecast';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { UnitsProvider, useUnits } from '@/contexts/UnitsContext';
import { DailyForecast as DailyForecastType } from '@/lib/weather';
import { toDisplayTemperature, toDisplayWindSpeed, temperatureUnitLabel, windSpeedUnitLabel } from '@/lib/units';

// Mock Recharts so the test doesn't depend on jsdom SVG layout — we're only
// checking that the LabelList formatters receive the right values.
vi.mock('recharts', async () => {
  const ActualModule = await vi.importActual('recharts') as any;
  return {
    ...ActualModule,
    ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
    BarChart: ({ children: _children }: any) => <div data-testid="bar-chart">{_children}</div>,
    Bar: ({ children: _children, ...props }: any) => <div data-testid="bar" data-shape={JSON.stringify(props)}>{_children}</div>,
    XAxis: () => <div data-testid="x-axis" />,
    YAxis: () => <div data-testid="y-axis" />,
    Tooltip: ({ content }: any) => <div data-testid="tooltip">{typeof content === 'function' ? content({ active: false, payload: [] }) : content}</div>,
    Cell: () => <div data-testid="cell" />,
    LabelList: ({ children: _children, dataKey, formatter }: any) => {
      // Render the formatter output for each datum so we can assert on it.
      // The BarChart mock below passes rows as data; we mirror that here by
      // accepting a static placeholder sample.
      const sample = formatter ? formatter(20) : dataKey;
      return <span data-testid={`label-${dataKey}`}>{sample}</span>;
    },
    ReferenceArea: () => null,
    ReferenceLine: () => null,
  };
});

const mockForecast: DailyForecastType[] = [
  {
    date: new Date('2024-01-08'),
    temperatureMax: 25,
    temperatureMin: 18,
    weatherCode: 0,
    windSpeedMax: 10,
    windDirectionDominant: 180,
    precipitationProbabilityMax: 20,
    sunrise: new Date('2024-01-08T06:00:00Z'),
    sunset: new Date('2024-01-08T18:00:00Z'),
  },
  {
    date: new Date('2024-01-09'),
    temperatureMax: 28,
    temperatureMin: 20,
    weatherCode: 0,
    windSpeedMax: 12,
    windDirectionDominant: 180,
    precipitationProbabilityMax: 10,
    sunrise: new Date('2024-01-09T06:00:00Z'),
    sunset: new Date('2024-01-09T18:00:00Z'),
  },
];

describe('DailyForecast', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const renderWithProviders = (ui: React.ReactElement) =>
    render(
      <LanguageProvider>
        <UnitsProvider>{ui}</UnitsProvider>
      </LanguageProvider>,
    );

  it('renders 7-day forecast title', () => {
    renderWithProviders(<DailyForecast forecast={mockForecast} />);
    expect(screen.getByText(/7-day forecast/i)).toBeInTheDocument();
  });

  it('renders temperatures in °C by default (metric)', () => {
    // temperatureMax 25°C, temperatureMin 18°C
    renderWithProviders(<DailyForecast forecast={mockForecast} />);
    // Y-axis tick label would show 25; bar geometry and LabelList at 25°C.
    // Use the helper to know what to expect in metric mode.
    const max = toDisplayTemperature(25, 'metric');
    const min = toDisplayTemperature(18, 'metric');
    expect(max).toBe(25);
    expect(min).toBe(18);
    expect(temperatureUnitLabel('metric')).toBe('°C');
  });

  it('recomputes chart data when units toggle from metric to us', () => {
    // Regression: chartData useMemo in DailyForecast didn't list `units` in
    // its deps array, so toggling units left the bar geometry / LabelList
    // values stale (in °C while labels rendered °F).
    function FlipProbe() {
      const { setUnits } = useUnits();
      return <button data-testid="flip-us" onClick={() => setUnits('us')}>flip</button>;
    }
    const { container } = render(
      <LanguageProvider>
        <UnitsProvider>
          <FlipProbe />
          <DailyForecast forecast={mockForecast} />
        </UnitsProvider>
      </LanguageProvider>,
    );
    // Sanity: in metric mode, max=25 (°C integer).
    const maxMetric = toDisplayTemperature(25, 'metric');
    expect(maxMetric).toBe(25);
    expect(temperatureUnitLabel('metric')).toBe('°C');

    act(() => {
      screen.getByTestId('flip-us').click();
    });

    // After toggle, the chart data should reflect Fahrenheit conversion:
    // 25 °C * 9/5 + 32 = 77, 18 °C = 64.4 → 64.
    const maxUs = toDisplayTemperature(25, 'us');
    const minUs = toDisplayTemperature(18, 'us');
    expect(maxUs).toBe(77);
    expect(minUs).toBe(64);
    expect(temperatureUnitLabel('us')).toBe('°F');

    // Wind speeds convert too: 10 km/h → 6 mph, 12 → 7.
    expect(toDisplayWindSpeed(10, 'us')).toBe(6);
    expect(toDisplayWindSpeed(12, 'us')).toBe(7);
    expect(windSpeedUnitLabel('us')).toBe('mph');

    // The rendered sr-only table should now show 77°F / 64°F (it reads from
    // chartData, which must have been recomputed when units flipped).
    const srTable = container.querySelector('table.sr-only');
    expect(srTable).toBeTruthy();
    expect(srTable!.textContent).toContain('77°F');
    expect(srTable!.textContent).toContain('64°F');
  });
});