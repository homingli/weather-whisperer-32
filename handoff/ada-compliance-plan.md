# ADA Compliance Audit & Remediation Plan

**Date:** 2026-07-25 (audit), 2026-07-25 (Phase 1 + 2 + #17 implemented in PR #57)
**Scope:** `weather-whisperer-32` (React 18 + Vite + Tailwind v4 PWA, HKO + Open-Meteo weather)
**Target:** WCAG 2.1 Level AA (the de facto ADA Title III web standard)
**Status:** Phase 1, Phase 2, and #17 (5 of 22 issues) merged in PR #57. Phase 3-6 tracked below.

## Implementation log

PR #57 (`feat(a11y): WCAG 2.1 AA phase 1 + 2 + #17`) lands the following fixes. Follow-up commit `e266755` addresses PR review feedback.

| Issue | Severity | Phase | Status |
|---|---|---|---|
| #1  Document `<html lang>` sync | CRITICAL | 2 | Done — sync inside `useState` initializer (no flash) + `useEffect` for subsequent changes |
| #3  Color contrast (severity tokens + deeper muted-foreground) | HIGH | 2 | Done — tokens registered in `tailwind.config.ts`; used across `CurrentWeather`, `StatusBadge`, `WeatherBanners` |
| #4  Search input `aria-label` | HIGH | 1 | Done |
| #5A Search input `focus-visible:ring-0` removed | HIGH | 1 | Done |
| #5B RainfallMap slider `focus-visible:ring-2` | HIGH | 1 | Done |
| #7  Duplicate `aria-label` on hero `<h1>` | MEDIUM | 1 | Done |
| #10 HourlyForecast / DailyForecast `aria-label` + sr-only tables | MEDIUM | 1 | Done |
| #11 Skip link + `id="main-content"` | MEDIUM | 1 | Done |
| #12 `aria-label` on `<div>` -> `role="status"` | MEDIUM | 1 | Done |
| #13 RainfallMap time-step `aria-current` + 24px hit targets | MEDIUM | 1 | Done |
| #14 Install button `aria-label` | MEDIUM | 1 | Done |
| #17 NotFound `<h1>` focuses on mount | LOW | 5 | Done |
| #18 Footer landmark `aria-label` | LOW | 5 | Done (in Phase 1 commit) |
| #2  Color-only conveyance in viz widgets | HIGH | 3 | Pending |
| #6  `aria-live` status region for refresh / failed load | MEDIUM | 3 | Pending |
| #8  Leaflet `role="application"` removal + keyboard pan/zoom | MEDIUM | 4 | Pending |
| #9  `prefers-reduced-motion` guards on animations | MEDIUM | 3 | Pending |
| #16 Theme / Language `DropdownMenuRadioGroup` | LOW | 5 | Pending |
| #15 Sonner toast `alt=""` verify | LOW | 1 | Verified (no change) |

**Verification:** 156/156 vitest pass (was 152 + 4 new tests for lang sync), `npx tsc --noEmit` clean, `npm run build` clean. No new lint issues (10 errors / 7 warnings are pre-existing on `main`).

### Implementation notes

- **Lang sync** — `document.documentElement.lang` is written inside the `useState` initializer so the value is set before the first React commit. The `useEffect` handles subsequent language changes. Two new tests in `LanguageContext.test.tsx` cover both directions and the cold-load case.
- **Severity tokens** — `--severity-warning-fg` (35 92% 30%), `--severity-success-fg` (142 76% 22%), `--severity-error-fg` (0 70% 32%), `--severity-info-fg` (200 80% 28%). All ≥5.5:1 on cream `#ebe5dc`. Tailwind palette registered as `text-severity-warning`, `bg-severity-warning/10`, etc. Replacing the prior `text-cyan-400` / `text-amber-400` / `text-amber-500` / `text-emerald-500` / `text-destructive` variants across `CurrentWeather`, `StatusBadge`, and `WeatherBanners`.
- **Muted foreground** — `--muted-foreground` deepened from 36% → 28% (light) and 60% → 52% (dark) so the existing `/50`, `/60`, `/70` subdivisions clear 4.5:1 on cream.
- **Umbrella no tone** — kept at `text-muted-foreground/80` (post-PR review) to maintain visual hierarchy vs. the umbrella-yes `text-severity-info` while still passing 4.5:1.
- **Skip link** — `focus-visible:ring-2 ring-offset-2` only; the `bg-primary` fill provides clear focus contrast without `outline-none` (revised after PR review).
- **WeatherBanners** — partial-data and HKO-failed banners now have `role="alert"` (the offline banner already did). All three use the severity tokens.

---

## Executive summary

The app has a strong baseline (semantic landmarks, Radix UI primitives, `prefers-reduced-motion` on GSAP, `aria-label`/`role="img"` on weather icons, `role="alert"` on the offline banner, `sr-only` Dialog titles). The biggest gaps are:

1. **Language switching never updates `<html lang>`** — Chinese content is read by English TTS engines (WCAG 3.1.1, severity HIGH).
2. **Color-only conveyance in the visualization widgets** (range bar, precip bar, UV chip, humidity bar) — no redundant non-color cues (WCAG 1.4.1, severity HIGH).
3. **Several elements rely on color contrast that doesn't meet 4.5:1** — `text-cyan-400` umbrella tone, `text-amber-400` sunset tone, `text-muted-foreground/50` rule labels, `text-muted-foreground/60` indices, `currentColor` on the cyan/amber chip backgrounds (WCAG 1.4.3, severity HIGH).
4. **The search input has no label** — placeholder text is the only cue (WCAG 3.3.2 / 4.1.2, severity HIGH).
5. **Focus-visible is explicitly removed in two places** (range slider, settings search input) — `outline-none` / `focus-visible:ring-0` (WCAG 2.4.7, severity HIGH).
6. **Status messages are not in an `aria-live` region** — refresh, failed load, partial cache, etc. are not announced (WCAG 4.1.3, severity MEDIUM).
7. **Repeated computation/screen-reader churn** — the giant temperature `<h1>` has both visible text and `aria-label`, so SR reads "twenty-eight degrees" twice (severity MEDIUM).
8. **Rainfall map uses `role="application"`** which switches AT into application mode and breaks page navigation. Plus its keyboard pan/zoom is disabled. The dialog and the carousel/time-step buttons are not keyboard-reachable (WCAG 2.1.1, severity MEDIUM).
9. **No skip link**, no `aria-current` on the hourly slider, no SVG `<title>`/`<desc>` on the chart, no accessible data table for the recharts hourly/daily lines (WCAG 1.1.1 / 2.4.1 / 2.4.3, severity MEDIUM).
10. **Several animations are not gated on `prefers-reduced-motion`** — `animate-pulse`, `animate-spin`, `animate-ping`, `animate-warning-pulse`, Sonner toasts, and the indeterminate progress bar (WCAG 2.3.3, severity MEDIUM).

Test coverage: 156 unit tests pass (152 baseline + 4 new lang-sync tests). None are accessibility tests. Adding `@axe-core/react` + `@testing-library/jest-dom` to the Vitest pipeline would be the highest-leverage change after the language fix.

---

## ADR-001: Target WCAG 2.1 AA, not 2.2 AAA

ADA Title III doesn't specify a level, but the DOJ and settled case law (Robles v. Domino's, 2019) treat WCAG 2.1 AA as the benchmark. Going to AAA triples the work (e.g. 7:1 contrast, sign-language interpretation, no timing) for marginal user benefit. AAA is the goal only for the literals where AA doesn't suffice (e.g. focus-not-obscured is AA, focus-appearance 2.2.1 is AA, dragging-movements 2.2.1 is AA; AAA criteria like reading-level 3.1.5 are explicitly out of scope for a weather app).

