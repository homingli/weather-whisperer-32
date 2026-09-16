# Backlog

Ideas parked for future sessions. Not scheduled; grab an item when starting
the matching iteration. Keep entries terse but decision-complete — record the
"why", not just the "what".

## Share the forecast (event planning)

- Share affordance on the DailyForecast card: 7-day summary via
  `navigator.share` (mobile) with clipboard fallback (desktop).
- Build the summary string as a pure function of `weather.daily` + units +
  language — trivially testable, i18n on both EN/TC.
- v2 (only if text share proves useful): render the same summary into a
  branded canvas card and share as an image (`navigator.share({ files })`).
- Deliberately rejected: sharing the nowcast map as an image. MapLibre WebGL
  canvas + cross-origin HKO/MSC/CARTO tiles → `toDataURL()` taint risk on
  servers we don't control; and a 2-hour nowcast image is stale within the
  hour. If rain sharing matters later, do a text nowcast summary (grid data
  is already client-side) instead of a map screenshot.

## Rain threshold heads-up (current location)

- For the current location, surface when the forecast has rain above a
  threshold — default ~0.5 mm (or user-configurable x mm) — with the time
  it starts: e.g. "Rain (2 mm) around 15:00".
- Source: hourly precipitation already fetched client-side; likely a small
  helper over `weather.hourly` + a chip/line in the hero or at-a-glance, or
  a toast if it newly crosses the threshold while the app is open.
- Open decisions: default threshold value, cumulative-vs-rate wording
  (mm per hour vs total), and whether it follows the selected city or only
  geolocated "current location".
