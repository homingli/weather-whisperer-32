// MSC nowcast time derivation for the GeoMet WMS tile layer.
//
// GeoMet exposes the HRDPS WEonG Total Precipitation Intensity Index as
// per-step WMS tiles with an hourly TIME dimension (nearestValue=0). There is
// no lightweight endpoint to read the current dimension (GetMetadata is
// disabled; the full GetCapabilities is ~39 MB), so step times are derived
// from the UTC clock with a conservative publish-lag rule:
//
//   - HRDPS runs at 00/06/12/18Z, published ~1-2h after run start.
//   - Latest *published* run start R = floor((utcHour - 2) / 6) * 6, on the
//     previous day when that goes negative. Verified 2026-08-07 at 00:54Z and
//     01:23Z: the 18Z run was still the latest while the 00Z run had not yet
//     been published.
//   - The WMS TIME dimension starts at R+1h (there is no 0h step) and runs
//     hourly for 48h; `nearestValue=0` snaps any residual mismatch to the
//     nearest available hour, so labels always match the served data because
//     both derive from the same computed run start.

import { MSC, VANCOUVER_BBOX } from './constants';

/**
 * Latest published HRDPS run start for a given instant, in UTC.
 * R = floor((utcHour - RUN_PUBLISH_LAG_HOURS) / 6) * 6, rolled to the
 * previous day when negative. Pure function of `now` — unit-testable.
 */
export function determineLatestRun(now: Date): Date {
  // Use the UTC wall-clock fields (not the epoch) so the 6-hour cycle is
  // aligned to 00/06/12/18Z regardless of local timezone. A negative cycle
  // (before 02:00Z) normalizes to the previous day via Date.UTC's overflow
  // handling — e.g. cycle -6 at 00:30Z on the 7th becomes the 6th at 18:00Z.
  const hour = now.getUTCHours();
  const lag = MSC.RUN_PUBLISH_LAG_HOURS;
  const cycle = Math.floor((hour - lag) / 6) * 6;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), cycle, 0, 0, 0));
}

/**
 * The 6 forecast steps to display, as MapServer time strings
 * ("YYYY-MM-DDTHH:00:00Z" — GeoMet's WMS time parser accepts exactly
 * `%Y-%m-%dT%H:%M:%SZ`, no milliseconds; verified 2026-08-07).
 *
 * Steps are the NEXT 6 HOURS FROM NOW, not runStart+1..6h: GeoMet serves a
 * rolling window (~now-3h to +48h; the capabilities time dimension is cached
 * and unreliable), so hours early in the latest run are often no longer
 * served and requests for them fail with "time outside valid hours". Future
 * hours are always within the window. `runStart` (the analysis time shown in
 * the control bar) still comes from determineLatestRun.
 */
export function buildMscStepTimes(now: Date): { runStart: Date; steps: string[] } {
  const runStart = determineLatestRun(now);
  // Next full hour strictly after now — never the current hour (which can be
  // mostly elapsed), never a past time.
  const firstStep = new Date(now);
  firstStep.setUTCMinutes(0, 0, 0);
  firstStep.setUTCHours(firstStep.getUTCHours() + 1);
  const steps = MSC.STEP_HOURS.map((h) => formatMscTime(new Date(firstStep.getTime() + (h - 1) * 3600_000)));
  return { runStart, steps };
}

/** "YYYY-MM-DDTHH:00:00Z" — the strict MapServer WMS time format. */
function formatMscTime(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  return `${y}-${mo}-${da}T${hh}:00:00Z`;
}

/**
 * "HH:MM" in Vancouver local time (PDT/PST, DST-aware) for step labels and
 * buttons. WMS timestamps are UTC instants; Intl converts to
 * America/Vancouver so DST transitions are handled by the engine, not
 * hardcoded offsets. Falls back to UTC when the tz database is unavailable.
 */
export function formatStepTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const fmt = getVancouverTimeFmt();
  if (!fmt) {
    // Fallback: UTC (pre-localization behavior).
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  }
  return fmt.format(d);
}

/**
 * "YYYY-MM-DD HH:MM" in Vancouver local time for the control-bar observation
 * time — mirrors HKO's parseUpdateTime output format. Falls back to UTC when
 * the tz database is unavailable.
 */
