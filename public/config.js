// 接続先の設定。空なら同じサーバー（Webで開いたとき）。ネイティブアプリ用ビルドでは公開サーバーのURLに置き換わる。
window.YUMETAN_CONFIG = { apiBase: "" };
// revenueCat: { ios, android } はネイティブビルド時に scripts/build-mobile.mjs が追加する公開SDKキー。Webでは使わない。
