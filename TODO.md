# Backlog

Ideas parked for future sessions. Not scheduled; grab an item when starting
the matching iteration. Keep entries terse but decision-complete — record the
"why", not just the "what".

## Share the forecast — text share shipped; image card parked

Shipped (see CHANGELOG, "Share the forecast with friends"): the share icon
in the daily-forecast card header builds the message with the pure
`buildForecastShareText` (`src/lib/share-forecast.ts` — unit- and
language-aware, EN/TC, city timezone) and hands it to `navigator.share`,
with a clipboard fallback plus toast. Remaining:

- v2 (only if text share proves useful): render the same summary into a
  branded canvas card and share as an image (`navigator.share({ files })`).
- Deliberately rejected: sharing the nowcast map as an image. MapLibre WebGL
  canvas + cross-origin HKO/MSC/CARTO tiles → `toDataURL()` taint risk on
  servers we don't control; and a 2-hour nowcast image is stale within the
  hour. If rain sharing matters later, do a text nowcast summary (grid data
  is already client-side) instead of a map screenshot.

## Rain threshold heads-up — banner shipped; config + toast remain

Shipped (see CHANGELOG, "Rain-start banner"): `RainStartBanner` above the
at-a-glance row answers "when will it rain?" ("Rain expected around 15:30 ·
in ~45 min" / "Raining now · easing around 17:00") from the HKO gridded
nowcast merged with Open-Meteo minutely_15/hourly (`src/lib/rain-start.ts`),
with a bar strip encoding per-window mm. The entry's open decisions are
resolved: it follows the selected city (wording stays location-neutral, not
geolocation-only), the wet-window threshold is a fixed 0.1 mm per step
(`RAIN_THRESHOLD_MM`), and amounts show as bar heights rather than a
"Rain (2 mm) around 15:00" text format or a mm/h rate. Remaining:

- User-configurable threshold: 0.1 mm is fixed; expose an "x mm" setting
  only if drizzle-grade windows prove too chatty in practice.
- Toast when rain newly crosses the threshold while the app is open,
  mirroring the warning-change toasts in `Index.tsx`.