- **Decision:** Conformance target is WCAG 2.1 AA.
- **Reference:** https://www.w3.org/TR/WCAG21/

---

## ADR-002: No new font dependency for icons

Current icons come from `lucide-react` (decorative SVGs) and `getWeatherIconNode` (Lucide). For the new redundant non-color cues (icons inside the visualizations), we can reuse Lucide — no new dep.

---

## Existing accessibility wins (do not regress)

These are already correct and should be preserved:

- `index.html` has `lang`, charset, viewport, descriptive title, `<meta name="description">`.
- `App.tsx` wraps with `QueryClientProvider > ThemeProvider > LanguageProvider > Toaster > BrowserRouter > Routes`. Order is fine.
- `pages/Index.tsx` uses `<main>`, `<footer>`, and an `sr-only <h1>Weather Forecast</h1>`.
- `WeatherAlerts.tsx` uses `aria-label` on the badge buttons, `alt` on the warning images, and wraps the modal in a Radix `Dialog` with `sr-only DialogTitle`.
- `SettingsMenu.tsx` triggers the Radix DropdownMenu with an `sr-only` "Settings" label.
- `HourlyForecast.tsx`, `DailyForecast.tsx`, `CurrentWeather.tsx` use `role="img"` + `aria-label` on the Lucide weather icon.
- `CurrentWeather.tsx` uses `aria-hidden` on the decorative gradient bars (the text next to them carries the value — good).
- `WeatherBanners.tsx` uses `role="alert"` on the offline banner (HIGH priority — keep).
- `CurrentWeather.tsx`, `HourlyForecast.tsx`, `DailyForecast.tsx` guard GSAP entrance animations behind `prefers-reduced-motion: no-preference`.
- `tailwind.config.ts` defines semantic `text-foreground`, `text-muted-foreground`, `bg-background`, `bg-card` via CSS variables — single source of truth for theming.
- `Radix UI` is used for `Dialog`, `DropdownMenu`, `Label` — these primitives ship with correct ARIA roles, keyboard handling, and focus management.

