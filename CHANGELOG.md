# Changelog

User-visible changes shipped to the app. Internal refactors, test additions, and dev-only tooling are noted in `handoff/` and git history.

The format loosely follows [Keep a Changelog](https://keepachangelog.com/): each entry is a date with grouped subsections (Added / Changed / Fixed / Notes). Versions are not formal; entries are ordered newest-first.

## Unreleased

### Added
- **Share the forecast with friends.** A new share icon in the 7-day
  forecast card composes the upcoming days into a short message —
  "Weather in Hong Kong for the coming days: ☀️ Sat, Sep 19 · Clear
  sky · 24–28°C 🌧️ Sun, Sep 20 · Light rain · 60% rain …" plus a link
  to the app — and opens the phone's share sheet so you can send it
  straight to the group chat before an outdoor event. On devices
  without a share sheet the message is copied with a confirmation
  toast, ready to paste. Temps follow your unit setting and the
  message renders in English or Traditional Chinese to match the app.
- **Rain-start banner ("when will it rain?").** A thin strip above the
  at-a-glance row reads "Rain expected around 15:30 · in ~45 min" or
  "Raining now · easing around 17:00", with a small
  upcoming-precipitation bar strip labelled "next 6 h" — and hides
  itself when no rain is expected within that span. Text and bars scan
  the same 6-hour span; bar height scales with the
  rain amount in each window and the bar where rain begins is
  highlighted. It merges two
  free sources with complementary strengths: the HKO gridded nowcast
  (0–2 h, ~1 km cells — district-accurate) and Open-Meteo's 15-minute
  precipitation series, which now arrives inside the existing weather
  fetch (no extra request). Open-Meteo's model grid
  is city-scale (~8 km cells — Kwun Tong and Central get the same
  forecast), so segments it backs carry a location-neutral "city-scale"
  qualifier (城市尺度預報) instead
  of implying district precision. The banner reads the rain map's cached
  data when available (upgrading the 0–2 h segment to district accuracy)
  and never triggers the 2.7 MB nowcast download itself. Both English
  and Traditional Chinese.
- **Offline indicator in the top bar.** A small amber "Currently offline"
  chip appears next to the clock the moment the browser reports it is
  offline, and disappears when connectivity returns — at which point the
  weather refetches automatically in the background. Previously the app
  only told you about connectivity after a refresh actually failed (the
  red cached-data banner); the chip is the proactive heads-up that pairs
  with it. Reuses the banner's wording in both languages.
- **Text size setting in the menu (Small / Medium / Large).** A new pill in
  the settings menu scales the whole UI by setting the root font-size
  (80% / 100% / 125% of the browser default), so every rem-based
  Tailwind size — text, spacing, icons, tap targets — rescales together:
  `Small` fits more on low-resolution phones, `Large` reads better. The
  choice persists in localStorage and is applied before first paint (no
  flash of the default scale). `Medium` is the previous look, unchanged.
  The few fixed-px text utilities (hero numerals, kicker labels, small
  captions) were converted to rem so they scale too; chart-internal SVG
  label sizes are intentionally left fixed to avoid label collisions in
  the fixed chart geometry.

### Changed
- **At-a-glance strip: rain jumps to the nowcast, arrow removed.** The
  rain-percentage chip (shown when the chance is ≥ 20 %) is now its own
  button that takes you straight to the rainfall nowcast pane — the map
  slide on mobile, the bottom map section on desktop — where the
  2-hour radar-based forecast lives. Outside nowcast coverage (no PRD or
  Vancouver pane) the chip stays plain text. Each day's temperature group
  keeps its old behavior (reveals the full daily forecast), and the
  down-arrow at the end of the strip is gone — the row now reads as two
  plain controls. Rain-chip labels are full sentences for screen readers
  in both languages ("Rain chance 80%. View the rainfall nowcast map.").
- **Hero temperature caption now reads low → high.** The muted line under
  the hero ("L 24°C · H 32°C · 3° warmer by 03:00 PM") previously led with
  the high; the low now comes first, left to right, in both the visible
  caption and its screen-reader label (en + tc).
- **At-a-glance strip now covers today, not just tomorrow.** `TomorrowGlance`
  is `AtAGlance`: the thin strip between the hero and the hourly/daily
  split (above the swipe deck on mobile) summarises `daily[0]` and
  `daily[1]` in the same per-day format (range, rain ≥ 20 %). Each
  day is one group — kicker, icon, low/high, rain — and the groups
  share a line when they fit and wrap to one line per day on narrow
  screens; the row stays a single button (full per-day sentence in the
  `aria-label`, joined by "; "). The range reads low → high, matching the
  hero caption. A missing or sentinel day is skipped, so partial
  forecasts degrade to a single-day strip.
- **Wind removed from the at-a-glance strip.** The strip now reads kicker,
  icon, low/high, rain ≥ 20 % per day — the wind clause crowded narrow
  screens (it already hid below 360 px). Wind is unchanged on the daily
  forecast cards and in the hourly chart, and the screen-reader sentence
  drops the wind clause to match what is shown.

### Fixed
- **HK daily wind no longer shows 0 km/h.** The HKO daily forecast does
  not publish wind, so the parser seeds `windSpeedMax: 0` placeholders;
  the Open-Meteo merge only backfilled sunrise/sunset, so the 0 leaked
  into the at-a-glance strip and the daily cards (today's day-max read 0
  while the live wind was, say, 13 km/h). The merge now backfills wind
  speed + direction from Open-Meteo for HKO daily rows, as the parser
  comment always intended. (The HKO-only fallback, used when Open-Meteo
  is fully down, still has no wind source and keeps 0.)
- **Narrow-phone overflow in the rainfall map timeline.** The nowcast step
  labels in both map cards (HKO + MSC) sat in a single `justify-between`
  flex row sized to its content, so the MSC map's many GeoMet steps pushed
  the row past the card edge on 375–402 px iPhones and clipped against the
  card's `overflow-x: hidden`. The step row now scrolls horizontally
  (hidden scrollbar) when it outgrows the card, and the flex column holding
  it got `min-w-0` so the scroll rail can actually constrain. Caught by the
  new viewport audit (below).
- **Full-bleed PWA no longer collides with the notch / home indicator.**
  The viewport meta now includes `viewport-fit=cover` (iOS Safari + the
  standalone PWA previously letterboxed the app instead of using the full
  display), and the app column pads with `env(safe-area-inset-*)` on all
  four edges, so header actions clear the status bar / Dynamic Island and
  the bottom pagination + footer clear the home indicator. On browsers
  without a device inset the padding is unchanged.

### Notes
- **Responsive viewport audit tooling.** `npm run audit:viewports` walks
  the app at every iPhone portrait logical width (375 → 440 CSS px,
  including 402×874 and 375×812) across the main route, both rainfall-map
  slides, settings, alert badges/toasts and the offline banner, asserting
  no page-level horizontal overflow, no vertical page scroll, no clipped
  hero numerals and no overlapping interactive controls. Runs offline on
  recorded fixtures; screenshots land in `scripts/audit/shots/`. See
  `scripts/audit/README.md`. 72/72 checks pass at write time.


### Fixed
- **Intermittent blank map on mobile** when clicking "Load Map" for the nowcast rainfall card. Leaflet's constructor reads the container's bounding rect synchronously, so a map mounted against a 0x0 container (common during a Swiper slide transition or iOS Safari URL-bar hide/show) ends up with a 0x0 viewport that never recovers on its own. The basemap renders as `bg-muted/20` and the rainfall cells paint into an invisible canvas. Fix: `map.invalidateSize()` on the next frame after the ref lands, plus a `ResizeObserver` on the map container so subsequent size changes (URL bar toggle, orientation, slide re-entry) re-layout the map.
- **Cold-start snapshot crash on upgrade.** Snapshot schema bumped to v2 (drops legacy v1 envelopes missing `headline`); `CurrentWeatherProps.headline` made optional with an OM default as a defensive guard.

### Added
- **HKO-native headline icon + label** for HK coordinates when both Open-Meteo and HKO are live. The hero now reads HKO's own icon taxonomy (50–93), which is more granular than WMO 4677 for current conditions: night variants (70–77), special atmospheric states (`Windy` 80, `Dry` 81, `Humid` 82, `Fog` 83, `Mist` 84, `Haze` 85), and temperature states (`Hot` 90, `Warm` 91, `Cool` 92, `Cold` 93). For example, on a humid HK day the headline now reads `Humid` instead of the lossy WMO-mapped `Moderate rain` that the previous path produced.
- **`HeadlineInfo` polymorphism** on `WeatherData`. `headline.source` is `'hko' | 'om'`; when `'hko'`, `headline.hkoIconCode` carries the source code. Always present; non-HK paths write `{ source: 'om' }`.

### Changed
- **Night headline labels renamed** from HKO's `Fine` to natural English (`Clear` / `Clear periods` / `Clear intervals` / `Clear periods with a few showers` / `Clear intervals with showers`). HK-English visitors and local users don't recognise `Fine` as the nighttime counterpart to `Sunny`; the new wording parallels the daytime labels and matches `Sunny ↔ Clear`. HK Traditional Chinese parallels: `天晴` ↔ `天晴` (same character for both; the day/night split is carried by the lucide `Sun`/`Moon` icon, as in HKO's reference wording).
- **HK Traditional Chinese HKO descriptions** reworked to follow HKO conventions. The biggest fix: `hko.desc.sunnyIntervals` (code 52) was previously set to `陽光驟雨` (HKO's wording for code 54, "Sunshine + showers"); now `部分時間有陽光` for 52, with 54 keeping `陽光驟雨`. Day/night parallels now share vocabulary (50/70 = `天晴`, 51/71 = `短暫天晴`, etc.).

### Notes
- **Headline only.** Daily forecast tiles still use lossy WMO labels. This plan improves the hero rendering because that's where users scan first; the daily strip continues to look up HKO daily icons through the legacy `hkoIconToWeatherCode()` translator (`src/lib/hko-fetch.ts`). The asymmetry is intentional (decision in `handoff/hko-headline-icon-plan.md` Decision 1) and is the most likely surprise for HK users: daily-tile icons may show `Moderate rain` while the hero reads `Humid`. Documented in plan Risk #4.
- **HKO icon schema drift guard.** If HKO returns the sentinel `9999` (or `NaN`, or an empty array) on the `Icon` field, the headline falls through to the WMO path. Verified by `weather-manager.test.ts` "headline propagation" block (5 sentinel-fallback cases).
- **TC review status.** No named HK TC reviewer at write time. Strings follow HKO conventions but should be confirmed by a native HK Traditional Chinese speaker before any user-facing announcement. See `handoff/hko-headline-icon-plan.md` Phase 4 blocker.
- **Scope is HK + both sources live only.** PRD region continues to use Open-Meteo (no PRD-data-layer change here). Non-HK coordinates use Open-Meteo. The HKO-only fallback path (`fallbackSource: 'HKO'`) picks up the headline swap mechanically. A broader overhaul of that path is a separate plan (Decision 14).
- **No new dependency.** HKO icon mapping uses `Wind`, `Droplets`, `ThermometerSun`, `ThermometerSnowflake` from the existing `lucide-react@0.462.0`; verified at plan write. The defensive `?? Cloud` fallback in `getHKOIconNode` stays as cheap insurance against future lucide removals.
- **Test coverage.** 323 / 323 vitest cases pass. Coverage details in `handoff/hko-headline-icon.md`.

## Earlier history

Pre-2026-08-02 work is documented in `ARCHITECTURE.md` and per-feature handoff docs under `handoff/`. Notable prior milestones:
- `feat/us-metrics-support`: metric ↔ US unit toggle
- `feat/api-boundary-parsers`: tolerant API-boundary parsing with shape-drift logging
- `feat/a11y-low-hanging-fruit`: WCAG 2.1 AA fixes from the ada-compliance plan
- `feat/editorial-app`: paper-cream editorial redesign + mobile swiper deck
