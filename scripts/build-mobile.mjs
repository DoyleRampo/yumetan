// ネイティブアプリ用に public/ を dist/ にコピーし、接続先サーバーURLを埋め込む
// 使い方: API_URL=https://your-server.example.com node scripts/build-mobile.mjs
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
const revenuecatApiKey = process.env.REVENUECAT_APPLE_API_KEY || "";
if (/^sk_/.test(revenuecatApiKey)) {
  console.error(
    "REVENUECAT_APPLE_API_KEY には公開SDKキーを指定してください。秘密キー(sk_)はアプリに埋め込めません。",
  );
  process.exit(1);
}
fs.writeFileSync(
  path.join("dist", "config.js"),
  `window.YUMETAN_CONFIG = { apiBase: ${JSON.stringify(apiUrl)}, revenuecatApiKey: ${JSON.stringify(revenuecatApiKey)} };\n`,
);
console.log(
  `dist/ を作成しました（接続先: ${apiUrl}、RevenueCat: ${revenuecatApiKey ? "有効" : "未設定"}）`,
);
