// CI 用: App ターゲットの Release 構成だけを手動署名（指定したプロビジョニングプロファイル）に切り替える。
// 使い方: node scripts/ios-manual-signing.mjs "<プロファイル名>" <Team ID>
// フレームワーク（Pods）にはプロファイルを付けられないため、xcodebuild の引数ではなく
// App ターゲットの設定にだけ PROVISIONING_PROFILE_SPECIFIER を書き込む。
import fs from "node:fs";

const [profileName, teamId] = process.argv.slice(2);
if (!profileName || !teamId) {
  console.error("使い方: node scripts/ios-manual-signing.mjs <プロファイル名> <Team ID>");
  process.exit(1);
}
const file = "ios/App/App.xcodeproj/project.pbxproj";
let src = fs.readFileSync(file, "utf8");
let patched = 0;
src = src.replace(
  /(\/\* Release \*\/ = \{\s*isa = XCBuildConfiguration;[\s\S]*?buildSettings = \{\n)([\s\S]*?)(\t*\};\s*name = Release;)/g,
  (whole, head, body, tail) => {
    if (!body.includes("PRODUCT_BUNDLE_IDENTIFIER")) return whole; // プロジェクト全体の設定はそのまま
    patched++;
    body = body.replace(
      /^\s*"?(CODE_SIGN_STYLE|CODE_SIGN_IDENTITY|DEVELOPMENT_TEAM|PROVISIONING_PROFILE_SPECIFIER)(\[[^\]]*\])?"? = .*\n/gm,
      "",
    );
    body +=
      `\t\t\t\tCODE_SIGN_IDENTITY = "Apple Distribution";\n` +
      `\t\t\t\t"CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "Apple Distribution";\n` +
      `\t\t\t\tCODE_SIGN_STYLE = Manual;\n` +
      `\t\t\t\tDEVELOPMENT_TEAM = ${teamId};\n` +
      `\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = "${profileName}";\n`;
    return head + body + tail;
  },
);
if (patched !== 1) {
  console.error(`App ターゲットの Release 構成が ${patched} 件見つかりました（1件のはず）。project.pbxproj を確認してください。`);
  process.exit(1);
}
fs.writeFileSync(file, src);
console.log(`App の Release 構成を手動署名に切り替えました（プロファイル: ${profileName}）`);