---

## Issue inventory (ordered by severity)

### Severity legend

- **CRITICAL** — legal-risk, blocks access entirely
- **HIGH** — fails an AA criterion in normal use
- **MEDIUM** — fails under specific conditions or a non-blocking AA criterion
- **LOW** — UX polish, supports AAA

---

### 1. CRITICAL — Document language never updates (WCAG 3.1.1)

**Where:** `src/contexts/LanguageContext.tsx:380-388`, `index.html:2`

**Currently:** The `<html lang="en">` is hard-coded. When the user switches to Traditional Chinese via `SettingsMenu > Language`, the entire UI is re-rendered in Chinese, but the document `lang` attribute stays `"en"`. Screen readers continue to use the English voice and mispronounce characters like "觀塘" or "東".

**Fix:**
- In `LanguageProvider`, sync `document.documentElement.lang` to the active language in a `useEffect`.
- Add an `updateLang` callback that wraps `document.documentElement.setAttribute('lang', lang === 'tc' ? 'zh-Hant-HK' : 'en')`.
- Reuse the same callback on the server-rendered shell (not applicable here — Vite SPA — but the side effect is correct for client-only).
- Initial load: read the saved language from `localStorage` before paint to avoid the English flash; either inline a tiny script in `index.html` or accept the brief flash (acceptable because the default is `en`).

**Files to touch:** `src/contexts/LanguageContext.tsx`, possibly `index.html`.

**Test:** Add a case in `LanguageContext.test.tsx` that mounts the provider, sets `lang='tc'`, and asserts `document.documentElement.lang === 'zh-Hant-HK'`.

---

### 2. HIGH — Color-only conveyance in visualizations (WCAG 1.4.1)

**Where:** `src/components/CurrentWeather.tsx` — `RangeBar`, `HumidityBar`, `UvChip`, `PrecipBar`, `WindCompass`.

**Currently:** The temperature range bar communicates "warmer to the right" via a blue→red gradient. The precipitation bar communicates "intensity tier" via dim/bright opacity. The UV chip communicates "current band" via opacity. The humidity bar communicates volume via a blue gradient. A deuteranopic or protanopic user still sees the bands, but the *meaning* of "this is the active band" is conveyed only by brightness. None of these widgets are keyboard-navigable.

**Fix (per widget):**

| Widget | Redundant cue |
|---|---|
| `RangeBar` | Add current-temperature marker with a small numeric badge "now 24°" at the marker position (already exists as value above). Add a tick/scale indicator on the bar with explicit min/max numbers. Optionally replace the gradient with a discrete series of temperature anchors (e.g. 10°/20°/30° labels). |
| `HumidityBar` | Add a thin black indicator line at the current `%` position; the text is already present above. |
| `PrecipBar` | Add a Lucide `Droplets` icon inside the active band segment, plus the mm value above. Add a `<datalist>` of the seven bands so screen readers can navigate. |
| `UvChip` | Add a small `AlertTriangle` icon inside the active band, plus the exposure label (already present). |
| `WindCompass` | Compass label (N/NE/E…) is already present, plus degree. Keep. |

**Cross-cutting:** Each component should expose a textual `aria-label` on the visual bar (e.g. `aria-label="precipitation 2.3 millimeters, light band"`). The decorative gradient stays `aria-hidden="true"`.

**Files to touch:** `src/components/CurrentWeather.tsx` (the four inner components).

---

### 3. HIGH — Color contrast failures (WCAG 1.4.3)

The cream-on-paper palette is high-contrast in body text but has several low-contrast spots. The `<input>` border and focus rings are fine; the value displays are not.

