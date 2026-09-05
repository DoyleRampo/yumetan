// Firebase の接続設定（ウェブアプリ用の公開値。秘密鍵ではない。アクセス制御は firestore.rules で行う）
// apiKey が空なら Firebase は使わず、端末内保存だけで動く。
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDPqttLs9U4MOtc7RL4QOgM3nWdlhESC1g",
  authDomain: "yumetan-a31f0.firebaseapp.com",
  projectId: "yumetan-a31f0",
  storageBucket: "yumetan-a31f0.firebasestorage.app",
  messagingSenderId: "629890488926",
  appId: "1:629890488926:web:7bae0225717dfffa6372cf",
};
