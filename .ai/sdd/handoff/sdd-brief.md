# SDD Handoff Brief: MSC Vancouver Nowcast Rainfall Map

> Status: Final
> Readiness: Ready for release
> Updated: 2026-08-07

## Metadata

- **Spec ID:** `001-msc-vancouver-nowcast`
- **Spec Path:** `.ai/sdd/specs/001-msc-vancouver-nowcast/`
- **Current .status:** `review:done`
- **Source Inputs:** N/A; `handoff/msc-vancouver-nowcast-plan.md`; N/A

## Product / Feature Summary

- **User / Audience:** Users whose location resolves to the Vancouver metro area
- **Problem:** The nowcast rainfall map only worked for Hong Kong (HKO); Vancouver users saw no precipitation nowcast.
- **Outcome:** Vancouver users see an auto-loading 6-hour precipitation-intensity nowcast overlay on a Leaflet basemap, matching the HKO experience.
- **Scope:** MSC HRDPS 2.5km Total Precipitation Intensity Index served as GeoMet WMS tiles; Vancouver bbox (48.9–49.5°N / 122.3–124.0°W); step slider + autoplay; light/dark basemap toggle; loading/error/stale states; compact intensity legend; en/tc.
- **Out of Scope:** Other Canadian cities; historical data; mm amounts (index 0–10 only); French; precipitation type; user-configurable bbox.

## Requirements Summary

- **Key User Stories:** `US-001` (Vancouver nowcast), `US-002` (HKO unchanged), `US-003` (reliable access states)
- **Must Have Functional Requirements:** `FR-001`–`FR-008`, `FR-010`
- **Important NFRs:** `NFR-001` performance (WMS tiles, ~2–10 KB), `NFR-003` accessibility, `NFR-004` resilience (no proxy; GeoMet CORS `*`)
- **Acceptance Notes:** MSC map auto-loads (no "Load Map" prompt, D-009); steps = next 6 hours from now in strict `YYYY-MM-DDTHH:00:00Z`; step times displayed in Vancouver local time (PDT/PST via Intl).

## Design Summary

- **Approach:** Pre-rendered per-step WMS tiles from GeoMet (`HRDPS-WEonG_2.5km_TotalPrecipIntensityIndex`, style `TotalPrecipIntensityIndex_Dis`) overlaid on Carto basemaps via react-leaflet `WMSTileLayer`. No GRIB2 parsing, WASM, or proxy (GRIB2 proved infeasible: template 262 unsupported, JPEG2000-packed; D-001/D-004).
- **Components / Modules:** `MSCRainfallMap.tsx` (lazy outer, error boundary), `MSCRainfallMapInner.tsx` (map, WMS layer, controls, states), `src/lib/msc-wms.ts` (run/step derivation, formatters), `src/lib/constants.ts` (MSC consts), `Index.tsx` gate, `LanguageContext.tsx` (`msc.*` keys), `vite.config.ts` (SW cache rule).
- **Data / State:** Run/step times derived from UTC clock with 2h publish-lag rule; no grid cache (HTTP `max-age=3600` + SW `msc-tile-cache`).
- **APIs / Integrations:** GeoMet WMS GetMap (version 1.3.0; `crs=EPSG:3857` appended by Leaflet, not passed as param); GetLegendGraphic colors verified and rendered as compact swatches.
- **Technical Decisions:** `D-001`/`D-004` WMS tiles; `D-002` discrete style + compact legend; `D-007`/`D-009` MSC auto-load; `D-008` always show latest analysis with age chip; steps-next-6h; Vancouver-local display zone.
- **Risks / Constraints:** GeoMet rolling time window + cached/unreliable capabilities dimension (steps derived from clock, verified live); pre-existing tanstack lockfile skew produces 5 tsc errors in untouched files (non-blocking, separate concern).

## Implementation Plan

- **Task Source:** `.ai/sdd/specs/001-msc-vancouver-nowcast/tasks.md`
- **Recommended Order:** T1 → T2 → T3 → T4/T7 → T5 → T6 → T8/T9 → T10
- **Key Tasks:** T2 (time derivation), T5 (inner component), T6 (Index wiring), T10 (E2E)
- **Likely Files / Areas:** `src/components/MSCRainfallMap*.tsx`, `src/lib/msc-wms.ts`, `src/lib/constants.ts`, `src/pages/Index.tsx`

## Verification Plan

```text
Command: npx vitest run
Expected: all pass (355 incl. 29 new)
Command: npx eslint . / npx tsc --noEmit -p tsconfig.app.json / npx vite build
Expected: 0 errors in feature code; build succeeds
```

## Review / Release Notes

- **Review Artifact:** `.ai/sdd/specs/001-msc-vancouver-nowcast/review.md`
- **Review Verdict:** Approved (2026-08-07; all 12 issues resolved; issue 3 intentionally skipped by user decision)
- **Known Follow-ups:** None blocking. Pre-existing repo item (not from this feature): align `react-query`/`query-persist` versions to clear 5 tsc errors in untouched files.

## Handoff Readiness

- **Ready for Implementation:** yes
- **Ready for QA:** yes
- **Ready for Release:** yes
- **Blockers:** None
- **Recommended Next Action:** Merge/QA the feature branch; consider the tanstack lockfile alignment separately. No commits made (project rule — branch `feat/msc-vancouver-nowcast` holds the changes uncommitted).
