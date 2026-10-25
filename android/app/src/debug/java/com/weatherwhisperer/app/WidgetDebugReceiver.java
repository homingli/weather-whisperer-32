package com.weatherwhisperer.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Base64;

import java.nio.charset.StandardCharsets;

/**
 * Debug-build-only hook for driving the home-screen widget from adb without
 * waiting for real weather: writes a fixture payload into the same
 * SharedPreferences slot WeatherWidgetPlugin uses and redraws every placed
 * widget. Lives in src/debug so release APKs never declare it.
 *
 *   adb shell am broadcast -a com.weatherwhisperer.app.DEBUG_WIDGET \
 *       -n com.weatherwhisperer.app/.WidgetDebugReceiver \
 *       --es payloadB64 "$(base64 < fixture.json)"
 *
 * The payload travels base64-encoded because emoji and JSON quotes do not
 * survive adb's shell quoting. `--ez clear true` wipes the slot instead, to
 * look at the empty state. See scripts/emu/widget.sh for the wrapper.
 */
public class WidgetDebugReceiver extends BroadcastReceiver {

    static final String ACTION = "com.weatherwhisperer.app.DEBUG_WIDGET";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!ACTION.equals(intent.getAction())) return;
        SharedPreferences prefs = context.getSharedPreferences(
                WeatherWidgetPlugin.PREFS, Context.MODE_PRIVATE);
        if (intent.getBooleanExtra("clear", false)) {
            prefs.edit().remove(WeatherWidgetPlugin.KEY_PAYLOAD).apply();
        } else {
            String b64 = intent.getStringExtra("payloadB64");
            if (b64 == null || b64.isEmpty()) return;
            String json = new String(Base64.decode(b64, Base64.DEFAULT), StandardCharsets.UTF_8);
            prefs.edit().putString(WeatherWidgetPlugin.KEY_PAYLOAD, json).apply();
        }
        WeatherWidgetProvider.updateAll(context);
    }
}
