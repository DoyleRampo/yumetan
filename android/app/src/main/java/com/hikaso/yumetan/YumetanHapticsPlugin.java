package com.hikaso.yumetan;

import android.os.Build;
import android.view.HapticFeedbackConstants;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "YumetanHaptics")
public class YumetanHapticsPlugin extends Plugin {
    @PluginMethod
    public void pulse(PluginCall call) {
        String kind = call.getString("kind", "tap");
        int feedback = switch (kind) {
            case "result" -> Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                ? HapticFeedbackConstants.CONFIRM
                : HapticFeedbackConstants.LONG_PRESS;
            case "step" -> HapticFeedbackConstants.CLOCK_TICK;
            default -> HapticFeedbackConstants.KEYBOARD_TAP;
        };
        getActivity().runOnUiThread(() -> {
            getBridge().getWebView().performHapticFeedback(feedback);
            call.resolve();
        });
    }
}
