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
import { computeRainStart, seriesFromHourly, seriesFromMinutely } from '@/lib/rain-start';
import { logEvent, logWarn } from '@/lib/log';
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

/**
 * Payload schema version. The native renderer refuses a payload whose
 * schema differs and shows the "open the app" hint instead. Without this,
 * an APK upgrade renders the PREVIOUS build's saved payload with the new
 * layout — any renamed key reads as an empty cell until the app's next
 * sync (seen live: v1→v2 renamed the sun keys, so upgraded widgets showed
 * a blank sun cell). Bump whenever a key is renamed, removed, changes
 * meaning, or is newly consumed by a renderer that older payloads predate
 * (v3: rainIcon — an old payload missing it would leave the alerts widget
 * silently umbrella-less); keep WeatherWidgetPlugin.SCHEMA in lockstep.
 */
export const WIDGET_SCHEMA = 3;

/** Flat payload of display strings; keys match the Android layout ids. */
export interface WidgetPayload {
  schema: typeof WIDGET_SCHEMA;
  icon: string;
  /** Feels-like temperature with unit suffix (product decision: the widget
   *  leads with what it feels like, not the measured value). */
  temperature: string;
  condition: string;
  /** Umbrella verdict cell: ☂️ + time-to-rain when rain is coming, else
   *  💧 + rain probability. */
  rain: string;
  /** Bare verdict glyph (☂️/💧) for the alerts-only widget; `rain` keeps
   *  its prefix so the 4x2 renderer is untouched by this key. */
  rainIcon: string;
  /** Short badge text; native shows the icon instead when available. */
  warning: string;
  warningUrgent: boolean;
  /** HKO warnsum code of the first active warning (drives icon loading). */
  warningCode?: string;
  /** Base64 PNG of the official warning icon; absent when rendering failed
   *  or no warning is active — native falls back to the text badge. */
  warningIcon?: string;
  /** Single sun cell — next sunset while day, next sunrise at night. */
  sunTime: string;
  sunIn: string;
  updatedAt: string;
}

/**
 * "Time til" target: the next occurrence strictly in the future, or the
 * last valid one when today's has already passed (clock time still
 * renders; the lead time does not). Values are coerced, not instanceof-
 * checked: the cold-start localStorage seed carries sun times as ISO
 * strings (bare JSON.parse), the same shape share-forecast defends at.
 */
function nextSunEvent(dates: unknown[], nowMs: number): Date | undefined {
  const valid = dates
    .map(d => (d instanceof Date ? d : d == null ? undefined : new Date(d as string | number)))
    .filter(
      (d): d is Date => d !== undefined && Number.isFinite(d.getTime()) && d.getTime() > 0
    );
  if (valid.length === 0) return undefined;
  return valid.find(d => d.getTime() > nowMs) ?? valid[valid.length - 1];
}

/** Whole-minute lead time, same shape as the in-app sun strip countdown. */
function countdown(target: Date | number, nowMs: number, t: Translate): string {
  const targetMs = typeof target === 'number' ? target : target.getTime();
  const diffMin = Math.round((targetMs - nowMs) / 60000);
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

  // Only the OM parser stamps WeatherData.timezone; the HKO path is
  // HK-only, so default rather than silently using the device zone.
  const timeZone =
    data.timezone ?? (data.headline.source === 'hko' ? 'Asia/Hong_Kong' : undefined);

  // Umbrella verdict: the same rain-start engine as the in-app banner, over
  // the series already on the payload (no HKO nowcast — the widget carries
  // the city-scale verdict). The start renders as an absolute clock time:
  // the widget cannot tick, so a relative "in 15m" would read as live for
  // hours between syncs.
  const forecast = computeRainStart({
    now: nowMs,
    minutely: seriesFromMinutely(data.minutely),
    hourly: seriesFromHourly(data.hourly),
  });
  // The verdict glyph doubles as the alerts widget's icon: ☂️ when rain is
  // coming, 💧 when it is not. `rain` keeps the prefix for the 4x2.
  let rainIcon: string;
  let rainText: string;
  if (forecast?.status === 'raining-now') {
    rainIcon = '☂️';
    rainText = t('sun.now', 'now');
  } else if (forecast?.status === 'rain-expected' && forecast.startsAt) {
    rainIcon = '☂️';
    rainText = formatClock(new Date(forecast.startsAt), timeZone);
  } else {
    rainIcon = '💧';
    rainText = psr || `${Math.round(current.precipitationProbability)}%`;
  }
  const rain = `${rainIcon} ${rainText}`;

  // One sun cell: next sunset while day, next sunrise at night.
  const sunDates = data.daily.map(d => (current.isDay ? d.sunset : d.sunrise));
  const sunEvent = nextSunEvent(sunDates, nowMs);
  const sunGlyph = current.isDay ? '🌇' : '🌅';

  const activeWarnings = (data.warnings ?? []).filter(
    w => w.actionCode?.toUpperCase() !== 'CANCEL'
  );
  // Surface the most severe active warning, not merely the first in feed
  // order — a T8 must not hide behind an earlier amber rain entry.
  const ranked = activeWarnings.map(w => ({ warning: w, badge: warningBadge(w, t) }));
  const pick = ranked.find(r => r.badge.urgent) ?? ranked[0];
  const firstWarning = pick?.warning;
  const badge = pick?.badge;

  return {
    schema: WIDGET_SCHEMA,
    icon: getWeatherIcon(current.weatherCode, current.isDay),
    temperature: `${toDisplayTemperature(current.apparentTemperature, units)}°`,
    condition,
    rain,
    rainIcon,
    warning: badge?.text ?? '',
    warningUrgent: badge?.urgent ?? false,
    warningCode: firstWarning?.code,
    sunTime: sunEvent ? `${sunGlyph} ${formatClock(sunEvent, timeZone)}` : '',
    sunIn: sunEvent ? countdown(sunEvent, nowMs, t) : '',
    updatedAt: formatString(t('widget.updated', 'Updated {0}'), formatClock(now)),
  };
}

