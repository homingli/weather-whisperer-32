import { getDateTimeFormatter } from '@/lib/utils';

/**
 * Offline sunrise/sunset from the NOAA solar equations (gml.noaa.gov
 * solcalc). Replaces the Open-Meteo `daily=sunrise,sunset` fields so sun
 * times survive when Open-Meteo is unavailable, and so the HKO-only path
 * (which has no sun data) can still feed the sun-cycle strip and theme.
 *
 * Accuracy: ±1–2 min vs Open-Meteo's NREL SPA — both define sunrise as the
 * sun's upper limb crossing the −0.833° zenith (refraction + disk radius),
 * so they measure the same event. Locked against published references
 * (timeanddate.com, HKO solstice tables) in solar-times.test.ts.
 */

const DEG = Math.PI / 180;
/** Zenith at sunrise/sunset: 90° horizon + refraction + solar radius. */
const HORIZON_ZENITH = 90.833;

export interface SunTimes {
  /** Sunrise instant; null in polar night (sun never rises) or polar day. */
  sunrise: Date | null;
  /** Sunset instant; null in polar night or polar day (sun never sets). */
  sunset: Date | null;
}

/** Julian day number (x.5) for 0h UT of the given calendar date. */
function julianDayMidnight(year: number, month: number, day: number): number {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5;
}

/**
 * Sunrise/sunset as UTC instants for the calendar day of `date` as seen in
 * `tzOffsetMinutes` (e.g. +480 for HKT). Coordinates in degrees, east-positive.
 * Polar day/night (|latitude| beyond the circle, midsummer/midwinter) returns
 * null fields — consumers treat that like any other "no sun event" day.
 */
export function getSunTimes(
  latitude: number,
  longitude: number,
  date: Date,
  tzOffsetMinutes: number,
): SunTimes {
  // Local calendar date for the location (NOT the device's calendar).
  const local = new Date(date.getTime() + tzOffsetMinutes * 60000);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth() + 1;
  const day = local.getUTCDate();

  // Evaluate solar position at ~noon UT of the local date: close enough to
  // both events that declination drift within the day is negligible (<5 s).
  const t = (julianDayMidnight(year, month, day) + 0.5 - 2451545) / 36525;

  // Geometric mean longitude / anomaly of the sun, equation of center,
  // apparent longitude, obliquity (NOAA solcalc terms, truncated series).
  const meanLon = (280.46 + 36000.771 * t) % 360;
  const meanAnom = ((357.528 + 35999.05 * t) % 360) * DEG;
  const eccentricity = 0.016708634 - 0.000037043 * t;
  const center =
    (1.914602 - 0.004817 * t) * Math.sin(meanAnom) +
    (0.019993 - 0.000101 * t) * Math.sin(2 * meanAnom) +
    0.000289 * Math.sin(3 * meanAnom);
  const aberration = -0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * t) * DEG);
  const appLon = ((meanLon + center + aberration) % 360) * DEG;
  const meanObliq = 23 + (26 + (21.448 - 46.815 * t - 0.00059 * t * t + 0.001813 * t * t * t) / 60) / 60;
  const obliq = (meanObliq + 0.00256 * Math.cos((125.04 - 1934.136 * t) * DEG)) * DEG;
  const declination = Math.asin(Math.sin(obliq) * Math.sin(appLon));

  // Equation of time (minutes): sundial ahead of the clock. The NOAA formula
  // sums terms in radians and converts to degrees before the ×4 scaling.
  const y = Math.tan(obliq / 2) ** 2;
  const meanLonRad = (((meanLon % 360) + 360) % 360) * DEG;
  const eqTime =
    (4 / DEG) *
    (y * Math.sin(2 * meanLonRad) -
      2 * eccentricity * Math.sin(meanAnom) +
      4 * eccentricity * y * Math.sin(meanAnom) * Math.cos(2 * meanLonRad) -
      0.5 * y * y * Math.sin(4 * meanLonRad) -
      1.25 * eccentricity * eccentricity * Math.sin(2 * meanAnom));

  // Hour angle at the horizon. |cos| > 1 ⇒ polar day or night; NaN/Infinity
  // (degenerate inputs like |latitude| = 90°, where tan() explodes) also
  // means "no well-defined sun event today".
  const cosHa =
    Math.cos(HORIZON_ZENITH * DEG) / (Math.cos(latitude * DEG) * Math.cos(declination)) -
    Math.tan(latitude * DEG) * Math.tan(declination);
  if (!Number.isFinite(cosHa) || cosHa > 1 || cosHa < -1) {
    return { sunrise: null, sunset: null };
  }
  const haDeg = Math.acos(cosHa) / DEG;

  const noonUtcMin = 720 - 4 * longitude - eqTime;
  const base = Date.UTC(year, month - 1, day);
  return {
    sunrise: new Date(base + (noonUtcMin - 4 * haDeg) * 60000),
    sunset: new Date(base + (noonUtcMin + 4 * haDeg) * 60000),
  };
}

/**
 * UTC offset (minutes) in effect for `timeZone` at `at` — DST-aware, unlike
 * a fixed offset. Falls back to the device offset for an invalid zone,
 * matching `formatInTimezone`'s degradation. Location context only: this
 * never decides *display* formatting, just which calendar day the sun math
 * runs for.
 */
export function getZoneOffsetMinutes(timeZone: string | undefined, at: Date): number {
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  };
  const offsetFrom = (zone?: string): number => {
    const parts = getDateTimeFormatter('en-CA', { ...options, timeZone: zone }).formatToParts(at);
    const pick = (type: Intl.DateTimeFormatPartTypes): number =>
      Number(parts.find((p) => p.type === type)?.value);
    const asUtc = Date.UTC(pick('year'), pick('month') - 1, pick('day'), pick('hour'), pick('minute'));
    return Math.round((asUtc - at.getTime()) / 60000);
  };
  if (timeZone) {
    try {
      return offsetFrom(timeZone);
    } catch {
      // Invalid zone: fall through to the device offset.
    }
  }
  try {
    return offsetFrom(undefined);
  } catch {
    return -at.getTimezoneOffset();
  }
}
