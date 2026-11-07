// 接続先の設定。空なら同じサーバー（Webで開いたとき）。ネイティブアプリ用ビルドでは公開サーバーのURLに置き換わる。
// ga4MeasurementId: アプリ用 GA4 ウェブストリームの測定ID（G-…）。公開値。空なら計測しない。
//   取得・設定の手順は docs/analytics/GA4_SETUP.md（`npm run ga4:setup -- --write` で書き込める）。
window.YUMETAN_CONFIG = { apiBase: "", ga4MeasurementId: "" };
