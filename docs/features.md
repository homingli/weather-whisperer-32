# Feature details

## Current weather

The hero section displays:
- **Location and time.** City name and local time formatted for that timezone
- **Icon.** Large weather icon for current conditions
- **Temperature.** Current apparent temperature with a "feels like" label
- **Temperature caption.** Today's low and high (low first, left to right) with a 3-hour trend indicator (up/down/flat)
- **Condition.** Current precipitation and humidity data
- **Umbrella indicator.** Whether an umbrella is recommended, based on current rain or upcoming precipitation
- **Sun-cycle strip.** Day/night progress bar; next sunset during the day, next sunrise at night, with exact times
- **UV index chip.** Color-banded UV chip with localized band labels (Low / Moderate / High / Very High / Extreme)

## At a glance (today + tomorrow)

`AtAGlance` is a thin, low-weight strip between the hero and the hourly/daily split on desktop, and above the swipe deck on mobile. It summarises `daily[0]` and `daily[1]` in the same per-day format: temp range (low → high) and rain chance (only when ≥ 20 %); wind intentionally stays off the strip (it lives on the daily cards). Each day's temperature group (kicker, icon, range) is a button that reveals the full daily forecast (desktop scroll / mobile deck advance); the groups share a line when they fit and wrap to one line per day when they don't. Each rain chip is its own button that jumps to the nowcast pane (map slide on mobile, section scroll on desktop) — where the 2-hour radar-based forecast lives — and degrades to static text when the city is outside nowcast coverage. A missing or sentinel day is skipped; with none left the strip renders nothing.

## Hourly forecast

6-hour forecast with an interactive line chart:
- Temperature trend (left Y-axis)
- Precipitation probability as translucent bars behind the temperature line (right Y-axis); the tooltip shows the chance and the expected rainfall in mm (or in)

## Daily forecast

7-day forecast (today and tomorrow are also summarised in the `AtAGlance` strip above the deck) with:
- Min/max temperatures
- Weather conditions
- Precipitation probability
- Weather icons
- Share button in the card header (see "Share the forecast" below)

## Share the forecast

A share icon in the daily-forecast card header composes the upcoming days into a short, chat-friendly message and opens the platform share sheet (`navigator.share`); where no share sheet exists (desktop) the message is copied with a confirmation toast instead.

- The message is built by the pure `buildForecastShareText` (`src/lib/share-forecast.ts`) from `weather.daily` + units + language + the city's timezone — a header line, one line per day (icon, date, condition, temp range, rain chance when meaningful), and a link to the app. It renders in English or Traditional Chinese to match the app and respects the unit setting.
- Share-sheet dismissal (`AbortError`) is treated as "user cancelled", not an error; any other share failure falls through to the clipboard fallback.
- Deliberately rejected: sharing the nowcast map as an image (MapLibre WebGL canvas + cross-origin tiles → `toDataURL()` taint risk, and a 2-hour nowcast is stale within the hour). A v2 branded image card may follow if the text share proves useful (see `TODO.md`).

## Settings and navigation

The hamburger menu covers:
- **Global city search.** Autocomplete over the Open-Meteo Geocoding API
- **Recent locations.** The last 3 visited cities
- **Current location.** One-tap geolocation
- **Theme toggle.** Light, dark, and auto (sun-synced) modes
- **Language toggle.** English and Traditional Chinese
- **Manual refresh.** Fetches fresh data on demand; falls back to the last cached snapshot if the source is unreachable
- **Data-source credit.** "Data from Open-Meteo & HK Observatory" (or Open-Meteo alone outside Hong Kong) at the bottom of the menu — the page footer was removed so the forecast deck can use the full viewport height

## Weather alerts

HKO warnings render as compact icons in the top bar; clicking opens a modal with the full safety text. Coverage:
- Typhoon signals (TC1, TC3, TC8, TC8B-D, TC9, TC10)
- Rainstorm warnings (Red, Amber)
- Special weather advisories (Hot Weather, Cold Weather, Frost, etc.)
- Tsunami and landslip warnings
- 20 locally-hosted animated warning GIFs (no CDN dependencies)
- Cancelled warnings are filtered with `actionCode.toUpperCase() !== 'CANCEL'` (case-insensitive; HKO returns uppercase `CANCEL`). The filter is locked against the live fixture in `src/lib/__fixtures__/`

## Rain-start banner

A thin strip above the at-a-glance row (both mobile and desktop layouts) answering "when will it rain?":
- **No rain expected in the next N h** / **Rain expected around HH:MM · in ~N min** / **Raining now · easing around HH:MM**, with a small upcoming-precipitation bar strip
- Merges two free sources with complementary strengths: the HKO gridded nowcast (0–2 h, ~1 km cells — district-accurate) and Open-Meteo 15-minute/hourly precipitation (up to 24 h — city-scale, ~8 km model cells, so Open-Meteo-backed copy carries a "city-wide" qualifier)
- The Open-Meteo 15-minute series arrives inside the existing unified weather fetch (no extra request); the HKO grid segment upgrades automatically once the rain map has been loaded (it reads the shared query cache and never triggers the 2.7 MB CSV download itself)
- Renders nothing when neither source has usable data; phrasing refreshes on a minute tick
- Follows the selected city (wording stays location-neutral, not geolocation-only); a step counts as wet at ≥ 0.1 mm (`RAIN_THRESHOLD_MM` in `src/lib/rain-start.ts`), with amounts shown as bar heights rather than mm text

## Gridded rainfall nowcast

- HKO gridded rainfall data visualized on an interactive MapLibre map
- Covers Hong Kong and the Pearl River Delta (Shenzhen, Guangzhou, Macau, Zhuhai; extends into Guangdong, China)
- Forecast step controls sit directly above the map: Play/Pause button, the active `Forecast Step` label (formatted HH:MM), the timeline slider, and clickable per-step buttons.
- Map follows underneath with the active timestep's color-bucketed GeoJSON overlay
- MSC GeoMet (Meteorological Service of Canada, Vancouver) rainfall tile layer via WMS, rendered through `MSCRainfallMap`
- Carto basemap support for vector tiles when `VITE_CARTO_API_KEY` is set
- Precise ending timestamps are derived from raw CSV `endTime` values
- User location blue pin marker with automatic map zoom to data extent
- Scroll wheel zoom, double-click zoom, and zoom controls
- Legend overlay bottom-right with seven color buckets from `< 0.5 mm` to `> 30 mm`
