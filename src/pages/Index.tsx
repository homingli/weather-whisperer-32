import { useMemo, useCallback, lazy, Suspense, useEffect, useState, useRef } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination } from 'swiper/modules';
import { CurrentWeather } from '@/components/CurrentWeather';
import { DailyForecast } from '@/components/DailyForecast';
import { WeatherAlerts } from '@/components/WeatherAlerts';
import { SettingsMenu } from '@/components/SettingsMenu';
import { FetchingStatus } from '@/components/FetchingStatus';
import { WeatherBanners } from '@/components/WeatherBanners';
import { LocalClock } from '@/components/LocalClock';
import { useSelectedCity } from '@/hooks/useSelectedCity';
import { useWeatherWithProgress } from '@/hooks/useWeatherWithProgress';
import { useWarningChangeDetector } from '@/hooks/useWarningChangeDetector';
import {
  useDevSimulatedWarnings,
  useDevBaselineNonce,
  devAddWarning,
  devRemoveWarning,
  devClearWarnings,
  devResetBaseline,
  devListWarnings,
} from '@/lib/devWarningSimulator';
import { isInHongKong, isInRainfallRegion, translateStationName, translateDistrictName, getWarningIcon } from '@/lib/hko-weather';
import { PLACEHOLDER_SENTINEL } from '@/lib/constants';
import { useLanguage, formatString } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { toast } from 'sonner';
import { CloudRain, MapPin, Download, ChevronLeft, ChevronRight } from 'lucide-react';

