import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AtAGlance } from './AtAGlance';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { UnitsProvider } from '@/contexts/UnitsContext';
import type { DailyForecast as DailyForecastType } from '@/lib/weather';

const today: DailyForecastType = {
  date: new Date('2024-01-08T00:00:00Z'),
  temperatureMax: 29.4,
  temperatureMin: 23.2,
  weatherCode: 1, // mainly clear
  windSpeedMax: 18.3,
  windDirectionDominant: 120,
  precipitationProbabilityMax: 15, // below the 20 % signal cutoff
  sunrise: new Date('2024-01-08T00:00:00Z'),
  sunset: new Date('2024-01-08T00:00:00Z'),
};

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

describe('AtAGlance Component', () => {
  beforeEach(() => {
    // Reset the units/language preferences so tests start in metric/English.
    localStorage.clear();
  });

  it('renders nothing when there are no days', () => {
    const { container } = renderWithProviders(
      <AtAGlance onReveal={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when every day is sentinel (no-data placeholder)', () => {
    const { container } = renderWithProviders(
      <AtAGlance
        today={{ ...today, temperatureMax: -999, temperatureMin: -999 }}
        tomorrow={{ ...tomorrow, temperatureMax: -999, temperatureMin: -999 }}
        onReveal={() => {}}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('summarises both days in the same format (metric)', () => {
    renderWithProviders(<AtAGlance today={today} tomorrow={tomorrow} onReveal={() => {}} />);

    const strip = screen.getByRole('button', {
      // "Today: Mainly clear, High 29°C, Low 23°C; Tomorrow: Partly cloudy, High 31°C, Low 25°C, Rain Chance 80%"
      name: /Today: Mainly clear, High 29°C, Low 23°C; Tomorrow: Partly cloudy, High 31°C, Low 25°C, Rain Chance 80%/i,
    });
    expect(strip).toBeInTheDocument();

    // Both day groups are visible, in order.
    expect(strip).toHaveTextContent('Today');
    expect(strip).toHaveTextContent('Tomorrow');
    // Range reads low → high (matching the hero caption).
    expect(strip).toHaveTextContent(/23°C\/29°C/);
    expect(strip).toHaveTextContent(/25°C\/31°C/);
    expect(strip).toHaveTextContent('29°C');
    expect(strip).toHaveTextContent('23°C');
    expect(strip).toHaveTextContent('31°C');
    expect(strip).toHaveTextContent('25°C');
    // Wind stays off the strip (it lives on the daily cards instead).
    expect(strip).not.toHaveTextContent('km/h');
    // Tomorrow's rain chance signals; today's 15 % stays below the cutoff
    // and is omitted from the strip (and from the sentence).
    expect(strip).toHaveTextContent('80%');
    expect(strip).not.toHaveTextContent('15%');
  });

  it('renders tomorrow only when the today row is missing', () => {
    renderWithProviders(<AtAGlance tomorrow={tomorrow} onReveal={() => {}} />);

    const strip = screen.getByRole('button', {
      name: /Tomorrow: Partly cloudy, High 31°C, Low 25°C, Rain Chance 80%/i,
    });
    expect(strip).toBeInTheDocument();
    expect(strip).not.toHaveTextContent('Today');
  });

  it('renders today only when the tomorrow row is missing', () => {
    renderWithProviders(<AtAGlance today={today} onReveal={() => {}} />);

    const strip = screen.getByRole('button', {
      name: /Today: Mainly clear, High 29°C, Low 23°C/i,
    });
    expect(strip).toBeInTheDocument();
    expect(strip).not.toHaveTextContent('Tomorrow');
  });

  it('skips a sentinel day but keeps the other', () => {
    renderWithProviders(
      <AtAGlance
        today={{ ...today, temperatureMax: -999, temperatureMin: -999 }}
        tomorrow={tomorrow}
        onReveal={() => {}}
      />
    );

    const strip = screen.getByRole('button', {
      name: /Tomorrow: Partly cloudy, High 31°C, Low 25°C, Rain Chance 80%/i,
    });
    expect(strip).toBeInTheDocument();
    expect(strip).not.toHaveTextContent('Today');
  });

  it('omits the rain-chance segment below 20 %', () => {
    renderWithProviders(
      <AtAGlance
        tomorrow={{ ...tomorrow, precipitationProbabilityMax: 10 }}
        onReveal={() => {}}
      />
    );

    const strip = screen.getByRole('button');
    expect(strip).not.toHaveTextContent('10%');
    // The aria-label drops the "Rain Chance" clause too.
    expect(strip.getAttribute('aria-label')).not.toContain('Rain Chance');
  });

  it('respects US units (°F / mph) on both days', () => {
    // Round-trip the stored unit through localStorage like the provider does.
    localStorage.setItem('weather-units', 'us');
    renderWithProviders(<AtAGlance today={today} tomorrow={tomorrow} onReveal={() => {}} />);

    const strip = screen.getByRole('button', {
      // 29.4°C → 85°F, 23.2°C → 74°F;
      // 31.2°C → 88°F, 25.1°C → 77°F.
      name: /Today: Mainly clear, High 85°F, Low 74°F; Tomorrow: Partly cloudy, High 88°F, Low 77°F, Rain Chance 80%/i,
    });
    expect(strip).toBeInTheDocument();
    expect(strip).toHaveTextContent('85°F');
    expect(strip).toHaveTextContent('77°F');
    // No wind clause and no stray mph on the strip.
    expect(strip).not.toHaveTextContent('mph');
  });

  it('uses the active UI language for the labels and sentences', () => {
    localStorage.setItem('weather-language', 'tc');
    renderWithProviders(<AtAGlance today={today} tomorrow={tomorrow} onReveal={() => {}} />);

    // 今日: 大致晴朗, 最高 29°C, 最低 23°C;
    // 明日: 局部多雲, 最高 31°C, 最低 25°C, 降雨機率 80%
    expect(
      screen.getByRole('button', {
        name: /今日: 大致晴朗, 最高 29°C, 最低 23°C/,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /; 明日: 局部多雲, 最高 31°C, 最低 25°C, 降雨機率 80%/,
      })
    ).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveTextContent('今日');
    expect(screen.getByRole('button')).toHaveTextContent('明日');
    // No wind clause in Traditional Chinese either.
    expect(screen.getByRole('button')).not.toHaveTextContent('公里/小時');
  });

  it('calls onReveal when activated', async () => {
    const user = userEvent.setup();
    const onReveal = vi.fn();
    renderWithProviders(<AtAGlance today={today} tomorrow={tomorrow} onReveal={onReveal} />);

    await user.click(screen.getByRole('button'));
    expect(onReveal).toHaveBeenCalledTimes(1);
  });
});
