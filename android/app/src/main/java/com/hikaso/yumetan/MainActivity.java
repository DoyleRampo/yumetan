package com.hikaso.yumetan;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 端末のアラーム連携プラグイン（自作）。super.onCreate より前に登録する
        registerPlugin(YumetanAlarmPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
