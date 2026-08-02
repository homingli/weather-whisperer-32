import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WeatherBanners } from './WeatherBanners';
import { LanguageProvider } from '@/contexts/LanguageContext';
import type { WeatherData, SourceState } from '@/lib/weather';

function makeWeather(overrides: Partial<WeatherData> = {}): WeatherData {
  return {
    current: {
      temperature: 25,
      apparentTemperature: 27,
      humidity: 70,
      uvIndex: 5,
      weatherCode: 0,
      windSpeed: 10,
      windDirection: 180,
      precipitation: 0,
      precipitationProbability: 20,
      isDay: true,
    },
    hourly: [],
    daily: [],
    ...overrides,
  };
}

const okOm: SourceState = { ok: true, cachedAt: Date.now(), ttlMs: 5 * 60_000, isExpired: false };
const okHko: SourceState = { ok: true, cachedAt: Date.now(), ttlMs: 60_000, isExpired: false };
const failedHko: SourceState = { ok: false, cachedAt: 0, ttlMs: 60_000, isExpired: true };

function renderBanner(weather: WeatherData, props: Partial<{ onRefetch: () => void; isRefetching: boolean }> = {}) {
  return render(
    <LanguageProvider>
      <WeatherBanners weather={weather} isHKCovered={true} {...props} />
    </LanguageProvider>
  );
}

describe('WeatherBanners', () => {
  describe('live data (no flag)', () => {
    it('renders nothing when neither isFallback nor hkoFailed is set', () => {
      const { container } = renderBanner(makeWeather());
      expect(container.firstChild).toBeNull();
    });
  });

  describe('legacy HKO fallback', () => {
    it('renders the legacy amber banner for fallbackSource: HKO', () => {
      const weather = makeWeather({
        isFallback: true,
        fallbackSource: 'HKO',
        sources: { om: failedHko, hko: okHko },
      });
      renderBanner(weather);
      expect(screen.getByTestId('banner-hko')).toBeInTheDocument();
    });
  });

  describe('partial (one source unavailable)', () => {
    it('renders the amber partial banner with the working source name', () => {
      const weather = makeWeather({
        isFallback: true,
        fallbackSource: 'partial',
        sources: { om: okOm, hko: failedHko },
      });
      renderBanner(weather);
      const banner = screen.getByTestId('banner-partial');
      expect(banner).toBeInTheDocument();
      // English copy mentions Open-Meteo since OM is the live source.
      expect(banner.textContent).toMatch(/Open-Meteo/i);
    });

    it('names HKO when only HKO is live', () => {
      const weather = makeWeather({
        isFallback: true,
        fallbackSource: 'partial',
        sources: { om: failedHko, hko: okHko },
      });
      renderBanner(weather);
      const banner = screen.getByTestId('banner-partial');
      expect(banner.textContent).toMatch(/HK Observatory/i);
    });
  });

  describe('cache (both sources unavailable)', () => {
    it('renders the red offline banner with a refetch button', () => {
      const weather = makeWeather({
        isFallback: true,
        fallbackSource: 'cache',
        sources: { om: failedHko, hko: failedHko },
      });
      const onRefetch = vi.fn();
      renderBanner(weather, { onRefetch });
      const banner = screen.getByTestId('banner-cache');
      expect(banner).toBeInTheDocument();
      const button = screen.getByRole('button');
      fireEvent.click(button);
      expect(onRefetch).toHaveBeenCalledOnce();
    });

    it('disables the refetch button while a refetch is in flight', () => {
      const weather = makeWeather({
        isFallback: true,
        fallbackSource: 'cache',
        sources: { om: failedHko, hko: failedHko },
      });
      renderBanner(weather, { onRefetch: () => {}, isRefetching: true });
      const button = screen.getByRole('button') as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });
  });

  describe('legacy hkoFailed (no isFallback)', () => {
    it('renders the legacy amber HKO-failed note', () => {
      const weather = makeWeather({
        hkoFailed: true,
      });
      renderBanner(weather);
      expect(screen.getByTestId('banner-hko-failed')).toBeInTheDocument();
    });
  });

  describe('WCAG 4.1.3 role semantics', () => {
    it('uses role="alert" only for the offline (cache) banner — interrupts screen readers', () => {
      const weather = makeWeather({
        isFallback: true,
        fallbackSource: 'cache',
        sources: { om: failedHko, hko: failedHko },
      });
      renderBanner(weather);
      const banner = screen.getByTestId('banner-cache');
      expect(banner).toHaveAttribute('role', 'alert');
    });

    it('uses role="status" for the informational amber banners — non-interrupting', () => {
      const hko: WeatherData = makeWeather({
        isFallback: true,
        fallbackSource: 'HKO',
        sources: { om: failedHko, hko: okHko },
      });
      const { rerender } = renderBanner(hko);
      expect(screen.getByTestId('banner-hko')).toHaveAttribute('role', 'status');

      const partial: WeatherData = makeWeather({
        isFallback: true,
        fallbackSource: 'partial',
        sources: { om: okOm, hko: failedHko },
      });
      rerender(
        <LanguageProvider>
          <WeatherBanners weather={partial} isHKCovered={true} />
        </LanguageProvider>
      );
      expect(screen.getByTestId('banner-partial')).toHaveAttribute('role', 'status');

      const hkoFailed: WeatherData = makeWeather({ hkoFailed: true });
      rerender(
        <LanguageProvider>
          <WeatherBanners weather={hkoFailed} isHKCovered={true} />
        </LanguageProvider>
      );
      expect(screen.getByTestId('banner-hko-failed')).toHaveAttribute('role', 'status');
    });
  });
});