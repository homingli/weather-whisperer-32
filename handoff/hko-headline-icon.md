# HKO-Native Headline Icon — Implementation Notes

**Date:** 2026-08-02
**Scope:** `weather-whisperer-32` (React 18 + Vite + Tailwind v3 PWA, HKO + Open-Meteo weather)
**Plan:** [`hko-headline-icon-plan.md`](./hko-headline-icon-plan.md)
**Codebook:** [`hko-wmo-code-mapping.md`](./hko-wmo-code-mapping.md)
**Branch:** working tree only — no commit, per project rule
**Status:** All 5 phases implemented. 323 / 323 tests pass. Build clean. No new lint errors.

## What shipped

HK users now see the HKO-native icon + label on the headline hero when both Open-Meteo and HKO are live. HKO's 30-entry icon taxonomy (50–93) is more granular than WMO 4677 in two directions that matter for HK weather:

1. **Night variants** (70–77) parallel day variants (50–54) — e.g. `Sunny` 50 ↔ `Clear` 70 (renamed from `Fine` per Decision 8).
2. **Special atmospheric states WMO has no slot for** — `Windy` 80, `Dry` 81, `Humid` 82, `Fog` 83, `Mist` 84, `Haze` 85, plus temperature states `Hot` 90 / `Warm` 91 / `Cool` 92 / `Cold` 93.

The headline icon + label swap is the only UX change. Every other surface (hourly tile, daily strip, UV, humidity, wind, range bar) keeps its existing WMO-driven rendering.

## Decisions at a glance

| # | Decision | Where it lives |
|---|---|---|
| 1 | Headline only — don't refactor hourly or daily paths | `CurrentWeather.tsx` is the sole consumer of `headline.hkoIconCode` |
| 2 | Trigger: HK + both sources live + valid `Icon` field | `weather-manager.ts` `headlineFromHkoIcon()` |
| 3 | HKO-only fallback path: propagate icon mechanically (no new behavior) | `hko-fetch.ts` `buildHKOWeatherData()` |
| 4 | `getHKODescription()` is a sibling of `getWeatherDescription()`, not a replacement | `src/lib/weather/hko-codes.ts` |
| 5 | Per-surface `HeadlineInfo` polymorphism — `headline: { source, hkoIconCode? }` | `src/lib/weather/types.ts` |
| 6 | Lucide icon uses HKO's day/night distinction built into the code (50–69 day, 70–77 night) | `hko-codes.ts` `getHKOIconNode()` |
| 7 | TC translations follow HK conventions | `LanguageContext.tsx` `hko.desc.*` keys |
| 8 | Drop "Fine" in EN; use "Clear" family that parallels "Sunny" | `hko-codes.ts` `DESCRIPTIONS` table |
| 9 | Don't change `hkoIconToWeatherCode()` — daily tile still uses it | `hko-icons.ts` (untouched) |
| 10 | Add `hko.desc.*` keys for new states (10 keys) | `LanguageContext.tsx` |
| 11 | PRD region stays on OM today | No code change (PRD path unchanged) |
| 12 | Special-condition codes are replacement headlines, not secondary cues | Headline swap (single render path) |
| 13 | Lucide fallback `?? Cloud` stays as defensive code | `getHKOIconNode()` |
| 14 | `fallbackSource: 'HKO'` overhaul is a separate plan | `buildHKOWeatherData()` propagates icon mechanically — no new behavior |

## Files touched

### New files
- `src/lib/weather/hko-codes.ts` — `HKO_ICON_CODES` (29-entry enumeration), `hkoDescriptionKey(code)`, `getHKODescription(code)` (hardcoded EN), `getHKOIconNode(code)`, `isHKODayTime(code)`. Mirrors `codes.ts` (WMO) shape; pure functions, no React.
- `src/lib/weather/hko-codes.test.ts` — exhaustive truth tables. Verifies every mapped code resolves to a non-empty label and a lucide component; unknown codes fall back; day/night helper correct across the full 50–93 range; renamed night labels do not start with `Fine`.

