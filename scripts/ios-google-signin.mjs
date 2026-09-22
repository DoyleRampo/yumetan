// ビルド時に Google Sign-In 用の URL スキーム（iOS クライアント ID を逆順にしたもの）を
// ios/App/App/Info.plist に追加する。GOOGLE_IOS_CLIENT_ID が無ければ何もしない。
import fs from "node:fs";
const clientId = String(process.env.GOOGLE_IOS_CLIENT_ID || "").trim();
if (!clientId) {
  console.warn(
    "GOOGLE_IOS_CLIENT_ID 未設定: Google Sign-In の URL スキームは追加しません。",
  );
  process.exit(0);
}
const match = /^([0-9]+-[a-z0-9]+)\.apps\.googleusercontent\.com$/.exec(
  clientId,
);
if (!match) {
  console.error(
    "GOOGLE_IOS_CLIENT_ID の形式が不正です（例: 123456-abc.apps.googleusercontent.com）。",
  );
  process.exit(1);
}
const scheme = `com.googleusercontent.apps.${match[1]}`;
const file = "ios/App/App/Info.plist";
let plist = fs.readFileSync(file, "utf8");
if (plist.includes(scheme)) {
  console.log(`Info.plist は既に ${scheme} を含んでいます`);
  process.exit(0);
}
const entry = `
		<dict>
			<key>CFBundleTypeRole</key>
			<string>Editor</string>
			<key>CFBundleURLName</key>
			<string>google</string>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>${scheme}</string>
			</array>
		</dict>`;
const updated = plist.replace(
  /(<key>CFBundleURLTypes<\/key>\s*<array>)/,
  `$1${entry}`,
);
if (updated === plist) {
  console.error("Info.plist に CFBundleURLTypes がありません。");
  process.exit(1);
}
fs.writeFileSync(file, updated);
console.log(`Info.plist に URL スキーム ${scheme} を追加しました`);
