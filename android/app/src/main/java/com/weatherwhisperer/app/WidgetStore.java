package com.weatherwhisperer.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import android.widget.RemoteViews;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * State and helpers shared by every widget renderer. One payload slot
 * (SharedPreferences) feeds all widget types; each provider picks the
 * fields its layout draws. Keeping the parse guard, the redraw fan-out
 * and the payload-image decode here means a new widget type cannot
 * forget them.
 */
final class WidgetStore {

    private WidgetStore() {}

    /**
     * Last payload the web layer saved, or null when absent, malformed, or
     * written by a build with a different schema. A mismatched payload must
     * not be drawn with this layout: renamed keys read as blank cells next
     * to a plausible-looking "Updated" stamp. Show the neutral state instead
     * so the user opens the app, which rewrites the store.
     */
    static JSONObject readValidPayload(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(
                WeatherWidgetPlugin.PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(WeatherWidgetPlugin.KEY_PAYLOAD, null);
        if (raw == null) return null;
        try {
            JSONObject parsed = new JSONObject(raw);
            if (parsed.optInt("schema", 0) == WeatherWidgetPlugin.SCHEMA) return parsed;
        } catch (JSONException e) {
            // Malformed — fall through to the neutral state.
        }
        return null;
    }

    /** Redraw every placed widget of every type. The single fan-out point —
     *  plugin saves and the debug receiver both land here, so a new widget
     *  type is registered for redraws in exactly one place. */
    static void updateAllWidgets(Context context) {
        WeatherWidgetProvider.updateAll(context);
        WeatherAlertWidgetProvider.updateAll(context);
    }

    /** Decode a base64 (or data-URL) payload image; null on any failure. */
    static Bitmap decodeBase64Bitmap(String dataUrl) {
        if (dataUrl == null || dataUrl.isEmpty()) return null;
        int comma = dataUrl.indexOf(',');
        String b64 = comma >= 0 ? dataUrl.substring(comma + 1) : dataUrl;
        try {
            byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /** Open the app when the widget is tapped. Every widget layout must put
     *  @+id/widget_root on its tappable root so this one call serves all. */
    static void applyLaunchIntent(Context context, RemoteViews views) {
        Intent intent = context.getPackageManager()
                .getLaunchIntentForPackage(context.getPackageName());
        if (intent == null) return;
        PendingIntent pending = PendingIntent.getActivity(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, pending);
    }
}
