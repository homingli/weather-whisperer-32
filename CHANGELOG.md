# Changelog

User-visible changes shipped to the app. Internal refactors, test additions, and dev-only tooling are noted in `handoff/` and git history.

The format is loosely [Keep a Changelog](https://keepachangelog.com/) — date + grouped subsections (Added / Changed / Fixed / Notes). Versions are not formal; entries are ordered newest-first.

## Unreleased

### Fixed
- **Intermittent blank map on mobile** when clicking "Load Map" for the nowcast rainfall card. Leaflet's constructor reads the container's bounding rect synchronously, so a map mounted against a 0x0 container (common during a Swiper slide transition or iOS Safari URL-bar hide/show) ends up with a 0x0 viewport that never recovers on its own — the basemap renders as `bg-muted/20` and the rainfall cells paint into an invisible canvas. Fix: `map.invalidateSize()` on the next frame after the ref lands, plus a `ResizeObserver` on the map container so subsequent size changes (URL bar toggle, orientation, slide re-entry) re-layout the map.
- **Cold-start snapshot crash on upgrade.** Snapshot schema bumped to v2 (drops legacy v1 envelopes missing `headline`); `CurrentWeatherProps.headline` made optional with an OM default as a defensive guard.

### Added
- **HKO-native headline icon + label** for HK coordinates when both Open-Meteo and HKO are live. The hero now reads HKO's own icon taxonomy (50–93), which is more granular than WMO 4677 for current conditions: night variants (70–77), special atmospheric states (`Windy` 80, `Dry` 81, `Humid` 82, `Fog` 83, `Mist` 84, `Haze` 85), and temperature states (`Hot` 90, `Warm` 91, `Cool` 92, `Cold` 93). For example, on a humid HK day the headline now reads `Humid` instead of the lossy WMO-mapped `Moderate rain` that the previous path produced.
- **`HeadlineInfo` polymorphism** on `WeatherData` — `headline.source` is `'hko' | 'om'`; when `'hko'`, `headline.hkoIconCode` carries the source code. Always present (non-HK paths write `{ source: 'om' }`).

### Changed
- **Night headline labels renamed** from HKO's `Fine` to natural English (`Clear` / `Clear periods` / `Clear intervals` / `Clear periods with a few showers` / `Clear intervals with showers`). HK-English visitors and local users don't recognise `Fine` as the nighttime counterpart to `Sunny`; the new wording parallels the daytime labels and matches `Sunny ↔ Clear`. HK Traditional Chinese parallels: `天晴` ↔ `天晴` (same character; the day/night split is carried by the lucide `Sun`/`Moon` icon, not by divergent characters — matches HKO's reference wording).
- **HK Traditional Chinese HKO descriptions** reworked to follow HKO conventions. The biggest fix: `hko.desc.sunnyIntervals` (code 52) was previously set to `陽光驟雨` (HKO's wording for code 54, "Sunshine + showers"); now `部分時間有陽光` for 52, with 54 keeping `陽光驟雨`. Day/night parallels now share vocabulary (50/70 = `天晴`, 51/71 = `短暫天晴`, etc.).

### Notes
- **Headline only — daily forecast tiles still use lossy WMO labels.** This plan improves the hero rendering because that's where users scan first; the daily strip continues to look up HKO daily icons through the legacy `hkoIconToWeatherCode()` translator (`src/lib/hko-fetch.ts`). The asymmetry is intentional (decision in `handoff/hko-headline-icon-plan.md` Decision 1) and is the most likely surprise for HK users — daily-tile icons may show e.g. `Moderate rain` while the hero reads `Humid`. Documented in plan Risk #4.
- **HKO icon schema drift guard.** If HKO returns the sentinel `9999` (or `NaN`, or an empty array) on the `Icon` field, the headline falls through to the WMO path. Verified by `weather-manager.test.ts` "headline propagation" block (5 sentinel-fallback cases).
- **TC review status.** No named HK TC reviewer at write time. Strings follow HKO conventions but should be confirmed by a native HK Traditional Chinese speaker before any user-facing announcement. See `handoff/hko-headline-icon-plan.md` Phase 4 blocker.
- **Scope is HK + both sources live only.** PRD region continues to use Open-Meteo (no PRD-data-layer change here). Non-HK coordinates use Open-Meteo. The HKO-only fallback path (`fallbackSource: 'HKO'`) picks up the headline swap mechanically — broader overhaul of that path is a separate plan (Decision 14).
- **No new dependency.** HKO icon mapping uses `Wind`, `Droplets`, `ThermometerSun`, `ThermometerSnowflake` from the existing `lucide-react@0.462.0` — verified at plan write. The defensive `?? Cloud` fallback in `getHKOIconNode` stays as cheap insurance against future lucide removals.
- **Test coverage.** 323 / 323 vitest cases pass. Coverage details in `handoff/hko-headline-icon.md`.

## [Earlier] — Pre-changelog history

Pre-2026-08-02 work is documented in `ARCHITECTURE.md` and per-feature handoff docs under `handoff/`. Notable prior milestones:
- `feat/us-metrics-support` — Metric ↔ US unit toggle
- `feat/api-boundary-parsers` — tolerant API-boundary parsing with shape-drift logging
- `feat/a11y-low-hanging-fruit` — WCAG 2.1 AA fixes from the ada-compliance plan
- `feat/editorial-app` — paper-cream editorial redesign + mobile swiper deck
