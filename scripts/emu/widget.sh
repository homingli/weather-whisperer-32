#!/usr/bin/env bash
# Android emulator loop for the home-screen widget. Boots an AVD, installs
# the newest debug APK, injects fixture payloads through the debug-only
# WidgetDebugReceiver, and screenshots the result — no phone, no waiting
# for real weather. See docs/android-widget-testing.md.
#
#   scripts/emu/widget.sh boot                 start the AVD (creates it on first run), wait for boot
#   scripts/emu/widget.sh install              install newest debug APK, grant location, pin GPS to HK, launch app
#   scripts/emu/widget.sh payload <fixture>    render a fixture (name under scripts/emu/fixtures/, or a path)
#   scripts/emu/widget.sh clear                wipe the payload → empty "open the app" state
#   scripts/emu/widget.sh shot [out.png]       screenshot → scripts/emu/shots/<timestamp>.png by default
#   scripts/emu/widget.sh home                 jump to the home screen
#   scripts/emu/widget.sh logcat               follow widget + web-console log lines
#
# Env: AVD (default ww-pixel8), LAT/LON (default Hong Kong), ANDROID_HOME.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
PKG=com.weatherwhisperer.app
AVD=${AVD:-ww-pixel8}
IMAGE="system-images;android-36;google_apis;arm64-v8a"
LAT=${LAT:-22.3193}
LON=${LON:-114.1694}

sdk_dir() {
  if [ -n "${ANDROID_HOME:-}" ]; then echo "$ANDROID_HOME"; return; fi
  if [ -n "${ANDROID_SDK_ROOT:-}" ]; then echo "$ANDROID_SDK_ROOT"; return; fi
  sed -n 's/^sdk\.dir=//p' "$ROOT/android/local.properties" 2>/dev/null | head -1
}
SDK=$(sdk_dir)
[ -n "$SDK" ] || { echo "Android SDK not found: set ANDROID_HOME or android/local.properties sdk.dir" >&2; exit 1; }
ADB_BIN="$SDK/platform-tools/adb"
# -e pins every command to the emulator: with a physical phone also plugged
# in, plain `adb` would happy-path onto it (install, location grants…).
adb() { "$ADB_BIN" -e "$@"; }
EMULATOR="$SDK/emulator/emulator"
AVDMANAGER="$SDK/cmdline-tools/latest/bin/avdmanager"

die() { echo "$*" >&2; exit 1; }

need_device() {
  adb get-state >/dev/null 2>&1 || die "no emulator attached — run: $0 boot"
}

# `am broadcast -n` to a component that does not exist still reports
# result=0, so a release APK (no debug receiver) would look like success.
need_debug_receiver() {
  adb shell dumpsys package $PKG 2>/dev/null | grep -q WidgetDebugReceiver \
    || die "WidgetDebugReceiver not in the installed app — install a debug APK (make apk && $0 install)"
}

cmd_boot() {
  [ -x "$EMULATOR" ] || die "emulator not installed — run: $SDK/cmdline-tools/latest/bin/sdkmanager --install emulator \"$IMAGE\""
  if adb get-state >/dev/null 2>&1; then echo "emulator already running"; return; fi
  if ! "$EMULATOR" -list-avds | grep -qx "$AVD"; then
    [ -d "$SDK/system-images/android-36/google_apis/arm64-v8a" ] \
      || die "system image missing — run: $SDK/cmdline-tools/latest/bin/sdkmanager --install \"$IMAGE\""
    echo "creating AVD $AVD"
    echo no | "$AVDMANAGER" create avd -n "$AVD" -k "$IMAGE" -d pixel_8 >/dev/null 2>&1 \
      || die "avdmanager create failed"
  fi
  mkdir -p "$ROOT/scripts/emu/shots"
  nohup "$EMULATOR" -avd "$AVD" -no-boot-anim -gpu auto \
    > "$ROOT/scripts/emu/shots/emulator.log" 2>&1 &
  echo "booting $AVD (log: scripts/emu/shots/emulator.log)"
  for _ in $(seq 1 60); do
    if [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; then
      echo "booted"; return
    fi
    sleep 3
  done
  die "emulator did not finish booting in 180s"
}

newest_debug_apk() {
  ls -t "$ROOT"/android/app/build/outputs/apk/debug/*.apk 2>/dev/null | head -1
}

cmd_install() {
  need_device
  APK=$(newest_debug_apk)
  [ -n "$APK" ] || die "no debug APK — run: make apk"
  echo "installing $(basename "$APK")"
  adb install -r "$APK" | tail -1
  adb shell pm grant $PKG android.permission.ACCESS_FINE_LOCATION
  adb shell pm grant $PKG android.permission.ACCESS_COARSE_LOCATION
  # Emulator GPS defaults to Mountain View; pin it so the HKO path (warnings,
  # 9-day, nowcast) is exercised. adb's geo fix takes LON then LAT.
  adb emu geo fix "$LON" "$LAT" >/dev/null
  adb shell am start -n $PKG/.MainActivity >/dev/null
  echo "app launched at $LAT,$LON — add the widget: long-press home → Widgets → search 'Weather'"
}

cmd_payload() {
  need_device
  need_debug_receiver
  local f=${1:-}
  [ -n "$f" ] || die "usage: $0 payload <fixture-name|path.json>"
  [ -f "$f" ] || f="$ROOT/scripts/emu/fixtures/$f.json"
  [ -f "$f" ] || die "fixture not found: $1 (have: $(ls "$ROOT/scripts/emu/fixtures" | sed 's/\.json$//' | tr '\n' ' '))"
  local b64
  b64=$(base64 < "$f" | tr -d '\n')
  # One --es arg; the largest fixture (T8 with a 96px icon) is ~12 KB of
  # base64 and verified end-to-end on platform-tools 36 — if a bigger one
  # ever renders as the empty hint, the arg was truncated by adb.
  adb shell am broadcast -a $PKG.DEBUG_WIDGET -n $PKG/.WidgetDebugReceiver \
    --es payloadB64 "$b64" >/dev/null
  echo "rendered $(basename "$f")"
}

cmd_clear() {
  need_device
  need_debug_receiver
  adb shell am broadcast -a $PKG.DEBUG_WIDGET -n $PKG/.WidgetDebugReceiver --ez clear true >/dev/null
  echo "payload cleared"
}

cmd_shot() {
  need_device
  mkdir -p "$ROOT/scripts/emu/shots"
  local out=${1:-"$ROOT/scripts/emu/shots/$(date +%H%M%S).png"}
  adb exec-out screencap -p > "$out"
  echo "$out"
}

cmd_home() {
  need_device
  adb shell input keyevent KEYCODE_HOME
}

cmd_logcat() {
  need_device
  adb logcat -v brief | grep -E "WeatherWidget|Capacitor/Console|AppWidget"
}

case "${1:-}" in
  boot) cmd_boot ;;
  install) cmd_install ;;
  payload) cmd_payload "${2:-}" ;;
  clear) cmd_clear ;;
  shot) cmd_shot "${2:-}" ;;
  home) cmd_home ;;
  logcat) cmd_logcat ;;
  *) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
