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
import { getWarningIcon, hasWarningIcon } from '@/lib/hko-weather';
import { toDisplayTemperature } from '@/lib/units';
import type { Units } from '@/lib/units';
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
  /** Short badge text; native shows the icon instead when available. */
  warning: string;
  warningUrgent: boolean;
  /** HKO warnsum code of the first active warning (drives icon loading). */
  warningCode?: string;
  /** Base64 PNG of the official warning icon; absent when rendering failed
   *  or no warning is active — native falls back to the text badge. */
  warningIcon?: string;
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
 * Short badge for the warning pill. Keys are real HKO warnsum codes
 * (mirror of getWarningIcon's map in hko-icons.ts — the translations
 * file's warning keys are display names, NOT API codes). TC signal
 * numbers ("T8" etc.) are shared EN/TC shorthand in HK; the rest get
 * translated shorthands; unmapped codes fall back to the name's first
 * word (capped).
 */
const NAMED_BADGES: Record<string, { key: string; fallback: string; urgent: boolean }> = {
  WTS: { key: 'widget.badge.WTS', fallback: 'Storm', urgent: false },
  WHOT: { key: 'widget.badge.WHOT', fallback: 'Hot', urgent: false },
  WCOLD: { key: 'widget.badge.WCOLD', fallback: 'Cold', urgent: false },
  WFROST: { key: 'widget.badge.WFROST', fallback: 'Frost', urgent: false },
  WMSGNL: { key: 'widget.badge.WMSGNL', fallback: 'Monsoon', urgent: false },
  WL: { key: 'widget.badge.WL', fallback: 'Landslip', urgent: false },
  WFIREY: { key: 'widget.badge.WFIREY', fallback: 'Fire', urgent: false },
  WFIRER: { key: 'widget.badge.WFIRER', fallback: 'Fire', urgent: true },
  WFNTSA: { key: 'widget.badge.WFNTSA', fallback: 'Flooding', urgent: false },
  WTMW: { key: 'widget.badge.WTMW', fallback: 'Tsunami', urgent: true },
};

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
  const named = NAMED_BADGES[code];
  if (named) return { text: t(named.key, named.fallback), urgent: named.urgent };
  return { text: warning.name.split(/\s+/)[0].slice(0, 12), urgent: false };
}

/** Build the display-string payload the native widget renders. */
export function buildWidgetPayload(
  data: WeatherData,
  t: Translate,
  units: Units,
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
  // Only the OM parser stamps WeatherData.timezone; the HKO path is
  // HK-only, so default rather than silently using the device zone.
  const timeZone =
    data.timezone ?? (data.headline.source === 'hko' ? 'Asia/Hong_Kong' : undefined);

  const firstWarning = data.warnings?.find(
    w => w.actionCode?.toUpperCase() !== 'CANCEL'
  );
  const badge = firstWarning ? warningBadge(firstWarning, t) : undefined;

  return {
    icon: getWeatherIcon(current.weatherCode, current.isDay),
    temperature: `${toDisplayTemperature(current.temperature, units)}°`,
    condition,
    rain,
    warning: badge?.text ?? '',
    warningUrgent: badge?.urgent ?? false,
    warningCode: firstWarning?.code,
    sunrise: sunrise ? formatClock(sunrise, timeZone) : '',
    sunriseIn: sunrise ? sunCountdown(sunrise, nowMs, t) : '',
    sunset: sunset ? formatClock(sunset, timeZone) : '',
    sunsetIn: sunset ? sunCountdown(sunset, nowMs, t) : '',
    updatedAt: formatString(t('widget.updated', 'Updated {0}'), formatClock(now)),
  };
}

/** Rendered edge length of the warning icon bitmap, in px. */
const WARNING_ICON_PX = 48;

/**
 * Render the official HKO warning icon (public/icons/hko-warnings, mapped
 * by getWarningIcon) to a base64 PNG via canvas — the GIF's first frame.
 * Resolves undefined on any failure so the native side can fall back to
 * the text badge.
 */
export async function loadWarningIconImage(
  warningCode: string,
  size: number = WARNING_ICON_PX
): Promise<string | undefined> {
  // Codes without a real icon mapping would fall through to getWarningIcon's
  // generic ts.gif — the text badge is more informative for those.
  if (!hasWarningIcon(warningCode)) return undefined;
  if (typeof document === 'undefined') return undefined;
  try {
    return await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('no 2d context'));
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('icon load failed'));
      img.src = getWarningIcon(warningCode);
    });
  } catch {
    return undefined;
  }
}

/** Token of the most recent sync; older async syncs must not save. */
let latestSyncToken = 0;

/**
 * Push the latest weather into the widget. Fire-and-forget: a widget
 * failure must never break the app's own rendering. No-op on web.
 * The warning icon renders async; its failure degrades to the text badge
 * inside an otherwise-complete payload. A sync whose icon render finishes
 * after a newer sync started is dropped, so last-write-wins is always
 * the most recent data.
 */
export function syncWeatherWidget(
  data: WeatherData,
  t: Translate,
  units: Units,
  now: Date = new Date(),
  loadIcon: typeof loadWarningIconImage = loadWarningIconImage
): void {
  if (!Capacitor.isNativePlatform()) return;
  const token = ++latestSyncToken;
  void (async () => {
    const payload = buildWidgetPayload(data, t, units, now);
    if (payload.warningCode) {
      payload.warningIcon = await loadIcon(payload.warningCode);
    }
    if (token !== latestSyncToken) return;
    await WeatherWidget.save({ payload: JSON.stringify(payload) });
  })().catch(() => {
    // Nothing to surface — the next data refresh retries.
  });
}
