# Viewport audit — iPhone logical widths (375–440 CSS px)

Automated overflow / overlap audit for issue #104. Walks the app (dev-mode
build through `vite preview`) at every iPhone portrait logical width and
asserts page-level layout invariants, recording screenshots for visual
review.

## Why this exists

Every iPhone logical width (375–440 pt) is below the app's single
responsive breakpoint (`md`, 768 px / `1080px` mobile-deck switch), so the
whole iPhone family shares one layout bucket. Layout bugs that only appear
at the extremes — a timeline rail that outgrows the card at 375, a header
action row that crowds at 375 but stretches at 440 — previously needed a
human to resize a browser and eyeball it. This script makes the check
repeatable and deterministic (all external data is stubbed), so a future
layout change that reintroduces horizontal overflow fails `npm run
audit:viewports`.

## Matrix

| Width × height (pt) | Device class | Row added by |
|---|---|---|
| 375 × 667 | SE 2nd/3rd gen, iPhone 6/7/8 | issue matrix |
| 375 × 812 | iPhone X / 11 Pro / 12–13 mini (notched tall-narrow) | issue open question — added |
| 390 × 844 | Base 6.1" (12/13/14) | issue matrix |
| 393 × 852 | 6.1" Pro / modern base (14 Pro, 15/16, 17 Pro) | issue matrix |
| 402 × 874 | iPhone 16 Pro / 16e | issue open question — added |
| 428 × 926 | Older Plus / Pro Max (12–14 Pro Max, 14 Plus) | issue matrix |
| 430 × 932 | Modern Plus / Pro Max (15–16 Plus / Pro Max) | issue matrix |
| 440 × 956 | Top-tier large (16 Pro Max, 17 Pro Max) | issue matrix |

Both issue open questions were answered by adding the rows: 402×874 is
current hardware between the standard and large clusters, and 375×812 is a
second 375-width row that exercises the notched tall-narrow height so a
single short-row SE width can't hide height-sensitive bugs.

## States

| State | What it loads |
|---|---|
| `hk-main` | Hong Kong (HKO + Open-Meteo merge; 3 swiper slides incl. the HK rainfall map card) |
| `hk-map` | HK + swipe to slide 3 (HK nowcast map, synthetic 2-step grid) |
| `hk-settings` | HK + the settings dropdown opened |
| `hk-alerts` | HK + two dev-simulated warnings (`__devWarnings.add`) → alert badges + toasts |
| `hk-cache-banner` | HK, loaded online then reloaded with all APIs blocked → red offline banner |
| `van-main` | Vancouver (Open-Meteo only, MSC rainfall map card) |
| `van-map` | Vancouver + swipe to slide 3 (GeoMet WMS map) |
| `sf-main` | San Francisco control (Open-Meteo only, no map card) |
| `sf-cache-banner` | SF offline banner state |

Run a subset with `--state hk-main,sf-main`; language can be flipped to
Traditional Chinese with `AUDIT_LANG=tc` (HK + global UI strings).

## Assertions (per width × state)

1. **No page-level horizontal overflow.** `documentElement`/`body`
   `scrollWidth <= innerWidth + 1`.
2. **No element escapes the viewport** unless it is intentionally
   constrained by a clipped/scrollable ancestor (overflow-hidden cards,
   `overflow-x-auto` rails — e.g. the map timeline on narrow widths).
3. **No vertical page scroll.** The deck scrolls *inside* its card
   (`overflow-y: auto`); the page itself must stay exactly `100dvh`.
4. **Hero numeral not clipped** by its overflow-hidden wrapper (the
   numerals clamp, never silently cut).
5. **No overlapping interactive controls** (buttons, links, inputs, roles,
   pagination bullets, map controls) — nested elements excluded. Pairs are
   reported; currently only the two simultaneous sonner warning toasts
   overlap, which is sonner's designed bottom-anchored mobile stacking
   (front toast fully tappable), so it is recorded as a note, not a
   failure.
6. **No unexpected JS errors.** Console `error` and uncaught `pageerror`
   are collected; expected noise (blocked APIs in `*-cache-banner`,
   failed sub-resource loads) is filtered.

Any assertion failure sets a non-zero exit code (CI-able) and names the
offending elements.

## Running

Prerequisites: `playwright-core` (dev dependency, exact-pinned) and its
Chromium browser installed once:

```bash
pnpm install --ignore-scripts
pnpm exec playwright-core install chromium    # only needed once per machine
npm run audit:viewports
```

`npm run audit:viewports` (alias `node scripts/audit/audit-viewports.mjs`):

- builds a dev-mode bundle (`vite build --mode development` with
  `NODE_ENV=development`, which keeps the app's `window.__devWarnings`
  simulator available for the alert state and skips the Carto key
  requirement),
- boots `vite preview` on port 4173,
- walks the matrix with headless Chromium,
- writes screenshots + `results.json` into `scripts/audit/shots/`
  (gitignored — screenshots are review artifacts, not source).

Flags:

```
--no-build        reuse existing dist/ (after a code change, rebuild manually or drop the flag)
--build           force a fresh build
--state s1,s2     restrict states
--width 375,393   restrict to listed widths
--shots-only      capture screenshots without failing on assertions
```

Port override: `AUDIT_PORT=4300 npm run audit:viewports`.

## Data determinism

Every network dependency is stubbed from recorded fixtures in
`fixtures/` (see its README):

- Open-Meteo forecast responses for the three cities, shifted at runtime so
  the recorded payload behaves like a live snapshot (sun strip, trend
  caption and charts anchor on "now");
- HKO `fnd` / `rhrread` / `warnsum` for the HK merge path;
- a synthetic 2-step HKO nowcast CSV (the HK map's timeline + legend render
  without a ~2.7 MB download);
- every map tile (Carto basemap style + tiles, GeoMet WMS) → a flat grey
  256×256 PNG;
- geocoding/Nominatim/`_vercel` endpoints → inert responses.

No API key, no network access and no service worker (registration is
stubbed out) are needed, so the run is reproducible from a clean checkout.

## Visual review

The numeric checks catch page-level regressions; they cannot judge
"cramped but not overflowing", dead space at the wide end, or tap-target
comfort. Open `scripts/audit/shots/<state>@<width>x<height>.png` for those
judgments after each run. The 72 matrix screenshots cover every state at
every width.
