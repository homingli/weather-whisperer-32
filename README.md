# Weather Whisperer

Weather Whisperer is a weather app that answers the questions behind the forecast: Will I need an umbrella? Is a typhoon coming? When will the rain reach my street? It works anywhere in the world, and in Hong Kong it brings in official data straight from the Hong Kong Observatory — in English or Traditional Chinese, online or offline.

## Wherever you are

**Know what today actually feels like.** See the current conditions with a "feels like" temperature, today's high and low, and whether things are warming up, cooling down, or holding steady over the next three hours.

**Get a straight answer about rain.** The app tells you plainly whether an umbrella is worth carrying. A "when will it rain?" banner tells you when rain is expected — or, if it is already raining, when it should ease — and the today-and-tomorrow strip shows each day's temperature range, with the chance of rain only when it is worth knowing about — at least one in five.

**Look ahead by hours or by week.** An interactive chart traces the temperature through the next six hours with the chance of rain behind it, and a seven-day outlook carries you through the rest of the week.

**Check any city, in its own time.** Search for a place by name, let the app find you automatically, or jump back to your recent cities with one tap. Every forecast shows the local time of that city — useful when you are travelling or checking on family elsewhere.

**Make it yours.** Switch between English and Traditional Chinese, pick a light or dark theme (or one that follows the sun), and add the app to your home screen. It works like a native app: it loads fast, remembers the last forecast you saw, and keeps showing it even when you have no connection.

## In Hong Kong and the Pearl River Delta

**Weather from the official source.** In Hong Kong, Weather Whisperer blends the Hong Kong Observatory's official data into the forecast, so you are reading the same warnings the Observatory itself publishes — not a watered-down feed.

**Warnings the moment they are issued.** Typhoon signals (T1 through T10), rainstorm alerts, and hot-weather, cold-weather and other advisories appear at the top of the page as soon as they are announced. Tap one to read the full safety guidance in your language.

**Watch the rain coming.** An animated map shows where rainfall is expected over the next couple of hours across Hong Kong, Shenzhen, Macau and the wider Pearl River Delta. Press play and step through the coming hours frame by frame; a blue pin marks where you are.

## What makes it different

- **Official where it counts.** Most weather apps serve you the same generic feed everywhere. In Hong Kong this one adds the Observatory's own data, warnings, and rainfall maps.
- **It tells you what to do.** Umbrella advice, and a rain chance that only appears when it is worth mentioning, replace the usual wall of numbers.
- **Offline-friendly and no strings attached.** No account, no login — just weather. If your connection drops, you still get the last forecast you saw, clearly marked, with a button to refresh when you are back online.

## For developers

### Run it locally

```bash
git clone https://github.com/homingli/weather-whisperer-32.git
cd weather-whisperer-32
pnpm install --ignore-scripts   # dependencies; lifecycle scripts are not run
npm run dev   # http://localhost:8080 with hot reload
```

Other useful commands: `npm run build` (production build), `npm run lint`, and `npm test` (add `--run` for a single pass). Node.js 20+ required.

The map uses a Carto vector basemap when `VITE_CARTO_API_KEY` is set and falls back to open tiles without it. `npm run audit:viewports` checks the app at every iPhone portrait width against layout regressions; see `scripts/audit/README.md`.

### Android APK

The `android/` directory is a Capacitor shell that wraps the web build into an installable APK. Requirements: a JDK (21+ — Capacitor 8's Android plugin targets Java 21), an Android SDK with platform 36, and `sdk.dir` set in `android/local.properties` (or `ANDROID_HOME` in the environment).

```bash
pnpm run apk
```

That builds the web assets, syncs them into the native shell, and runs `gradlew assembleDebug`; the APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`. The sync step also regenerates the gitignored `capacitor-cordova-android-plugins/` directory that `android/settings.gradle` includes, so it must run at least once on a fresh clone before any gradle command.

## Documentation

- [Architecture](./ARCHITECTURE.md) — data flow, project structure, testing strategy
- [Feature details](./docs/features.md) — per-feature breakdown (hero, hourly/daily, alerts, nowcast maps)
- [Local storage and caching](./docs/local-storage.md) — how offline and cached data work
- [Performance](./docs/performance.md) — refetch cadence, lazy loading, render isolation
- [Accessibility](./docs/accessibility.md) — WCAG 2.1 AA status and remaining work
