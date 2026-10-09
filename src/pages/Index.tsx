import { useMemo, useCallback, lazy, Suspense, useEffect, useState, useRef } from 'react';
import { CurrentWeather } from '@/components/CurrentWeather';
import type { MobileSwiperDeckHandle } from '@/components/MobileSwiperDeck';

import { FetchingStatus } from '@/components/FetchingStatus';
import { LocalClock } from '@/components/LocalClock';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useSelectedCity } from '@/hooks/useSelectedCity';
import { useWeatherWithProgress } from '@/hooks/useWeatherWithProgress';
import { useWarningChangeDetector } from '@/hooks/useWarningChangeDetector';
import { useNextHoliday } from '@/hooks/useNextHoliday';
import { useKeySequence } from '@/hooks/useKeySequence';
import {
  useDevSimulatedWarnings,
  useDevBaselineNonce,
} from '@/lib/devWarningSimulator';
import { isInHongKong, isInRainfallRegion, translateStationName, translateDistrictName, getWarningIcon } from '@/lib/hko-weather';
import { buildShareCityLabel } from '@/lib/share-forecast';
import { PLACEHOLDER_SENTINEL, isInVancouverBox, STORAGE_KEYS } from '@/lib/constants';
import { prefetchMscNowcast } from '@/lib/msc-prefetch';
import { useLanguage, formatString } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { toast } from 'sonner';
import { CloudRain, MapPin, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { AtAGlance } from '@/components/AtAGlance';
import { RainStartBanner } from '@/components/RainStartBanner';

// Lazy load heavy components. DailyForecast pulls recharts and is
// below the fold on both mobile (Swiper slide 3) and desktop (split row);
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
// HolidayBadge (header countdown + details dialog) stays lazy so the Dialog
// primitives it drags in keep out of the initial chunk, like SettingsMenu.
// The badge appears once the holiday query resolves anyway, so the lazy
// hop costs nothing visible.
const HolidayBadge = lazy(() => import('@/components/HolidayBadge').then(module => ({ default: module.HolidayBadge })));
// HolidayConfetti (easter egg burst) stays lazy for the same reason — its
// Dialog-free chunk is tiny, but there is no reason to pay for it upfront.
const HolidayConfetti = lazy(() => import('@/components/HolidayConfetti').then(module => ({ default: module.HolidayConfetti })));
// CitySearch backs the landing empty state (HML-58): when the geolocation
// prompt is denied the page must offer an inline search, not a dead welcome
// card. Lazy like SettingsMenu so the Input primitive and the CitySearch
// module itself stay out of the initial chunk (the geocoding helpers are
// already in it via the eager useSelectedCity import).
const CitySearch = lazy(() => import('@/components/CitySearch').then(module => ({ default: module.CitySearch })));
// The mobile swipe deck (swiper/react + Pagination, ~27 kB gzip) is only
// rendered at <=1080px. Isolating it in its own lazy chunk keeps swiper out
// of the initial bundle for desktop users; the deck is the only module that
// imports swiper/react.
const MobileSwiperDeck = lazy(() => import('@/components/MobileSwiperDeck').then(module => ({ default: module.MobileSwiperDeck })));

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

// Mobile deck slide indices — must match the child order passed to
// MobileSwiperDeck below (0 = current weather, 1 = hourly, 2 = 7-day,
// 3 = rainfall map when the city is inside nowcast coverage).
const DECK_DAILY_SLIDE = 2;
const DECK_NOWCAST_SLIDE = 3;

// Konami for the confetti egg: c-c-f-f, each press within 1.5s of the
// previous. Module-level so useKeySequence's effect deps stay stable.
const EGG_SEQUENCE = ['c', 'c', 'f', 'f'] as const;
const EGG_SEQUENCE_GAP_MS = 1500;

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
  // HK-only: countdown to the next public holiday. Self-hides while loading,
  // on failure, and for cities outside HK; day math uses the city's timezone.
  const holidayCountdown = useNextHoliday(isHKCovered, weather?.timezone);
  // Nowcast map region: PRD (HKO) or Vancouver (MSC). Vancouver wins the
  // split when both are true (the boxes don't overlap).
  const nowcastVisible = !!selectedCity &&
    (isInRainfallRegion(selectedCity.latitude, selectedCity.longitude) ||
      isInVancouverBox(selectedCity.latitude, selectedCity.longitude));
  const useMSCNowcast = !!selectedCity &&
    isInVancouverBox(selectedCity.latitude, selectedCity.longitude);

  // Share label — same location inputs as the header's label, minus the
  // reverse-geocode "Current Location" placeholder the raw name can carry.
  // See buildShareCityLabel.
  const shareCityLabel = selectedCity
    ? buildShareCityLabel({
        name: selectedCity.name,
        admin1: selectedCity.admin1,
        country: selectedCity.country,
        isHKCovered,
        nearestStation: weather?.nearestStation,
        translateStation: (station) => translateStationName(station, lang),
      })
    : '';

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

  // Mobile detection for conditional rendering (avoids double-mounting both
  // layouts). Shared with the two map components via one refcounted
  // matchMedia listener (useIsMobile).
  const isMobile = useIsMobile();

  // ── Easter egg: confetti ──
  // Plays once per app open when the shown day IS a HK public holiday, and
  // replays on EVERY c-c-f-f konami: the play key is a sum, so a manual
  // burst after the auto one is never swallowed by Math.max. The keyboard
  // listener runs at every viewport width — touch-only devices simply never
  // see keydowns, so the egg stays desktop/hybrid-keyboard territory. The
  // toast fires at most once per holiday date across reloads (localStorage
  // guard); storage failures only cost the toast, never the confetti.
  const [manualBursts, setManualBursts] = useState(0);
  const confettiPlayKey = manualBursts + (holidayCountdown?.isToday ? 1 : 0);
  useEffect(() => {
    if (!holidayCountdown?.isToday) return;
    const holidayDate = holidayCountdown.holiday.date;
    try {
      if (localStorage.getItem(STORAGE_KEYS.EGG_HOLIDAY_TOAST) !== holidayDate) {
        localStorage.setItem(STORAGE_KEYS.EGG_HOLIDAY_TOAST, holidayDate);
        const name = lang === 'tc'
          ? holidayCountdown.holiday.nameTc
          : holidayCountdown.holiday.nameEn;
        toast(formatString(t('glance.holidayEggToast'), name), { icon: '🎉' });
      }
    } catch {
      // localStorage unavailable (private mode) — confetti still plays.
    }
  }, [holidayCountdown, lang, t]);

  const triggerConfettiBurst = useCallback(() => {
    setManualBursts(count => count + 1);
  }, []);
  useKeySequence(EGG_SEQUENCE, EGG_SEQUENCE_GAP_MS, triggerConfettiBurst);

  // Reveal target for the glance strip: desktop scrolls the secondary row
  // (hourly/daily) into view; mobile advances the swipe deck to the slide
  // that holds the DailyForecast.
  const dailySectionRef = useRef<HTMLDivElement | null>(null);
  const mobileSwiperRef = useRef<MobileSwiperDeckHandle | null>(null);

  const revealDailyForecast = useCallback(() => {
    if (isMobile) {
      mobileSwiperRef.current?.slideTo(DECK_DAILY_SLIDE, 400);
      return;
    }
    dailySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [isMobile]);

  // The glance strip's rain chips jump to the nowcast pane instead: the map
  // slide on mobile (index 3), the bottom map section on desktop. Only wired
  // when the city is inside nowcast coverage — elsewhere the chips degrade
  // to static text.
  const nowcastSectionRef = useRef<HTMLDivElement | null>(null);

  const revealNowcast = useCallback(() => {
    if (isMobile) {
      mobileSwiperRef.current?.slideTo(DECK_NOWCAST_SLIDE, 400);
      return;
    }
    nowcastSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [isMobile]);

  // Dev-only: `window.__devWarnings` is mounted by devWarningSimulator.ts at
  // module load time. Try __devWarnings.add('TC8') / .addCancelled('TC1') /
  // .remove('TC8') / .resetBaseline() / .list().

  // Freshness banner moved into <WeatherBanners>; the hook augments the
  // cached data with `fallbackSource: 'cache'` when the background fetch
  // fails, so we no longer need a separate top-bar label here.

  // Pulse set memoized on warningDiff (stable identity between real changes)
  // so WeatherAlerts' memo isn't defeated by a fresh Set on every render.
  const pulseCodes = useMemo(
    () => new Set(warningDiff.added.map((w) => w.code)),
    [warningDiff],
  );

  return (
    <div className={`min-h-screen gradient-sky flex flex-col${isMobile ? ' h-dvh' : ''}`}>
      <div className={`w-full mx-auto safe-px safe-top safe-bottom flex flex-col flex-1 min-h-0 transition-all duration-300${
        isMobile ? '' : ' max-w-2xl lg:max-w-5xl xl:max-w-7xl'
      }`}>
        {/* Top bar: row 1 = [date time]; row 2 = [location]; right column spans both */}
        <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 mb-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {weather?.timezone && (
              <LocalClock timezone={weather.timezone} />
            )}
            {/* Holiday countdown rides on the date line (calendar metadata);
                details dialog on tap. Self-hides for non-HK cities. On mobile
                it moves to the deck's pagination row instead (below) to keep
                the slim date row uncluttered. */}
            {!isMobile && (
              <Suspense fallback={null}>
                <HolidayBadge holiday={holidayCountdown} />
              </Suspense>
            )}
            {/* Direct import (not lazy): must be visible on the first paint
                of a cold start that begins offline. */}
            <OfflineIndicator />
          </div>
          <div className="row-span-2 flex items-center justify-end gap-2">
            {effectiveWarnings.length > 0 && (
              <Suspense fallback={null}>
                <WeatherAlerts
                  warnings={effectiveWarnings}
                  pulseTrigger={pulseTrigger}
                  pulseCodes={pulseCodes}
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
                className="h-full min-h-12 px-3 flex items-center gap-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                title={t('pwa.install')}
              >
                <Download className="h-5 w-5" />
                <span className="hidden sm:inline">{t('pwa.install')}</span>
              </button>
            )}
          </div>
          {selectedCity && (
            <div className="flex items-center gap-2 text-muted-foreground flex-wrap min-w-0">
              <MapPin className="h-4 w-4 shrink-0" />
              <div className="flex items-center flex-wrap gap-2">
                {isHKCovered ? (
                  weather?.nearestStation && (
                    <span className="text-sm font-medium text-foreground">
                      {translateStationName(weather.nearestStation, lang)}
                    </span>
                  )
                ) : (
                  <span className="text-sm font-medium text-foreground">
                    {selectedCity.name}{selectedCity.admin1 ? `, ${selectedCity.admin1}` : ''}, {selectedCity.country}
                  </span>
                )}
                {weather?.nearestDistrict && (
                  <span className="inline-flex items-center gap-x-1.5 text-xs text-muted-foreground">
                    <span aria-hidden="true">·</span>
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
            <div className="text-center py-10 sm:py-20 animate-fade-in">
              <CloudRain className="h-20 w-20 mx-auto mb-4 text-primary" />
              <h2 className="text-3xl font-semibold mb-2">{t('loading.welcome')}</h2>
              <p className="text-lg text-muted-foreground">
                {t('loading.searchPrompt')}
              </p>
              <Suspense fallback={null}>
                <CitySearch recentCities={recentCities} onCitySelect={handleCitySelect} className="mt-8" />
              </Suspense>
            </div>
          ) : isLoading ? (
            <FetchingStatus loadProgress={loadProgress} isHKCovered={isHKCovered} />
          ) : !weather && error ? (
            <div className="text-center py-20 editorial-card">
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
                  {/* Glance strip stays above the deck so it is glanceable on
                      every slide (hero + hourly/daily live on separate swipe
                      slides on mobile; see AtAGlance). The rain-start banner
                      rides above it in the same thin-strip language; both
                      hide themselves when their data is missing. */}
                  <div className="mb-3 shrink-0">
                    <RainStartBanner
                      weather={weather}
                      latitude={selectedCity.latitude}
                      longitude={selectedCity.longitude}
                      className="mb-2"
                    />
                    <AtAGlance
                      today={weather.daily?.[0]}
                      tomorrow={weather.daily?.[1]}
                      onReveal={revealDailyForecast}
                      onRevealNowcast={nowcastVisible ? revealNowcast : undefined}
                    />
                  </div>
                  {/* Each child is one slide's content; MobileSwiperDeck wraps
                      them in SwiperSlide. It is the only module that may import
                      swiper/react, keeping the ~27 kB gzip deck out of the
                      initial bundle for desktop users. */}
                  <Suspense fallback={<Skeleton className="swiper-mobile-deck rounded-xl bg-muted/20" />}>
                    <MobileSwiperDeck
                      ref={mobileSwiperRef}
                      // Carve a hole between bullets 2 and 3 for the holiday
                      // chip below; only while the badge has something to show.
                      bulletGapAfterIndex={holidayCountdown ? 1 : undefined}
                    >
                      {/* Slide 1: Current weather */}
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

                      {/* Slide 2: Hourly forecast, full height */}
                      <Suspense fallback={<Skeleton className="h-full rounded-xl bg-muted/20 editorial-card" />}>
                        <HourlyForecast forecast={weather.hourly || []} daily={sunTimes || []} timezone={weather.timezone} cityName={shareCityLabel} />
                      </Suspense>

                      {/* Slide 3: 7-day forecast, full height (own slide so the
                          7-column strip keeps enough width at 320–390 px
                          instead of squeezing beside/above hourly) */}
                      <Suspense fallback={<Skeleton className="h-full rounded-xl bg-muted/20" />}>
                        <DailyForecast forecast={weather.daily || []} timezone={weather.timezone} cityName={shareCityLabel} />
                      </Suspense>

                      {/* Slide 4: Rainfall map (PRD or Vancouver) */}
                      {nowcastVisible && (
                        <Suspense fallback={<Skeleton className="h-full rounded-xl bg-muted/20 editorial-card" />}>
                          {useMSCNowcast ? (
                            <MSCRainfallMap userLocation={{ latitude: selectedCity.latitude, longitude: selectedCity.longitude }} />
                          ) : (
                            <RainfallMap userLocation={{ latitude: selectedCity.latitude, longitude: selectedCity.longitude }} />
                          )}
                        </Suspense>
                      )}
                    </MobileSwiperDeck>
                  </Suspense>

                  {/* Swipe hint + pagination — bullets render here (outside the swiper
                      so they don't overlap the rainfall band's legend). CSS overrides
                      in src/index.css neutralize swiper's default absolute positioning
                      so the dots flow inline with the chevrons.

                      The holiday badge floats centered in a hole the deck carves
                      between bullets 2 and 3 (bulletGapAfterIndex above) — a real
                      gap in the bullet row, so no clickable dot sits under the
                      chip. It MUST stay a sibling of the pagination div, never a
                      child: Swiper's pagination render() wipes the container's
                      children (setInnerHTML), so anything mounted inside gets
                      deleted. Gated on holidayCountdown — the badge self-hides
                      for non-HK cities and the chip must not leave an empty box. */}
                  <div className="relative shrink-0">
                    <div id="swiper-mobile-deck-pagination" className="flex items-center justify-center gap-3 py-2 text-muted-foreground/50">
                      <ChevronLeft className="h-3 w-3" />
                      <ChevronRight className="h-3 w-3" />
                    </div>
                    {holidayCountdown && (
                      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-1">
                        <Suspense fallback={null}>
                          <HolidayBadge holiday={holidayCountdown} />
                        </Suspense>
                      </div>
                    )}
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

                  {/* Today + tomorrow at a glance — thin strip between the
                      hero and the hourly/daily split. Scrolls the split
                      below on tap. The rain-start banner sits above it. */}
                  <RainStartBanner
                    weather={weather}
                    latitude={selectedCity.latitude}
                    longitude={selectedCity.longitude}
                  />
                  <AtAGlance
                    today={weather.daily?.[0]}
                    tomorrow={weather.daily?.[1]}
                    onReveal={revealDailyForecast}
                    onRevealNowcast={nowcastVisible ? revealNowcast : undefined}
                  />

                  {/* Secondary Row: Split Forecasts */}
                  <div ref={dailySectionRef} className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-stretch">
                    <Suspense fallback={<Skeleton className="h-[300px] rounded-xl bg-muted/20" />}>
                      <HourlyForecast forecast={weather.hourly || []} daily={sunTimes || []} timezone={weather.timezone} cityName={shareCityLabel} />
                    </Suspense>

                    <Suspense fallback={<Skeleton className="h-[300px] rounded-xl bg-muted/20" />}>
                      <DailyForecast forecast={weather.daily || []} timezone={weather.timezone} cityName={shareCityLabel} />
                    </Suspense>
                  </div>

                  {/* Bottom Row: Optional Map — scroll target for the glance
                      strip's rain chips (revealNowcast). The wrapper div is
                      the ref anchor; space-y still applies to it as a direct
                      child. scroll-mt keeps the sticky header from covering
                      the map's top edge after scrollIntoView. */}
                  {nowcastVisible && (
                    <div ref={nowcastSectionRef} className="scroll-mt-4">
                      <Suspense fallback={<Skeleton className="h-[400px] rounded-xl bg-muted/20" />}>
                        {useMSCNowcast ? (
                          <MSCRainfallMap userLocation={{ latitude: selectedCity.latitude, longitude: selectedCity.longitude }} />
                        ) : (
                          <RainfallMap userLocation={{ latitude: selectedCity.latitude, longitude: selectedCity.longitude }} />
                        )}
                      </Suspense>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : null}
        </main>
        {/* No page footer — the forecast cards use the full viewport height.
            The data-source credit moved into the bottom of the settings
            (hamburger) menu; see SettingsMenu. */}
        {/* Easter egg confetti layer — fixed-position and pointer-events-none,
            so tree placement is irrelevant; lives here to cover both layouts. */}
        <Suspense fallback={null}>
          <HolidayConfetti playKey={confettiPlayKey} />
        </Suspense>
      </div>
    </div>
  );
};

export default Index;
