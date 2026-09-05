// Firebase の接続設定。Firebase コンソール → プロジェクトの設定 → マイアプリ → ウェブアプリ → 「SDK の設定と構成」の値を貼る。
// apiKey が空のままなら Firebase は使わず、端末内保存だけで動く。
window.FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "yumetan-a31f0.firebaseapp.com",
  projectId: "yumetan-a31f0",
  storageBucket: "yumetan-a31f0.firebasestorage.app",
  messagingSenderId: "",
  appId: "",
};