### Modified files
- `src/lib/weather/types.ts` — `WeatherData.headline: HeadlineInfo` (required); new `HeadlineInfo` interface exported alongside.
- `src/lib/weather-manager.ts` — `headlineFromHkoIcon(icon)` helper. Merge path writes `headline: { source: 'hko', hkoIconCode: code }` when (a) `isHK`, (b) HKO current fetch succeeded, (c) `icon[0]` is a finite integer other than `9999`. Otherwise `{ source: 'om' }`. Non-HK and partial paths also write `{ source: 'om' }`.
- `src/lib/hko-fetch.ts` — `buildHKOWeatherData()` seeds the headline from the HKO icon field. This is the mechanical change called out in Decision 3 / Decision 14: the HKO-only fallback path now picks up the icon-code-driven headline without any new behavior beyond what the path already does.
- `src/components/CurrentWeather.tsx` — `CurrentWeatherProps.headline: HeadlineInfo` added. New `headlineIconAndLabel(headline, weather)` module-level helper resolves `{ Icon, labelKey }`. Both compact (mobile swiper) and desktop render sites use `headlineRender.Icon` + `headlineRender.labelKey`, so the aria-label and visible label swap together.
- `src/pages/Index.tsx` — both `CurrentWeather` call sites (mobile swiper slide 1 + desktop hero) pass `headline={weather.headline}`.
- `src/contexts/LanguageContext.tsx` — added `hko.desc.*` keys (22 total: 5 day-conditions-only + 5 night parallels + 6 special states + 4 temperature states + 2 shared with WMO via `weather.desc.*`). TC seed values follow HKO conventions; day/night parallels share vocabulary.
- `src/lib/weather.ts` — barrel re-export for `hkoDescriptionKey`, `getHKODescription`, `getHKOIconNode`, `isHKODayTime`, `HKO_ICON_CODES`.
- `src/components/CurrentWeather.test.tsx` — added 6 HKO headline-swap tests + 3 TC locale render tests. Existing test renders updated to pass `headline={{ source: 'om' }}` (no behavior change for them).
- `src/lib/weather-manager.test.ts` — added 7 `headline propagation` cases (live 50 / live 82 / sentinel 9999 / empty array / HKO fetch fail / non-HK / partial path).
- `src/test/Integration.test.tsx` — `CurrentWeather` call site updated to pass `headline={{ source: 'om' }}`.

### Files NOT touched
- `src/lib/weather/codes.ts` — WMO table stays as-is.
- `src/lib/hko-icons.ts` `hkoIconToWeatherCode()` — kept as the legacy translator; daily forecast tiles still use it.
- `src/lib/weather/open-meteo.ts` — OM request shape unchanged.
- All chart, hourly, daily components — they read from OM's hourly/daily codes, not from the headline.
- `src/components/CurrentWeather.tsx` non-headline subcomponents — `RangeBar`, `SunriseSunsetCountdown`, `HumidityBar`, `WindCompass`, `UvChip`, `PrecipBar` — all unchanged. The headline refactor is localised to the icon + label render sites.

## Behavior matrix

| Trigger | `headline.source` | `headline.hkoIconCode` | What the hero renders |
|---|---|---|---|
| HK + both sources live + HKO `Icon[0]` ∈ [50,93] ∖ {9999} | `'hko'` | the code | `getHKOIconCode(code)` + `t(hkoDescriptionKey(code))` |
| HK + both sources live + HKO `Icon[0]` = 9999 / empty / NaN | `'om'` | unset | WMO `getWeatherIconNode(weatherCode, isDay)` + `t(weatherDescriptionKey(weatherCode))` |
| HK + HKO current fetch failed | `'om'` | unset | WMO path |
| HK + HKO daily succeeded, OM failed (`fallbackSource: 'HKO'`) | `'hko'` if `Icon[0]` valid, else `'om'` | code or unset | Same swap — mechanical (Decision 3) |
| HK + OM succeeded, HKO daily failed (`fallbackSource: 'partial'`) | `'om'` | unset | WMO path |
| Non-HK coordinates (PRD or anywhere else) | `'om'` | unset | WMO path |
| Both failed | throws | — | Caller (React Query hook) shows cached-data banner |

## Test gate (Phase 5 step 5)

```
$ npx tsc --noEmit -p tsconfig.app.json
TypeScript: No errors found

$ npx vitest run
PASS (323) FAIL (0)

$ npx eslint src/components/CurrentWeather.tsx
ESLint: No issues found

$ npx eslint . (full repo)
12 errors, 8 warnings — all pre-existing on main, all in files this change
didn't touch (DailyForecast.test.tsx, HourlyForecast.test.tsx, DailyForecast.tsx,
react-refresh/only-export-components across 5 unrelated files). Diff against
main shows the same counts.

$ npx vite build
dist/assets/index-*.js ~1,030 kB (gzip ~317 kB)
```

The headline-swap tests assert the **aria-label** on the hero icon swaps in lockstep with the visible label (test: `expect(container.querySelector('[aria-label="Sunny"]')).toBeTruthy()`). Screen readers see the HKO label, not the WMO label, when HKO is active.

## Risks worth knowing (operational)

