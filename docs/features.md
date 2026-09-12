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

`AtAGlance` is a thin, low-weight strip between the hero and the hourly/daily split on desktop, and above the swipe deck on mobile. It summarises `daily[0]` and `daily[1]` in the same per-day format: temp range (low → high), rain chance (only when ≥ 20 %), and max wind. Each day is one group (kicker, icon, range, rain, wind); the groups share a line when they fit and wrap to one line per day when they don't — the whole row is still a single button. Activating the strip reveals the full daily forecast (desktop scroll / mobile deck advance). Below 360 px each day's wind group hides; the chevron still signals "more". A missing or sentinel day is skipped; with none left the strip renders nothing.

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

## Gridded rainfall nowcast

- HKO gridded rainfall data visualized on an interactive MapLibre map
- Covers Hong Kong and the Pearl River Delta (Shenzhen, Guangzhou, Macau, Zhuhai; extends into Guangdong, China)
- Forecast step controls sit directly above the map: Play/Pause button, the active `Forecast Step` label (formatted HH:MM), the timeline slider, and clickable per-step buttons.
- Map follows underneath with the active timestep's color-bucketed GeoJSON overlay
- MSC (Macau) rainfall tile layer via WMS, rendered through `MSCRainfallMap`
- Carto basemap support for vector tiles when `VITE_CARTO_API_KEY` is set
- Precise ending timestamps are derived from raw CSV `endTime` values
- User location blue pin marker with automatic map zoom to data extent
- Scroll wheel zoom, double-click zoom, and zoom controls
- Legend overlay bottom-right with seven color buckets from `< 0.5 mm` to `> 30 mm`
