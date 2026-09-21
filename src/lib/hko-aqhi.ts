/** EPD Air Quality Health Index (AQHI) — RSS feed fetching and parsing.
 *
 *  Spike for issue #99. The HKO Open Data API has no `dataType=aqhi`; the
 *  authoritative AQHI source is the EPD RSS feed hosted on aqhi.gov.hk
 *  (18 stations: 15 general + 3 roadside). The feed blocks cross-origin
 *  reads (Access-Control-Allow-Origin: https://aqhi.gov.hk), so on the web
 *  it is fetched through a same-origin proxy: the Vite dev proxy
 *  (`/aqhi-rss`) in development and a Vercel rewrite in production — the
 *  same pattern the nowcast CSV uses for `/hko-data`. The native WebView
 *  has no rewrite layer, so the shells fetch EPD directly over the native
 *  HTTP stack (no CORS there) — see `native-http.ts`.
 *
 *  Parsing notes (from the live feed, Sep 2026):
 *  - EN description: "Central/Western - General Stations: 5 Moderate - Thu, ..."
 *  - TC description: "中西區 - 一般監測站: 5 中 - 2026年9月17日 (星期四)"
 *  The TC level token is 中, not 中等 — so the health-risk band is derived
 *  from the numeric value instead of parsing the level word.
 */

import { fetchWithTimeout } from './fetch-utils';
import { logTiming, logFailure } from './log';
import { logParseWarnings } from './parsers';
import { TIMING } from './constants';
import { getDistanceFromLatLon } from './hko-stations';
import { isNativePlatform, nativeHttpGetText } from './native-http';

export type AqhiLevel = 'low' | 'moderate' | 'high' | 'veryHigh' | 'serious';

/** A resolved AQHI reading for the user's location. */
export interface AqhiReading {
  /** AQHI value (1–10+, EPD scale) */
  index: number;
  /** Station title in the fetch language (e.g. "Central/Western" / "中西區") */
  station: string;
}

/** One parsed feed item. */
export interface AqhiFeedItem {
  station: string;
  value: number;
}

/** EPD monitoring stations. Titles must match the RSS feed exactly for
 *  each language; coordinates are approximate station locations (± few
 *  hundred metres — accepted for this use, 17 Sep 2026). Roadside entries
 *  are kept to document the full feed, but nearest-station matching is
 *  general-only by product decision: the general reading represents the
 *  district's background air, while roadside reflects kerbside exposure
 *  that overstates what a whole-district card should claim. */
export interface EpdAqhiStation {
  en: string;
  tc: string;
  lat: number;
  lon: number;
  type: 'general' | 'roadside';
}

export const EPD_AQHI_STATIONS: EpdAqhiStation[] = [
  { en: 'Central/Western', tc: '中西區', lat: 22.2867, lon: 114.1441, type: 'general' },
  { en: 'Southern', tc: '南區', lat: 22.2478, lon: 114.1906, type: 'general' },
  { en: 'Eastern', tc: '東區', lat: 22.2880, lon: 114.2180, type: 'general' },
  { en: 'Kwun Tong', tc: '觀塘', lat: 22.3129, lon: 114.2267, type: 'general' },
  { en: 'Sham Shui Po', tc: '深水埗', lat: 22.3304, lon: 114.1592, type: 'general' },
  { en: 'Kwai Chung', tc: '葵涌', lat: 22.3572, lon: 114.1292, type: 'general' },
  { en: 'Tsuen Wan', tc: '荃灣', lat: 22.3716, lon: 114.1177, type: 'general' },
  { en: 'Tseung Kwan O', tc: '將軍澳', lat: 22.3174, lon: 114.2606, type: 'general' },
  { en: 'Yuen Long', tc: '元朗', lat: 22.4453, lon: 114.0226, type: 'general' },
  { en: 'Tuen Mun', tc: '屯門', lat: 22.3904, lon: 113.9753, type: 'general' },
  { en: 'Tung Chung', tc: '東涌', lat: 22.2880, lon: 113.9425, type: 'general' },
  { en: 'Tai Po', tc: '大埔', lat: 22.4501, lon: 114.1647, type: 'general' },
  { en: 'Sha Tin', tc: '沙田', lat: 22.3777, lon: 114.1917, type: 'general' },
  { en: 'North', tc: '北區', lat: 22.4927, lon: 114.1387, type: 'general' },
  { en: 'Tap Mun', tc: '塔門', lat: 22.4722, lon: 114.3600, type: 'general' },
  { en: 'Causeway Bay', tc: '銅鑼灣', lat: 22.2800, lon: 114.1828, type: 'roadside' },
  { en: 'Central', tc: '中環', lat: 22.2820, lon: 114.1580, type: 'roadside' },
  { en: 'Mong Kok', tc: '旺角', lat: 22.3196, lon: 114.1686, type: 'roadside' },
];