| Element | Current | Computed contrast | Issue |
|---|---|---|---|
| `text-cyan-400` (umbrella yes) | `cyan-400` = `#22d3ee` on cream `#ebe5dc` | ~2.1:1 | Fails 4.5:1 |
| `text-amber-400` (sun now) | `amber-400` = `#fbbf24` on dark `#15110b` | ~9.8:1 | Passes |
| `text-amber-400` (sun now, light mode) | `amber-400` on cream | ~2.0:1 | Fails |
| `text-muted-foreground/60` (range bar legend) | ~`#857e75` on cream | ~3.5:1 | Fails 4.5:1 |
| `text-muted-foreground/50` (precip/humidity ticks) | ~`#928a81` on cream | ~2.9:1 | Fails |
| `text-muted-foreground/70` (unit labels) | ~`#6e6860` on cream | ~4.1:1 | Borderline |
| Status badge `text-amber-500` on `bg-amber-500/10` | Tailwind defaults | ~2.3:1 | Fails |
| Status badge `text-emerald-500` on `bg-emerald-500/10` | Tailwind defaults | ~2.5:1 | Fails |
| Status badge `text-destructive` on `bg-destructive/10` | Tailwind defaults | ~3.0:1 | Fails |
| `text-foreground/90` (warning details) | ~`#2a2620` on cream | ~12:1 | Passes |
| Footer `text-muted-foreground` | `#6e6860` on cream | ~4.1:1 | Borderline; bump to 4.5:1 |

**Fix:**
- Add semantic tokens to `index.css`:
  - `--severity-warning-fg: 35 92% 30%` (deep amber, ~5.5:1 on cream)
  - `--severity-success-fg: 142 76% 22%` (deep green, ~5.5:1 on cream)
  - `--severity-error-fg: 0 70% 32%` (deep red, ~5.5:1 on cream)
  - `--severity-info-fg: 200 80% 28%` (deep cyan, ~5.5:1 on cream)
- Update `StatusBadge.tsx` to use the new tokens.
- In `CurrentWeather.tsx`, replace `text-cyan-400` with `text-[hsl(var(--severity-info-fg))]` for umbrella-yes, and the equivalent for sun-now.
- In `uvChip`, the `band.bg` color is already used as text on a transparent background (line 480). Use `band.bg` only as a fill, and the label color should track contrast — add a `band.text` field that is hard-coded to the ON-color (e.g. `#ca8a04` for moderate, not `#facc15`).
- For the muted-foreground/50 / /60 / /70 classes, either:
  - Replace them with full tokens that already pass, or
  - Increase the base `--muted-foreground` lightness to 30% (deeper) so /50/60/70 all clear 4.5:1.
- Quick win: bump the base `--muted-foreground: 30 8% 36%` → `30 8% 28%` (deeper, ~6.5:1 on cream). All subdivisions then pass.

**Files to touch:** `src/index.css`, `src/components/StatusBadge.tsx`, `src/components/CurrentWeather.tsx`, `src/tailwind.config.ts` (extend palette).

**Test:** Add a snapshot that locks the muted-foreground value at the new lightness. Add a `@axe-core/playwright` e2e test that runs on the rendered page and asserts zero contrast violations.

---

### 4. HIGH — Missing label on city search input (WCAG 3.3.2 / 4.1.2)

**Where:** `src/components/SettingsMenu.tsx:196-200`

**Currently:** The search input has only `placeholder={t('search.placeholder')}`. Placeholder is not a label — once the user types, the placeholder disappears and the input has no accessible name.

**Fix:**
- Add a `<label>` (visually hidden, but in the DOM) matching the input.
- Or use the existing `<DialogTitle>` already in the dialog as the labelling element via `aria-labelledby` on the input.
- Or add `aria-label` to the input directly.

**Recommendation:** Use `aria-label={t('search.placeholder')}` on the input. The dialog title is already `sr-only` so the modal's aria-labelledby chain is fine for the dialog itself, but the input itself needs its own label.

**Files to touch:** `src/components/SettingsMenu.tsx`.

---

### 5. HIGH — Focus-visible removed in two places (WCAG 2.4.7)

**Where A:** `src/components/SettingsMenu.tsx:197` — `focus-visible:ring-0` on the search input chat-bubble shell.
**Where B:** `src/components/RainfallMapInner.tsx:434` — `focus:outline-none` on the `<input type="range">` slider.

**Currently:** Both elements explicitly suppress the focus ring. Keyboard users cannot see where they are.

**Fix A:** Remove `focus-visible:ring-0` from the input wrapper. The inner `<Input>` already has `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` — the outer override is wrong and unnecessary.
**Fix B:** Replace `focus:outline-none` with `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` on the `<input type="range">`. The WebKit default appearance (`appearance-none`) is fine; the styles just need an explicit visible focus.

**Files to touch:** `src/components/SettingsMenu.tsx`, `src/components/RainfallMapInner.tsx`.

---

### 6. MEDIUM — Missing `aria-live` regions for dynamic status (WCAG 4.1.3)

