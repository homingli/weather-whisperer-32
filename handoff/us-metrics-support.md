# US Metrics Conversion Support — Plan

**Date:** 2026-07-26
**Scope:** `weather-whisperer-32` (React 18 + Vite + Tailwind v3 PWA, HKO + Open-Meteo weather)
**Branch:** `feat/us-metrics-support` (working tree only — no commit, per project rule)
**Status:** All 4 phases implemented. 235/235 tests pass. Build clean.

## Goal

Add a menu toggle that lets users switch the displayed units between **Metric** (°C, km/h, mm) and **US** (°F, mph, in). Source data, types, and fetch layer stay metric — conversion happens at the display layer only.

## Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Default = `metric`** | Preserves existing behavior for every current user. Zero regressions on rollout. README is HK/Traditional-Chinese-focused (HKO is a primary source), so metric is the right baseline. |
| 2 | **Toggle shape: 2-state** (Metric / US) | User asked for a "toggle". Matches the simpler mental model. 3-state (Auto) would mean following `navigator.language` (`en-US` → US, others → metric) — added complexity for marginal value. Easy to add later if requested. |
| 3 | **Persistence: `localStorage['weather-units']`** | Mirrors `weather-language` and `theme-mode`. Synchronous read at provider mount so first paint is correct. |
| 4 | **Conversion at display layer only** | Open-Meteo returns metric natively; the type layer stays metric. Conversion helpers live next to consumers. Tests of the fetch/API layer don't change. |
| 5 | **Nowcast map stays in mm always** | Confirmed with user. HKO gridded data is regional and calibrated to mm. Only the `PrecipBar` read-out in `CurrentWeather` converts. Map legend keeps `(mm)` so US-mode users see the unit explicitly. |
| 6 | **Universal metrics stay unitless** | UV index (WHO-aligned color bands), humidity (%), wind direction (deg/compass), sunrise/sunset (HH:MM) — not converted. |
| 7 | **Separate `UnitsContext`, not folded into `ThemeContext`** | Orthogonal concerns, easier to test independently, follows the Language/Theme precedent of one-context-per-axis. |

## Conversion table

| Metric | US | Formula | Display rounding |
|---|---|---|---|
| Temperature | Fahrenheit | `°F = °C × 9/5 + 32` | Integer (matches current `Math.round` behavior) |
| Wind speed | mph | `mph = km/h × 0.621371` | Integer |
| Precipitation | inches | `in = mm × 0.0393701` | 2 decimals (preserves sub-mm "trace" precision) |

## Files to touch

### New files
- `src/contexts/UnitsContext.tsx` — provider, `useUnits()` hook, type `'metric' | 'us'`
- `src/contexts/UnitsContext.test.tsx` — parity with `ThemeContext.test.tsx`: default, persistence, setUnits round-trip, both modes
- `src/lib/units.ts` — pure functions: `celsiusToFahrenheit`, `kmhToMph`, `mmToInches`, `formatTemperature`, `formatWindSpeed`, `formatPrecipitation` (one helper per axis, each picks metric or US at call site via the hook)
- `src/lib/units.test.ts` — conversion math + boundary tests (0°C = 32°F, 100°C = 212°F; 0 km/h = 0 mph; 25.4 mm = 1.0 in)