export function formatObservationTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const fmt = getVancouverDateTimeFmt();
  if (!fmt) {
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const da = String(d.getUTCDate()).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `${y}-${mo}-${da} ${hh}:${mm}`;
  }
  // en-CA renders "YYYY-MM-DD, HH:MM" — drop the comma.
  return fmt.format(d).replace(', ', ' ');
}

/**
 * Zone abbreviation for Vancouver at the given instant ("PDT" in summer,
 * "PST" in winter), or the current date when omitted. Empty string when the
 * tz database is unavailable.
 */
export function vancouverTimeZoneAbbr(iso?: string): string {
  try {
    const d = iso ? new Date(iso) : new Date();
    if (Number.isNaN(d.getTime())) return '';
    return (
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Vancouver',
        timeZoneName: 'short',
      })
        .formatToParts(d)
        .find((p) => p.type === 'timeZoneName')?.value ?? ''
    );
  } catch {
    return '';
  }
}

const EARTH_RADIUS_MERCATOR = 20037508.34;

// Vancouver local-time formatters. Created lazily and guarded: if a target
// lacks the tz database (exotic embedded engines), formatStepTime /
// formatObservationTime fall back to UTC output instead of crashing module
// load. hourCycle 'h23' avoids Intl's "24:00" midnight quirk.
let vancouverTimeFmt: Intl.DateTimeFormat | null | undefined;
let vancouverDateTimeFmt: Intl.DateTimeFormat | null | undefined;

function getVancouverTimeFmt(): Intl.DateTimeFormat | null {
  if (vancouverTimeFmt === undefined) {
    try {
      vancouverTimeFmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Vancouver',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      });
    } catch {
      vancouverTimeFmt = null;
    }
  }
  return vancouverTimeFmt;
}

function getVancouverDateTimeFmt(): Intl.DateTimeFormat | null {
  if (vancouverDateTimeFmt === undefined) {
    try {
      vancouverDateTimeFmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Vancouver',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      });
    } catch {
      vancouverDateTimeFmt = null;
    }
  }
  return vancouverDateTimeFmt;
}

/** Convert a latitude to the Web-Mercator Y coordinate (EPSG:3857). */
function latToMercatorY(lat: number): number {
  const radians = (lat * Math.PI) / 180;
  return (Math.log(Math.tan(radians) + 1 / Math.cos(radians)) * 180) / Math.PI * (EARTH_RADIUS_MERCATOR / 180);
}

/** Convert a longitude to the Web-Mercator X coordinate (EPSG:3857). */
function lonToMercatorX(lon: number): number {
  return (lon * EARTH_RADIUS_MERCATOR) / 180;
}

/**
 * Vancouver bbox in EPSG:3857 as [minX, minY, maxX, maxY] — used for the
 * no-precipitation probe tile and any raw GetMap requests. Pure + testable.
 */
export function vancouverBboxMercator(): { minX: number; minY: number; maxX: number; maxY: number } {
  const minX = lonToMercatorX(VANCOUVER_BBOX.west);
  const maxX = lonToMercatorX(VANCOUVER_BBOX.east);
  const minY = latToMercatorY(VANCOUVER_BBOX.south);
  const maxY = latToMercatorY(VANCOUVER_BBOX.north);
  return { minX, minY, maxX, maxY };
}

/**
 * Build the GeoMet GetMap URL for a single 256×256 tile covering the whole
 * Vancouver bbox — the no-precipitation probe target (map) and the idle
 * prefetch target (`msc-prefetch`). Shared so the two never diverge in bbox
 * or request params. Pure + testable.
 */
export function buildProbeUrl(stepIso: string): string {
  const { minX, minY, maxX, maxY } = vancouverBboxMercator();
  const bbox = [minX, minY, maxX, maxY].map((v) => v.toFixed(2)).join(',');
  return (
    `${MSC.WMS_URL}?service=WMS&request=GetMap&version=1.3.0` +
    `&crs=EPSG:3857&bbox=${bbox}&width=256&height=256` +
    `&layers=${MSC.LAYER}&styles=${MSC.STYLE}` +
    `&transparent=true&format=image/png&time=${encodeURIComponent(stepIso)}`
  );
}
