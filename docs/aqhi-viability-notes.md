# AQHI card — viability notes (issue #99 spike)

Branch: `explore/aqhi-viability`. Status: **viable, with three caveats** — the
data source, transport, parsing, pipeline, and UI slot are all proven below.

## What this branch contains

A working vertical slice, all tests green (`431 passing`):

- `src/lib/hko-aqhi.ts` — EPD RSS fetcher (`getHKOAQHI`), regex parser,
  18-station coordinate table, `aqhiLevelFor` band derivation, nearest-station
  lookup. Fetch failure returns `null` (never throws).
- `src/lib/weather/types.ts` — `aqhiIndex` / `aqhiLevel` / `aqhiStation` on
  `CurrentWeather` (undefined ⇒ UI renders nothing, HK-only metric).
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
5. **Bands verified against the feed's own labels.** Live data shows value 3
   labeled "Low" and 4 "Moderate" ⇒ Low 1–3, Moderate 4–7, High 8–10, Very
   High 10+. (The issue body's table agrees.)
6. **Feed cadence:** `pubDate`/`lastBuildDate` update hourly (hourly AQHI is
   EPD's published maximum reporting interval).

## Caveats / decisions before merging

1. **Station coordinates are approximate** (± few hundred metres, marked in
   `EPD_AQHI_STATIONS`). Fine for nearest-station selection; verify against
   EPD's published station addresses if this ever drives anything
   distance-sensitive.
2. **Roadside vs general.** Nearest-of-all-18 wins, so users in Central /
   Causeway Bay / Mong Kok typically get the roadside reading (more protective
   for pedestrians; higher than the general reading). Alternative: general-only.
   Needs a product call.
3. **`findNearestDistrict()` reuse was rejected.** HKO rainfall district names
   ("Central & Western District", "Kwai Tsing") don't match EPD titles
   ("Central/Western", "Kwai Chung"), and EPD stations (Tung Chung, Tap Mun,
   Tseung Kwan O, the roadside trio) have no HKO district equivalent. A
   dedicated EPD station table removes the fragile string mapping entirely.

## Explicitly out of scope (spike)

- Non-HK AQI via Open-Meteo (`air_quality_index`): a different scale
  (dimensionless AQI 0–500, not EPD's 1–10+ AQHI). Separate issue if wanted.
- CHANGELOG/ARCHITECTURE entries — to be written when the spike graduates.
