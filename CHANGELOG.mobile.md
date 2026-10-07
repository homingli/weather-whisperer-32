# Mobile changelog

User-visible changes in the Android sideload builds (`apk-v*` prereleases from
the `mobile` branch). One section per release, newest first: `make bump`
scaffolds the next section, you fill in the bullets, and `make upload` turns
the section into the GitHub release description. This file is separate from the
web app's `CHANGELOG.md`, which lives on `main`; releases before v0.8.4 predate
this file.

## v0.8.4

- **Holiday countdown badge moved to the header.** The "days until the next HK
  public holiday" chip now sits next to the clock instead of in the glance
  strip.
- **Clock reads HH:MM everywhere and ticks once a minute** instead of showing
  seconds in some places.
- **Quieter header location row.**
- **Hourly and 7-day forecast split into full-height swiper panes**, fixing the
  overlapping/clipped deck on low-resolution phones (HML-61).
- **Accessibility:** screen-reader-only forecast table captions no longer
  overlap the kicker label on WebKit (HML-63).
