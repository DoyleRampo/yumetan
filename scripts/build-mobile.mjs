// ネイティブアプリ用に public/ を dist/ にコピーし、接続先サーバーURLを埋め込む
// 使い方: API_URL=https://your-server.example.com node scripts/build-mobile.mjs
import fs from "node:fs";
import path from "node:path";

const apiUrl = (process.env.API_URL || "").replace(/\/$/, "");
if (!apiUrl) {
  console.error("API_URL（公開したサーバーのURL）を指定してください。例: API_URL=https://yumetan.onrender.com npm run mobile:build");
  process.exit(1);
}
fs.rmSync("dist", { recursive: true, force: true });
fs.cpSync("public", "dist", { recursive: true, filter: (src) => !src.endsWith("sw.js") });
fs.writeFileSync(path.join("dist", "config.js"), `window.YUMETAN_CONFIG = { apiBase: ${JSON.stringify(apiUrl)} };\n`);
console.log(`dist/ を作成しました（接続先: ${apiUrl}）`);
