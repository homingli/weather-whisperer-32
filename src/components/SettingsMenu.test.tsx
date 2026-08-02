import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsMenu } from './SettingsMenu';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { UnitsProvider } from '@/contexts/UnitsContext';
import { GeoLocation } from '@/lib/weather';

const noCity: GeoLocation | null = null;
const noRecent: GeoLocation[] = [];

describe('SettingsMenu units + language pill toggles', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const renderMenu = () =>
    render(
      <ThemeProvider>
        <LanguageProvider>
          <UnitsProvider>
            <SettingsMenu
              currentCity={noCity}
              recentCities={noRecent}
              onCitySelect={() => {}}
            />
          </UnitsProvider>
        </LanguageProvider>
      </ThemeProvider>,
    );

  it('renders the units pill toggle with both options', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    const unitsGroup = screen.getByRole('radiogroup', { name: /units/i });
    expect(unitsGroup).toBeInTheDocument();
    expect(within(unitsGroup).getByRole('radio', { name: 'Metric' })).toBeInTheDocument();
    expect(within(unitsGroup).getByRole('radio', { name: 'US' })).toBeInTheDocument();
  });

  it('marks Metric as checked by default', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(screen.getByRole('radio', { name: 'Metric' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'US' })).toHaveAttribute('aria-checked', 'false');
  });

  it('persists US selection to localStorage when clicked', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    await userEvent.click(screen.getByRole('radio', { name: 'US' }));
    expect(localStorage.getItem('weather-units')).toBe('us');
  });

  it('persists metric selection when clicked after US was active', async () => {
    localStorage.setItem('weather-units', 'us');
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    await userEvent.click(screen.getByRole('radio', { name: 'Metric' }));
    expect(localStorage.getItem('weather-units')).toBe('metric');
  });

  it('renders the language pill toggle with both options', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    const langGroup = screen.getByRole('radiogroup', { name: /language/i });
    expect(langGroup).toBeInTheDocument();
    expect(within(langGroup).getByRole('radio', { name: 'English' })).toBeInTheDocument();
    expect(within(langGroup).getByRole('radio', { name: '繁體中文' })).toBeInTheDocument();
  });

  it('marks English as checked by default', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(screen.getByRole('radio', { name: 'English' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '繁體中文' })).toHaveAttribute('aria-checked', 'false');
  });

  it('persists 繁體中文 selection to localStorage when clicked', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    await userEvent.click(screen.getByRole('radio', { name: '繁體中文' }));
    expect(localStorage.getItem('weather-language')).toBe('tc');
  });

  it('arrow keys cycle through options in the units pill', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    const metricRadio = screen.getByRole('radio', { name: 'Metric' });
    metricRadio.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'US' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Metric' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('SettingsMenu theme radio group (WCAG 4.1.2)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const renderMenu = () =>
    render(
      <ThemeProvider>
        <LanguageProvider>
          <UnitsProvider>
            <SettingsMenu currentCity={noCity} recentCities={noRecent} onCitySelect={() => {}} />
          </UnitsProvider>
        </LanguageProvider>
      </ThemeProvider>,
    );

  it('renders the theme picker as menuitemradio entries with 3 options', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    // Radix DropdownMenu items render as role="menuitemradio" inside a
    // menu, not bare role="radio" inside a radiogroup. The semantic
    // purpose is the same (exclusive 1-of-N choice) — what matters for
    // WCAG 4.1.2 is that the active option is marked with aria-checked.
    expect(screen.getByRole('menuitemradio', { name: /light/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: /dark/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: /auto/i })).toBeInTheDocument();
  });

  it('marks Auto as the default checked theme', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(screen.getByRole('menuitemradio', { name: /auto/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: /light/i })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('menuitemradio', { name: /dark/i })).toHaveAttribute('aria-checked', 'false');
  });

  it('persists Dark selection to localStorage when clicked', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    await userEvent.click(screen.getByRole('menuitemradio', { name: /dark/i }));
    // Radix closes the menu after a radio item is chosen, so re-open to
    // verify the aria-checked state reflects the persisted selection.
    expect(localStorage.getItem('theme-mode')).toBe('dark');
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(screen.getByRole('menuitemradio', { name: /dark/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: /auto/i })).toHaveAttribute('aria-checked', 'false');
  });
});

// Tiny helper — avoids an extra import surface just for `within`.