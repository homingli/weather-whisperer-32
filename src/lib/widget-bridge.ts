/**
 * Android home-screen widget bridge.
 *
 * Contract: the widget is a dumb native renderer. TypeScript resolves
 * units, language, warning badges and sun lead times into a flat payload
 * of display strings; the native side (WeatherWidgetPlugin) persists it
 * to SharedPreferences and redraws every placed widget. There is no
 * native fetching on purpose — the widget is exactly as fresh as the
 * app's own data and updates ride the same fetch cadence as the UI.
 * The "Updated HH:MM" stamp makes staleness explicit.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { formatString } from '@/contexts/LanguageContext';
import {
  getWeatherIcon,
  weatherDescriptionKey,
  hkoDescriptionKey,
} from '@/lib/weather';
import type { WeatherData } from '@/lib/weather';
import type { HKOWarning } from '@/lib/hko-types';

type Translate = (key: string, fallback?: string) => string;

interface WeatherWidgetPlugin {
  save(options: { payload: string }): Promise<void>;
}

const WeatherWidget = registerPlugin<WeatherWidgetPlugin>('WeatherWidget', {
  web: { save: async () => {} },
});

/** Flat payload of display strings; keys match the Android layout ids. */
export interface WidgetPayload {
  icon: string;
  temperature: string;
  condition: string;
  rain: string;
  warning: string;
  warningUrgent: boolean;
  sunrise: string;
  sunriseIn: string;
  sunset: string;
  sunsetIn: string;
  updatedAt: string;
}

/**
 * "Time til" target: the next occurrence strictly in the future, or the
 * last valid one when today's has already passed (clock time still
 * renders; the lead time does not).
 */
function nextSunEvent(dates: (Date | undefined)[], nowMs: number): Date | undefined {
  const valid = dates.filter(
    (d): d is Date =>
      d instanceof Date && Number.isFinite(d.getTime()) && d.getTime() > 0
  );
  if (valid.length === 0) return undefined;
  return valid.find(d => d.getTime() > nowMs) ?? valid[valid.length - 1];
}

/** Whole-minute lead time, same shape as the in-app sun strip countdown. */
function sunCountdown(target: Date, nowMs: number, t: Translate): string {
  const diffMin = Math.round((target.getTime() - nowMs) / 60000);
  if (diffMin < 1) return '';
  const hrs = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  if (hrs > 0 && mins > 0) {
    return formatString(t('sun.inHoursMinutes', 'in {0}h {1}m'), String(hrs), String(mins));
  }
  if (hrs > 0) return formatString(t('sun.inHours', 'in {0}h'), String(hrs));
  return formatString(t('sun.inMinutes', 'in {0}m'), String(mins));
}

function formatClock(date: Date, timeZone?: string): string {
  // Hour and minute must come from ONE Intl call so both land in the
  // location's timezone — mixing them with device-local accessors would
  // render a wrong clock whenever the device travels zones.
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '00';
  return `${get('hour').padStart(2, '0')}:${get('minute')}`;
}

/**
 * Short badge for the warning pill. Tropical-cyclone signal numbers
 * ("T8" etc.) are the shared EN/TC shorthand in HK, so they bypass i18n;
 * rain colours get a translated shorthand; anything else falls back to
 * the warning name's first word.
 */
function warningBadge(warning: HKOWarning, t: Translate): { text: string; urgent: boolean } {
  const code = warning.code.toUpperCase();
  if (code.startsWith('TC8')) return { text: 'T8', urgent: true };
  if (code === 'TC9') return { text: 'T9', urgent: true };
  if (code === 'TC10') return { text: 'T10', urgent: true };
  if (code === 'TC1') return { text: 'T1', urgent: false };
  if (code === 'TC3') return { text: 'T3', urgent: false };
  if (code === 'WRAINA') return { text: t('widget.badge.WRAINA', 'Amber'), urgent: false };
  if (code === 'WRAINR') return { text: t('widget.badge.WRAINR', 'Red'), urgent: true };
  if (code === 'WRAINB') return { text: t('widget.badge.WRAINB', 'Black'), urgent: true };
  return { text: warning.name.split(/\s+/)[0].slice(0, 10), urgent: false };
}

/** Build the display-string payload the native widget renders. */
export function buildWidgetPayload(
  data: WeatherData,
  t: Translate,
  now: Date = new Date()
): WidgetPayload {
  const nowMs = now.getTime();
  const current = data.current;

  const condition =
    data.headline.source === 'hko' && data.headline.hkoIconCode != null
      ? t(hkoDescriptionKey(data.headline.hkoIconCode))
      : t(weatherDescriptionKey(current.weatherCode));

  const psr = current.precipitationProbabilityRaw?.trim();
  const rain = psr
    ? `💧 ${psr}`
    : `💧 ${Math.round(current.precipitationProbability)}%`;

  const sunrise = nextSunEvent(data.daily.map(d => d.sunrise), nowMs);
  const sunset = nextSunEvent(data.daily.map(d => d.sunset), nowMs);
  const timeZone = data.timezone;

  const firstWarning = data.warnings?.find(
    w => w.actionCode?.toUpperCase() !== 'CANCEL'
  );
  const badge = firstWarning ? warningBadge(firstWarning, t) : undefined;

  return {
    icon: getWeatherIcon(current.weatherCode, current.isDay),
    temperature: `${Math.round(current.temperature)}°`,
    condition,
    rain,
    warning: badge?.text ?? '',
    warningUrgent: badge?.urgent ?? false,
    sunrise: sunrise ? formatClock(sunrise, timeZone) : '',
    sunriseIn: sunrise ? sunCountdown(sunrise, nowMs, t) : '',
    sunset: sunset ? formatClock(sunset, timeZone) : '',
    sunsetIn: sunset ? sunCountdown(sunset, nowMs, t) : '',
    updatedAt: formatString(t('widget.updated', 'Updated {0}'), formatClock(now)),
  };
}

/**
 * Push the latest weather into the widget. Fire-and-forget: a widget
 * failure must never break the app's own rendering. No-op on web.
 */
export function syncWeatherWidget(
  data: WeatherData,
  t: Translate,
  now: Date = new Date()
): void {
  if (!Capacitor.isNativePlatform()) return;
  const payload = JSON.stringify(buildWidgetPayload(data, t, now));
  WeatherWidget.save({ payload }).catch(() => {
    // Nothing to surface — the next data refresh retries.
  });
}
