import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TomorrowGlance } from './TomorrowGlance';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { UnitsProvider } from '@/contexts/UnitsContext';
import type { DailyForecast as DailyForecastType } from '@/lib/weather';

const tomorrow: DailyForecastType = {
  date: new Date('2024-01-09T00:00:00Z'),
  temperatureMax: 31.2,
  temperatureMin: 25.1,
  weatherCode: 2, // partly cloudy
  windSpeedMax: 25.4,
  windDirectionDominant: 180,
  precipitationProbabilityMax: 80,
  sunrise: new Date('2024-01-09T00:00:00Z'),
  sunset: new Date('2024-01-09T00:00:00Z'),
};

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <LanguageProvider>
      <UnitsProvider>{ui}</UnitsProvider>
    </LanguageProvider>
  );

describe('TomorrowGlance Component', () => {
  beforeEach(() => {
    // Reset the units preference so tests start in metric mode.
    localStorage.clear();
  });

  it('renders nothing when there is no tomorrow forecast', () => {
    const { container } = renderWithProviders(
      <TomorrowGlance onReveal={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when tomorrow temps are sentinel (no-data placeholder)', () => {
    const { container } = renderWithProviders(
      <TomorrowGlance
        forecast={{ ...tomorrow, temperatureMax: -999, temperatureMin: -999 }}
        onReveal={() => {}}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('summarises tomorrow: temp range, rain chance ≥ 20 %, max wind (metric)', () => {
    renderWithProviders(<TomorrowGlance forecast={tomorrow} onReveal={() => {}} />);

    const strip = screen.getByRole('button', {
      // "Tomorrow: Partly cloudy, High 31°C, Low 25°C, Rain Chance 80%, Wind 25 km/h"
      name: /Tomorrow: Partly cloudy, High 31°C, Low 25°C, Rain Chance 80%, Wind 25 km\/h/i,
    });
    expect(strip).toBeInTheDocument();

    // Visible segments mirror the sentence.
    expect(strip).toHaveTextContent('31°C');
    expect(strip).toHaveTextContent('25°C');
    expect(strip).toHaveTextContent('80%');
    expect(strip).toHaveTextContent('25 km/h');
  });

  it('omits the rain-chance segment below 20 %', () => {
    renderWithProviders(
      <TomorrowGlance
        forecast={{ ...tomorrow, precipitationProbabilityMax: 10 }}
        onReveal={() => {}}
      />
    );

    const strip = screen.getByRole('button');
    expect(strip).not.toHaveTextContent('10%');
    // The aria-label drops the "Rain Chance" clause too.
    expect(strip.getAttribute('aria-label')).not.toContain('Rain Chance');
  });

  it('respects US units (°F / mph)', () => {
    // Round-trip the stored unit through localStorage like the provider does.
    localStorage.setItem('weather-units', 'us');
    renderWithProviders(<TomorrowGlance forecast={tomorrow} onReveal={() => {}} />);

    const strip = screen.getByRole('button', {
      // 31.2°C → 88°F, 25.1°C → 77°F, 25.4 km/h → 16 mph
      name: /High 88°F, Low 77°F, Rain Chance 80%, Wind 16 mph/i,
    });
    expect(strip).toBeInTheDocument();
    expect(strip).toHaveTextContent('88°F');
    expect(strip).toHaveTextContent('16 mph');
  });

  it('uses the active UI language for the label and sentence', () => {
    localStorage.setItem('weather-language', 'tc');
    renderWithProviders(<TomorrowGlance forecast={tomorrow} onReveal={() => {}} />);

    // 明日: 局部多雲, 最高 31°C, 最低 25°C, 降雨機率 80%, 風 25 公里/小時
    expect(
      screen.getByRole('button', {
        name: /明日: 局部多雲, 最高 31°C, 最低 25°C, 降雨機率 80%/,
      })
    ).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveTextContent('明日');
    expect(screen.getByRole('button')).toHaveTextContent('公里/小時');
  });

  it('calls onReveal when activated', async () => {
    const user = userEvent.setup();
    const onReveal = vi.fn();
    renderWithProviders(<TomorrowGlance forecast={tomorrow} onReveal={onReveal} />);

    await user.click(screen.getByRole('button'));
    expect(onReveal).toHaveBeenCalledTimes(1);
  });
});
