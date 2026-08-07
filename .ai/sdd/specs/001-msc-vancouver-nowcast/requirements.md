# Feature: MSC Vancouver Nowcast Rainfall Map

> Status: Approved  
> Source: handoff/msc-vancouver-nowcast-plan.md

## Overview

The app currently shows a gridded rainfall nowcast map for Hong Kong, sourced from the Hong Kong Observatory (HKO). This feature adds a matching nowcast rainfall map for **Vancouver, BC, Canada**, using data from the Meteorological Service of Canada (MSC) GeoMet platform.

The map displays short-range precipitation forecasts (up to 6 hours) as an animated overlay on a basemap, letting users see where rain is coming and decide whether to stay or go.

## Business Context

The app serves users in two geographies: Hong Kong (HKO data) and Vancouver (MSC data). Currently, the nowcast map only works for Hong Kong. Users in the Vancouver metro area see no precipitation nowcast at all — a gap in the core "see what rain looks like coming" value proposition.

**Success signals:**
- Vancouver users can view the nowcast map without switching regions manually.
- The map loads within the same performance budget as the HKO map.
- The intensity visualization is clear enough for users to make stay/decide actions.

## User Stories

### US-001: View Vancouver precipitation nowcast

**As a** user whose location is in or near Vancouver, BC  
**I want to** see a rainfall nowcast map covering the Vancouver metro area  
**So that** I can see where rain is coming and decide whether to stay or go

**Acceptance Criteria:**
- [ ] The map displays when the user's geolocation resolves to Vancouver, BC (48.9–49.5°N, 122.3–124.0°W).
- [ ] The map covers the Vancouver metro area and surrounding region (Squamish to south of the border, Vancouver Island to Fraser Valley).
- [ ] The map shows up to 6 hours of forecast data with step controls (the next 6 hourly forecast times — GeoMet serves a rolling window; see D-001).
- [ ] The user can play an animation cycling through all forecast steps.
- [ ] The map displays precipitation intensity using a color-coded overlay with a visible legend.
- [ ] The user can switch between a light and dark basemap.

### US-002: View Hong Kong precipitation nowcast (unchanged)

**As a** user whose location is in Hong Kong  
**I want to** see the existing HKO rainfall nowcast map  
**So that** I can see where rain is coming and decide whether to stay or go

**Acceptance Criteria:**
- [ ] The map displays when the user's geolocation resolves to Hong Kong.
- [ ] The HKO map continues to work exactly as before — no regression in behavior, data, or UI.

### US-003: Access the nowcast map reliably

**As a** user on any network condition  
**I want to** see clear loading, error, and recovery states when the nowcast data fails to load  
**So that** I am never left with a blank or stuck screen

**Acceptance Criteria:**
- [ ] A loading spinner is shown while data downloads.
- [ ] A progress bar is shown on slow connections (over 10 seconds).
- [ ] An error overlay with a retry button is shown if the data fetch fails.
- [ ] Previously loaded data remains visible (stale-data indicator) while a background refresh is attempted.

## Functional Requirements

### FR-001: Display nowcast map for Vancouver — Must Have

**WHEN** the user's location resolves to the Vancouver region  
**THE SYSTEM SHALL** load and display the latest MSC precipitation forecast data as a color-coded overlay on a Leaflet basemap centered on Vancouver, without requiring an explicit "Load Map" opt-in  
**SO THAT** the map is immediately available. (MSC data is small, cached WMS tiles — not a multi-MB download — so the HKO-style opt-in prompt does not apply to MSC; user decision 2026-08-07.)

### FR-002: Display nowcast map for Hong Kong (unchanged) — Must Have

**WHEN** the user's location resolves to the Hong Kong region  
**IF** the nowcast map has not yet been loaded  
**THE SYSTEM SHALL** show the existing HKO "Load Map" prompt  
**SO THAT** the HKO experience is unchanged

### FR-003: Show forecast timeline with step controls — Must Have

