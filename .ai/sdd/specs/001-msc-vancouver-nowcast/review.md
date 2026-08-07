# Review: MSC Vancouver Nowcast Rainfall Map

> Requirements: @requirements.md
> Design: @design.md
> Tasks: @tasks.md
> **Status: FINAL — reviewed 2026-08-07. All 10 issues resolved (issue 3 intentionally skipped by user decision). Task 10 manual browser E2E passed: the user exercised the live map in-browser across fix rounds (map rendered and was draggable, steps/legend/controls usable — subsequent requests were UI polish: compact legend, Vancouver-local step times, both implemented and re-verified). `.status` advanced to `review:done`.**

## Coverage Check

| Requirement | Expected Coverage | Status | Evidence / Notes |
|-------------|-------------------|--------|------------------|
| FR-001 Vancouver map auto-loads (no prompt, D-009) | `MSCRainfallMap.tsx` (outer) | Pass | Lazy chunk + Suspense + error boundary; no "Load Map" prompt (user decision, spec updated) |
| FR-002 HKO unchanged | `Index.tsx` gate | Pass | Gate extended (`isInRainfallRegion \|\| isInVancouverBox`), HKO path untouched at both render sites; 355 tests green incl. all pre-existing |
| FR-003 Step slider + autoplay (next 6 hours) | `MSCRainfallMapInner.tsx` | Pass | 6 steps from next full hour; slider + play/pause + clickable labels; tested |
| FR-004 Color-coded overlay + legend | GeoMet `_Dis` style + compact swatch legend | Pass | Legend = 3 verified swatches (green Low / yellow Moderate / orange High) — colors + labels verified from GetLegendGraphic + live tiles; replaces the tall 217×482 image (user request, design §3 updated) |
| FR-005 Basemap toggle | Inner, same pattern as HKO | Pass | Light/dark Carto tiles; follows theme; tested |
| FR-006 Cache tiles | GeoMet `max-age=3600` + workbox `msc-tile-cache` | Pass | SW rule in built `sw.js` (verified in dist) |
| FR-007 Auto-detect region | `isInVancouverBox` at both Index sites | Pass | Desktop + mobile Swiper slide 3; Vancouver → MSC, PRD → HKO, elsewhere → none |
| FR-008 Loading/error/stale states | Inner state machine | Pass | First-batch error counting → retry overlay; 20s hang guard → stale pill; regression test |
| FR-009 Loading state | Spinner + 10s slow-network chip | Pass | Determinate progress N/A for tiles (documented) |
| FR-010 Observation time | `nowcast.updated` + run start | Pass | Vancouver local time + zone abbr (user request); auto-refresh at run boundary |
| FR-011 en/tc | `msc.*` keys both languages | Pass | All 6 keys defined in en + tc (verified parity) |
| NFR-001 Performance | Budgets in design §8 | Pass | WMS tiles ~2–10 KB; MSC chunk 4.21 kB gz |
| NFR-003 Accessibility | Labels, native slider, chips | Pass | `role="status"` + `aria-live` on chips, `aria-label`s, native range input, legend swatch labels (WCAG 1.4.1) |
| NFR-004 Resilience | No proxy needed (GeoMet CORS `*`) | Pass | Verified live |

## Task Completion Check

| Task | Status | Evidence / Notes |
|------|--------|------------------|
| T1 constants | Pass | `MSC`, `VANCOUVER_BBOX`/`CENTER`, `isInVancouverBox`, `MSC_TIMEOUT_MS`; layer/style consts shared (issue 6) |
| T2 msc-wms.ts | Pass | 16 unit tests; lag rule + strict time format verified against live GeoMet |
| T3 workbox rule | Pass | `msc-tile-cache` in built `sw.js` |
| T4 MSCRainfallMap | Pass | Auto-loads (D-009); lazy chunk; error boundary |
| T5 MSCRainfallMapInner | Pass | WMS layer (no `crs` param — issue 10 fix), steps, autoplay, states, run-refresh timer, compact legend, Vancouver-local times |
| T6 Index wiring | Pass | Both sites; HKO path untouched |
| T7 translations | Pass | en/tc `msc.*` keys, balanced |
| T8 unit tests | Pass | 16/16 incl. PDT/PST tz + abbr tests |
| T9 component tests | Pass | 10/10 incl. first-batch-failure regression, run-boundary refresh, map-lock regression, zone-agnostic WMS-time assertions |
| T10 E2E | **Pass** | Manual browser E2E exercised by the user across fix rounds (map rendered + draggable after issue 10; legend + timezone feedback confirms working interaction) |

## Design Check

