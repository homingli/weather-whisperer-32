# HKO API fixtures

Live snapshots of HKO open-data responses, captured for regression testing.
JSON files only — no comments inside, all context lives here.

## Why these exist

The HKO `warnsum` feed (`https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum`) was observed returning `"actionCode": "CANCEL"` (uppercase) in production on 2026-07-31, while the client filter in `WeatherAlerts.tsx` was comparing against mixed-case `"Cancel"`. The cancelled amber rainstorm warning (`WRAINA`) stayed visible in production until the filter was made case-insensitive.

These fixtures lock the regression by feeding the exact same JSON shape that HKO returned, into the same component test that previously passed for the wrong reason.

## Files

| File | Captured | Notes |
|---|---|---|
| `hko-warnsum-2026-07-31-en.json` | 2026-07-31 | English feed. Contains the cancelled amber rainstorm warning that exposed the bug. |
| `hko-warnsum-2026-07-31-tc.json` | 2026-07-31 | Traditional Chinese feed. Same `actionCode` casing as EN. |

## How to refresh

```bash
curl -sS "https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=en" \
  -o src/lib/__fixtures__/hko-warnsum-$(date +%Y-%m-%d)-en.json
curl -sS "https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=tc" \
  -o src/lib/__fixtures__/hko-warnsum-$(date +%Y-%m-%d)-tc.json
```

Update the test imports in `src/components/WeatherAlerts.test.tsx` to match the new filename. Keep the previous snapshot for comparison if HKO ever changes a shape (e.g., adds a new actionCode value).

## What to watch for

- New `actionCode` values beyond the known set (`ISSUE`, `CANCEL`, `EXTEND`, `REISSUE`, ...). If a new value appears, decide explicitly whether it should keep a warning active or filter it out, and update the comment in `WeatherAlerts.tsx` accordingly.
- Case drift on `actionCode`. The filter is case-insensitive on `CANCEL`; if the same drift happens on other codes (e.g., `"cancel"` vs `"CANCEL"` for thunderstorm extensions), apply the same `.toUpperCase()` treatment.
- New top-level warning codes (`WRAIN*`, `WTS`, `WFIRE*`, `TC*`, ...) — make sure each maps to a known icon in `src/lib/hko-icons.ts` and a known color in `src/lib/hko-weather.ts`.
</content>
</invoke>