/** EPD health-risk bands — the official five-category table
 *  (gov.hk/en/residents/environment/air/aqhi.htm, verified 18 Sep 2026):
 *  Low 1–3, Moderate 4–6, High 7, Very High 8–10, Serious 10+.
 *  NOTE: the issue body's table (Moderate 4–7, High 8–10, Very High >10,
 *  four categories) is wrong — an earlier draft of this spike shipped it.
 *  This function is the single source of truth for value → band; the UI
 *  band table in CurrentWeather.tsx keys off these levels, so the two
 *  cannot drift. */
export function aqhiLevelFor(value: number): AqhiLevel {
  if (value <= 3) return 'low';
  if (value <= 6) return 'moderate';
  if (value <= 7) return 'high';
  if (value <= 10) return 'veryHigh';
  return 'serious';
}

/** Nearest general EPD station to the given coordinates, with its feed
 *  title in the requested language. Roadside stations (Causeway Bay,
 *  Central, Mong Kok) are excluded — see the station-table note. */
export function findNearestAqhiStation(
  lat: number,
  lon: number,
  lang: 'en' | 'tc' = 'en',
): { title: string; station: EpdAqhiStation; distance: number } | null {
  let best: { title: string; station: EpdAqhiStation; distance: number } | null = null;
  for (const station of EPD_AQHI_STATIONS) {
    if (station.type !== 'general') continue;
    const distance = getDistanceFromLatLon(lat, lon, station.lat, station.lon);
    if (!best || distance < best.distance) {
      best = { title: lang === 'tc' ? station.tc : station.en, station, distance };
    }
  }
  return best;
}

/** Parse the AQHI RSS feed into per-station readings.
 *  Item titles hold the station name; descriptions hold
 *  "{station} - {type} Stations: {value} {level} - {timestamp}".
 *  Unparseable items are skipped and reported in `warnings` — a partial
 *  feed still yields readings for the districts that parsed. */
