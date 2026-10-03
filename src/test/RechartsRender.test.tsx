import { describe, it, expect, vi } from 'vitest';
import { UnitsProvider } from '@/contexts/UnitsProvider';
import { LanguageProvider } from '@/contexts/LanguageProvider';
import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { HourlyForecast } from '@/components/HourlyForecast';
import { DailyForecast } from '@/components/DailyForecast';


import { HourlyForecast as HourlyForecastType, DailyForecast as DailyForecastType } from '@/lib/weather';

// The per-component chart tests mock recharts away because jsdom has no SVG
// layout engine. This file is the complement: charts render with REAL
// recharts, stubbing only ResponsiveContainer (nothing to observe in jsdom —
// hand the child a fixed size the way the real one does). A recharts-major
// behavior change — axis defaults, line/bar/label rendering — fails loudly
// here instead of only in the browser.
vi.mock('recharts', async () => {
  const ActualModule = (await vi.importActual('recharts')) as typeof import('recharts');
  const React = (await import('react')) as typeof import('react');
  return {
    ...ActualModule,
    ResponsiveContainer: ({
      children,
    }: {
      children: ReactElement<{ width?: number; height?: number }>;
    }) => React.cloneElement(children, { width: 800, height: 400 }),
  };
});

const mockHourly: HourlyForecastType[] = Array.from({ length: 4 }, (_, i) => ({
  time: new Date(Date.UTC(2024, 0, 8, 12 + i)),
  temperature: 20 + i,
  weatherCode: 0,
  windSpeed: 10,
  windDirection: 180,
  precipitationProbability: 10 * i,
  precipitation: 0,
  isDay: true,
}));

const mockDaily: DailyForecastType[] = [
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
    windDirectionDominant: 200,
    precipitationProbabilityMax: 30,
    sunrise: new Date('2024-01-09T06:00:00Z'),
    sunset: new Date('2024-01-09T18:00:00Z'),
  },
];

const wrap = (ui: ReactNode) => (
  <LanguageProvider>
    <UnitsProvider>{ui}</UnitsProvider>
  </LanguageProvider>
);

describe('Real recharts rendering (no-mock smoke)', () => {
  it('renders the hourly ComposedChart — line, rain bars, axis ticks', () => {
    const { container } = render(wrap(<HourlyForecast forecast={mockHourly} />));
    expect(container.querySelector('svg.recharts-surface')).toBeTruthy();
    expect(container.querySelector('.recharts-line')).toBeTruthy();
    expect(container.querySelector('.recharts-line-curve')).toBeTruthy();
    expect(container.querySelectorAll('.recharts-bar-rectangle').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.recharts-cartesian-axis-tick').length).toBeGreaterThan(0);
  });

  it('renders the daily BarChart — range bars and LabelList temperature text', () => {
    const { container } = render(wrap(<DailyForecast forecast={mockDaily} />));
    const svg = container.querySelector('svg.recharts-surface');
    expect(svg).toBeTruthy();
    expect(svg!.querySelectorAll('.recharts-bar-rectangle').length).toBeGreaterThan(0);
    // LabelList formatters ran against real data (25/18/28/20 °C).
    const text = svg!.textContent ?? '';
    expect(text).toContain('25°C');
    expect(text).toContain('18°C');
    expect(text).toContain('28°C');
    expect(text).toContain('20°C');
  });
});
