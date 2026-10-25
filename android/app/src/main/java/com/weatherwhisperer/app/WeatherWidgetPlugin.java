package com.weatherwhisperer.app;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridge the web layer uses to hand the home-screen widget its rendered
 * payload. The widget is a dumb native renderer: units, language, warning
 * badges and sun countdowns are all resolved in TypeScript. This plugin
 * only persists the JSON and triggers a redraw of every placed widget.
 */
@CapacitorPlugin(name = "WeatherWidget")
public class WeatherWidgetPlugin extends Plugin {

    static final String PREFS = "widget_weather";
    static final String KEY_PAYLOAD = "payload";
    /** Must match WIDGET_SCHEMA in src/lib/widget-bridge.ts. A payload with
     *  any other value was written by a different build and is not rendered. */
    static final int SCHEMA = 2;

    @PluginMethod
    public void save(PluginCall call) {
        String payload = call.getString("payload");
        if (payload == null || payload.isEmpty()) {
            call.reject("payload required");
            return;
        }
        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_PAYLOAD, payload).apply();
        WeatherWidgetProvider.updateAll(context);
        call.resolve();
    }
}
