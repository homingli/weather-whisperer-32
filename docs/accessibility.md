# Accessibility

Conformance target is WCAG 2.1 Level AA. Accessibility work is tracked with the implementation and test suite in `src/`.

What's in place today:

- **Document language.** `<html lang>` is synced to `zh-Hant-HK` / `en` synchronously inside the `LanguageProvider` initializer, so screen readers never see a flash of English on a Chinese-filled page
- **Skip link.** "Skip to main content" link is the first focusable element
- **Landmarks.** `<main id="main-content">`, `<nav aria-label>`, plus an `sr-only <h1>Weather Forecast</h1>`. There is deliberately no page footer — the data-source credit lives at the bottom of the settings menu
- **Live regions.** `role="alert"` on the offline (cache) banner; `role="status"` on the partial-data / HKO-fallback banners and the top-bar offline indicator; `role="status" aria-live="polite"` on the refresh indicator (shared sr-only region in `src/lib/aria-utils.tsx`)
- **Forms.** the city search input has an `aria-label`; the search dialog uses a Radix `Dialog` with `sr-only DialogTitle`
- **Charts.** each Recharts SVG has an `aria-label` and an accompanying `sr-only <table>` exposing the same data points to screen readers
- **Color contrast.** semantic severity tokens (`--severity-warning-fg`, `--severity-success-fg`, `--severity-error-fg`, `--severity-info-fg`) at ≥5.5:1 on cream, and a deeper `--muted-foreground` (28% light / 52% dark) so `/50`, `/60`, `/70` subdivisions clear 4.5:1
- **Keyboard.** visible `focus-visible:ring-2` ring on every interactive element; explicit `aria-current` on RainfallMap time-step buttons; `<h1>` in `NotFound.tsx` programmatically focuses on mount
- **Quiet shelf.** Below-threshold metric chips (precip, humidity, UV, wind) use `aria-label` to carry full values; tap/toggle reveals detail on focus (WCAG 1.4.13)
- **At-a-glance strip.** Each day's temperature button and each rain-chance chip (≥ 20 %) carries a full-sentence `aria-label` (condition, high, low; "Rain chance 80%. View the rainfall nowcast map.") so screen readers never hear a bare "80 %"

Remaining work: non-color cues inside visualization widgets, `prefers-reduced-motion` guards on all animations, and Playwright + `@axe-core` e2e coverage.