// Lazy load heavy components
const HourlyForecast = lazy(() => import('@/components/HourlyForecast').then(module => ({ default: module.HourlyForecast })));
const RainfallMap = lazy(() => import('@/components/RainfallMap').then(module => ({ default: module.RainfallMap })));

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
  const { setSunTimes } = useTheme();
  const { selectedCity, recentCities, isLocating, handleCitySelect } = useSelectedCity();
  const { data: weather, isLoading, error, refetch, isFetching, loadProgress } = useWeatherWithProgress(
    selectedCity?.latitude,
    selectedCity?.longitude,
    language === 'tc' ? 'tc' : 'en',
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

  // Dev-only: expose the warning simulator to the console for QA.
  // Try __devWarnings.add('TC8') / .remove('TC8') / .reset() / .list().
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    window.__devWarnings = {
      add: devAddWarning,
      remove: devRemoveWarning,
      clear: devClearWarnings,
      reset: devResetBaseline,
      list: devListWarnings,
    };
    console.info('[dev] __devWarnings ready: __devWarnings.add("TC8") / .remove("TC8") / .reset() / .list()');
    return () => {
      delete window.__devWarnings;
    };
  }, []);

  // Freshness banner moved into <WeatherBanners>; the hook augments the
  // cached data with `fallbackSource: 'cache'` when the background fetch
  // fails, so we no longer need a separate top-bar label here.

  return (
    <div className={`min-h-screen gradient-sky flex flex-col${isMobile ? ' h-dvh' : ''}`}>
      <div className={`w-full mx-auto px-4 pt-[10px] pb-4 flex flex-col flex-1 min-h-0 transition-all duration-300${
        isMobile ? '' : ' max-w-2xl lg:max-w-5xl xl:max-w-7xl'
      }`}>
        {/* Top bar: row 1 = [date time]; row 2 = [location]; right column spans both */}
        <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 mb-4 shrink-0">
          <div className="flex items-center">
            {weather?.timezone && (
              <LocalClock timezone={weather.timezone} />
            )}
          </div>
          <div className="row-span-2 flex items-center justify-end gap-2">
            {effectiveWarnings.length > 0 && (
              <WeatherAlerts
                warnings={effectiveWarnings}
                pulseTrigger={pulseTrigger}
                pulseCodes={new Set(warningDiff.added.map(w => w.code))}
                selectedWarningCode={selectedWarningCode}
                onConsumed={handleConsumedSelectedWarning}
              />
            )}
            <SettingsMenu currentCity={selectedCity} recentCities={recentCities} onCitySelect={handleCitySelect} onRefresh={handleForceRefresh} />
            {deferredPrompt && !isInstalled && (
              <button
                onClick={install}
                aria-label={language === 'tc' ? '安裝應用程式' : 'Install app'}
                className="h-full min-h-[3rem] px-3 flex items-center gap-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                title="Install app"
              >
                <Download className="h-5 w-5" />
                <span className="hidden sm:inline">Install</span>
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
                      {translateStationName(weather.nearestStation, language === 'tc' ? 'tc' : 'en')}
                    </span>
                  )
                ) : (
                  <span className="text-base font-medium text-foreground">
                    {selectedCity.name}{selectedCity.admin1 ? `, ${selectedCity.admin1}` : ''}, {selectedCity.country}
                  </span>
                )}
                {weather?.nearestDistrict && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                    {translateDistrictName(weather.nearestDistrict, language === 'tc' ? 'tc' : 'en')}
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
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
              <WeatherBanners
                weather={weather}
                isHKCovered={isHKCovered}
                onRefetch={handleForceRefresh}
                isRefetching={isFetching}
              />

              {/* ── Mobile: horizontal swipe card deck ── */}
              {isMobile && (
                <div className="flex flex-col flex-1 min-h-0 mt-3 animate-fade-in">
                  <Swiper
                    modules={[Pagination]}
                    pagination={{ clickable: true }}
                    spaceBetween={16}
                    slidesPerView={1}
                    className="swiper-mobile-deck"
                    threshold={10}
                    noSwipingClass="no-swipe"
                  >
                    {/* Slide 1: Current weather */}
                    <SwiperSlide>
                      <CurrentWeather
                        compact
                        weather={weather.current ?? PLACEHOLDER_CURRENT}
                        hourlyForecast={weather.hourly || []}
                        dailyForecast={weather?.daily?.[0]}
                        locationName={selectedCity?.name}
                        timezone={weather.timezone}
                      />
                    </SwiperSlide>

                    {/* Slide 2: Hourly (top) + 7-day (bottom) split 50/50 */}
                    <SwiperSlide>
                      <div className="flex flex-col gap-3 h-full">
                        <div className="flex-1 min-h-0">
                          <Suspense fallback={<div className="h-full animate-pulse bg-muted/20 rounded-xl glass-card" />}>
                            <HourlyForecast forecast={weather.hourly || []} daily={sunTimes || []} timezone={weather.timezone} />
                          </Suspense>
                        </div>
                        <div className="flex-1 min-h-0">
                          <DailyForecast forecast={weather.daily || []} timezone={weather.timezone} />
                        </div>
                      </div>
                    </SwiperSlide>

                    {/* Slide 3: Rainfall map (PRD only) */}
                    {selectedCity && isInRainfallRegion(selectedCity.latitude, selectedCity.longitude) && (
                      <SwiperSlide>
                        <Suspense fallback={<div className="h-full animate-pulse bg-muted/20 rounded-xl glass-card" />}>
                          <RainfallMap userLocation={{ latitude: selectedCity.latitude, longitude: selectedCity.longitude }} />
                        </Suspense>
                      </SwiperSlide>
                    )}
                  </Swiper>

                  {/* Swipe hint — arrows flank the swiper dots to form one pagination indicator */}
                  <div className="flex items-center justify-center gap-3 py-2 text-muted-foreground/50 shrink-0">
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
                      locationName={selectedCity?.name}
                      timezone={weather.timezone}
                    />
                  </div>

                  {/* Secondary Row: Split Forecasts */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-stretch">
                    <Suspense fallback={<div className="h-[300px] animate-pulse bg-muted/20 rounded-xl" />}>
                      <HourlyForecast forecast={weather.hourly || []} daily={sunTimes || []} timezone={weather.timezone} />
                    </Suspense>

                    <DailyForecast forecast={weather.daily || []} timezone={weather.timezone} />
                  </div>

                  {/* Bottom Row: Optional Map */}
                  {selectedCity && isInRainfallRegion(selectedCity.latitude, selectedCity.longitude) && (
                    <Suspense fallback={<div className="h-[400px] animate-pulse bg-muted/20 rounded-xl" />}>
                      <RainfallMap userLocation={{ latitude: selectedCity.latitude, longitude: selectedCity.longitude }} />
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
