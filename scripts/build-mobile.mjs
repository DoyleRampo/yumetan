// ネイティブアプリ用に public/ を dist/ にコピーし、接続先サーバーURLとRevenueCatの公開キーを埋め込む
// 使い方: API_URL=https://your-server.example.com REVENUECAT_IOS_KEY=appl_... REVENUECAT_ANDROID_KEY=goog_... node scripts/build-mobile.mjs
// RevenueCatの公開SDKキー（appl_/goog_）はアプリに埋め込んでよい値。秘密キー（sk_）は絶対に渡さないこと。
import fs from "node:fs";
import path from "node:path";

const apiUrl = (process.env.API_URL || "").replace(/\/$/, "");
if (!apiUrl) {
  console.error(
    "API_URL（公開したサーバーのURL）を指定してください。例: API_URL=https://yumetan.onrender.com npm run mobile:build",
  );
  process.exit(1);
}
fs.rmSync("dist", { recursive: true, force: true });
fs.cpSync("public", "dist", {
  recursive: true,
  filter: (src) => !src.endsWith("sw.js"),
});
const revenueCat = {
  ios: process.env.REVENUECAT_IOS_KEY || "",
  android: process.env.REVENUECAT_ANDROID_KEY || "",
};
for (const [platform, key] of Object.entries(revenueCat)) {
  if (key.startsWith("sk_")) {
    console.error(
      `REVENUECAT_${platform.toUpperCase()}_KEY に秘密キー（sk_）が指定されています。公開SDKキーを使ってください。`,
    );
    process.exit(1);
  }
  if (!key)
    console.warn(
      `REVENUECAT_${platform.toUpperCase()}_KEY 未設定: ${platform} ではストア購入ボタンが無効になります。`,
    );
}
fs.writeFileSync(
  path.join("dist", "config.js"),
  `window.YUMETAN_CONFIG = ${JSON.stringify({ apiBase: apiUrl, revenueCat })};\n`,
);
console.log(`dist/ を作成しました（接続先: ${apiUrl}）`);