**WHEN** the nowcast map is loaded  
**IF** multiple forecast steps are available  
**THE SYSTEM SHALL** display a step slider and clickable step labels covering the next 6 hourly forecast times (GeoMet serves a rolling ~now-3h..+48h window; hours early in the latest run are not served)  
**AND** allow the user to scrub through forecast steps manually or play an auto-advancing animation  
**SO THAT** the user can see how precipitation is expected to evolve

### FR-004: Color-code precipitation intensity with legend — Must Have

**WHEN** the nowcast map renders a forecast step  
**THE SYSTEM SHALL** color each grid cell according to a precipitation intensity band and display a visible legend mapping colors to intensity levels.

### FR-005: Support light and dark basemap — Must Have

**WHEN** the nowcast map is displayed  
**THE SYSTEM SHALL** provide a basemap toggle button to switch between light and dark basemaps  
**AND** the toggle must persist per user session.

### FR-006: Cache nowcast data for reuse — Must Have

**WHEN** nowcast data is successfully fetched  
**THE SYSTEM SHALL** cache the per-step tiles (HTTP `max-age=3600` from GeoMet + a service-worker runtime-caching rule for `geo.weather.gc.ca`)  
**SO THAT** re-opening the map within the cache window renders without re-downloading tiles. (No localStorage grid cache: tiles are served by the browser cache / SW, matching the tile-based architecture.)

### FR-007: Auto-detect region and route to correct nowcast source — Must Have

**WHEN** the app determines the user's location  
**IF** the location is in the Vancouver bounding box  
**THE SYSTEM SHALL** select the MSC data source for the nowcast map.  
**IF** the location is in the Hong Kong bounding box  
**THE SYSTEM SHALL** select the HKO data source for the nowcast map.

### FR-008: Show loading and error states — Must Have

**WHEN** the nowcast data fetch is in progress  
**THE SYSTEM SHALL** show a loading indicator.  
**IF** the fetch fails and no cached data exists  
**THE SYSTEM SHALL** show a full-screen error overlay with a retry button.  
**IF** the fetch fails but cached data exists  
**THE SYSTEM SHALL** show a stale-data indicator while the previous data remains on screen.

### FR-009: Show progress on download — Should Have

**WHEN** the nowcast tiles are loading  
**THE SYSTEM SHALL** show a loading spinner while the first tiles download  
**SO THAT** the user is never left with a blank map. (Tile-based loading has no single Content-Length; the determinate progress bar from the HKO CSV path is not applicable.)

### FR-010: Display current observation time — Must Have

**WHEN** the nowcast map is loaded  
**THE SYSTEM SHALL** show the timestamp of the latest analysis/observation in the map's control bar.

### FR-011: Support both English and Traditional Chinese — Could Have

**WHEN** the user switches the app language  
**THE SYSTEM SHALL** display all nowcast UI text (labels, legend, tooltips) in the selected language, using the existing `en/tc` translation system.

## Non-Functional Requirements

### NFR-001: Performance

The nowcast map must load within the same performance budget as the existing HKO map:
- Initial data fetch: under 30 seconds on 4G.
- Map render (grid cells painted): under 2 seconds after data arrives.
- Step-change animation: under 100ms per step toggle.

### NFR-002: Reliability

The nowcast data source (MSC Datamart) must be available with reasonable uptime. If the source is unavailable for more than 30 minutes, the system should surface a clear message to the user.

### NFR-003: Accessibility

The nowcast map must support keyboard navigation (step slider, basemap toggle, refresh button) and screen-reader labels. The color-coded precipitation overlay must have an alternative text description in the legend (WCAG 1.4.1 non-text content).

### NFR-004: Data source resilience

If CORS blocks direct browser fetch from the MSC Datamart, the system should fall back to a minimal server-side proxy without changing the user experience.

## Out of Scope

