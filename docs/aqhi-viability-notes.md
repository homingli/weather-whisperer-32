# AQHI card — viability notes (issue #99 spike)

Branch: `explore/aqhi-viability`. Status: **viable, with three caveats** — the
data source, transport, parsing, pipeline, and UI slot are all proven below.

## What this branch contains

A working vertical slice, all tests green (`440 passing`):

- `src/lib/hko-aqhi.ts` — EPD RSS fetcher (`getHKOAQHI`), regex parser,
  18-station coordinate table, `aqhiLevelFor` band derivation, nearest-station
  lookup. Fetch failure returns `null` (never throws).
- `src/lib/weather/types.ts` — `aqhiIndex` / `aqhiStation` on `CurrentWeather`
  (undefined ⇒ UI renders nothing, HK-only metric; band derived for display
  via `aqhiLevelFor`, so no redundant level field is persisted).
- `src/lib/hko-fetch.ts` — AQHI joins the parallel fetch in
  `getHKODailyAndWarnings` (non-fatal `.catch`); `buildHKOWeatherData` attaches
  it to `current`. Covers both the merged path and the HKO-only fallback path.
- `src/lib/weather-manager.ts` — the both-live merge rebuilds `current` from
  Open-Meteo, so AQHI fields are re-attached explicitly there.
- `src/components/CurrentWeather.tsx` — `AqhiChip` full widget (mirrors
  `UvChip`: value + colored EPD band label + 4-segment band bar) and a quiet
  chip when AQHI ≤ 3 (Low). Renders only when data exists.
- `vercel.json` + `vite.config.ts` — same-origin `/aqhi-rss/*` proxy (Vercel
  rewrite in prod, Vite dev proxy in dev), the same pattern as `/hko-data/*`,
  plus a service-worker NetworkFirst rule (1h, matches EPD publish cadence).
- `src/contexts/LanguageContext.tsx` — `weather.aqhi`, `aqhi.low/moderate/
  high/veryHigh` in en + tc.
- Tests: `hko-aqhi.test.ts` (parser, bands, nearest, silent degradation) and
  5 component tests incl. a grid-visibility regression.

## Evidence collected (Sep 2026)

1. **Issue's proposed endpoint is invalid.** `dataType=aqhi` on
   `data.weather.gov.hk` returns "Please include valid parameters" (also
   confirmed by the issue's first comment). The real source is the EPD feed.
2. **EPD feed is live and stable-shaped.** EN + TC feeds return HTTP 200,
   well-formed RSS 2.0, 18 items each (15 general + 3 roadside).
   `https://www.aqhi.gov.hk/epd/ddata/html/out/aqhi_ind_rss_{Eng,ChT}.xml`
3. **CORS blocks direct browser fetch — proxy is mandatory.** The feed sends
   `Access-Control-Allow-Origin: https://aqhi.gov.hk` and 405s OPTIONS
   preflight. The `/hko-data` same-origin proxy precedent (Vercel rewrite +
   Vite proxy) handles this; verified end-to-end through the dev server
   (200 for both languages) on this branch.
4. **Parser is drift-resistant.** The TC feed uses `中` for Moderate (not
   `中等` as the issue's regex assumed) and mixes full-width/ASCII colons. The
   parser here never reads the level word — it extracts the station title and
   numeric value only, then derives the band from the value. Validated against
   live bytes: 18/18 items parse, 0 warnings.
5. **Band boundaries — CORRECTED 18 Sep 2026 against the official table.**
   EPD's health-risk scale has FIVE categories (gov.hk/en/residents/
   environment/air/aqhi.htm, en + tc verified): Low 1–3, Moderate 4–6,
   High 7, Very High 8–10, Serious 10+; TC terms 低/中/高/甚高/嚴重.
   The issue body's four-band table (Moderate 4–7, High 8–10, Very High
   >10) is wrong, and an earlier draft of this spike shipped it — the live
   feed's own "3→Low, 4→Moderate" labels cannot discriminate the 6/7 and
   7/8 boundaries, so that spot-check proved less than it appeared to.
   `aqhiLevelFor` in hko-aqhi.ts is the single source of truth for
   value → band; the UI band table keys off its levels.
6. **Feed cadence:** `pubDate`/`lastBuildDate` update hourly (hourly AQHI is
   EPD's published maximum reporting interval).

## Caveats — resolved 17 Sep 2026 (review with owner)

1. **Station coordinates are approximate** (± few hundred metres, marked in
   `EPD_AQHI_STATIONS`). Owner accepted — fine for nearest-station selection.
2. **Roadside vs general — resolved: general-only.** Roadside entries stay in
   the table to document the feed, but `findNearestAqhiStation` skips them, so
   every user gets the district's background reading.
3. **Refetch cadence — resolved: 15-min TTL on the AQHI fetch.** The 5-min
   loop is the app-wide weather refresh (`useWeatherWithProgress`), not
   AQHI-specific; loosening it would delay warnings (1-min TTL expectation).
   Instead `getHKOAQHI` serves repeat calls from a per-language parsed-feed
   cache (`TIMING.AQHI_TTL_MS`), so the proxy is hit at most every 15 min.
   Failures and empty feeds are never cached — the next loop retries.
   Concurrent cold-cache calls share one in-flight promise. The feed fetch
   uses a dedicated 3s timeout (`TIMING.AQHI_TIMEOUT_MS`) so a slow EPD feed
   can never stall warnings/daily/current beyond 3s on a cache miss.

## Known unknowns

- **Vercel rewrite path is unverified until the PR's preview deploy.** The
  dev-server proxy is proven (both languages 200), but EPD could treat
  Vercel's datacenter egress differently than a browser (403 instead of a
  CORS block). Check the preview URL's `/aqhi-rss/aqhi_ind_rss_Eng.xml`
  before merging.

## Design note: dedicated EPD station table

`findNearestDistrict()` reuse was rejected. HKO rainfall district names
("Central & Western District", "Kwai Tsing") don't match EPD titles
("Central/Western", "Kwai Chung"), and EPD stations (Tung Chung, Tap Mun,
Tseung Kwan O, the roadside trio) have no HKO district equivalent. A
dedicated EPD station table removes the fragile string mapping entirely.

## Explicitly out of scope (spike)

- Non-HK AQI via Open-Meteo (`air_quality_index`): a different scale
  (dimensionless AQI 0–500, not EPD's 1–10+ AQHI). Separate issue if wanted.
- CHANGELOG/ARCHITECTURE entries — to be written when the spike graduates.
