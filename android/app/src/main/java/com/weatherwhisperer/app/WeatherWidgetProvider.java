package com.weatherwhisperer.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

/**
 * 4x2 home-screen widget: current temp + condition, rain chance, active
 * HKO warning badge, and sunrise/sunset with lead time. Reads the payload
 * the web layer last wrote via WeatherWidgetPlugin — no native fetching,
 * so the widget is exactly as fresh as the app's own data.
 */
public class WeatherWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        manager.updateAppWidget(appWidgetIds, buildViews(context));
    }

    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, WeatherWidgetProvider.class));
        if (ids.length == 0) return;
        manager.updateAppWidget(ids, buildViews(context));
    }

    private static RemoteViews buildViews(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.weather_widget);
        SharedPreferences prefs = context.getSharedPreferences(
                WeatherWidgetPlugin.PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(WeatherWidgetPlugin.KEY_PAYLOAD, null);

        if (raw == null) {
            views.setTextViewText(R.id.widget_temp, "—");
            views.setTextViewText(R.id.widget_condition, context.getString(R.string.widget_empty_hint));
            views.setViewVisibility(R.id.widget_warning, View.GONE);
            views.setViewVisibility(R.id.widget_row_details, View.GONE);
            views.setViewVisibility(R.id.widget_updated, View.GONE);
            applyLaunchIntent(context, views);
            return views;
        }

        views.setViewVisibility(R.id.widget_row_details, View.VISIBLE);
        views.setViewVisibility(R.id.widget_updated, View.VISIBLE);
        try {
            JSONObject p = new JSONObject(raw);
            views.setTextViewText(R.id.widget_icon, p.optString("icon"));
            views.setTextViewText(R.id.widget_temp, p.optString("temperature"));
            views.setTextViewText(R.id.widget_condition, p.optString("condition"));
            views.setTextViewText(R.id.widget_rain, p.optString("rain"));
            views.setTextViewText(R.id.widget_sunrise, p.optString("sunrise"));
            views.setTextViewText(R.id.widget_sunrise_in, p.optString("sunriseIn"));
            views.setTextViewText(R.id.widget_sunset, p.optString("sunset"));
            views.setTextViewText(R.id.widget_sunset_in, p.optString("sunsetIn"));
            views.setTextViewText(R.id.widget_updated, p.optString("updatedAt"));

            String warning = p.optString("warning", "");
            Bitmap warningIcon = decodeBase64Bitmap(p.optString("warningIcon", ""));
            if (warningIcon != null) {
                // Official HKO alert icon takes precedence over the text badge.
                views.setViewVisibility(R.id.widget_warning_icon, View.VISIBLE);
                views.setImageViewBitmap(R.id.widget_warning_icon, warningIcon);
                views.setViewVisibility(R.id.widget_warning, View.GONE);
                views.setContentDescription(R.id.widget_warning_icon,
                        context.getString(R.string.widget_warning_desc));
            } else if (!warning.isEmpty()) {
                views.setViewVisibility(R.id.widget_warning_icon, View.GONE);
                views.setViewVisibility(R.id.widget_warning, View.VISIBLE);
                views.setTextViewText(R.id.widget_warning, warning);
                int badge = p.optBoolean("warningUrgent")
                        ? R.drawable.widget_badge_urgent
                        : R.drawable.widget_badge_warn;
                views.setInt(R.id.widget_warning, "setBackgroundResource", badge);
            } else {
                views.setViewVisibility(R.id.widget_warning_icon, View.GONE);
                views.setViewVisibility(R.id.widget_warning, View.GONE);
            }
        } catch (Exception e) {
            // Malformed payload — show a neutral state rather than stale or
            // garbled text. Next app data refresh rewrites the store.
            views.setTextViewText(R.id.widget_temp, "—");
            views.setViewVisibility(R.id.widget_row_details, View.GONE);
            views.setViewVisibility(R.id.widget_updated, View.GONE);
            views.setViewVisibility(R.id.widget_warning_icon, View.GONE);
        }
        applyLaunchIntent(context, views);
        return views;
    }

    /** Decode a base64 (or data-URL) payload image; null on any failure. */
    private static Bitmap decodeBase64Bitmap(String dataUrl) {
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

    private static void applyLaunchIntent(Context context, RemoteViews views) {
        Intent intent = context.getPackageManager()
                .getLaunchIntentForPackage(context.getPackageName());
        if (intent == null) return;
        PendingIntent pending = PendingIntent.getActivity(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, pending);
    }
}
