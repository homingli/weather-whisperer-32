# HKO-Native Headline Icon — Plan

**Date:** 2026-08-02
**Scope:** `weather-whisperer-32` (React 18 + Vite + Tailwind v3 PWA, HKO + Open-Meteo weather)
**Branch:** TBD — working tree only, no commit (project rule)
**Status:** Planned, no code change yet. Awaiting user sign-off before implementation.

Companion doc: `handoff/hko-wmo-code-mapping.md` (the codebook this plan builds on).

## Goal

For coordinates inside the Hong Kong / PRD extended region, the **headline** weather surface (the current-condition icon + description in `CurrentWeather.tsx`) should read from HKO's own icon taxonomy — which is more granular than WMO 4677 for current conditions — when HKO data is available. Fall back to the current WMO/OM code path otherwise. Keep OM as the source of truth for everywhere else (hourly tile, daily strip, UV, apparent temp, wind metrics, etc.) and for the PRD region as well, with HKO supplementing daily forecasts + warnings as today.

Out of scope (intentional):
- Hourly / daily / chart code translation paths — they stay WMO today and stay WMO after this change.
- Replacing `hkoIconToWeatherCode` outright — that function is still useful for HKO→WMO translation in legacy code paths; we add a sibling, not a replacement.
- The HKO-only fallback path (`fallbackSource: 'HKO'`). It already does WMO lookup through the lossy mapping; this plan improves the headline for the *common* case (HK + both sources live) and does not change the degraded case.

## Background (one paragraph)

The labels "Slight drizzle" / "Moderate rain" / etc. come from WMO 4677 — an international standard. Open-Meteo emits WMO codes and the app's `getWeatherDescription()` looks them up in a 27-entry table. HKO, in contrast, uses its own icon taxonomy (50–93) which has more granularity in two directions: (1) night variants (70–77) and (2) **special atmospheric states WMO 4677 has no slot for** — Windy (80), Dry (81), Humid (82), Mist (84), Haze (85), Hot (90), Warm (91), Cool (92), Cold (93). The existing `hkoIconToWeatherCode()` collapses this granularity down to WMO and, worse, maps several of them incorrectly (e.g. HKO 90 Hot → WMO 95 Thunderstorm). When HK users are on the OM-driven path today, they see "Moderate rain" when HKO is reporting "Light rain with sunny intervals" and they see generic WMO labels when the real situation is "Humid and Cool". This plan lifts those signal points off the floor by adding an HKO-native description table.

## Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Scope = the `CurrentWeather` headline only.** Don't refactor hourly or daily paths. | The granularity lives in `getHKOCurrentWeather`. Hourly/daily forecasts use the narrow subset (50–65), which is no richer than WMO. Per-surface split minimises divergence and keeps diff small. |
| 2 | **Trigger conditions: HK region only AND HKO current-weather payload AND `icon` field present in payload.** | PRD region users are OM-only today (`weather-manager.ts:38` only branches on `isInHongKong()`; `PRD_BOUNDS` is used by the rainfall nowcast map layer only). This plan keeps PRD on OM as today — see Decision 11. Outside HK, no change — WMO/OM path. |
| 3 | **`fallbackSource: 'HKO'` (HKO-only) path: headline rendering picks up the new behavior mechanically, but no broader rework.** | Phase 2 step 2 propagates `currentHko.icon[0]` to `headline.hkoIconCode`, so the headline swaps from a WMO-mapped label (lossy) to the HKO-native label. The underlying `weatherCode` on `current` still uses the lossy mapping (HKO daily + chart paths still need it); no API-coverage changes. Full HKO-only path overhaul is a separate plan — see Decision 14. |
| 4 | **Add `getHKODescription(iconCode)` as a sibling of `getWeatherDescription()`.** Don't replace either. | Two code paths, two tables. The WMO table stays i18n via `weather.desc.*` keys; the HKO table gets a parallel `hko.desc.*` namespace. |
| 5 | **Per-surface `descriptionKey` becomes polymorphic.** Add `headline.weatherCode | headline.hkoIconCode` to the merged `WeatherData` instead of overloading `weatherCode`. | Keeps the OM code usable by all other surfaces that read it (chart, hourly tile). Cleanest extension point. |
| 6 | **Lucide icon for HKO states uses HKO's day/night distinction directly.** | HKO already encodes day vs. night in the code block (50–69 day, 70–89 night). Pass `isDay = hkoIconCode ∈ [50,69] ∪ [90,93]` to the lucide lookup. |
| 7 | **TC translations for HKO codes are HK Traditional Chinese phrasing** ("微雨", "濕度高等", etc.). | Project README and existing TC strings are HK-focused. Verify the existing weather.desc.* TC strings survive — they will be reused only for the WMO paths. |
| 8 | **Night-variant labels use our own wording, not HKO's "Fine".** Drop "Fine" entirely. | "Fine" is HK-specific jargon; English-speaking visitors to the app (and many local users) don't recognize it. Use natural English that parallels the day wording: 70 → "Clear" (mirrors 50 "Sunny"), 71 → "Clear periods", 72 → "Clear intervals", 73 → "Clear periods with a few showers", 74 → "Clear intervals with showers". The HKO source wording is documented in a comment block above the table so future contributors can trace the mapping back to HKO's reference if needed (see "HKO descriptions to write" below). |
| 9 | **Don't change `hkoIconToWeatherCode()`.** Keep it. | Still used by `fallbackSource: 'HKO'` and as a fallback when the HKO icon field is missing. Also a smaller, less risky diff. (Renumbered from old 8.) |
| 10 | **Add `hko.desc.*` translation keys for the unique HKO additions: Windy, Dry, Humid, Mist, Haze, Hot, Warm, Cool, Cold.** ~10 new translation keys. | These have no WMO equivalent today; the user-facing signal they carry is the whole reason this plan exists. (Renumbered from old 9.) |
| 11 | **PRD region stays on OM today. HKO special-condition codes (80–93) are reported only for HK proper, not PRD; HKO daily-range codes 50–65 are no richer than WMO.** | PRD is the rainfall nowcast region, not a weather-forecast region. Enabling HKO headlines for PRD is a separate "PRD data layer" initiative, not a headline tweak. |
| 12 | **Special-condition codes (80–93) are replacement headlines, not secondary cues.** | The headline is what users scan first; a "Humid" tag below "Clear sky" is invisible and defeats the purpose. |
| 13 | **Lucide fallback for Wind/Humid/Hot/Cool/Cold/Warm.** All four icons (`Wind`, `Droplets`, `ThermometerSun`, `ThermometerSnowflake`) are exported by `lucide-react@0.462.0` — verified. The defensive `?? Cloud` fallback stays as a safety net. | Doesn't depend on a runtime check, but the fallback is cheap insurance against future lucide removals. |
| 14 | **`fallbackSource: 'HKO'` path is out of scope.** | That path is the degraded state (OM down + HKO up); users already see a "stale data" banner. Improving it requires re-plumbing `buildHKOWeatherData` to surface the `icon[]` field — a non-trivial expansion that belongs in a "HKO-only path overhaul" plan. |
## HKO descriptions to write

Drafted labels. EN first; TC in plan phase 2 (user can adjust to HK conventions).

HKO source mapping (for reference — *not* used verbatim in EN labels; see Decision 8):