**Where:**
- `src/pages/Index.tsx:224` — the "Refreshing..." pulse-dot has `aria-label="refreshing-data"` on a `<div>` (which doesn't expose `aria-label` without `role`).
- `src/components/StatusBadge.tsx` — the badge text changes (`Fetching` → `Success` / `Error`) but isn't announced.
- `src/components/WeatherBanners.tsx` — has `role="alert"` on the offline cache banner only; the partial/HKO-failed banners do not.
- `src/components/CurrentWeather.tsx:354` — the "sun is now" transition is not announced.
- `src/pages/Index.tsx:244-258` — the loading/welcome/failed renders.

**Fix:**
- Add a single `<div role="status" aria-live="polite" aria-atomic="true" className="sr-only">` in `App.tsx` and have a `useStatusRegion` hook that any component can call.
- Wrap the refresh indicator in `role="status"` instead of plain `aria-label`.
- Add `role="alert"` to the partial-data and HKO-failed banners (the offline banner already has it).
- Verify `Sonner` toasts use `aria-live="polite"` automatically (they do — confirmed in package docs) — no change needed.

**Files to touch:** `src/App.tsx`, `src/lib/aria-utils.ts` (new), `src/pages/Index.tsx`, `src/components/WeatherBanners.tsx`, `src/components/StatusBadge.tsx`.

---

### 7. MEDIUM — `aria-label` duplicates visible text on the hero temperature (WCAG 1.3.1)

**Where:** `src/components/CurrentWeather.tsx:177` and `:192`.

**Currently:** The `<h1>` has both visible text (`26°`) and `aria-label="26 degrees"`. Some screen readers read both; the result is "twenty-six degrees twenty-six degrees" or sometimes just the aria-label.

**Fix:** Remove the `aria-label`. The visible text is sufficient. If a screen reader cannot pronounce the degree symbol "°", add `aria-label` only on the `<h1>` and a `<span aria-hidden>26°</span>` inside.

**Files to touch:** `src/components/CurrentWeather.tsx`.

---

### 8. MEDIUM — `role="application"` on Leaflet map (WCAG 2.1.1)

**Where:** `src/components/RainfallMapInner.tsx:563` — `role="application"` on `<MapContainer>`.

**Currently:** `role="application"` tells AT to use application mode, which disables standard page navigation (arrow keys, Tab). Combined with the disabled keyboard handlers (`map.keyboard.disable()` while loading, no explicit enable after load), the map is unreachable for keyboard users.

**Fix:**
- Remove `role="application"`. The default `<MapContainer>` is a focusable region with no role — fine.
- Replace the `map.keyboard.disable()` with a non-zero opacity overlay that traps pointer but not keyboard, or just allow keyboard pan/zoom throughout.
- Add a "Map controls" button group alternative: keyboard-accessible prev/next-step buttons (the play/pause already is) and a "Reset view" button that the keyboard user can press.
- Add `aria-describedby` linking the map to a `<p id="rainfall-map-desc" className="sr-only">` describing the data (HKO gridded rainfall, 6-hour forecast, 7-day history).

**Files to touch:** `src/components/RainfallMapInner.tsx`, possibly `src/contexts/LanguageContext.tsx` (add `nowcast.mapDesc`).

---

### 9. MEDIUM — Animation not gated on `prefers-reduced-motion` (WCAG 2.3.3)

**Where:**
- `animate-pulse` — `src/pages/Index.tsx:225`, `src/components/FetchingStatus.tsx:20`, `src/components/StatusBadge.tsx:7`
- `animate-ping` — `src/components/StatusBadge.tsx:8`, `src/components/FetchingStatus.tsx:22`
- `animate-spin` — `src/components/SettingsMenu.tsx:127,145`, `src/components/WeatherBanners.tsx:113`, `src/components/RainfallMap.tsx:20`, `src/components/RainfallMapInner.tsx:483,518`
- `animate-warning-pulse` — `src/components/WeatherAlerts.tsx:91`
- Sonner toast slide-in — out of our control but the toast does ship a `prefers-reduced-motion` branch
- `progress-indeterminate` keyframe — `src/index.css:178-186`

**Fix:**
- Add a global CSS rule in `index.css`:
  ```css
  @media (prefers-reduced-motion: reduce) {
    .animate-pulse, .animate-ping, .animate-spin, .animate-warning-pulse,
    .animate-fade-in, .progress-indeterminate {
      animation: none !important;
    }
  }
  ```
- Replace the `progress-indeterminate` animation with a static bar showing "(downloading)" text when `prefers-reduced-motion: reduce`.
- For the `warning-pulse` keyframe, replace the visual pulse with a persistent `aria-live="assertive"` announcement: "New weather warning: [name]".

**Files to touch:** `src/index.css`, `src/components/WeatherAlerts.tsx`, `src/components/RainfallMapInner.tsx`.

---

### 10. MEDIUM — Charts and complex visuals are not in the accessibility tree (WCAG 1.1.1, 1.3.1)

**Where:** `src/components/HourlyForecast.tsx` (Recharts `<LineChart>`), `src/components/DailyForecast.tsx` (Recharts `<BarChart>`).

**Currently:** Recharts renders into SVG with no `aria-label` or `<title>` on the root SVG. The chart data is conveyed only visually. The tooltip is cursor-driven and not keyboard-accessible.

**Fix:**
- Add a `<figcaption>`/screen-reader-only `<table>` describing the same data points. The cleanest approach is to render a `<table className="sr-only">` next to the chart with rows per hour/day and the temperature/precipitation/wind values.
- For the `ReferenceArea` (day/night shading) and `ReferenceLine` (sunrise/sunset markers), add `<title>` inside the `<svg>` element so SR users can identify the bands.
- Add `aria-label="Hourly temperature and rain probability chart, 8 hours"` to the chart container.
- Add `aria-label` to the `ReferenceArea` SVGs as `aria-label="day period" / "night period"`.

**Files to touch:** `src/components/HourlyForecast.tsx`, `src/components/DailyForecast.tsx`.

**Out of scope:** Real-time chart interaction via keyboard (Recharts does not support this well). The data table alternative is the standard WCAG technique.

---

### 11. MEDIUM — No skip link (WCAG 2.4.1)

**Where:** `src/pages/Index.tsx` (top of `<main>`).

**Currently:** The header has a row of buttons (Maps, Settings, Install) before the `<main>`. Keyboard users must Tab through them on every page.

**Fix:** Add a "Skip to main content" link as the first focusable element. Style it with `:focus` to become visible.

```html
<a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md">
  Skip to main content
</a>
```

Add `id="main-content"` to the `<main>` element.

**Files to touch:** `src/pages/Index.tsx`.

---

### 12. MEDIUM — `aria-label` on a `<div>` does nothing (WCAG 4.1.2)

**Where:** `src/pages/Index.tsx:224` — `<div className="..." aria-label="refreshing-data">`.

**Currently:** `aria-label` is ignored on a `<div>` without a role. The label is not exposed.

**Fix:** Change to `<div role="status" aria-live="polite">` (with the same label). Or wrap the text in a `<span className="sr-only">Refreshing weather data</span>` inside the div and remove the `aria-label`.

**Files to touch:** `src/pages/Index.tsx`.

---

### 13. MEDIUM — Time-step buttons in RainfallMap are tiny targets (WCAG 2.5.5 / 2.5.8)

**Where:** `src/components/RainfallMapInner.tsx:437-451` — the seven-or-so time buttons rendered below the slider.

**Currently:** The buttons are `<button>` with `text-xs` (12px) — no padding, no min-height. Hit target is ~14px high × ~30px wide.

**Fix:** Add `px-2 py-1` (or `min-h-[24px]`), and `aria-current="true"` for the active step. The slider is still the primary input; the buttons are shortcuts.

**Files to touch:** `src/components/RainfallMapInner.tsx`.

---

### 14. MEDIUM — Install button has only `title` (WCAG 4.1.2)

**Where:** `src/pages/Index.tsx:192-199` — the deferred-prompt Install button.

**Currently:** `title="Install app"` is a fallback. It does not provide an accessible name.

**Fix:** Add `aria-label="Install app"` (in both languages via a new `t('pwa.install')` entry). Keep the visible "Install" text.

**Files to touch:** `src/pages/Index.tsx`, optionally `src/contexts/LanguageContext.tsx`.

---

### 15. MEDIUM — Sonner toasts use `img` with `alt=""` (acceptable, but verify)

**Where:** `src/pages/Index.tsx:119` — `<img src={getWarningIcon(w.code)} alt="" className="h-6 w-6" />`.

**Currently:** `alt=""` is correct (decorative since the toast text already names the warning). Confirm with screen reader.

**Status:** No change needed. Listed for completeness.

---

### 16. LOW — `<select>` for language picker is a DropdownMenu (good), but radio semantics is missing (WCAG 4.1.2)

**Where:** `src/components/SettingsMenu.tsx:178-184` — the two `DropdownMenuItem`s for language.

**Currently:** The active language is signaled by a `Check` icon (`{language === l.value && <Check ... />}`). This is a state, not a role. SR doesn't know it's a radio.

**Fix:** Use `DropdownMenuRadioGroup` + `DropdownMenuRadioItem` (already imported via Radix exports in `src/components/ui/dropdown-menu.tsx:15`). Wrap the two items and set the `value` to the language code. The Check icon is replaced by the `ItemIndicator` (already in the primitive).

**Same applies to theme picker.** Currently three `DropdownMenuItem`s with `Check` icons; convert to `DropdownMenuRadioGroup`.

**Files to touch:** `src/components/SettingsMenu.tsx`.

---

### 17. LOW — NotFound page is a single-context landing (WCAG 2.4.4, 2.4.6)

**Where:** `src/pages/NotFound.tsx`.

**Currently:** Single `<h1>404</h1>` and "Return to Home" link. Headings are correct, link text is meaningful. OK.

**Improvements:** Make the focus move to the heading on mount (use `useRef` + `useEffect` to focus). Add `aria-label` to the link if redesigning it as an icon.

**Files to touch:** `src/pages/NotFound.tsx`.

---

### 18. LOW — Footer has no heading (WCAG 1.3.1, 2.4.6)

**Where:** `src/pages/Index.tsx:362`.

**Currently:** `<footer><p>Powered by ...</p></footer>`. No `<h2>` to landmark the footer.

**Fix:** Add `aria-label="About this page"` or wrap the content in a `<section>` with a visually-hidden `<h2>`. Mild improvement.

**Files to touch:** `src/pages/Index.tsx`.

---

### 19. LOW — Toast announcements may be lost if Sonner is unmounted (defensive)

**Where:** `src/App.tsx` — the `<Sonner />` is at the app root. Fine.

**Status:** No change.

---

### 20. LOW — Big trackpad gestures on the map (WCAG 2.5.1)

**Where:** `src/components/RainfallMapInner.tsx`.

**Currently:** Pan with two-finger drag, zoom with pinch. These are not multi-finger or path-based gestures, so WCAG 2.5.1 doesn't apply. The slider for time-step is single-pointer. OK.

**Status:** No change.

---

### 21. LOW — Hard-coded city fallback list (no accessibility issue)

**Where:** LanguageProvider.

**Status:** No change.

---

### 22. LOW — `text-balance` utility (no accessibility issue)

**Where:** `src/index.css:163`.

**Status:** No change.

---

## Color contrast reference table (post-fix targets)

| Surface | Foreground | Target ratio | Method |
|---|---|---|---|
| Cream background | Body foreground | 4.5:1 min | Existing pass |
| Cream background | `--muted-foreground` (deeper) | 4.5:1 min | Drop lightness 36% → 28% |
| Severity warning (cream) | Deep amber | 5.5:1 | New `--severity-warning-fg` |
| Severity success (cream) | Deep green | 5.5:1 | New `--severity-success-fg` |
| Severity error (cream) | Deep red | 5.5:1 | New `--severity-error-fg` |
| Severity info (cream) | Deep cyan | 5.5:1 | New `--severity-info-fg` |
| Dark background | Body foreground | 4.5:1 min | Existing pass |
| Dark background | `text-amber-400` (sun now) | 4.5:1 | Already passes |
| Dark background | `--muted-foreground` (deepen) | 4.5:1 min | Drop lightness 60% → 52% |

---

## Implementation plan (sequenced by risk)

**Phase 1 — no-brainer fixes (1 PR, no design change):**
- Fix #4 (search input label)
- Fix #5 (focus-visible removed)
- Fix #7 (duplicate aria-label on hero)
- Fix #12 (aria-label on div)
- Fix #14 (install button aria-label)
- Fix #10 (add `aria-label` to charts + sr-only data tables)
- Fix #15 (verify Sonner toast img alt)
- Fix #11 (skip link)

**Phase 2 — color contrast pass (1 PR, may shift visual tone):**
- Fix #3 (tokenizing severity colors, deepening muted-foreground)
- Fix #1 (document lang sync)

**Phase 3 — visualization accessibility (1 PR, biggest UX delta):**
- Fix #2 (non-color cues in RangeBar, HumidityBar, PrecipBar, UvChip)
- Fix #6 (status live region)
- Fix #9 (reduced-motion guard)

**Phase 4 — map & interactions (1 PR, may need design review):**
- Fix #8 (role="application" removal, keyboard pan/zoom, screen-reader description)
- Fix #13 (time-step button targets + aria-current)

**Phase 5 — semantic polish (1 PR):**
- Fix #16 (radio groups for theme + language)
- Fix #17 (NotFound focus)
- Fix #18 (footer landmark)

**Phase 6 — test infrastructure (1 PR, no runtime change):**
- Add `@axe-core/playwright` to the e2e suite. Run on `/` for all three viewport widths (mobile, tablet, desktop). Fail CI on any violation.
- Add `@axe-core/react` in dev-only mode for component-level debugging.
- Add a few Vitest assertions using `jest-axe`'s `axe()` matcher on the key components.

---

## Files to touch (consolidated)

| File | Phase | Reason |
|---|---|---|
| `index.html` | 2 | inline script to set initial lang (optional) |
| `src/index.css` | 2, 3 | new severity tokens, muted-foreground deepening, reduced-motion media query |
| `src/tailwind.config.ts` | 2 | register severity text color tokens |
| `src/App.tsx` | 3 | add `<div role="status" aria-live="polite">` |
| `src/lib/aria-utils.ts` (new) | 3 | `useStatusRegion` hook |
| `src/contexts/LanguageContext.tsx` | 2 | update `document.documentElement.lang` on language change |
| `src/pages/Index.tsx` | 1, 2, 3, 5 | skip link, install aria-label, status region, footer landmark |
| `src/components/CurrentWeather.tsx` | 2, 3 | non-color cues, severity colors, duplicate aria-label |
| `src/components/HourlyForecast.tsx` | 1 | chart label, sr-only table |
| `src/components/DailyForecast.tsx` | 1 | chart label, sr-only table |
| `src/components/StatusBadge.tsx` | 2 | severity text colors |
| `src/components/WeatherBanners.tsx` | 3 | `role="alert"` on partial + HKO-failed banners |
| `src/components/WeatherAlerts.tsx` | 3 | reduced-motion fallback for warning pulse |
| `src/components/SettingsMenu.tsx` | 1, 5 | search input label, focus-visible, radio groups |
| `src/components/RainfallMapInner.tsx` | 1, 2, 4 | focus-visible, role="application", screen-reader description, button targets |
| `src/components/RainfallMap.tsx` | 4 | no changes (depends on inner) |
| `src/pages/NotFound.tsx` | 5 | focus heading on mount |

---

## Estimated effort

| Phase | Effort | Notes |
|---|---|---|
| 1 | 4 hours | mechanical, no design review |
| 2 | 4 hours | need to re-screenshot color tokens, dark + light |
| 3 | 6 hours | RangeBar redesign; precip/UV/humidity annotation |
| 4 | 6 hours | map keyboard support + SR description; design review |
| 5 | 2 hours | pure markup |
| 6 | 4 hours | test infra + CI integration |
| **Total** | **~26 hours** | incl. testing + screenshot reviews |

---

## Out-of-scope (explicit)

- Sign language video (WCAG 1.2.6, AAA)
- Reading-level simplification (WCAG 3.1.5, AAA) — current copy is grade 8–10
- Cookie/consent banner (not a feature today)
- Multi-region AAA contrast (the design system is calibrated for HK + global)
- PDF, video, audio content (no media today)
- Full keyboard navigation of the Recharts internals (use data-table alternative instead)

---

## References

- WCAG 2.1: https://www.w3.org/TR/WCAG21/
- WCAG 2.2 (extends 2.1; most criteria already in scope): https://www.w3.org/TR/WCAG22/
- Section 508 (US federal): https://www.section508.gov/
- ADA Title III web guidance: https://www.ada.gov/resources/web-guidance/
- WAI-ARIA 1.2: https://www.w3.org/TR/wai-aria-1.2/
- WebAIM contrast checker: https://webaim.org/resources/contrastchecker/
- Ay11y — color-blindness simulators: https://www.color-blindness.com/coblis-color-blindness-simulator/
- Inclusive Components (Heydon Pickering): https://inclusive-components.design/
- Radix UI primitives accessibility: https://www.radix-ui.com/primitives/docs/overview/accessibility
- Sonner a11y: https://sonner.emilkowal.ski/

---

## Sign-off checklist

When the plan is fully implemented, the following must all be true before merge:

- [x] `pnpm tsc --noEmit` passes (PR #57)
- [ ] `pnpm lint` passes — 10 errors / 7 warnings remain pre-existing on `main`; no new issues from PR #57
- [x] `pnpm test` passes (156 tests, 4 new for lang sync — PR #57)
- [ ] `pnpm test:e2e` (Playwright + axe) passes — zero violations on `/`, `404`, `/pwa` (manifest), `/icons/...` (each icon). Phase 6.
- [ ] Lighthouse Accessibility score ≥ 95 on `/` for both color modes
- [ ] Manual screen-reader pass: VoiceOver on macOS (Safari), NVDA on Windows (Chrome), TalkBack on Android (Chrome) — user can navigate to current temperature, hourly forecast, daily forecast, warning list, and language switch without losing track
- [x] Manual keyboard pass: full tab cycle from cold load — skip link works (PR #57); remaining items deferred
- [ ] Manual color-blindness pass: deuteranopia + protanopia + tritanopia simulators — all visualizations convey their primary meaning non-color. Phase 3.
- [ ] Manual reduced-motion pass: macOS "Reduce motion" enabled — no animated transitions on load, no pulse/ping. Phase 3.
- [ ] High-contrast mode (forced colors) pass: Windows High Contrast or Safari "Increase contrast" — borders, focus rings, and primary text remain visible
- [ ] Zoom pass: 200% browser zoom reflow — no horizontal scroll, no clipped content
- [ ] One-handed mobile pass (optional but recommended): iPhone Safari + VoiceOver — all controls reachable