export function parseAqhiRss(xml: string): { data: AqhiFeedItem[]; warnings: string[] } {
  const data: AqhiFeedItem[] = [];
  const warnings: string[] = [];
  const items = xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/g) ?? [];

  for (const item of items) {
    // Title may be CDATA-wrapped like descriptions (strip if present).
    const title = item.match(/<title\b[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim();
    // Description may be CDATA-wrapped; strip the wrapper if present.
    // `\b[^>]*` tolerates attributed tags (<description type="html">) —
    // same drift-hardening as <item>/<title> above.
    const rawDesc = item.match(/<description\b[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1] ?? '';
    // Tolerant of EN "General Stations:" / "Roadside Stations:" and TC
    // "一般監測站:" / "路邊監測站:" with full-width or ASCII colon.
    const valueMatch = rawDesc.match(/(?:Stations?|監測站)\s*[:：]\s*(\d+)/);
    if (!title || !valueMatch) {
      warnings.push(`unparseable AQHI item: ${title ?? '<no title>'}`);
      continue;
    }
    data.push({ station: title, value: parseInt(valueMatch[1], 10) });
  }

  return { data, warnings };
}

const FEED_PATHS: Record<'en' | 'tc', { proxy: string; origin: string }> = {
  en: {
    proxy: '/aqhi-rss/aqhi_ind_rss_Eng.xml',
    origin: 'https://www.aqhi.gov.hk/epd/ddata/html/out/aqhi_ind_rss_Eng.xml',
  },
  tc: {
    proxy: '/aqhi-rss/aqhi_ind_rss_ChT.xml',
    origin: 'https://www.aqhi.gov.hk/epd/ddata/html/out/aqhi_ind_rss_ChT.xml',
  },
};

/** Per-language parsed-feed cache. AQHI piggybacks the app-wide 5-min
 *  weather refetch, but the EPD feed only updates hourly — TIMING.AQHI_TTL_MS
 *  (15 min) bounds the proxy hits without a dedicated timer. Keyed by
 *  language because each language is a separate feed file; the nearest-station
 *  resolution stays outside the cache so a location/language switch resolves
 *  correctly from whatever cached feed is valid. Failures are never cached —
 *  a down feed retries on the next weather loop (5 min). */
const feedCache: Partial<Record<'en' | 'tc', { data: AqhiFeedItem[]; fetchedAt: number }>> = {};
/** In-flight dedup: concurrent cold-cache calls (city switch / remount mid-
 *  flight) share one fetch instead of each hitting the proxy. */
const inFlight: Partial<Record<'en' | 'tc', Promise<AqhiFeedItem[]>>> = {};

/** Test seam: drop all cached feeds. */
export function resetAqhiFeedCacheForTests(): void {
  for (const key of Object.keys(feedCache) as Array<'en' | 'tc'>) delete feedCache[key];
  for (const key of Object.keys(inFlight) as Array<'en' | 'tc'>) delete inFlight[key];
}

/** Fetch + parse the feed for `lang`, deduplicating concurrent callers.
 *  Resolves [] when the fetch or parse fails (callers treat [] as no data). */
async function fetchAqhiFeed(lang: 'en' | 'tc'): Promise<AqhiFeedItem[]> {
  const pending = inFlight[lang];
  if (pending) return pending;

  const fetchPromise = (async () => {
    const start = Date.now();
    try {
      let xml: string;
      if (isNativePlatform()) {
        // Native WebView: no same-origin proxy exists there, fetch EPD
        // directly over the native stack (CORS doesn't apply to it).
        xml = (await nativeHttpGetText(FEED_PATHS[lang].origin, TIMING.AQHI_TIMEOUT_MS)).text;
      } else {
        const response = await fetchWithTimeout(FEED_PATHS[lang].proxy, {
          timeout: TIMING.AQHI_TIMEOUT_MS,
        });
        if (!response.ok) throw new Error(`Failed to fetch AQHI feed: ${response.status}`);
        xml = await response.text();
      }
      logTiming('EPD aqhi fetch', Date.now() - start);

      const { data, warnings } = parseAqhiRss(xml);
      logParseWarnings('EPD aqhi', warnings);
      return data;
    } catch (err) {
      logFailure('EPD aqhi', Date.now() - start, err);
      return [];
    }
  })();

  inFlight[lang] = fetchPromise;
  try {
    return await fetchPromise;
  } finally {
    if (inFlight[lang] === fetchPromise) delete inFlight[lang];
  }
}

/** Fetch the EPD AQHI feed and resolve the reading for the nearest station.
 *  Returns null (never throws) when the feed is down, unparseable, or no
 *  station matches — AQHI is an enhancement, so callers degrade silently. */
export async function getHKOAQHI(
  lang: 'en' | 'tc' = 'en',
  lat: number,
  lon: number,
): Promise<AqhiReading | null> {
  let items: AqhiFeedItem[];
  const cached = feedCache[lang];
  if (cached && Date.now() - cached.fetchedAt < TIMING.AQHI_TTL_MS) {
    items = cached.data;
  } else {
    items = await fetchAqhiFeed(lang);
    // An empty result is a down feed in disguise — don't cache it,
    // so the next weather loop retries.
    if (items.length === 0) return null;
    feedCache[lang] = { data: items, fetchedAt: Date.now() };
  }

  const nearest = findNearestAqhiStation(lat, lon, lang);
  const match = nearest ? items.find(r => r.station === nearest.title) : undefined;
  if (!match) return null;
  return { index: match.value, station: match.station };
}