- **Other Canadian cities** — This feature covers Vancouver metro only. Other BC cities (Victoria, Kelowna, etc.) are out of scope for this version.
- **Historical nowcast data** — Only the latest forecast cycle is shown. Users cannot view past analyses.
- **Rainfall amount (mm)** — MSC provides a precipitation intensity index (0–10), not mm/h. The legend displays intensity bands, not absolute precipitation amounts.
- **WMS-only fallback rendering** — If GRIB2 parsing proves infeasible, a WMS tile overlay is a backup plan but not a first-class feature. The primary implementation uses gridded data with per-cell rendering.
- **French language** — The app uses `en/tc` only. No French localization is included.
- **Precipitation type (rain/snow/ice)** — The HRDPS product aggregates all precipitation types into a single intensity index. Distinction between rain, snow, and freezing rain is out of scope.
- **User-configurable bounding box** — The Vancouver coverage area is fixed. Users cannot resize or pan outside the predefined box.

## Decisions

### D-001: Data source — HRDPS TPCPNINTSTI via GeoMet WMS

**Decision:** Use the MSC HRDPS 2.5km `TPCPNINTSTI` (Total Precipitation Intensity Index) product, served as per-step WMS tiles by **GeoMet** (`geo.weather.gc.ca/geomet`, layer `HRDPS-WEonG_2.5km_TotalPrecipIntensityIndex`, style `TotalPrecipIntensityIndex_Dis`). No GRIB2 files are fetched or parsed.
**Reason:** 2.5km resolution covers the Vancouver metro with adequate detail. Verified 2026-08-07: GRIB2 client-side parsing is infeasible (HRDPS grid template 262 is unsupported by the only maintained browser lib `@mattnucc/gribberish`, and the data is JPEG2000-packed). GeoMet WMS serves the same product with an hourly TIME dimension (`nearestValue=0`), `Access-Control-Allow-Origin: *`, and HTTP `max-age=3600`, verified end-to-end (CORS, EPSG:3857, per-step PNG, transparent where no rain).  
**Reason:** 2.5km resolution covers the Vancouver metro with adequate detail. The intensity index 0–10 maps cleanly to existing rainfall bands. 6 hours provides meaningful short-range guidance without the noise of longer-range forecasts.  
**Source:** Plan Phase 1–2  
**Impacts:** FR-001, FR-003, FR-004, Out of Scope (precipitation type, mm amounts)

### D-002: Intensity colors — GeoMet discrete style

**Decision:** Use GeoMet's pre-rendered discrete color style (`TotalPrecipIntensityIndex_Dis` — yellow → green → orange for increasing intensity). The legend is the GeoMet `GetLegendGraphic` image. No `RAINFALL_BANDS` reuse and no mm/h values: the HKO mm/h legend would be misleading for the index-based MSC product.  
**Reason:** The intensity index is MSC's standard product. Converting to mm/h would be speculative and misleading. Users already understand the color bands from the HKO map.  
**Source:** Plan Phase 2.3  
**Impacts:** FR-004, Out of Scope (mm amounts)

### D-003: Bounding box — fixed Vancouver metro coverage

**Decision:** The Vancouver nowcast covers 48.9–49.5°N / 122.3–124.0°W. At the 0.0225° grid spacing this is ~27 rows × ~76 cols ≈ **2,000 cells** per step (corrected 2026-08-07 — the original ~5,525-cell / 145km×190km estimate was arithmetically wrong: 0.6° lat ≈ 67 km).  
**Reason:** This box covers the Vancouver metro area, Squamish to the north, the Fraser Valley to the east, and includes the Strait of Georgia. It is the minimum useful coverage for the region.  
**Source:** Plan Phase 1.3  
**Impacts:** FR-001, Out of Scope (user-configurable box, other cities)

### D-004: No client-side GRIB2 parsing — WMS tiles

**Decision:** Do NOT parse GRIB2. The client requests pre-rendered per-step PNG tiles from GeoMet WMS and overlays them on the Leaflet basemap.
**Reason:** Verified 2026-08-07: (a) `grib2js` is a 2013 pure-Node reader with no WASM; (b) `@mattnucc/gribberish` (the maintained browser lib) cannot decode HRDPS grid template 262; (c) the data is JPEG2000-packed, ruling out a hand-rolled decoder; (d) browser WASM GRIB2 builds require shared memory → whole-app cross-origin isolation (COOP/COEP), which breaks no-cors basemap tiles. WMS tiles avoid parsing, WASM, proxies, and COOP/COEP entirely.
**Source:** Plan Phase 1.1; verified findings + user decision 2026-08-07
**Impacts:** NFR-001, NFR-004

