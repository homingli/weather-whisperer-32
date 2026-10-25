# Android widget — emulator test loop

How to see the home-screen widget render without building, sideloading and
opening the app on a phone. Everything runs on a local Android emulator and
is driven from `make` / `scripts/emu/widget.sh`.

## One-time setup

Needs the Android SDK path the Gradle build already uses
(`android/local.properties` → `sdk.dir`, or `ANDROID_HOME`), JDK 21, and
~1.6 GB of disk for the emulator + system image:

```sh
$SDK/cmdline-tools/latest/bin/sdkmanager --install emulator \
    "system-images;android-36;google_apis;arm64-v8a"
```

(`android-36` matches `compileSdkVersion`; `arm64-v8a` is for Apple Silicon.)
`make emu` creates the `ww-pixel8` AVD on first run.

## The loop

```sh
make apk                  # debug APK — weather-whisperer-v<ver>-dev.<sha>.apk
make emu                  # boot the AVD (first boot ~90 s, later ~10 s)
make emu-install          # install, grant location, pin GPS to HK, launch the app
```

Place the widget once per AVD: long-press the home screen → **Widgets** →
search "Weather" → long-press the preview and drop it. After that the
widget updates whenever the app syncs or a fixture is injected; `make
emu-install` after a rebuild keeps the placed widget.

```sh
make emu-widget FIXTURE=night-clear     # render a fixture payload
make emu-widget FIXTURE=raining-now-t8  # umbrella "now" + T8 icon, urgent
make emu-clear                          # empty "open the app" state
make emu-shot                           # PNG → scripts/emu/shots/<time>.png
```

Fixtures live in `scripts/emu/fixtures/*.json` and are plain widget payloads
(the same JSON `buildWidgetPayload` produces), so a new visual state is a
new JSON file. `old-schema-v1.json` is the deliberate odd one out — it must
render as the empty hint, see below. `widget-bridge.test.ts` checks that
every other fixture carries the current schema and only known keys.

Injecting goes through `WidgetDebugReceiver`, which exists only in debug
builds (`android/app/src/debug/`). It writes the fixture to the same
SharedPreferences slot the Capacitor plugin uses and redraws every placed
widget, so what you see is exactly the production render path.

Useful while iterating:

```sh
scripts/emu/widget.sh logcat                 # WeatherWidget.save calls + web console
adb shell run-as com.weatherwhisperer.app cat shared_prefs/widget_weather.xml
LAT=49.28 LON=-123.12 make emu-install       # non-HK location (Open-Meteo only)
```

## Payload schema and stale payloads

The widget is a dumb renderer: the native side draws whatever JSON is in
SharedPreferences, and that JSON survives an APK upgrade. The payload
therefore carries `schema` (`WIDGET_SCHEMA` in `src/lib/widget-bridge.ts`,
`WeatherWidgetPlugin.SCHEMA` in Java). A payload with a different or
missing schema renders as "—  Open the app to load weather" instead of
being drawn with the new layout — that is what the previous build's payload
would otherwise look like: renamed keys read as blank cells next to a
plausible "Updated HH:MM" stamp (this is how v1's `sunrise`/`sunset` keys
produced an empty sun cell after the v2 upgrade).

Bump `WIDGET_SCHEMA` (both sides) whenever a key is renamed, removed or
changes meaning. Adding an optional key does not need a bump.

## Reading a widget on a real phone

The **Updated HH:MM** stamp is the staleness indicator. If it is old, the
app has not completed a sync since — open the app and let it load once;
the widget redraws on every successful fetch. A stamp that does not move
after opening the app means the save path failed; `adb logcat | grep
WeatherWidget` on a debug build shows the `save` call and its payload.
