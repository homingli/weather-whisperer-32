package com.weatherwhisperer.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.graphics.Bitmap;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

/**
 * 4x2 home-screen widget: current temp + condition, rain chance, active
 * HKO warning badge, and sunrise/sunset with lead time. Reads the payload
 * the web layer last wrote via WeatherWidgetPlugin — no native fetching,
 * so the widget is exactly as fresh as the app's own data. The alerts-only
 * 2x1 renderer lives in WeatherAlertWidgetProvider; shared plumbing
 * (payload guard, redraw fan-out, launch tap) in WidgetStore.
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
        WidgetStore.applyLaunchIntent(context, views);
        JSONObject p = WidgetStore.readValidPayload(context);
        if (p == null) {
            renderEmpty(context, views);
            return views;
        }

        views.setViewVisibility(R.id.widget_row_details, View.VISIBLE);
        views.setViewVisibility(R.id.widget_updated, View.VISIBLE);
        views.setTextViewText(R.id.widget_icon, p.optString("icon"));
        views.setTextViewText(R.id.widget_temp, p.optString("temperature"));
        views.setTextViewText(R.id.widget_condition, p.optString("condition"));
        views.setTextViewText(R.id.widget_rain, p.optString("rain"));
        views.setTextViewText(R.id.widget_sun, p.optString("sunTime"));
        views.setTextViewText(R.id.widget_sun_in, p.optString("sunIn"));
        views.setTextViewText(R.id.widget_updated, p.optString("updatedAt"));

        String warning = p.optString("warning", "");
        Bitmap warningIcon = WidgetStore.decodeBase64Bitmap(p.optString("warningIcon", ""));
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
        return views;
    }

    /** No usable payload: dash + "open the app" hint, every data row hidden.
     *  Sets every view the data path sets — launchers reapply RemoteViews onto
     *  the existing tree when the layout is unchanged, so an untouched view
     *  keeps the previous render's content. */
    private static void renderEmpty(Context context, RemoteViews views) {
        views.setTextViewText(R.id.widget_icon, "");
        views.setTextViewText(R.id.widget_temp, "—");
        views.setTextViewText(R.id.widget_condition, context.getString(R.string.widget_empty_hint));
        views.setViewVisibility(R.id.widget_warning, View.GONE);
        views.setViewVisibility(R.id.widget_warning_icon, View.GONE);
        views.setViewVisibility(R.id.widget_row_details, View.GONE);
        views.setViewVisibility(R.id.widget_updated, View.GONE);
    }
}