1. **Daily-tile asymmetry.** Headline reads HK phrasing; daily tiles (which use `hkoIconToWeatherCode()`) read lossy WMO labels. HK users on a humid day see "Humid" in the hero and "Moderate rain" in the 7-day list. Intentional (Decision 1) but worth surfacing in user comms. If a user files a bug about this, the answer is: "yes, asymmetry is by design; daily overhaul is a separate plan."

2. **HKO icon schema drift.** The `Icon` field is `number[]` (sometimes empty, sometimes `[9999]` as a no-data sentinel). The defensive `headlineFromHkoIcon()` in `weather-manager.ts` collapses all "no usable icon" cases to `{ source: 'om' }`. If HKO adds a new code range outside 50–93, the HKO path returns `'Unknown'`; the OM path remains the source of truth. Snapshot test (`hko-weather.test.ts` fixture on `Icon[0]` shape) is recommended but not yet in place. **Cross-version guard**: `LAST_KNOWN_SCHEMA_VERSION` bumped to 2 so old v1 snapshots (which lack the new `headline` field) get dropped on read. `CurrentWeatherProps.headline` is also optional with a module-scope `{ source: 'om' }` default so the hero never crashes regardless of how a malformed payload reaches the render path. Regression test added in `storage.test.ts` "drops legacy v1 envelopes (HKO headline shape change)".

3. **TC reviewer.** Phase 4 had no named HK TC reviewer at write time. The day/night parallel structure (50 ↔ 70 share `天晴`, etc.) is the most subjective choice and the most likely to need a reviewer pass. Non-parallel strings (`天晴` / `短暫陽光` / `有霧` / `薄霧` / `煙霞` / `炎熱` / `和暖` / `稍涼` / `寒冷` / `潮濕` / `乾燥` / `風勢頗大`) are conventional HK phrasing and stable. If a reviewer flags wording, the change is a 5-minute `LanguageContext.tsx` edit + a TC render test update.

4. **`fallbackSource: 'HKO'` path mechanical change.** Phase 2 step 2 propagates the icon field through `buildHKOWeatherData` so the headline swap works consistently when OM is down and HKO carries the show. This is the only new behavior on the HKO-only fallback path; broader rework is a separate plan (Decision 14). Verify the headline renders `Humid` (or whatever HKO reports) in the dev simulator with OM forced off before announcing.

5. **Visual regression for existing HK users.** Current HK users see WMO labels (e.g. `Moderate rain`). They will now see HKO phrasing (e.g. `Sunny intervals with showers`, `Humid`, `Hot`). The terminology change is intentional but worth a brief release note.

## What to verify manually before any rollout

1. **Dev simulator with `?coords=HK`**: confirm icon + label swap to HK phrasing. Try coords that hit HKO codes 80–93 (the Hong Kong Observatory station is the easiest trigger — pick a summer day for `Hot`/`Humid`).
2. **TC locale under same coords**: confirm `天晴` / `潮濕` / `炎熱` render correctly. The icon should still swap (Sun ↔ Moon) but the Chinese label should read naturally.
3. **Non-HK coords (`?coords=Tokyo`)**: confirm the WMO path renders unchanged (`Clear sky` for WMO 0, etc.). Headline should look identical to before this change.
4. **HKO-only fallback (dev simulator with OM forced off)**: confirm the headline still swaps to HKO phrasing on the fallback path.
5. **Daily tile alongside hero**: notice the asymmetry (hero = `Humid`, daily = `Moderate rain`) and confirm it's intentional before announcing. If the asymmetry is jarring, the daily-tile refactor is the next plan.
6. **Aria-label sanity check** (VoiceOver / NVDA): the hero icon should announce the HKO label, not the WMO label, when active. Test asserts this — manual check confirms the test maps to real reader behaviour.

## Follow-ups not in scope of this plan

- **HKO-only fallback path overhaul** (Decision 14): re-plumb `buildHKOWeatherData` so the `Icon` field, warnings, station data, and sunrise/sunset are all sourced from HKO directly without falling through OM's lossy mapping. Currently the path does a minimal propagation.
- **Daily forecast tile icon refactor**: replace `hkoIconToWeatherCode()` with `getHKOIconNode(dayIconCode)` so the daily strip reads the same HKO-native lucide icons as the hero. Decision 1 punted this; it's the natural next step and removes the daily-tile asymmetry.
- **HKO icon snapshot test**: pin the API response shape (especially the `Icon` field semantics — when is `[9999]` vs `[50]` vs empty) so a HKO schema change fails CI loudly instead of silently degrading the headline to "Unknown".
- **HK TC reviewer pass**: see Risk #3.

## Verification commands

```sh
# Typecheck
npx tsc --noEmit -p tsconfig.app.json

# Tests (vitest)
npx vitest run

# Lint (full repo)
npx eslint .

# Build
npx vite build
```
