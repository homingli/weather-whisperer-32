# Audit fixtures

Recorded API responses that make the viewport audit (`audit-viewports.mjs`)
deterministic and fully offline. The audit replays these instead of hitting
live services.

| File | Source | Used by |
|---|---|---|
| `om-hong-kong.json` | Open-Meteo `/v1/forecast` for 22.32, 114.17 | `hk-*` states |
| `om-vancouver.json` | Open-Meteo `/v1/forecast` for 49.25, -123.12 | `van-*` states |
| `om-san-francisco.json` | Open-Meteo `/v1/forecast` for 37.77, -122.42 | `sf-*` states |
| `hko-fnd-en.json` | HKO `weather.php?dataType=fnd&lang=en` | HK merge path |
| `hko-rhrread-en.json` | HKO `weather.php?dataType=rhrread&lang=en` | HK current/icon |
| `hko-warnsum-en.json` | HKO `weather.php?dataType=warnsum&lang=en` | HK warnings (`{}` = none active) |

Open-Meteo payloads are time-shifted at replay so `current.time`, the
hourly axis and the daily sunrise/sunset all land on "now" — the sun strip,
the hero trend caption and the charts behave like a live snapshot no matter
when the audit runs.

## Refreshing

The weather services change their response shapes rarely but their values
constantly; the fixtures only need refreshing when the parsers' field
contract changes. To re-record, fetch the same URLs the app uses:

- Open-Meteo:
  `https://api.open-meteo.com/v1/forecast?latitude=<lat>&longitude=<lon>&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,is_day,uv_index&hourly=temperature_2m,weather_code,precipitation_probability,precipitation,wind_speed_10m,wind_direction_10m,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant,sunrise,sunset&timezone=auto&forecast_days=7&timeformat=unixtime`
- HKO: `https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType={fnd|rhrread|warnsum}&lang=en`

Run `pnpm exec vitest run` after a refresh — parser tests and the
`weather-manager` tests exercise the same field contracts, and a
`scripts/audit/audit-viewports.mjs` run confirms the app still renders a
full card deck from the new payloads.

The HK map's nowcast CSV and all map tiles are synthesized at runtime (see
the audit script); they deliberately are not committed here.