/** Rendered edge length of the warning icon bitmap, in px. The ImageView
 *  is 30dp, so 96px stays crisp up to 3x density. */
const WARNING_ICON_PX = 96;
/** Cap on the icon render; a hung Image must never block the widget save. */
const WARNING_ICON_TIMEOUT_MS = 3000;

/** True iff any pixel in the drawn canvas has non-zero alpha. */
function hasVisiblePixels(ctx: CanvasRenderingContext2D, size: number): boolean {
  const { data } = ctx.getImageData(0, 0, size, size);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) return true;
  }
  return false;
}

/**
 * Render the official HKO warning icon (public/icons/hko-warnings, mapped
 * by getWarningIcon) to a base64 PNG via canvas — the GIF's first frame.
 * Resolves undefined on any failure (load error, timeout, zero-size or
 * fully transparent render) so the native side falls back to the text
 * badge rather than showing an invisible image in its place.
 */
export async function loadWarningIconImage(
  warningCode: string,
  size: number = WARNING_ICON_PX,
  timeoutMs: number = WARNING_ICON_TIMEOUT_MS
): Promise<string | undefined> {
  // Normalize once: the mapping check is case-insensitive but the asset
  // lookup is exact, so a lowercase code would pass the guard and still
  // fall through to the misleading generic ts.gif.
  const code = warningCode.toUpperCase();
  // Codes without a real icon mapping would fall through to getWarningIcon's
  // generic ts.gif — the text badge is more informative for those.
  if (!hasWarningIcon(code)) return undefined;
  if (typeof document === 'undefined') return undefined;
  try {
    return await new Promise<string>((resolve, reject) => {
      const img = new Image();
      const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      const fail = (why: string) => {
        clearTimeout(timer);
        reject(new Error(why));
      };
      img.onload = () => {
        clearTimeout(timer);
        if (img.naturalWidth === 0) {
          fail('zero-size image');
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          fail('no 2d context');
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        if (!hasVisiblePixels(ctx, size)) {
          fail('blank render');
          return;
        }
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => fail('load error');
      img.src = getWarningIcon(code);
    });
  } catch (err) {
    logWarn(`widget: warning icon ${code} unavailable, using text badge`, err);
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
  // Android-only: the WeatherWidget plugin is registered in MainActivity
  // alone, so an iOS build would otherwise fire a rejected bridge call on
  // every refresh. isNativePlatform() is true on iOS too.
  if (Capacitor.getPlatform() !== 'android') return;
  const token = ++latestSyncToken;
  void (async () => {
    const payload = buildWidgetPayload(data, t, units, now);
    if (payload.warningCode) {
      payload.warningIcon = await loadIcon(payload.warningCode);
    }
    if (token !== latestSyncToken) return;
    await WeatherWidget.save({ payload: JSON.stringify(payload) });
    logEvent('widget.sync', {
      warning: payload.warningCode ?? null,
      icon: Boolean(payload.warningIcon),
    });
  })().catch(err => {
    logWarn('widget: sync failed', err);
  });
}
