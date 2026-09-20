import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { WeatherAlerts } from './WeatherAlerts';
import { LanguageProvider } from '@/contexts/LanguageContext';
import type { HKOWarning } from '@/lib/hko-types';
import warnsumEn from '@/lib/__fixtures__/hko-warnsum-2026-07-31-en.json';
import warnsumTc from '@/lib/__fixtures__/hko-warnsum-2026-07-31-tc.json';

const warning = (overrides: Partial<HKOWarning> = {}): HKOWarning => ({
  name: 'Typhoon Signal No. 8',
  code: 'TC8',
  actionCode: 'Issue',
  issueTime: '2024-01-01T00:00:00+08:00',
  updateTime: '2024-01-01T00:00:00+08:00',
  ...overrides,
});

const renderWithLanguage = (ui: React.ReactElement) =>
  render(<LanguageProvider>{ui}</LanguageProvider>);

describe('WeatherAlerts', () => {
  it('renders nothing when there are no active warnings', () => {
    const { container } = renderWithLanguage(<WeatherAlerts warnings={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders an icon button per active warning', () => {
    renderWithLanguage(
      <WeatherAlerts
        warnings={[
          warning({ code: 'TC8', name: 'Typhoon 8' }),
          warning({ code: 'WRAIN', name: 'Red Rainstorm' }),
        ]}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('filters out cancelled warnings', () => {
    renderWithLanguage(
      <WeatherAlerts
        warnings={[
          warning({ code: 'TC8', actionCode: 'Issue' }),
          warning({ code: 'TC8', actionCode: 'Cancel' }),
        ]}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('filters out CANCEL warnings (uppercase — what live HKO actually returns)', () => {
    // Regression: prior to fix/mobile-responsive-design, the filter compared
    // against mixed-case 'Cancel' but live HKO returns uppercase 'CANCEL',
    // so a cancelled amber rainstorm stayed visible in production. Both
    // casings must now be filtered.
    renderWithLanguage(
      <WeatherAlerts
        warnings={[
          warning({ code: 'WRAINA', name: 'Amber Rainstorm (Cancelled)', actionCode: 'CANCEL' }),
          warning({ code: 'WTS', name: 'Thunderstorm Warning', actionCode: 'EXTEND' }),
        ]}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Thunderstorm/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Amber Rainstorm/i })).toBeNull();
  });

  it('filters the cancelled amber rainstorm from the live 2026-07-31 EN fixture', () => {
    // Locks the regression against the exact JSON shape HKO returns. The live
    // feed uses uppercase 'CANCEL' for the warning that triggered the bug;
    // only the active 'EXTEND' thunderstorm warning should render.
    // Fixture: src/lib/__fixtures__/hko-warnsum-2026-07-31-en.json
    const liveWarnings = Object.values(warnsumEn) as HKOWarning[];
    expect(liveWarnings.map(w => w.actionCode)).toContain('CANCEL');

    renderWithLanguage(<WeatherAlerts warnings={liveWarnings} />);

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Thunderstorm/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rainstorm/i })).toBeNull();
  });

  it('filters the cancelled amber rainstorm from the live 2026-07-31 TC fixture', () => {
    // Same shape, Traditional Chinese names. actionCode case is identical
    // across languages (per fixture inspection 2026-07-31).
    const liveWarnings = Object.values(warnsumTc) as HKOWarning[];
    expect(liveWarnings.map(w => w.actionCode)).toContain('CANCEL');

    renderWithLanguage(<WeatherAlerts warnings={liveWarnings} />);

    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  

  it('applies animate-warning-pulse class to matching button when pulseCodes contains its code', () => {
    const { container } = renderWithLanguage(
      <WeatherAlerts
        warnings={[warning({ code: 'TC8' })]}
        pulseTrigger={1}
        pulseCodes={new Set(['TC8'])}
      />,
    );
    const button = container.querySelector('button');
    expect(button?.className).toContain('animate-warning-pulse');
  });

  it('does not apply pulse class when pulseCodes does not contain the code', () => {
    const { container } = renderWithLanguage(
      <WeatherAlerts
        warnings={[warning({ code: 'TC8' })]}
        pulseTrigger={1}
        pulseCodes={new Set(['OTHER'])}
      />,
    );
    const button = container.querySelector('button');
    expect(button?.className).not.toContain('animate-warning-pulse');
  });

  it('removes pulse class after the animation duration', () => {
    vi.useFakeTimers();
    const { container } = renderWithLanguage(
      <WeatherAlerts
        warnings={[warning({ code: 'TC8' })]}
        pulseTrigger={1}
        pulseCodes={new Set(['TC8'])}
      />,
    );
    expect(container.querySelector('button')?.className).toContain('animate-warning-pulse');
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(container.querySelector('button')?.className).not.toContain('animate-warning-pulse');
    vi.useRealTimers();
  });

  it('opens modal when selectedWarningCode matches a warning and fires onConsumed', () => {
    const onConsumed = vi.fn();
    // Use a code that's not in the i18n map so the API-provided name is used as-is
    renderWithLanguage(
      <WeatherAlerts
        warnings={[warning({ code: 'CUSTOM_XYZ', name: 'Custom Test Warning' })]}
        selectedWarningCode="CUSTOM_XYZ"
        onConsumed={onConsumed}
      />,
    );
    expect(screen.getAllByText('Custom Test Warning').length).toBeGreaterThan(0);
    expect(onConsumed).toHaveBeenCalledTimes(1);
  });

  it('fires onConsumed even when selectedWarningCode does not match (warning no longer active)', () => {
    const onConsumed = vi.fn();
    renderWithLanguage(
      <WeatherAlerts
        warnings={[warning({ code: 'TC8' })]}
        selectedWarningCode="MISSING"
        onConsumed={onConsumed}
      />,
    );
    expect(onConsumed).toHaveBeenCalledTimes(1);
  });

  it('does not open modal or fire onConsumed when selectedWarningCode is null', () => {
    const onConsumed = vi.fn();
    renderWithLanguage(
      <WeatherAlerts
        warnings={[warning({ code: 'TC8' })]}
        selectedWarningCode={null}
        onConsumed={onConsumed}
      />,
    );
    // Modal title only appears when a warning is selected; sr-only still in DOM but content check:
    expect(screen.queryByText('Typhoon Signal No. 8', { selector: 'span' })).toBeNull();
    expect(onConsumed).not.toHaveBeenCalled();
  });
});