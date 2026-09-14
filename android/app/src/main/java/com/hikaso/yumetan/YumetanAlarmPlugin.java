package com.hikaso.yumetan;

import android.content.Intent;
import android.provider.AlarmClock;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;

/**
 * 端末標準の時計アプリ（アラーム）と連携する小さなプラグイン。
 * JS からは window.Capacitor.Plugins.YumetanAlarm.set({ hour, minutes, message, days, skipUi }) で呼ぶ。
 * AlarmClock.ACTION_SET_ALARM を使うので、追加の権限ダイアログは不要（SET_ALARM は通常権限）。
 */
@CapacitorPlugin(name = "YumetanAlarm")
public class YumetanAlarmPlugin extends Plugin {

    /** 起床アラームを時計アプリに登録する。skipUi が true なら確認画面を出さずに登録する。 */
    @PluginMethod
    public void set(PluginCall call) {
        Integer hour = call.getInt("hour");
        Integer minutes = call.getInt("minutes");
        if (hour == null || minutes == null) {
            call.reject("hour and minutes are required");
            return;
        }
        String message = call.getString("message", "Yumetan");
        boolean skipUi = Boolean.TRUE.equals(call.getBoolean("skipUi", false));

        Intent intent = new Intent(AlarmClock.ACTION_SET_ALARM)
            .putExtra(AlarmClock.EXTRA_HOUR, hour)
            .putExtra(AlarmClock.EXTRA_MINUTES, minutes)
            .putExtra(AlarmClock.EXTRA_MESSAGE, message)
            .putExtra(AlarmClock.EXTRA_VIBRATE, true)
            .putExtra(AlarmClock.EXTRA_SKIP_UI, skipUi);

        // 曜日指定（1=日曜 … 7=土曜、java.util.Calendar と同じ）。空なら毎日／1回は時計アプリ側の既定に従う
        JSArray days = call.getArray("days");
        if (days != null && days.length() > 0) {
            ArrayList<Integer> list = new ArrayList<>();
            try {
                for (int i = 0; i < days.length(); i++) list.add(days.getInt(i));
            } catch (Exception ignored) {}
            if (!list.isEmpty()) intent.putIntegerArrayListExtra(AlarmClock.EXTRA_DAYS, list);
        }

        if (intent.resolveActivity(getContext().getPackageManager()) == null) {
            call.reject("no-clock-app");
            return;
        }
        getActivity().startActivity(intent);
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    /** 時計アプリのアラーム一覧を開く。 */
    @PluginMethod
    public void show(PluginCall call) {
        Intent intent = new Intent(AlarmClock.ACTION_SHOW_ALARMS);
        if (intent.resolveActivity(getContext().getPackageManager()) == null) {
            call.reject("no-clock-app");
            return;
        }
        getActivity().startActivity(intent);
        call.resolve();
    }
}