| HKO code | HKO source wording | Our EN label |
|---:|---|---|
| 50 | Sunny | Sunny |
| 51 | Sunny Periods | Sunny periods |
| 52 | Sunny Intervals | Sunny intervals |
| 53 | Sunny Periods with A Few Showers | Sunny periods with a few showers |
| 54 | Sunny Intervals with Showers | Sunny intervals with showers |
| 60 | Cloudy | Cloudy |
| 61 | Overcast | Overcast |
| 62 | Light Rain | Light rain |
| 63 | Rain | Rain |
| 64 | Heavy Rain | Heavy rain |
| 65 | Thunderstorms | Thunderstorms |
| 70 | Fine | **Clear** (renamed from "Fine") |
| 71 | Fine (periods) | **Clear periods** (renamed) |
| 72 | Fine (intervals) | **Clear intervals** (renamed) |
| 73 | Fine with showers | **Clear periods with a few showers** (renamed; matches 53's pattern) |
| 74 | Showers | **Clear intervals with showers** (renamed; matches 54's pattern) |
| 75 | Cloudy | Cloudy |
| 76 | Overcast | Overcast |
| 77 | Light Rain | Light rain |
| 80 | Windy | Windy |
| 81 | Dry | Dry |
| 82 | Humid | Humid |
| 83 | Fog | Fog |
| 84 | Mist | Mist |
| 85 | Haze | Haze |
| 90 | Hot | Hot |
| 91 | Warm | Warm |
| 92 | Cool | Cool |
| 93 | Cold | Cold |

Day/night parallels in the table:
- 50 ↔ 70: Sunny ↔ Clear
- 51 ↔ 71: Sunny periods ↔ Clear periods
- 52 ↔ 72: Sunny intervals ↔ Clear intervals
- 53 ↔ 73: Sunny periods with a few showers ↔ Clear periods with a few showers
- 54 ↔ 74: Sunny intervals with showers ↔ Clear intervals with showers
- 60 ↔ 75, 61 ↔ 76, 62 ↔ 77: same wording both halves (cloud cover / rain intensity doesn't change at night)

The HKO description table itself stays a flat `Record<number, string>` indexed by HKO code (50–65, 70–77, 80–85, 90–93). Day/night is two separate rows in the table, not a single string with a conditional suffix.

(TC translations go under `hko.desc.sunny`, `hko.desc.sunnyPeriods`, `hko.desc.clear`, `hko.desc.clearPeriods`, etc. — keep the key naming consistent with `weather.desc.*`. The TC reviewer can use the HKO source mapping above to pick natural HK phrasing.)

## Lucide icon table for HKO

Add to `codes.ts` (or a new `hko-icons.ts`):

| HKO code range | Lucide icon (existing or new) |
|---|---|
| 50, 70 | `Sun` / `Moon` |
| 51–53, 71–73 | `CloudSun` / `CloudMoon` |
| 52, 54, 60, 72, 74, 75 | `Cloud` (day/night) |
| 61, 76 | `Cloud` |
| 62–63, 77 | `CloudDrizzle` (no HKO drizzle — keep `CloudRain`) |
| 64 | `CloudRain` |
| 65 | `CloudLightning` |
| 80 | `Wind` *(new — verify available in `lucide-react`)* |
| 82 | `Droplets` *(new — verify)* |
| 83 | `CloudFog` |
| 84 | `CloudFog` (lighter styling if possible, else reuse) |
| 85 | `CloudFog` (else reuse) |
| 90–91 | `ThermometerSun` *(new — verify)* |
| 92–93 | `ThermometerSnowflake` or `Snowflake` *(new — verify, fallback `Cloud`)* |

`isDay` derivation: `code ∈ [50,69] ∪ [90,93]`. Special condition codes 80–85 are time-agnostic; pick a default (probably `day`) since `isDay` only affects the day/night variant of the cloud+sun icons.

## Files to touch

### New files
- `src/lib/weather/hko-codes.ts` — `HKO_DESCRIPTION_KEYS` (translation keys), `getHKODescription(code)`, `getHKOIconNode(code)`, `isHKODayTime(code)`. Mirrors the shape of `codes.ts`.
- `src/lib/weather/hko-codes.test.ts` — parity with `codes.ts`'s coverage. Tests: every mapped HKO code resolves to a non-empty label; unknown codes fall back; day/night helper truth table for all 30 codes.
- `src/lib/weather/types.ts` additions (or new file): `HeadlineInfo` type + `headline: HeadlineInfo` field on `WeatherData`. *(See decision 5.)*

### Modified files
- `src/lib/weather-manager.ts` — when both sources succeed (the merge path), the merged `WeatherData` writes `headline: { source: 'hko', hkoIconCode: ... }` if (a) `isHK`, (b) `hkoCurrentData` carries an `Icon` field that maps to a known HKO code, and (c) the HKO icon is not the sentinel `9999`. Otherwise `headline: { source: 'om' }`. The HKO-only fallback path (`fallbackSource: 'HKO'`) also writes `headline: { source: 'hko', hkoIconCode: currentHko.icon[0] }` when valid — see Phase 2 step 2 for why this is mechanical, not behavioral.
- `src/lib/hko-fetch.ts` — no schema change needed: `HKOCurrentWeatherResponse.icon: number[]` is already exposed (`hko-types.ts:14`), parsed at `parsers.ts:217-218`, and read at `hko-fetch.ts:218`. Phase 2 propagates `icon[0]` to `headline.hkoIconCode`.
- `src/components/CurrentWeather.tsx` — extend `CurrentWeatherProps` with `headline: HeadlineInfo`. Read from `headline` first. If `source === 'hko' && hkoIconCode != null`, render `getHKODescription(hkoIconCode)` + `getHKOIconNode(hkoIconCode)`. Otherwise the existing WMO lookup with `weather.weatherCode`. Falls through to today's behaviour for non-HK and degraded cases.
- `src/contexts/LanguageContext.tsx` — add `hko.desc.*` translation keys (en + tc). Mirror the EN list from "HKO descriptions to write" above. TC values: HK Traditional Chinese, decide per entry with the user (default drafts can use 自然香港天文台 style: 陽光充沛 / 短暫陽光 / 陽光驟雨 / 多雲 / 密雲 etc.).
- `src/lib/hko-icons.ts` — no code change in this plan, but export `HKO_ICON_CODES` (the 30-entry list above) so the new `hko-codes.ts` and its test don't duplicate the enumeration. *(Or hoist this list to `hko-codes.ts` and have `hko-icons.ts` import it. Either way, single source of truth.)*
- `src/components/CurrentWeather.test.tsx` — add cases: render with `headline={{ source: 'hko', hkoIconCode: 50 }}` shows "Sunny"; `headline={{ source: 'hko', hkoIconCode: 82 }}` shows "Humid"; `headline={{ source: 'om' }}` falls through to WMO path unchanged.

## Files NOT touched

- `src/lib/weather/codes.ts` (WMO table stays as-is).
- `src/lib/hko-icons.ts` `hkoIconToWeatherCode()` (kept as the legacy translator).
- `src/lib/weather/open-meteo.ts` (OM request shape unchanged).
- All chart, hourly, daily components (they read from OM's hourly/daily codes).

## Implementation phases

### Phase 1 — Reference data (no UX change yet)

1. Add `src/lib/weather/hko-codes.ts` with the description table + lucide map + day/night helper. Pure functions, no React.
2. Add `hko-codes.test.ts` — exhaustive mapping truth tables.
3. Add `hko.desc.*` translations to `LanguageContext.tsx` — bilingual seed values, can be revised later.

Gate: `pnpm test src/lib/weather/hko-codes.test.ts` passes. `pnpm build` clean. UI identical to today.

Estimated: ~2 h.

### Phase 2 — Type plumbing (no UX change yet)

1. Extend `WeatherData` (in `src/lib/weather/types.ts`) with `headline: { source: 'hko' | 'om'; hkoIconCode?: number | null }`. Field is required, not optional — non-HK paths write `{ source: 'om' }` so downstream consumers don't have to handle `undefined`.
2. Update `buildHKOWeatherData` (HKO-only fallback path) to seed `headline: { source: 'hko', hkoIconCode: currentHko.icon[0] }` when data is valid. **Note: this changes the headline rendering on the HKO-only fallback path too**, even though Decision 14 defers the broader overhaul. The change is mechanical (just propagates the icon the path already reads), not a behavior expansion; if it causes issues, it can be guarded by `fallbackSource !== 'HKO'` and revisited in the overhaul plan.
3. Update the merge path in `weather-manager.ts` — write `headline: { source: 'hko', hkoIconCode: hkoCurrentData.icon[0] }` only when (a) HKO current fetch succeeded and (b) `icon[0]` is a finite integer other than `9999`. Otherwise default to `{ source: 'om' }`. For non-HK coordinates, also `{ source: 'om' }`.
4. Update all existing `WeatherData` shape consumers if TypeScript flags missing field (likely `pages/Index.tsx` and `test/Integration.test.tsx`).

Gate: `pnpm tsc --noEmit` clean. `pnpm test` all green. UI still identical.

Estimated: ~1.5 h.

### Phase 3 — Headline render

1. Extend `CurrentWeatherProps` with `headline: HeadlineInfo` (new type exported from `src/lib/weather/types.ts`). Component reads from `headline` instead of `weather.weatherCode` for the icon + label rendering.
2. Both call sites in `src/pages/Index.tsx:276` and `:326` pass `headline={weather.headline}` (they already have `weather: WeatherData` in scope).
3. Branch on `headline.source`: render `getHKODescription` / `getHKOIconNode` for HKO path; existing logic (`getWeatherIconNode(weather.weatherCode, weather.isDay)` + `t(weatherDescriptionKey(weather.weatherCode))`) for OM path.
4. Visual regression check: load `?coords=HK` in dev, confirm icon + label swap to HK phrasing (try coords that hit HKO codes 80–93 — Hong Kong Observatory station is the easiest trigger). Load `?coords=Tokyo` (or any non-HK), confirm OM/WMO path unchanged.
5. Edge: HKO-only fallback path still works — Phase 2 step 2 already propagates `hkoIconCode` so the headline swaps the same way. Verify with the dev warning simulator.

Gate: manual smoke + existing tests + new tests added in Phase 5.

Estimated: ~2 h.

### Phase 4 — TC translations polish

1. **Blocker: project has no HK TC reviewer on file.** Either name a reviewer or split Phase 4 out and merge EN-only initially; TC pass in a follow-up.
2. Review HK TC phrasing against the EN labels in Decision 8. Iterate on style (e.g. prefer "陽光充沛" over "天晴"; use "大致天晴" for "Clear periods", etc.).
3. Update `LanguageContext.tsx` keys.

Estimated: ~30 min once a reviewer is named, mostly review.

### Phase 5 — Test coverage + ARIA

1. Add `hko-codes.test.ts` cases: every mapped HKO code resolves to a non-empty label; unknown codes fall back; `isHKODayTime(code)` truth table for all 30 codes.
2. Add `weather-manager.test.ts` cases for the merge path:
   - HKO current `icon: [50]` → merged `headline: { source: 'hko', hkoIconCode: 50 }`.
   - HKO current `icon: [82]` (Humid) → merged `headline: { source: 'hko', hkoIconCode: 82 }`.
   - HKO current `icon: [9999]` → merged `headline: { source: 'om' }`.
   - HKO current `icon: []` (empty) → merged `headline: { source: 'om' }`.
   - HKO current fetch fails → merged `headline: { source: 'om' }`.
3. Add `CurrentWeather` headline-swap tests: render with `headline={{ source: 'hko', hkoIconCode: 50 }}` shows "Sunny"; `headline={{ source: 'hko', hkoIconCode: 82 }}` shows "Humid"; `headline={{ source: 'om' }}` falls through to WMO path.
4. Verify `aria-label` on the headline reads the HKO label, not the WMO label, when HKO is active.
5. Run `pnpm verify` (typecheck + lint + tests + build).

Estimated: ~1 h.

**Total: ~7 hours (EN-only merge, no TC reviewer time included).**

## Resolved questions

| # | Question | Answer |
|---|---|---|
| 1 | PRD region | **PRD uses OM as today.** No PRD changes in this plan. |
| 2 | Night labels | **Drop "Fine". Use "Clear" / "Clear periods" / "Clear intervals"** (natural English, parallels "Sunny" ↔ "Clear"). HKO source wording documented in the plan for traceability; TC reviewer uses that table. |
| 3 | Replacement vs. secondary cue | **Replacement.** Special-condition codes swap the headline; no secondary tag. |
| 4 | Lucide fallback | **Keep `?? Cloud` fallback** as defensive code (all four icons are in `lucide-react@0.462.0`; verified). |
| 5 | `fallbackSource: 'HKO'` path | **Defer broader overhaul.** Phase 2 step 2 propagates the icon field mechanically (so headline rendering is consistent), but no new behavior is added on this path; full HKO-only rework is a separate plan. |

## Risks

- **TC translation drift.** New translation keys must be reviewed by a HK Traditional Chinese speaker. Without review, HK users may see Mainland-CN phrasing. **Phase 4 has no named reviewer — blocker or merge EN-only.**
- **HKO icon schema drift.** HKO has changed its API shape before. Re-pin the `Icon` field contract with a snapshot test (`hko-weather.test.ts` fixture). Defensive fallback in Phase 2 step 3: if parsing yields `9999`, `NaN`, or the array is empty, fall through to OM.
- **Visual regression on existing HK users.** They currently see WMO labels. The swap introduces new terminology (`Sunny periods`, `Clear periods with a few showers`, `Humid`, `Hot`) that they weren't seeing. Plan a brief "what changed" note in CHANGELOG.
- **Daily-forecast cells keep lossy WMO labels.** `hko-fetch.ts:147` still uses `hkoIconToWeatherCode(day.ForecastIcon)` for the daily tile icons — the headline change does not touch this path. Document in CHANGELOG so daily-tile users aren't surprised by the asymmetry (headline now uses HKO wording, daily tiles still use lossy WMO labels).
- **Test mock coverage.** The merge path in `weather-manager.ts` is already test-covered via `lib/weather-manager.test.ts`. The new `headline` propagation needs additional coverage there, not just at `CurrentWeather.tsx`. Phase 5 step 2 lists the cases.