### D-005: Region auto-routing via geolocation

**Decision:** The app automatically routes to MSC or HKO nowcast based on the user's geolocation. Vancouver location → MSC. Hong Kong location → HKO. No manual region selector for the nowcast map.  
**Reason:** The app already uses geolocation for other purposes (station proximity, etc.). Adding a manual region toggle would increase UI complexity for a two-region product.  
**Source:** Plan Phase 4.1  
**Impacts:** FR-007, FR-002

### D-006: Language — reuse `nowcast.*` where identical, add `msc.*` where semantics differ

**Decision:** Step controls, loading, and error states reuse the existing `nowcast.*` keys. The legend is NOT shared: HKO labels are mm/h ranges, MSC labels describe intensity index bands (e.g., "Light", "Moderate") per D-002. Add `msc.*` keys for legend and MSC-specific strings ("No precipitation in forecast", "Partial data available", "MSC data unavailable").
**Reason:** Reusing identical strings avoids duplication, but the HKO legend would render fabricated mm/h values for index-based MSC data — misleading and contrary to the "intensity bands, not mm amounts" requirement.
**Source:** Plan Phase 4.2; review finding 2026-08-07
**Impacts:** FR-011, FR-004, Out of Scope (French language)

### D-007: HKO "Load Map" prompt when section enters viewport

**Decision:** The HKO "Load Map" prompt appears when the nowcast section scrolls into view. **MSC does NOT show a prompt** — see D-009.  
**Reason:** Surfaces the feature without requiring an extra tap; the user still explicitly taps "Load Map" before the 2.7 MB HKO CSV downloads.  
**Source:** Q-001, user confirmed Option A  
**Impacts:** FR-002

### D-009: MSC auto-loads without a prompt

**Decision:** The MSC nowcast map renders immediately when the section is visible — no "Load Map" gate. The Leaflet bundle remains code-split (lazy chunk).  
**Reason:** MSC data is small per-step WMS tiles (cached `max-age=3600` + SW), unlike the 2.7 MB HKO CSV the HKO prompt exists to gate. A prompt with HKO's "~2.7MB" copy would be wrong for MSC.  
**Source:** User decision 2026-08-07 (review feedback)  
**Impacts:** FR-001

### D-008: Always show the latest available analysis

**Decision:** Always display the most recent HRDPS analysis regardless of its age. If the analysis is older than 6h, the observation timestamp is shown in the control bar (FR-010) and the label "Using last analysis at HH:MM" surfaces the age.  
**Reason:** More transparent and more useful than hiding data during off-hours. HRDPS runs at 00Z, 06Z, 12Z, 18Z — the latest analysis may be partially elapsed by the time the user checks, but it still provides actionable guidance.  
**Source:** Q-002, user confirmed Option A  
**Impacts:** FR-001, FR-010

## Questions

### Q-001: When should the "Load Map" prompt appear?

**Status:** answered  
**Decision:** D-007 — Show prompt when the section scrolls into view.

### Q-002: How to handle analyses older than 6 hours?

**Status:** answered  
**Decision:** D-008 — Always show the latest available analysis with a visible timestamp label.

### Q-003: Which GRIB2 parser for browser-side parsing?

**Status:** answered  
**Decision:** D-004 — no client-side GRIB2 parsing; GeoMet WMS tiles (verified: gribberish can't decode HRDPS template 262; data is JPEG2000; WASM builds need cross-origin isolation).

## Glossary

- **HRDPS:** High Resolution Deterministic Prediction System — MSC's regional NWP model at 2.5km resolution.
- **GRIB2:** GRIdded Binary — WMO standard binary format for gridded meteorological data.
- **TPCPNINTSTI:** Total Precipitation Intensity Index — a 0–10 scale representing the likelihood/intensity of precipitation at a given grid cell and forecast step.
- **MSC Datamart:** The public MSC raw data server at `dd.weather.gc.ca` where HRDPS GRIB2 files are hosted.
- **Nowcast:** A short-range precipitation forecast (0–6h) derived from a numerical weather prediction model run.
