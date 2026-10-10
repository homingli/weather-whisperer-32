# Mobile changelog

User-visible changes in the Android sideload builds (`apk-v*` prereleases from
the `mobile` branch). One section per release, newest first: `make bump`
scaffolds the next section as a draft built from commits since the previous
release (New/Fixed/Polish), you prune or polish it, and `make upload` turns
the section into the GitHub release description. This file is separate from the
web app's `CHANGELOG.md`, which lives on `main`; releases before v0.8.4 predate
this file.

## v0.8.5

### New

- Deep-link shared forecasts to the sender's location
- Holiday confetti, vacation badge on the deck dots, c-c-f-f trigger
- Night shading anchored to real sunset/sunrise times
- Strong-wind hours in hourly chart, gusts + daily UV max, HKO station wind for HK

### Fixed

- Default zoom 12 on both nowcast maps
- Transparent deck badge, c-c-f-f works at mobile viewports
- Type swiper instance ref as Swiper so typecheck passes
- Bind ReferenceAreas to yAxisId — bands never rendered; blue-gray gust shading

### Polish

- Gray border for warning-icon chips
- 1px border + white chip behind warning icons
- Shorten the load-map prompt — single line at 320px
- Gust band to 15% blue-gray, drop the yellow day wash, night tint to 12%
- Strong-gust hours shade as chart bands instead of tick glyphs

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
