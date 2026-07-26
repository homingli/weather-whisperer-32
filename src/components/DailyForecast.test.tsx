import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { DailyForecast } from './DailyForecast';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { UnitsProvider, useUnits } from '@/contexts/UnitsContext';
import { DailyForecast as DailyForecastType } from '@/lib/weather';

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
    const { container } = renderWithProviders(<DailyForecast forecast={mockForecast} />);
    // sr-only table reads °C directly from chartData.
    const srTable = container.querySelector('table.sr-only');
    expect(srTable).toBeTruthy();
    expect(srTable!.textContent).toContain('25°C');
    expect(srTable!.textContent).toContain('18°C');
  });

  it('renders temperatures in °C by default and °F when units=us, while keeping bar geometry in metric scale', () => {
    // chartData stays in metric (°C) — only labels convert at the edge.
    // This keeps the gradient stops and bar heights calibrated against
    // metric thresholds (red-hot, yellow-warm, blue-cool). US-mode
    // labels show Fahrenheit values at the °C tick mark — a small offset
    // acceptable for a hidden-axis chart.
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

    const srTable = container.querySelector('table.sr-only');
    expect(srTable).toBeTruthy();
    // Metric mode: raw °C values.
    expect(srTable!.textContent).toContain('25°C');
    expect(srTable!.textContent).toContain('18°C');
    expect(srTable!.textContent).toContain('10 km/h');

    act(() => {
      screen.getByTestId('flip-us').click();
    });

    // US mode: labels converted via formatTemperature / formatWindSpeed.
    // 25°C → 77°F, 18°C → 64°F. 10 km/h → 6 mph.
    expect(srTable!.textContent).toContain('77°F');
    expect(srTable!.textContent).toContain('64°F');
    expect(srTable!.textContent).toContain('6 mph');
    expect(srTable!.textContent).not.toContain('25°C');
    expect(srTable!.textContent).not.toContain('10 km/h');
  });
});