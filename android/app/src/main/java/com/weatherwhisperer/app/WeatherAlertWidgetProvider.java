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
 * 2x1 home-screen widget: the umbrella/no-umbrella verdict icon plus the
 * active HKO warning (official icon, text-badge fallback) — nothing else,
 * for people who glace only at "do I need an umbrella / is a warning up".
 * Draws the same payload as the 4x2 via WidgetStore; tap opens the app.
 */
public class WeatherAlertWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        manager.updateAppWidget(appWidgetIds, buildViews(context));
    }

    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, WeatherAlertWidgetProvider.class));
        if (ids.length == 0) return;
        manager.updateAppWidget(ids, buildViews(context));
    }

    private static RemoteViews buildViews(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.weather_alert_widget);
        WidgetStore.applyLaunchIntent(context, views);
        JSONObject p = WidgetStore.readValidPayload(context);

        if (p == null) {
            // Neutral state: the 2x1 has no room for the 4x2's hint text, so
            // a dash stands in for the verdict. Sets every view the data path
            // sets — launchers reapply RemoteViews onto the existing tree when
            // the layout is unchanged, so an untouched view keeps the previous
            // render's content.
            views.setTextViewText(R.id.alert_widget_rain, "—");
            views.setViewVisibility(R.id.alert_widget_warning_icon, View.GONE);
            views.setViewVisibility(R.id.alert_widget_warning, View.GONE);
            return views;
        }

        // The verdict is the one always-on element: umbrella when rain is
        // coming, droplet when not. An absent key (bad payload) hides the
        // cell rather than drawing a literal "null".
        String rainIcon = p.optString("rainIcon", "");
        if (rainIcon.isEmpty()) {
            views.setTextViewText(R.id.alert_widget_rain, "—");
        } else {
            views.setTextViewText(R.id.alert_widget_rain, rainIcon);
        }

        String warning = p.optString("warning", "");
        Bitmap warningIcon = WidgetStore.decodeBase64Bitmap(p.optString("warningIcon", ""));
        if (warningIcon != null) {
            // Official HKO alert icon takes precedence over the text badge.
            views.setViewVisibility(R.id.alert_widget_warning_icon, View.VISIBLE);
            views.setImageViewBitmap(R.id.alert_widget_warning_icon, warningIcon);
            views.setViewVisibility(R.id.alert_widget_warning, View.GONE);
            views.setContentDescription(R.id.alert_widget_warning_icon,
                    context.getString(R.string.widget_warning_desc));
        } else if (!warning.isEmpty()) {
            views.setViewVisibility(R.id.alert_widget_warning_icon, View.GONE);
            views.setViewVisibility(R.id.alert_widget_warning, View.VISIBLE);
            views.setTextViewText(R.id.alert_widget_warning, warning);
            int badge = p.optBoolean("warningUrgent")
                    ? R.drawable.widget_badge_urgent
                    : R.drawable.widget_badge_warn;
            views.setInt(R.id.alert_widget_warning, "setBackgroundResource", badge);
        } else {
            views.setViewVisibility(R.id.alert_widget_warning_icon, View.GONE);
            views.setViewVisibility(R.id.alert_widget_warning, View.GONE);
        }
        return views;
    }
}
