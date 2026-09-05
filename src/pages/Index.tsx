import { useMemo, useCallback, lazy, Suspense, useEffect, useState, useRef } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination } from 'swiper/modules';
import { CurrentWeather } from '@/components/CurrentWeather';

import { FetchingStatus } from '@/components/FetchingStatus';
import { LocalClock } from '@/components/LocalClock';
import { useSelectedCity } from '@/hooks/useSelectedCity';
import { useWeatherWithProgress } from '@/hooks/useWeatherWithProgress';
import { useWarningChangeDetector } from '@/hooks/useWarningChangeDetector';
import {
  useDevSimulatedWarnings,
  useDevBaselineNonce,
} from '@/lib/devWarningSimulator';
import { isInHongKong, isInRainfallRegion, translateStationName, translateDistrictName, getWarningIcon } from '@/lib/hko-weather';
import { PLACEHOLDER_SENTINEL, isInVancouverBox } from '@/lib/constants';
import { prefetchMscNowcast } from '@/lib/msc-prefetch';
import { useLanguage, formatString } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { toast } from 'sonner';
import { CloudRain, MapPin, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { TomorrowGlance } from '@/components/TomorrowGlance';

// Lazy load heavy components. DailyForecast pulls recharts (~120 kB) and is
// below the fold on both mobile (Swiper slide 2) and desktop (split row);
// deferring it lets recharts come out of the main chunk.
const DailyForecast = lazy(() => import('@/components/DailyForecast').then(module => ({ default: module.DailyForecast })));
const HourlyForecast = lazy(() => import('@/components/HourlyForecast').then(module => ({ default: module.HourlyForecast })));
const RainfallMap = lazy(() => import('@/components/RainfallMap').then(module => ({ default: module.RainfallMap })));
const MSCRainfallMap = lazy(() => import('@/components/MSCRainfallMap').then(module => ({ default: module.MSCRainfallMap })));
// SettingsMenu (dropdown) and WeatherBanners (error/partial banners) only
// render behind a user action or a degraded-data state respectively;
// deferring them keeps Dialog/Input primitives and the geocoding helpers
// out of the initial chunk.
const SettingsMenu = lazy(() => import('@/components/SettingsMenu').then(module => ({ default: module.SettingsMenu })));
const WeatherBanners = lazy(() => import('@/components/WeatherBanners').then(module => ({ default: module.WeatherBanners })));
const WeatherAlerts = lazy(() => import('@/components/WeatherAlerts').then(module => ({ default: module.WeatherAlerts })));

// Placeholder used when weather.current is null during transitions
// All display values set to PLACEHOLDER_SENTINEL so CurrentWeather shows `-` instead of 0
const PLACEHOLDER_CURRENT = {
  temperature: PLACEHOLDER_SENTINEL,
  apparentTemperature: PLACEHOLDER_SENTINEL,
  humidity: PLACEHOLDER_SENTINEL,
  uvIndex: PLACEHOLDER_SENTINEL,
  windSpeed: PLACEHOLDER_SENTINEL,
  windDirection: 0,
  precipitation: 0,
  precipitationProbability: 0,
  isDay: false,
  weatherCode: 3,
};

const Index = () => {
  const { language, t } = useLanguage();
  // API/content lang is 'tc' for Traditional Chinese, 'en' for everything else.
  const lang = language === 'tc' ? 'tc' : 'en';
  const { setSunTimes } = useTheme();
  const { selectedCity, recentCities, isLocating, handleCitySelect } = useSelectedCity();
  const { data: weather, isLoading, error, refetch, isFetching, loadProgress } = useWeatherWithProgress(
    selectedCity?.latitude,
    selectedCity?.longitude,
    lang,
  );

  const handleForceRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const handleConsumedSelectedWarning = useCallback(() => {
    setSelectedWarningCode(null);
  }, []);

  // Open-Meteo daily data is always used for sunrise/sunset (HKO doesn't provide it)
  const sunTimes = useMemo(() => weather?.daily, [weather?.daily]);

  // Update theme context with sunrise/sunset times for auto mode
  useEffect(() => {
    if (sunTimes && sunTimes.length > 0) {
      const todayForecast = sunTimes[0];
      const sunrise = todayForecast.sunrise instanceof Date ? todayForecast.sunrise : new Date(todayForecast.sunrise);
      const sunset = todayForecast.sunset instanceof Date ? todayForecast.sunset : new Date(todayForecast.sunset);

      if (!isNaN(sunrise.getTime()) && !isNaN(sunset.getTime())) {
        setSunTimes(sunrise, sunset);
      }
    }
  }, [sunTimes, setSunTimes]);

  // PWA install
  const { deferredPrompt, isInstalled, install } = usePwaInstall();

  // Determine if selected city is in Hong Kong coverage area
  const isHKCovered = selectedCity ? isInHongKong(selectedCity.latitude, selectedCity.longitude) : false;
  // Nowcast map region: PRD (HKO) or Vancouver (MSC). Vancouver wins the
  // split when both are true (the boxes don't overlap).
  const nowcastVisible = !!selectedCity &&
    (isInRainfallRegion(selectedCity.latitude, selectedCity.longitude) ||
      isInVancouverBox(selectedCity.latitude, selectedCity.longitude));
  const useMSCNowcast = !!selectedCity &&
    isInVancouverBox(selectedCity.latitude, selectedCity.longitude);

  // MSC prefetch: once the selected city is in the Vancouver box, warm the
  // nowcast map's lazy chunk + probe tiles at idle so the map's first render
  // doesn't stall on a ~150 kB chunk fetch. Network-gated inside the helper
  // (skips on saveData / 2G) and one-shot per session.
  useEffect(() => {
    if (useMSCNowcast) prefetchMscNowcast();
  }, [useMSCNowcast]);

  // Warning change detection: emit toast + pulse on newly added warnings,
  // toast only on cancellations (badge disappears on its own).
  // In dev, merge fake warnings from the console simulator with real data so
  // the full add/remove/cancel flow can be tested end-to-end without a live
  // HKO event.
  const simulatedWarnings = useDevSimulatedWarnings();
  const baselineNonce = useDevBaselineNonce();
  const effectiveWarnings = useMemo(() => {
    const real = weather?.warnings ?? [];
    if (simulatedWarnings.length === 0) return real;
    return [...real, ...simulatedWarnings];
  }, [weather?.warnings, simulatedWarnings]);

  const cityKey = selectedCity ? `${selectedCity.latitude},${selectedCity.longitude}` : null;
  const warningDiff = useWarningChangeDetector(effectiveWarnings, `${cityKey}:${baselineNonce}`);
  const [pulseTrigger, setPulseTrigger] = useState(0);
  const [selectedWarningCode, setSelectedWarningCode] = useState<string | null>(null);
  const lastConsumedDiff = useRef<typeof warningDiff | null>(null);

  useEffect(() => {
    if (warningDiff === lastConsumedDiff.current) return;
    lastConsumedDiff.current = warningDiff;

    if (warningDiff.added.length === 0 && warningDiff.removed.length === 0) return;

    for (const w of warningDiff.added) {
      const displayName = t(`warnings.${w.code}`, w.name);
      toast(formatString(t('alerts.toast.issued'), displayName), {
        duration: 5000,
        icon: <img src={getWarningIcon(w.code)} alt="" className="h-6 w-6" />,
        action: {
          label: t('alerts.toast.view'),
          onClick: () => setSelectedWarningCode(w.code),
        },
      });
    }
    for (const w of warningDiff.removed) {
      const displayName = t(`warnings.${w.code}`, w.name);
      toast(formatString(t('alerts.toast.cancelled'), displayName), { duration: 5000 });
    }
    if (warningDiff.added.length > 0) {
      setPulseTrigger(n => n + 1);
    }
  }, [warningDiff, t]);

  // Mobile detection for conditional rendering (avoids double-mounting both layouts)
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia('(max-width: 1080px)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1080px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Reveal target for the Tomorrow strip: desktop scrolls the secondary row
  // (hourly/daily) into view; mobile advances the swipe deck to the slide
  // that holds the DailyForecast.
  const dailySectionRef = useRef<HTMLDivElement | null>(null);
  const mobileSwiperRef = useRef<{ slideTo(index: number, speed?: number): void } | null>(null);

  const revealDailyForecast = useCallback(() => {
    if (isMobile) {
      mobileSwiperRef.current?.slideTo(1, 400);
      return;
    }
    dailySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [isMobile]);

  // Dev-only: `window.__devWarnings` is mounted by devWarningSimulator.ts at
  // module load time. Try __devWarnings.add('TC8') / .addCancelled('TC1') /
  // .remove('TC8') / .resetBaseline() / .list().

  // Freshness banner moved into <WeatherBanners>; the hook augments the
  // cached data with `fallbackSource: 'cache'` when the background fetch
  // fails, so we no longer need a separate top-bar label here.

  return (
    <div className={`min-h-screen gradient-sky flex flex-col${isMobile ? ' h-dvh' : ''}`}>
      <div className={`w-full mx-auto safe-px safe-top safe-bottom flex flex-col flex-1 min-h-0 transition-all duration-300${
        isMobile ? '' : ' max-w-2xl lg:max-w-5xl xl:max-w-7xl'
      }`}>
        {/* Top bar: row 1 = [date time]; row 2 = [location]; right column spans both */}
        <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 mb-3 shrink-0">
          <div className="flex items-center">
            {weather?.timezone && (
              <LocalClock timezone={weather.timezone} />
            )}
          </div>
          <div className="row-span-2 flex items-center justify-end gap-2">
            {effectiveWarnings.length > 0 && (
              <Suspense fallback={null}>
                <WeatherAlerts
                  warnings={effectiveWarnings}
                  pulseTrigger={pulseTrigger}
                  pulseCodes={new Set(warningDiff.added.map(w => w.code))}
                  selectedWarningCode={selectedWarningCode}
                  onConsumed={handleConsumedSelectedWarning}
                />
              </Suspense>
            )}
            <Suspense fallback={<div tabIndex={-1} className="h-12 w-12" aria-hidden="true" />}>
              <SettingsMenu currentCity={selectedCity} recentCities={recentCities} onCitySelect={handleCitySelect} onRefresh={handleForceRefresh} />
            </Suspense>
            {deferredPrompt && !isInstalled && (
              <button
                onClick={install}
                aria-label={t('pwa.install')}
                className="h-full min-h-[3rem] px-3 flex items-center gap-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                title={t('pwa.install')}
              >
                <Download className="h-5 w-5" />
                <span className="hidden sm:inline">{t('pwa.install')}</span>
              </button>
            )}
          </div>
          {selectedCity && (
            <div className="flex items-center gap-2 text-muted-foreground flex-wrap min-w-0">
              <MapPin className="h-5 w-5 shrink-0" />
              <div className="flex items-center flex-wrap gap-2">
                {isHKCovered ? (
                  weather?.nearestStation && (
                    <span className="text-base font-medium text-foreground">
                      {translateStationName(weather.nearestStation, lang)}
                    </span>
                  )
                ) : (
                  <span className="text-base font-medium text-foreground">
                    {selectedCity.name}{selectedCity.admin1 ? `, ${selectedCity.admin1}` : ''}, {selectedCity.country}
                  </span>
                )}
                {weather?.nearestDistrict && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                    {translateDistrictName(weather.nearestDistrict, lang)}
                  </span>
                )}
              </div>
              {isFetching && weather && !isLoading && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status" aria-live="polite">
                  <span className="h-2 w-2 rounded-full bg-primary animate-pulse" aria-hidden="true" />
                  <span>Refreshing...</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Skip link — first focusable element so keyboard users can jump past the
            header buttons to the main forecast. Becomes visible only on focus. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {language === 'tc' ? '跳到主要內容' : 'Skip to main content'}
        </a>

        {/* Screen reader only header */}
        <h1 className="sr-only shrink-0">Weather Forecast</h1>

        {/* Main content */}
        <main id="main-content" className="w-full flex-1 flex flex-col min-h-0">
          {isLocating ? (
            <div className="text-center py-20 animate-fade-in">
              <CloudRain className="h-20 w-20 mx-auto mb-4 text-primary" />
              <h2 className="text-3xl font-semibold mb-2">{t('loading.findingLocation')}</h2>
              <p className="text-lg text-muted-foreground">
                {t('loading.allowLocation')}
              </p>
            </div>
          ) : !selectedCity ? (
            <div className="text-center py-20 animate-fade-in">
              <CloudRain className="h-20 w-20 mx-auto mb-4 text-primary" />
              <h2 className="text-3xl font-semibold mb-2">{t('loading.welcome')}</h2>
              <p className="text-lg text-muted-foreground">
                {t('loading.searchPrompt')}
              </p>
            </div>
          ) : isLoading ? (
            <FetchingStatus loadProgress={loadProgress} isHKCovered={isHKCovered} />
          ) : !weather && error ? (
            <div className="text-center py-20 glass-card">
              <p className="text-lg text-destructive mb-2">{t('loading.failed')}</p>
              <p className="text-base text-muted-foreground">{t('loading.tryAgain')}</p>
            </div>
          ) : weather ? (
            <>
              <Suspense fallback={null}>
                <WeatherBanners
                  weather={weather}
                  onRefetch={handleForceRefresh}
                  isRefetching={isFetching}
                />
              </Suspense>

              {/* ── Mobile: horizontal swipe card deck ── */}
              {isMobile && (
                <div className="flex flex-col flex-1 min-h-0 mt-3 animate-fade-in">
                  {/* Tomorrow strip stays above the deck so it is glanceable on
                      every slide (hero + hourly/daily live on separate swipe
                      slides on mobile; see TomorrowGlance). */}
                  <div className="mb-3 shrink-0">
                    <TomorrowGlance forecast={weather.daily?.[1]} onReveal={revealDailyForecast} />
                  </div>
                  <Swiper
                    modules={[Pagination]}
                    onSwiper={(instance) => {
                      mobileSwiperRef.current = instance;
                    }}
                    pagination={{ el: '#swiper-mobile-deck-pagination', clickable: true }}
                    spaceBetween={16}
                    slidesPerView={1}
                    className="swiper-mobile-deck"
                    threshold={30}
                    noSwipingClass="no-swipe"
                  >
                    {/* Slide 1: Current weather */}
                    <SwiperSlide>
                      <CurrentWeather
                        compact
                        weather={weather.current ?? PLACEHOLDER_CURRENT}
                        hourlyForecast={weather.hourly || []}
                        dailyForecast={weather?.daily?.[0]}
                        tomorrowSunrise={weather?.daily?.[1]?.sunrise}
                        locationName={selectedCity?.name}
                        timezone={weather.timezone}
                        headline={weather.headline}
                      />
                    </SwiperSlide>

                    {/* Slide 2: Hourly (top) + 7-day (bottom) split 50/50 */}
                    <SwiperSlide>
                      <div className="flex flex-col gap-3 h-full">
                        <div className="flex-1 min-h-0">
                          <Suspense fallback={<Skeleton className="h-full rounded-xl bg-muted/20 glass-card" />}>
                            <HourlyForecast forecast={weather.hourly || []} daily={sunTimes || []} timezone={weather.timezone} />
                          </Suspense>
                        </div>
                        <div className="flex-1 min-h-0">
                          <Suspense fallback={<Skeleton className="h-full rounded-xl bg-muted/20" />}>
                            <DailyForecast forecast={weather.daily || []} timezone={weather.timezone} />
                          </Suspense>
                        </div>
                      </div>
                    </SwiperSlide>

                    {/* Slide 3: Rainfall map (PRD only) */}
                    {nowcastVisible && (
                      <SwiperSlide>
                        <Suspense fallback={<Skeleton className="h-full rounded-xl bg-muted/20 glass-card" />}>
                          {useMSCNowcast ? (
                            <MSCRainfallMap userLocation={{ latitude: selectedCity.latitude, longitude: selectedCity.longitude }} />
                          ) : (
                            <RainfallMap userLocation={{ latitude: selectedCity.latitude, longitude: selectedCity.longitude }} />
                          )}
                        </Suspense>
                      </SwiperSlide>
                    )}
                  </Swiper>

                  {/* Swipe hint + pagination — bullets render here (outside the swiper
                      so they don't overlap the rainfall band's legend). CSS overrides
                      in src/index.css neutralize swiper's default absolute positioning
                      so the dots flow inline with the chevrons. */}
                  <div id="swiper-mobile-deck-pagination" className="flex items-center justify-center gap-3 py-2 text-muted-foreground/50 shrink-0">
                    <ChevronLeft className="h-3 w-3" />
                    <ChevronRight className="h-3 w-3" />
                  </div>
                </div>
              )}

              {/* ── Desktop: original grid layout (lg+) ── */}
              {!isMobile && (
                <div className="space-y-6 lg:space-y-8 animate-fade-in">
                  {/* Top Row: Hero (Full Width) */}
                  <div className="space-y-6">
                    <CurrentWeather
                      weather={weather.current ?? PLACEHOLDER_CURRENT}
                      hourlyForecast={weather.hourly || []}
                      dailyForecast={weather?.daily?.[0]}
                      tomorrowSunrise={weather?.daily?.[1]?.sunrise}
                      locationName={selectedCity?.name}
                      timezone={weather.timezone}
                      headline={weather.headline}
                    />
                  </div>

                  {/* Tomorrow at a glance — thin strip between the hero and
                      the hourly/daily split. Scrolls the split below on tap. */}
                  <TomorrowGlance forecast={weather.daily?.[1]} onReveal={revealDailyForecast} />

                  {/* Secondary Row: Split Forecasts */}
                  <div ref={dailySectionRef} className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-stretch">
                    <Suspense fallback={<Skeleton className="h-[300px] rounded-xl bg-muted/20" />}>
                      <HourlyForecast forecast={weather.hourly || []} daily={sunTimes || []} timezone={weather.timezone} />
                    </Suspense>

                    <Suspense fallback={<Skeleton className="h-[300px] rounded-xl bg-muted/20" />}>
                      <DailyForecast forecast={weather.daily || []} timezone={weather.timezone} />
                    </Suspense>
                  </div>

                  {/* Bottom Row: Optional Map */}
                  {nowcastVisible && (
                    <Suspense fallback={<Skeleton className="h-[400px] rounded-xl bg-muted/20" />}>
                      {useMSCNowcast ? (
                        <MSCRainfallMap userLocation={{ latitude: selectedCity.latitude, longitude: selectedCity.longitude }} />
                      ) : (
                        <RainfallMap userLocation={{ latitude: selectedCity.latitude, longitude: selectedCity.longitude }} />
                      )}
                    </Suspense>
                  )}
                </div>
              )}
            </>
          ) : null}
        </main>

        {/* Footer */}
        <footer className="text-center py-3 shrink-0 text-sm text-muted-foreground" aria-label={language === 'tc' ? '關於此頁' : 'About this page'}>
          <p>
            {isHKCovered
              ? formatString(t('source.poweredByBoth'), t('source.openMeteo'), t('source.hko'))
              : formatString(t('source.poweredBy'), t('source.openMeteo'))
            }
          </p>
        </footer>
      </div>
    </div>
  );
};

export default Index;
