import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel, type UserEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SettingsMenu } from './SettingsMenu';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { UnitsProvider } from '@/contexts/UnitsContext';
import { FontSizeProvider } from '@/contexts/FontSizeContext';
import { GeoLocation } from '@/lib/weather';

const noCity: GeoLocation | null = null;
const noRecent: GeoLocation[] = [];

// Fresh QueryClient per test — useCitySearch uses useQuery, so the
// component must be wrapped in a provider, and the client must be clean
// (otherwise a previous test's geocode cache leaks into the next).
function TestProviders({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    // `retry: false` so a failed query surfaces an error state instead of
    // hanging the test. `refetchOnWindowFocus: false` /
    // `refetchOnReconnect: false` avoid flakiness on CI agents that steal
    // focus or shift network state mid-run.
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('SettingsMenu units + language pill toggles', () => {
  let user: UserEvent;

  beforeEach(() => {
    localStorage.clear();
    // Fresh user-event instance per test. `pointerEventsCheck: Never`
    // skips the post-pointer-event `screen.getByRole` walk that verifies
    // CSS `pointer-events` — the check re-walks the DOM tree computing
    // ARIA roles, which is expensive in jsdom (~120ms+ per call) and
    // pushes simple click sequences past CI timeouts under cold loads.
    // We don't rely on the check here: every click target is a real
    // <button> with no `pointer-events: none` overrides, and the
    // assertions verify localStorage state which the pointer-events
    // check is supposed to protect.
    user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
  });

  const renderMenu = () =>
    render(
      <TestProviders>
        <ThemeProvider>
          <LanguageProvider>
            <UnitsProvider>
              <FontSizeProvider>
                <SettingsMenu
                  currentCity={noCity}
                  recentCities={noRecent}
                  onCitySelect={() => {}}
                />
              </FontSizeProvider>
            </UnitsProvider>
          </LanguageProvider>
        </ThemeProvider>
      </TestProviders>,
    );

  it('renders the units pill toggle with both options', async () => {
    renderMenu();
    await user.click(screen.getByRole('button', { name: /settings/i }));
    const unitsGroup = screen.getByRole('radiogroup', { name: /units/i });
    expect(unitsGroup).toBeInTheDocument();
    expect(within(unitsGroup).getByRole('radio', { name: 'Metric' })).toBeInTheDocument();
    expect(within(unitsGroup).getByRole('radio', { name: 'US' })).toBeInTheDocument();
  });

  it('marks Metric as checked by default', async () => {
    renderMenu();
    await user.click(screen.getByRole('button', { name: /settings/i }));
    expect(screen.getByRole('radio', { name: 'Metric' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'US' })).toHaveAttribute('aria-checked', 'false');
  });

  it('persists US selection to localStorage when clicked', async () => {
    renderMenu();
    await user.click(screen.getByRole('button', { name: /settings/i }));
    await user.click(screen.getByRole('radio', { name: 'US' }));
    expect(localStorage.getItem('weather-units')).toBe('us');
  });

  it('persists metric selection when clicked after US was active', async () => {
    localStorage.setItem('weather-units', 'us');
    renderMenu();
    await user.click(screen.getByRole('button', { name: /settings/i }));
    await user.click(screen.getByRole('radio', { name: 'Metric' }));
    expect(localStorage.getItem('weather-units')).toBe('metric');
  });

  it('renders the language pill toggle with both options', async () => {
    renderMenu();
    await user.click(screen.getByRole('button', { name: /settings/i }));
    const langGroup = screen.getByRole('radiogroup', { name: /language/i });
    expect(langGroup).toBeInTheDocument();
    expect(within(langGroup).getByRole('radio', { name: 'English' })).toBeInTheDocument();
    expect(within(langGroup).getByRole('radio', { name: '繁體中文' })).toBeInTheDocument();
  });

  it('marks English as checked by default', async () => {
    renderMenu();
    await user.click(screen.getByRole('button', { name: /settings/i }));
    expect(screen.getByRole('radio', { name: 'English' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '繁體中文' })).toHaveAttribute('aria-checked', 'false');
  });

  it('persists 繁體中文 selection to localStorage when clicked', async () => {
    renderMenu();
    await user.click(screen.getByRole('button', { name: /settings/i }));
    await user.click(screen.getByRole('radio', { name: '繁體中文' }));
    expect(localStorage.getItem('weather-language')).toBe('tc');
  });

  it('arrow keys cycle through options in the units pill', async () => {
    renderMenu();
    await user.click(screen.getByRole('button', { name: /settings/i }));
    const metricRadio = screen.getByRole('radio', { name: 'Metric' });
    metricRadio.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'US' })).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Metric' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('SettingsMenu theme pill toggle', () => {
  let user: UserEvent;

  beforeEach(() => {
    localStorage.clear();
    user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
  });

  const renderMenu = () =>
    render(
      <TestProviders>
        <ThemeProvider>
          <LanguageProvider>
            <UnitsProvider>
              <FontSizeProvider>
                <SettingsMenu currentCity={noCity} recentCities={noRecent} onCitySelect={() => {}} />
              </FontSizeProvider>
            </UnitsProvider>
          </LanguageProvider>
        </ThemeProvider>
      </TestProviders>,
    );

  it('renders the theme pill toggle with 3 options in Auto/Light/Dark order', async () => {
    renderMenu();
    await user.click(screen.getByRole('button', { name: /settings/i }));
    const themeGroup = screen.getByRole('radiogroup', { name: /theme/i });
    expect(themeGroup).toBeInTheDocument();
    const radios = within(themeGroup).getAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual(['Auto', 'Light', 'Dark']);
    expect(within(themeGroup).getByRole('radio', { name: 'Auto' })).toBeInTheDocument();
    expect(within(themeGroup).getByRole('radio', { name: 'Light' })).toBeInTheDocument();
    expect(within(themeGroup).getByRole('radio', { name: 'Dark' })).toBeInTheDocument();
  });

  it('marks Auto as the default checked theme', async () => {
    renderMenu();
    await user.click(screen.getByRole('button', { name: /settings/i }));
    expect(screen.getByRole('radio', { name: 'Auto' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'false');
  });

  it('persists Dark selection to localStorage when clicked', async () => {
    renderMenu();
    await user.click(screen.getByRole('button', { name: /settings/i }));
    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    // Pills are plain buttons (not Radix items), so the menu stays open —
    // assert the persisted state and the live aria-checked in one pass.
    expect(localStorage.getItem('theme-mode')).toBe('dark');
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Auto' })).toHaveAttribute('aria-checked', 'false');
  });

  it('arrow keys cycle through theme options', async () => {
    renderMenu();
    await user.click(screen.getByRole('button', { name: /settings/i }));
    const autoRadio = screen.getByRole('radio', { name: 'Auto' });
    autoRadio.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Auto' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('SettingsMenu primary action pill', () => {
  let user: UserEvent;

  beforeEach(() => {
    localStorage.clear();
    user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
  });

  const renderMenu = () =>
    render(
      <TestProviders>
        <ThemeProvider>
          <LanguageProvider>
            <UnitsProvider>
              <FontSizeProvider>
                <SettingsMenu currentCity={noCity} recentCities={noRecent} onCitySelect={() => {}} />
              </FontSizeProvider>
            </UnitsProvider>
          </LanguageProvider>
        </ThemeProvider>
      </TestProviders>,
    );

  it('renders Current location, Search and Refresh as one 3-button pill', async () => {
    renderMenu();
    await user.click(screen.getByRole('button', { name: /settings/i }));
    expect(screen.getByRole('menuitem', { name: /current location/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /search city/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /refresh data/i })).toBeInTheDocument();
    // Pill order follows the menu layout: Current location, Search, Refresh.
    const firstThree = screen.getAllByRole('menuitem').slice(0, 3);
    expect(firstThree.map((m) => m.getAttribute('aria-label'))).toEqual([
      'Use current location',
      'Search city',
      'Refresh Data',
    ]);
  });

  it('opens the search dialog from the search action', async () => {
    renderMenu();
    await user.click(screen.getByRole('button', { name: /settings/i }));
    await user.click(screen.getByRole('menuitem', { name: /search city/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /search for a city/i })).toBeInTheDocument();
  });
});

// Tiny helper — avoids an extra import surface just for `within`.
describe('SettingsMenu data-source credit (relocated from the page footer)', () => {
  let user: UserEvent;

  beforeEach(() => {
    localStorage.clear();
    user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
  });

  const hkCity: GeoLocation = {
    name: 'Hong Kong',
    latitude: 22.3193,
    longitude: 114.1694,
    country: 'HK',
  };
  const nonHkCity: GeoLocation = {
    name: 'London',
    latitude: 51.5072,
    longitude: -0.1276,
    country: 'GB',
    admin1: 'England',
  };

  const renderMenu = (city: GeoLocation | null = noCity) =>
    render(
      <TestProviders>
        <ThemeProvider>
          <LanguageProvider>
            <UnitsProvider>
              <FontSizeProvider>
                <SettingsMenu currentCity={city} recentCities={noRecent} onCitySelect={() => {}} />
              </FontSizeProvider>
            </UnitsProvider>
          </LanguageProvider>
        </ThemeProvider>
      </TestProviders>,
    );

  it('credits Open-Meteo & HK Observatory for a HK-coverage city (en)', async () => {
    renderMenu(hkCity);
    await user.click(screen.getByRole('button', { name: /settings/i }));
    expect(screen.getByText('Data from Open-Meteo & HK Observatory')).toBeInTheDocument();
  });

  it('credits both sources in Traditional Chinese after switching language', async () => {
    renderMenu(hkCity);
    await user.click(screen.getByRole('button', { name: /settings/i }));
    await user.click(screen.getByRole('radio', { name: '繁體中文' }));
    expect(screen.getByText('資料來源：Open-Meteo 及 香港天文台')).toBeInTheDocument();
  });

  it('credits Open-Meteo alone for a non-HK city', async () => {
    renderMenu(nonHkCity);
    await user.click(screen.getByRole('button', { name: /settings/i }));
    expect(screen.getByText('Data from Open-Meteo')).toBeInTheDocument();
    expect(screen.queryByText(/HK Observatory/i)).not.toBeInTheDocument();
  });

  it('credits Open-Meteo alone when no city is selected yet', async () => {
    renderMenu(noCity);
    await user.click(screen.getByRole('button', { name: /settings/i }));
    expect(screen.getByText('Data from Open-Meteo')).toBeInTheDocument();
  });
});

describe('SettingsMenu font-size pill toggle', () => {
  let user: UserEvent;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.removeProperty('font-size');
    user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
  });

  const renderMenu = () =>
    render(
      <TestProviders>
        <ThemeProvider>
          <LanguageProvider>
            <UnitsProvider>
              <FontSizeProvider>
                <SettingsMenu currentCity={noCity} recentCities={noRecent} onCitySelect={() => {}} />
              </FontSizeProvider>
            </UnitsProvider>
          </LanguageProvider>
        </ThemeProvider>
      </TestProviders>,
    );

  it('renders the pill with Small/Medium/Large options in order', async () => {
    renderMenu();
    await user.click(screen.getByRole('button', { name: /settings/i }));
    const sizeGroup = screen.getByRole('radiogroup', { name: /text size/i });
    const radios = within(sizeGroup).getAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual(['Small', 'Medium', 'Large']);
  });

  it('marks Medium as checked by default', async () => {
    renderMenu();
    await user.click(screen.getByRole('button', { name: /settings/i }));
    expect(screen.getByRole('radio', { name: 'Medium' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Small' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: 'Large' })).toHaveAttribute('aria-checked', 'false');
  });

  it('persists Large and rescales the root font-size when clicked', async () => {
    renderMenu();
    await user.click(screen.getByRole('button', { name: /settings/i }));
    await user.click(screen.getByRole('radio', { name: 'Large' }));
    expect(localStorage.getItem('weather-font-size')).toBe('large');
    expect(document.documentElement.style.fontSize).toBe('112.5%');
    expect(screen.getByRole('radio', { name: 'Large' })).toHaveAttribute('aria-checked', 'true');
  });

  it('applies a stored Small preference to the root font-size on mount', () => {
    localStorage.setItem('weather-font-size', 'small');
    renderMenu();
    expect(document.documentElement.style.fontSize).toBe('87.5%');
  });

  it('shows 細/標準/大 labels after switching to Traditional Chinese', async () => {
    renderMenu();
    await user.click(screen.getByRole('button', { name: /settings/i }));
    await user.click(screen.getByRole('radio', { name: '繁體中文' }));
    const sizeGroup = screen.getByRole('radiogroup', { name: '字體大小' });
    const radios = within(sizeGroup).getAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual(['細', '標準', '大']);
  });
});
