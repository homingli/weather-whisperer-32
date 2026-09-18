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

/** The strip container (a div since the row hosts two kinds of controls). */
const strip = (container: HTMLElement): HTMLElement => container.firstChild as HTMLElement;

const noop = () => {};

describe('AtAGlance Component', () => {
  beforeEach(() => {
    // Reset the units/language preferences so tests start in metric/English.
    localStorage.clear();
  });

  it('renders nothing when there are no days', () => {
    const { container } = renderWithProviders(
      <AtAGlance onReveal={noop} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when every day is sentinel (no-data placeholder)', () => {
    const { container } = renderWithProviders(
      <AtAGlance
        today={{ ...today, temperatureMax: -999, temperatureMin: -999 }}
        tomorrow={{ ...tomorrow, temperatureMax: -999, temperatureMin: -999 }}
        onReveal={noop}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('summarises both days in the same format (metric)', () => {
    const { container } = renderWithProviders(
      <AtAGlance today={today} tomorrow={tomorrow} onReveal={noop} onRevealNowcast={noop} />
    );

    // Each day's temperature group is a button with a full-sentence label
    // (the rain clause moved to the rain chip's own label).
    expect(
      screen.getByRole('button', { name: 'Today: Mainly clear, High 29°C, Low 23°C' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Tomorrow: Partly cloudy, High 31°C, Low 25°C' })
    ).toBeInTheDocument();
    // The rain chip is its own button with the nowcast destination in the label.
    expect(
      screen.getByRole('button', { name: 'Rain chance 80%. View the rainfall nowcast map.' })
    ).toBeInTheDocument();

    const row = strip(container);
    // Both day groups are visible, in order.
    expect(row).toHaveTextContent('Today');
    expect(row).toHaveTextContent('Tomorrow');
    // Range reads low → high (matching the hero caption).
    expect(row).toHaveTextContent(/23°C\/29°C/);
    expect(row).toHaveTextContent(/25°C\/31°C/);
    // Wind stays off the strip (it lives on the daily cards instead).
    expect(row).not.toHaveTextContent('km/h');
    // Tomorrow's rain chance signals; today's 15 % stays below the cutoff
    // and is omitted from the strip (and from the labels).
    expect(row).toHaveTextContent('80%');
    expect(row).not.toHaveTextContent('15%');
  });

  it('renders no down-arrow chevron (removed affordance)', () => {
    const { container } = renderWithProviders(
      <AtAGlance today={today} tomorrow={tomorrow} onReveal={noop} onRevealNowcast={noop} />
    );
    expect(container.querySelector('.lucide-chevron-down')).toBeNull();
  });

  it('renders tomorrow only when the today row is missing', () => {
    const { container } = renderWithProviders(
      <AtAGlance tomorrow={tomorrow} onReveal={noop} onRevealNowcast={noop} />
    );

    expect(
      screen.getByRole('button', { name: /Tomorrow: Partly cloudy, High 31°C, Low 25°C/ })
    ).toBeInTheDocument();
    expect(strip(container)).not.toHaveTextContent('Today');
  });

  it('renders today only when the tomorrow row is missing', () => {
    const { container } = renderWithProviders(
      <AtAGlance today={today} onReveal={noop} onRevealNowcast={noop} />
    );

    expect(
      screen.getByRole('button', { name: /Today: Mainly clear, High 29°C, Low 23°C/ })
    ).toBeInTheDocument();
    expect(strip(container)).not.toHaveTextContent('Tomorrow');
  });

  it('skips a sentinel day but keeps the other', () => {
    const { container } = renderWithProviders(
      <AtAGlance
        today={{ ...today, temperatureMax: -999, temperatureMin: -999 }}
        tomorrow={tomorrow}
        onReveal={noop}
        onRevealNowcast={noop}
      />
    );

    expect(
      screen.getByRole('button', { name: /Tomorrow: Partly cloudy, High 31°C, Low 25°C/ })
    ).toBeInTheDocument();
    expect(strip(container)).not.toHaveTextContent('Today');
  });

  it('omits the rain-chance chip below 20 %', () => {
    renderWithProviders(
      <AtAGlance
        tomorrow={{ ...tomorrow, precipitationProbabilityMax: 10 }}
        onReveal={noop}
        onRevealNowcast={noop}
      />
    );

    // No rain chip button and no visible percentage.
    expect(screen.queryByRole('button', { name: /Rain chance/ })).toBeNull();
    expect(screen.queryByText('10%')).toBeNull();
  });

  it('renders the rain chip as static text when the nowcast pane is unreachable', () => {
    renderWithProviders(<AtAGlance today={today} tomorrow={tomorrow} onReveal={noop} />);

    // Tomorrow's 80 % still shows, but not as a control.
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rain chance/ })).toBeNull();
  });

  it('respects US units (°F / mph) on both days', () => {
    // Round-trip the stored unit through localStorage like the provider does.
    localStorage.setItem('weather-units', 'us');
    renderWithProviders(
      <AtAGlance today={today} tomorrow={tomorrow} onReveal={noop} onRevealNowcast={noop} />
    );

    // 29.4°C → 85°F, 23.2°C → 74°F; 31.2°C → 88°F, 25.1°C → 77°F.
    expect(
      screen.getByRole('button', { name: 'Today: Mainly clear, High 85°F, Low 74°F' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Tomorrow: Partly cloudy, High 88°F, Low 77°F' })
    ).toBeInTheDocument();
    // No wind clause and no stray mph on the strip.
    expect(strip(screen.getByRole('button', { name: /Today:/ }).parentElement!)).not.toHaveTextContent('mph');
  });

  it('uses the active UI language for the labels and sentences', () => {
    localStorage.setItem('weather-language', 'tc');
    renderWithProviders(
      <AtAGlance today={today} tomorrow={tomorrow} onReveal={noop} onRevealNowcast={noop} />
    );

    // 今日: 大致晴朗, 最高 29°C, 最低 23°C / 明日: 局部多雲, 最高 31°C, 最低 25°C
    expect(
      screen.getByRole('button', { name: /今日: 大致晴朗, 最高 29°C, 最低 23°C/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /明日: 局部多雲, 最高 31°C, 最低 25°C/ })
    ).toBeInTheDocument();
    // Rain chip label is translated too.
    expect(
      screen.getByRole('button', { name: /降雨機率 80%。查看降雨即時預報地圖。/ })
    ).toBeInTheDocument();
    // No wind clause in Traditional Chinese either.
    expect(strip(screen.getByRole('button', { name: /今日:/ }).parentElement!)).not.toHaveTextContent('公里/小時');
  });

  it('calls onReveal when a day group is activated', async () => {
    const user = userEvent.setup();
    const onReveal = vi.fn();
    const onRevealNowcast = vi.fn();
    renderWithProviders(
      <AtAGlance today={today} tomorrow={tomorrow} onReveal={onReveal} onRevealNowcast={onRevealNowcast} />
    );

    await user.click(screen.getByRole('button', { name: /Today: Mainly clear/ }));
    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(onRevealNowcast).not.toHaveBeenCalled();
  });

  it('calls onRevealNowcast when a rain chip is activated', async () => {
    const user = userEvent.setup();
    const onReveal = vi.fn();
    const onRevealNowcast = vi.fn();
    renderWithProviders(
      <AtAGlance today={today} tomorrow={tomorrow} onReveal={onReveal} onRevealNowcast={onRevealNowcast} />
    );

    await user.click(screen.getByRole('button', { name: /Rain chance 80%/ }));
    expect(onRevealNowcast).toHaveBeenCalledTimes(1);
    expect(onReveal).not.toHaveBeenCalled();
  });
});
