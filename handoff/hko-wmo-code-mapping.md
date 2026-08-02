# HKO × WMO Weather Code Mapping — Reference

**Date:** 2026-08-02
**Scope:** `weather-whisperer-32` — all weather-code translation paths
**Status:** Documented, no code change.

## Sources of truth in the codebase

| What | File | Function / table |
|---|---|---|
| WMO description table | `src/lib/weather/codes.ts` | `getWeatherDescription()`, `weatherDescriptionKey()` |
| WMO translation keys (en + tc) | `src/contexts/LanguageContext.tsx` | `weather.desc.*` keys |
| HKO → WMO code map | `src/lib/hko-icons.ts` | `hkoIconToWeatherCode()` |
| HKO icon codes reference URL | `src/lib/hko-icons.ts:5` | comment: `https://www.hko.gov.hk/textonly/v2/explain/wxicon_e.htm` |
| WMO icon (emoji + lucide) | `src/lib/weather/codes.ts` | `getWeatherIcon()`, `ICON_MAP` |

The app requests `weather_code` from Open-Meteo (`src/lib/weather/open-meteo.ts:18-20`) and feeds it straight to `getWeatherDescription()`. HKO's own endpoints return HKO icon codes, which pass through `hkoIconToWeatherCode()` first and then into the same description table.

---

## 1. WMO weather codes used by the app

These are the Open-Meteo codes the description table in `src/lib/weather/codes.ts` recognises. Anything outside this set falls back to `'Unknown'`.

| WMO code | EN label (current) | Group (per WMO 4677) |
|---:|---|---|
| 0 | Clear sky | Cloud development |
| 1 | Mainly clear | Cloud development |
| 2 | Partly cloudy | Cloud development |
| 3 | Overcast | Cloud development |
| 45 | Foggy | Fog |
| 48 | Depositing rime fog | Fog |
| 51 | Light drizzle | Drizzle |
| 53 | Moderate drizzle | Drizzle |
| 55 | Dense drizzle | Drizzle |
| 56 | Freezing drizzle | Drizzle (freezing) |
| 57 | Dense freezing drizzle | Drizzle (freezing) |
| 61 | Slight rain | Rain |
| 63 | Moderate rain | Rain |
| 65 | Heavy rain | Rain |
| 66 | Freezing rain | Rain (freezing) |
| 67 | Heavy freezing rain | Rain (freezing) |
| 71 | Slight snow | Snow |
| 73 | Moderate snow | Snow |
| 75 | Heavy snow | Snow |
| 77 | Snow grains | Snow |
| 80 | Slight rain showers | Showers |
| 81 | Moderate rain showers | Showers |
| 82 | Violent rain showers | Showers |
| 85 | Slight snow showers | Snow showers |
| 86 | Heavy snow showers | Snow showers |
| 95 | Thunderstorm | Thunderstorm |
| 96 | Thunderstorm with hail | Thunderstorm |
| 99 | Thunderstorm with heavy hail | Thunderstorm |

Total: 27 distinct codes.

Notes on the labels:
- EN wording ("Slight / Moderate / Heavy" for rain, "Light / Moderate / Dense" for drizzle) is taken from the WMO 4677 descriptors — `Slight rain` = WMO 4677 code 61, `Light drizzle` = code 51, etc.
- The full WMO 4677 standard has more codes (00–99 range, with codes 04–19 covering haze/mist/dust, 30–39 covering dust storms and funnel clouds, etc.) — this app uses a 27-code subset that matches what Open-Meteo emits.
- TC translations live in `src/contexts/LanguageContext.tsx` under the same `weather.desc.*` keys. Translation values are HK Traditional Chinese; verify they survive the headline-icon swap (see `hko-headline-icon-plan.md`).

---

## 2. HKO icon codes used by the app

HKO's icon taxonomy in the current mapping (per the `hkoIconToWeatherCode` table in `src/lib/hko-icons.ts`). The mapping comment cites `https://www.hko.gov.hk/textonly/v2/explain/wxicon_e.htm` as the reference page — if that link has moved, the live canonical location is the Hong Kong Observatory website under their weather symbols section.