| Design Area / Decision | Status | Notes |
|------------------------|--------|-------|
| WMS tiles, no GRIB2 parsing (D-001/D-004) | Pass | Followed; verified against live GeoMet |
| GeoMet discrete style + legend (D-002) | Pass | Compact swatches; no fabricated mm/h labels; colors verified |
| Run selection + 2h publish-lag rule (§4) | Pass | Tested at boundaries; steps = next 6h from now (strict MapServer format) |
| Steps next-6h (no runStart+1..6h) | Pass | GeoMet rolling window verified; strict `%Y-%m-%dT%H:%M:%SZ` format |
| No localStorage grid cache (FR-006) | Pass | HTTP + SW cache |
| D-008 "Using last analysis" chip | Pass | Tested; pairs with auto-run-refresh timer |
| No-precipitation probe | Pass | All 6 steps probed; chip only when all dry |
| Map lock released after first load | Pass | Regression test: later tile batches never re-lock |
| `version=1.3.0` param, `crs` NOT in params | Pass | design §3 corrected to match verified Leaflet behavior (issue 10) |
| Vancouver-local display zone | Pass | Intl `America/Vancouver`, DST-aware, h23; UTC fallback guard |

## Code Quality Check

- [x] Follows project conventions (patterns mirror HKO map; no new deps)
- [x] No obvious duplication
- [x] Error/loading/empty states handled (issue 1, 8, 9, 10 fixes + verified)
- [x] Types are appropriate (0 type errors in feature code)
- [x] Security/privacy handled (hardcoded https endpoints; no user data sent)
- [x] Accessibility (role/aria-live chips, alt/visible legend labels, native slider)
- [x] No unnecessary complexity (WMS path strictly simpler than the original parse design)

## Verification

```text
Command: npx vitest run
Exit code: 0
Summary: 355 passed (326 pre-existing + 29 new), 0 failed
Verdict: PASS

Command: npx eslint .
Exit code: 0
Summary: 0 errors, 9 warnings — all pre-existing react-refresh/exhaustive-deps
        in untouched files (LanguageContext warnings pre-date feature keys)
Verdict: PASS

Command: npx tsc --noEmit -p tsconfig.app.json
Exit code: n/a
Summary: 5 errors, all pre-existing tanstack lockfile skew in untouched files
        (react-query@5.101.2 vs query-persist@5.101.4 from PR #76). The
        removeClient fix cleared one of the original 6. 0 errors in feature code.
Verdict: PASS (feature scope)

Command: npx vite build
Exit code: 0
Summary: built in 2.19s; MSC lazy chunk 4.21 kB gz; sw.js contains msc-tile-cache
Verdict: PASS

Command: manual — live GeoMet GetMap URLs (version=1.3.0, crs=EPSG:3857,
        strict time) return 200 PNG for all 6 steps; user in-browser E2E
Verdict: PASS
```

## Issues Found (all resolved)

| # | Severity | Issue | Status |
|---|----------|-------|--------|
| 1 | High | First-batch tile failure rendered a blank map (Leaflet fires `load` even when all tiles errored) | **Fixed** — per-batch error counting; regression test |
| 2 | Medium | No-precipitation probe checked only step 1 | **Fixed** — all 6 steps probed; chip only when every step dry |
| 3 | Medium | No tests for stale-pill / 20s-hang paths | **Won't fix (user decision)** — critical FR-008 path covered; remaining timer logic non-blocking; avoids test bloat |
| 4 | Low | Steps/run frozen at mount across run boundaries | **Fixed** — stateful run + auto-refresh timer; regression test |
| 5 | Low | No-precipitation chip lacked `role="status"` / `aria-live` | **Fixed** |
| 6 | Low | `MSC.LEGEND_URL` hardcoded layer/style strings | **Fixed** — shared consts |
| 7 | High | Map immovable after first pan (lock keyed on `tileLoading`) | **Fixed** — lock released after first batch; regression test |
| 8 | Design | HKO "Load Map (~2.7MB)" prompt wrong for MSC's small cached tiles | **Fixed** — auto-load (user decision, FR-001/D-009 updated); refresh button kept |
| 9 | High | All WMS requests failed: ms-in-time format, missing CRS, steps outside GeoMet's rolling window | **Fixed** — steps = next 6h from now in strict format; `version=1.3.0`; verified live |
| 10 | High | `crs.project is not a function` — `crs` param collided with Leaflet's CRS option; also fixed pre-existing `persister.removeClient is not a function` (App.tsx:47) | **Fixed** — `crs` removed from params (Leaflet appends it from `version=1.3.0`); `removeClient` added to custom persister; design §3 corrected; verified final URL returns PNG |
| 11 | Low | Legend image (217×482) too tall; MapServer ignores scale params | **Fixed** — compact 3-swatch legend, colors/labels verified from GeoMet (user request) |
| 12 | Low | Step times displayed in UTC, not Vancouver local | **Fixed** — Intl `America/Vancouver` (PDT/PST, DST-aware) + zone abbr; UTC fallback; unit + component tests updated |

## Verdict

- [x] **Approved**
- [ ] Approved with follow-ups
- [ ] Needs fixes

**Notes:**
- All Must Have requirements pass, design is followed, verification passes, no blocking issues.
- Non-blocking pre-existing repo follow-up (not introduced by this feature): the tanstack lockfile skew (`react-query@5.101.2` vs `query-persist@5.101.4`) produces 5 tsc errors in untouched files — align versions separately when convenient.
- The architecture pivoted from GRIB2 parsing to GeoMet WMS tiles after verified infeasibility findings; spec docs were updated and user-approved before implementation, so the implementation matches the revised approved artifacts.
