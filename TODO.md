# Backlog

Ideas parked for future sessions. Not scheduled; grab an item when starting
the matching iteration. Keep entries terse but decision-complete — record the
"why", not just the "what".

## Share the forecast — v2 (image card)

- v1 shipped: text summary via `navigator.share` + clipboard fallback
  (`ShareForecastButton` + `src/lib/share-forecast.ts`).
- v2 (only if text share proves useful): render the same summary into a
  branded canvas card and share as an image (`navigator.share({ files })`).
- Deliberately rejected: sharing the nowcast map as an image. MapLibre WebGL
  canvas + cross-origin HKO/MSC/CARTO tiles → `toDataURL()` taint risk on
  servers we don't control; and a 2-hour nowcast image is stale within the
  hour. If rain sharing matters later, do a text nowcast summary (grid data
  is already client-side) instead of a map screenshot.

## Parked elsewhere

- Saved cities (pinned list, at-a-glance conditions): HML-65.