| HKO code | HKO description (EN, per HKO's own reference) | Day/Night |
|---:|---|---|
| 50 | Sunny | Day |
| 51 | Sunny Periods | Day |
| 52 | Sunny Intervals | Day |
| 53 | Sunny Periods with A Few Showers | Day |
| 54 | Sunny Intervals with Showers | Day |
| 60 | Cloudy | Day |
| 61 | Overcast | Day |
| 62 | Light Rain | Day |
| 63 | Rain | Day |
| 64 | Heavy Rain | Day |
| 65 | Thunderstorms | Day |
| 70 | Fine | Night |
| 71 | Fine (periods) | Night |
| 72 | Fine (intervals) | Night |
| 73 | Fine with showers | Night |
| 74 | Showers | Night |
| 75 | Cloudy | Night |
| 76 | Overcast | Night |
| 77 | Light Rain | Night |
| 80 | Windy | Any |
| 81 | Dry | Any |
| 82 | Humid | Any |
| 83 | Fog | Any |
| 84 | Mist | Any |
| 85 | Haze | Any |
| 90 | Hot | Any |
| 91 | Warm | Any |
| 92 | Cool | Any |
| 93 | Cold | Any |

Total: 30 mapped codes (50–54, 60–65, 70–77, 80–85, 90–93). Default fallback is `3` (Overcast) for unmapped codes — including the HKO sentinel `9999` ("no reading") and any negative number from the upstream payload.

Where they appear in the app:
- `getHKOCurrentWeather` (current snapshot only) — full 50–93 range, including special conditions (Windy / Humid / Hot / Cool / etc.).
- `getHKODailyAndWarnings` 9-day forecast — narrower range, primarily 50–65 (sunny → thunderstorms). The 80–93 special-conditions are essentially absent from this endpoint.
- HKO hourly forecast (if used) — same narrow range as daily.

This asymmetry is the reason the HKO-granular headline only works for the "now" surface, not hourly/daily.

---

## 3. HKO → WMO mapping (as implemented in `hkoIconToWeatherCode`)

Verbatim from `src/lib/hko-icons.ts:7-50`. Column order: HKO code → HKO description → mapped WMO code → mapped WMO label → accuracy flag.

| HKO code | HKO desc | WMO code | WMO label | Accuracy |
|---:|---|---:|---|---|
| 50 | Sunny | 0 | Clear sky | Exact |
| 51 | Sunny Periods | 1 | Mainly clear | Lossy — drops the "periods" qualifier |
| 52 | Sunny Intervals | 2 | Partly cloudy | Lossy — drops the "intervals" qualifier |
| 53 | Sunny Periods with A Few Showers | 2 | Partly cloudy | Lossy — drops the "a few showers" cue |
| 54 | Sunny Intervals with Showers | 61 | Slight rain | Lossy — keeps intensity, drops sunny-partly context |
| 60 | Cloudy | 3 | Overcast | Approx — "cloudy" is less overcast than WMO 3 |
| 61 | Overcast | 3 | Overcast | Exact |
| 62 | Light Rain | 61 | Slight rain | Approx — semantic match, different wording |
| 63 | Rain | 63 | Moderate rain | Lossy — HK "rain" ≠ HK "moderate rain" |
| 64 | Heavy Rain | 65 | Heavy rain | Exact |
| 65 | Thunderstorms | 95 | Thunderstorm | Approx — drops the "heavy"/"ongoing" intensity |
| 70 | Fine (night) | 0 | Clear sky | Exact (for night) |
| 71 | Fine (periods, night) | 1 | Mainly clear | Lossy |
| 72 | Fine (intervals, night) | 2 | Partly cloudy | Lossy |
| 73 | Fine with showers (night) | 2 | Partly cloudy | Lossy — drops the showers |
| 74 | Showers (night) | 61 | Slight rain | Approx — drops intensity |
| 75 | Cloudy (night) | 3 | Overcast | Approx |
| 76 | Overcast (night) | 3 | Overcast | Exact |
| 77 | Light Rain (night) | 61 | Slight rain | Approx |
| 80 | Windy | 71 | Slight snow | **Wrong mapping** — `71` is snow, not wind. Looks like a typo in the source (HKO 80 should plausibly map to no WMO equivalent, or to an auxiliary field, not snow). |
| 81 | Dry | 65 | Heavy rain | **Wrong mapping** — `65` is heavy rain, the opposite of "Dry". Almost certainly a transcription error. |
| 82 | Humid | 73 | Moderate snow | **Wrong mapping** — `73` is snow. Humidity has no WMO equivalent. |
| 83 | Fog | 45 | Foggy | Exact |
| 84 | Mist | 45 | Foggy | Approx — WMO 45 is fog, not mist |
| 85 | Haze | 45 | Foggy | Lossy — WMO 45 is fog, not haze |
| 90 | Hot | 95 | Thunderstorm | **Wrong mapping** — `95` is thunderstorm. Temperature has no WMO equivalent. |
| 91 | Warm | 95 | Thunderstorm | **Wrong mapping** — same as above. |
| 92 | Cool | 0 | Clear sky | **Wrong mapping** — `0` is clear sky, not cool. The app will show "Clear sky" when HKO reports "Cool" conditions. |
| 93 | Cold | 0 | Clear sky | **Wrong mapping** — same as above. |

All five "wrong mapping" rows (80, 81, 82, 90, 91, 92, 93) are runtime-visible bugs. They occur precisely because HKO's special-conditions codes (Windy / Dry / Humid / Hot / Warm / Cool / Cold) have no WMO equivalent — they were forced into a 27-slot table by whoever wrote the original mapping. In practice the app currently hits these when the user is on the HKO-only fallback path (`weather-manager.ts:125`, `fallbackSource: 'HKO'`) and HKO's current weather reports one of these conditions. That path is exercised when OM is down.

---

## 4. Coverage matrix: where each code set is consumed

| Surface | Code source | Description source | Icon source |
|---|---|---|---|
| `CurrentWeather` hero headline (`CurrentWeather.tsx`) | OM (`omData.current.weatherCode`) via the merged record | `getWeatherDescription(omCode)` | `getWeatherIconNode(omCode, isDay)` |
| `HourlyForecast` chart tooltips | OM (`hourly[].weather_code`) | `getWeatherDescription` | Same |
| `DailyForecast` list | Merged — HKO daily overrides, OM supplies what HKO doesn't | Per-cell, depends on path | Per-cell |
| HKO-only fallback (`fallbackSource: 'HKO'`) | HKO icon codes via `fetchHKOWeatherData` → `hkoIconToWeatherCode` | `getWeatherDescription(mappedWmo)` | `getWeatherIconNode(mappedWmo, dayOrNight?)` |
| HK + both live (the merge path) | OM owns `current` (HKO only injects `temperature`) | `getWeatherDescription(omCode)` | `getWeatherIconNode(omCode, omIsDay)` |

In other words: even when HKO data is fused in, the *current* surface (the headline) is OM-owned today. This is the lever the plan document (`hko-headline-icon-plan.md`) proposes flipping.

---

## 5. What HKO does that WMO 4677 doesn't

The reverse crosswalk — categories HKO expresses via icon codes that WMO has no slot for:

| HKO category | HKO codes | WMO equivalent | Replacement plan |
|---|---|---|---|
| Night variants of every condition | 70–77 | None — WMO has no day/night split | Use HKO wording directly (without day/night qualifier) |
| Windy (a "feels like" cue) | 80 | None | "Windy" label, lucide `Wind` (added in plan) |
| Dry (a humidity cue) | 81 | None | "Dry" label |
| Humid (a humidity cue) | 82 | None | "Humid" label |
| Fog (current) | 83 | WMO 45 "Foggy" | Already mapped |
| Mist | 84 | ~ WMO 45 | Use "Mist" directly |
| Haze | 85 | ~ WMO 45 | Use "Haze" directly |
| Hot / Warm / Cool / Cold | 90–93 | None — HKO uses this for unusual temperature | Use "Hot" / "Warm" / "Cool" / "Cold" directly |

Of these, the categories that carry user-facing signal and are not already covered by the current WMO table are: **night variants, Windy, Dry, Humid, Mist, Haze, Hot, Warm, Cool, Cold**.

That set is the scope of new `getHKODescription()` entries if the headline-icon plan lands.

---

## 6. References to drop in code comments

- WMO code definitions: WMO Manual on Codes, Volume I.1 (WMO-No. 306). Section FM 12 / FM 15 for "present weather" codes 00–99.
- HKO icon codes: original at `https://www.hko.gov.hk/textonly/v2/explain/wxicon_e.htm` (cited in `hko-icons.ts`). If the live site has moved, the English-language "Weather Symbols" page is the canonical replacement.
- Open-Meteo weather_code parameter: `https://open-meteo.com/en/docs` (WMO subset).