### Modified files
- `src/lib/constants.ts` — add `STORAGE_KEYS.UNITS = 'weather-units'`
- `src/App.tsx` — wrap children with `<UnitsProvider>` (inside `<LanguageProvider>` / `<ThemeProvider>`, sibling order to either; doesn't matter since no provider reads another)
- `src/components/SettingsMenu.tsx` — new "Units" section between Refresh and Theme. Two `<DropdownMenuItem>`s with `<Check>` glyph for the active one. Icons: `Ruler` (metric) + `Gauge` (us) — or just one icon (`Ruler`) and rely on the label, matching the existing Theme section's style.
- `src/contexts/LanguageContext.tsx` — add 6 new translation keys (3 en + 3 tc, see Translation keys below)
- `src/components/CurrentWeather.tsx`:
  - Hero `<h1>` apparent-temp render
  - `RangeBar` low/current/high
  - `WindCompass` speed + unit label
  - `PrecipBar` mm value + marker position (recompute against inch-converted maxTick of `1.18 in` so the bar still spans visually) + band label switcher (0.5–2 mm → 0.02–0.08 in etc., see "PrecipBar in US mode" below)
  - aria-label strings (range bar, precip bar)
- `src/components/HourlyForecast.tsx`:
  - Left Y-axis `tickFormatter` (temp)
  - Tooltip temp line + rainIntensity `(${mm}mm)` → `(${in}in)`
  - sr-only table temp cell + rain intensity cell
- `src/components/DailyForecast.tsx`:
  - `LabelList` formatters (low/high)
  - Tooltip low/high/wind
  - sr-only table cells
- Tests that hardcode `°`, `km/h`, `mm` — either parameterize on `useUnits` mock OR add parallel assertions for both modes. Decide during implementation; lean toward adding tests rather than mutating existing ones (existing tests assert the current metric behavior; new tests assert US).

### `PrecipBar` in US mode

The bar's marker position uses a linear scale up to a `maxTick`. Today `maxTick = 30` (mm). For US:

- `maxTick = 1.2` (in), the inch equivalent of 30 mm.
- Convert the input `mm` to inches before placing the marker.
- Band labels: today's labels are hardcoded HKO thresholds ("0.5 – 2 mm" etc.). For US, switch to inch thresholds:
  - `< 0.02 in` (was `< 0.5 mm`)
  - `0.08 in` (was `2 mm`)
  - `0.2 in` (was `5 mm`)
  - `0.4 in` (was `10 mm`)
  - `0.8 in` (was `20 mm`)
  - `1.2 in+` (was `30 mm+`)
- The `RAINFALL_BANDS` array in `CurrentWeather.tsx` (local copy, separate from `lib/rainfallBands.ts` which feeds the map) needs a US variant. Keep two parallel arrays; pick at render time.
- This widget stays independent of the map's bands (`lib/rainfallBands.ts`), which remain mm.

## Implementation phases

### Phase 1 — Foundation (~2 h)

1. New `src/lib/units.ts` with conversion helpers + tests (`src/lib/units.test.ts`).
2. New `src/contexts/UnitsContext.tsx` mirroring `ThemeContext` structure: synchronous read from `localStorage` in `useState` initializer, `setUnits` writes through to `localStorage`, `value` memoized. Tests in `UnitsContext.test.tsx`.
3. Add `STORAGE_KEYS.UNITS` to `src/lib/constants.ts`.
4. Wrap `<App>` in `<UnitsProvider>` (in `src/App.tsx`).

Stop point: `useUnits()` returns `'metric' | 'us'`, default `'metric'`, persists across reloads. No visual change yet.

### Phase 2 — Menu toggle (~30 min)

1. Add 3 translation keys to both languages (see below).
2. New "Units" section in `SettingsMenu.tsx` between Refresh and Theme. Two items with `Ruler` icon (one per option) and `<Check>` on the active one.

Stop point: User can flip the toggle. `useUnits()` returns the new value. No display change yet.

### Phase 3 — Display layer conversion (~3 h)

For each consumer, replace inline literals with helpers from `useUnits()`:

1. **CurrentWeather hero** — apparent-temp `<h1>` (2 lines, both `compact` and desktop branches).
2. **RangeBar** — current + low + high + aria-label.
3. **WindCompass** — speed number + unit label (`t('unit.kmh')` → `t('unit.mph')` when US).
4. **PrecipBar** — see "PrecipBar in US mode" above. New `RAINFALL_BANDS_US` array. Select bands at render.
5. **HourlyForecast** — left Y-axis tick + tooltip temp + tooltip rain intensity + sr-only cells.
6. **DailyForecast** — `LabelList` formatters + tooltip temp + tooltip wind + sr-only cells.

Stop point: every weather metric in the UI respects the toggle. Tests still pass.

### Phase 4 — Test coverage + a11y + handoff (~2 h)

1. New tests in `CurrentWeather.test.tsx`, `HourlyForecast.test.tsx`, etc. — render with `useUnits` mocked to `'us'`, assert °F/mph/in appear and °C/km/h/mm do not.
2. New tests in `SettingsMenu.test.tsx` (or extend existing) — clicking US persists and updates localStorage.
3. Update README's "Features Breakdown" to mention the toggle (1 paragraph under Settings).
4. Update `ARCHITECTURE.md` if it has a context inventory.
5. End-to-end check: `npm run lint`, `npm run typecheck`, `npx vitest run`, `npx vite build`. Visual smoke check via `npm run dev` flipping the toggle on a representative city (HK for metric; pick a US city for US — Denver / NYC / Honolulu).

## Translation keys

Add to both `en` and `tc` maps in `src/contexts/LanguageContext.tsx`:

| Key | en | tc |
|---|---|---|
| `settings.units` | `Units` | `單位` |
| `settings.metric` | `Metric (°C, km/h, mm)` | `公制 (°C, 公里/小時, 毫米)` |
| `settings.us` | `US (°F, mph, in)` | `美制 (°F, 英里/小時, 英寸)` |

The `unit.*` keys already cover km/h. Add:

| Key | en | tc |
|---|---|---|
| `unit.mph` | `mph` | `英里/小時` |
| `unit.in` | `in` | `英寸` |

## Out of scope (deferred)

- **Auto mode** (follow `navigator.language`). Easy to add later as a third `DropdownMenuItem`. Not asked for.
- **Pressure** (hPa → inHg / mb). Not currently displayed in the UI; would need a new metric card first.
- **Visibility / distance** (km → mi). Not currently displayed.
- **Temperature in the nowcast map**. Map stays mm per decision #5.
- **Per-city preference** (some users want different units per location). Overkill for v1; global preference matches how Theme and Language work today.
- **Migration of existing localStorage**. No schema version needed — the key is new (`weather-units`), and `localStorage.getItem` returns `null` for missing keys, defaulting to `'metric'`.

## Risks

- **Recharts Y-axis ticks**: recharts computes tick positions from the data domain, but the tick *labels* go through our `tickFormatter`. Changing only the formatter is safe (no axis resize).
- **PrecipBar marker math**: the marker uses `Math.max(0, Math.min(mm, maxTick))` to clamp. Converting mm→in changes the scale but the clamp logic is identical. Risk: rounding 25.4 mm → 1.00 in places the marker exactly at the bar's end, which is correct.
- **Tooltip rendering on daily chart**: the tooltip is a render prop that reads `row.windSpeedMax` directly. Make sure the converter runs in the tooltip body, not on `chartData` mutation.
- **Test interdependencies**: some existing tests assert `Math.round(data.temperature)°` in cells. After conversion those become `°F`. Decide per test: either mock `useUnits` to `'metric'` for that test, or update the assertion to `°`. Recommend mocking — keeps test names stable and intent clear.

## Verification checklist

- [ ] `npm run lint` clean
- [ ] `npx tsc --noEmit` clean
- [ ] `npx vitest run` all tests pass (existing 199 + new tests for units/context/menu/display)
- [ ] `npx vite build` succeeds
- [ ] Dev server: flip toggle, every metric updates without a re-mount
- [ ] Reload: selection persists
- [ ] Both UI languages: new translation keys render correctly in `en` and `tc`
- [ ] Lighthouse a11y still ≥ 95 (no a11y regression)

## Reference

- `src/contexts/ThemeContext.tsx` — template for UnitsContext shape
- `src/contexts/ThemeContext.test.tsx` — template for UnitsContext test
- `src/components/SettingsMenu.tsx` — template for menu section insertion
- `src/contexts/LanguageContext.tsx` — translation key additions
- `handoff/ada-compliance-plan.md` — plan format precedent