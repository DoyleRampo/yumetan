package com.hikaso.yumetan;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SystemAlarmPlugin.class);
        registerPlugin(AuthBrowserPlugin.class);
        registerPlugin(YumetanAlarmPlugin.class);
        registerPlugin(YumetanHapticsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
