#!/bin/sh
# iOS アプリを Xcode の画面を使わずにアーカイブし、App Store Connect（TestFlight）へアップロードする。
# 事前に `npm run mobile:sync`（API_URL / REVENUECAT_IOS_KEY 付き）で dist/ と ios/ を更新しておくこと。
#
# 使い方:
#   IOS_TEAM_ID=XXXXXXXXXX npm run ios:upload
#
# 環境変数:
#   IOS_TEAM_ID   （必須）Apple Developer の Team ID（10桁）。
#                 developer.apple.com/account → Membership details → Team ID、または
#                 security find-certificate -a -c "Apple Development" -p | openssl x509 -noout -subject
#                 の出力に含まれる OU= の値。
#   BUILD_NUMBER  （任意）ビルド番号。未指定なら現在日時（例: 202609191230）を使うので、
#                 前回より必ず大きくなる。
#   MARKETING_VERSION （任意）表示バージョン。未指定なら Xcode プロジェクトの値（1.0）。
#   ASC_KEY_ID / ASC_ISSUER_ID / ASC_API_KEY_PATH
#                 （任意、3つセット）App Store Connect API キーの Key ID・Issuer ID・.p8 ファイルのパス。
#                 指定すると Apple ID のログインなしでアップロードできる（GitHub Actions 用）。
#   IOS_PROVISIONING_PROFILE
#                 （任意）App Store 用プロビジョニングプロファイル（.mobileprovision）のパス。
#                 指定すると自動署名を使わず、このプロファイルと Apple Distribution 証明書で署名する
#                 （GitHub Actions 用。Apple ID のログインがない環境では自動署名が使えないため）。
#
# 署名: IOS_PROVISIONING_PROFILE 未指定なら Xcode の自動署名（-allowProvisioningUpdates）。その場合は
# Xcode → Settings → Accounts に Apple ID が追加されていること。
set -eu

: "${IOS_TEAM_ID:?IOS_TEAM_ID（Apple Developer の Team ID）を指定してください}"
BUILD_NUMBER="${BUILD_NUMBER:-$(date +%Y%m%d%H%M)}"
MARKETING_VERSION="${MARKETING_VERSION:-}"
AUTH_ARGS=""
if [ -n "${ASC_KEY_ID:-}" ] || [ -n "${ASC_ISSUER_ID:-}" ] || [ -n "${ASC_API_KEY_PATH:-}" ]; then
  : "${ASC_KEY_ID:?ASC_KEY_ID / ASC_ISSUER_ID / ASC_API_KEY_PATH は3つセットで指定してください}"
  : "${ASC_ISSUER_ID:?ASC_KEY_ID / ASC_ISSUER_ID / ASC_API_KEY_PATH は3つセットで指定してください}"
  : "${ASC_API_KEY_PATH:?ASC_KEY_ID / ASC_ISSUER_ID / ASC_API_KEY_PATH は3つセットで指定してください}"
  [ -f "$ASC_API_KEY_PATH" ] || { echo "ASC_API_KEY_PATH のファイルがありません: $ASC_API_KEY_PATH" >&2; exit 1; }
  AUTH_ARGS="-authenticationKeyPath $ASC_API_KEY_PATH -authenticationKeyID $ASC_KEY_ID -authenticationKeyIssuerID $ASC_ISSUER_ID"
fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/build/ios"
ARCHIVE="$OUT/App.xcarchive"
EXPORT_PLIST="$OUT/ExportOptions.plist"
BUNDLE_ID="$(sed -n 's/.*PRODUCT_BUNDLE_IDENTIFIER = \([^;]*\);.*/\1/p' "$ROOT/ios/App/App.xcodeproj/project.pbxproj" | head -1)"

# 署名関連の xcodebuild 引数（位置パラメータに積む。値に空白を含むため）
set -- -allowProvisioningUpdates CODE_SIGN_STYLE=Automatic
EXPORT_SIGNING="  <key>signingStyle</key><string>automatic</string>"
PROFILE_NAME=""
if [ -n "${IOS_PROVISIONING_PROFILE:-}" ]; then
  [ -f "$IOS_PROVISIONING_PROFILE" ] || { echo "IOS_PROVISIONING_PROFILE のファイルがありません: $IOS_PROVISIONING_PROFILE" >&2; exit 1; }
  PROFILE_PLIST="$(security cms -D -i "$IOS_PROVISIONING_PROFILE")"
  PROFILE_NAME="$(printf '%s' "$PROFILE_PLIST" | plutil -extract Name raw -o - -)"
  PROFILE_UUID="$(printf '%s' "$PROFILE_PLIST" | plutil -extract UUID raw -o - -)"
  PROFILE_APP_ID="$(printf '%s' "$PROFILE_PLIST" | plutil -extract Entitlements.application-identifier raw -o - -)"
  if [ "$PROFILE_APP_ID" != "$IOS_TEAM_ID.$BUNDLE_ID" ]; then
    echo "プロビジョニングプロファイル「$PROFILE_NAME」は $PROFILE_APP_ID 用です。$IOS_TEAM_ID.$BUNDLE_ID 用（App Store Connect 配布）のプロファイルを作り直してください。" >&2
    exit 1
  fi
  if ! security find-identity -v -p codesigning | grep -q "Apple Distribution"; then
    echo "キーチェーンに Apple Distribution 証明書がありません（Apple Development ではアップロードできません）。Keychain Access で「Apple Distribution: …」を秘密鍵ごと .p12 に書き出してください。" >&2
    exit 1
  fi
  for dir in "$HOME/Library/MobileDevice/Provisioning Profiles" "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"; do
    mkdir -p "$dir"
    cp "$IOS_PROVISIONING_PROFILE" "$dir/$PROFILE_UUID.mobileprovision"
  done
  node "$ROOT/scripts/ios-manual-signing.mjs" "$PROFILE_NAME" "$IOS_TEAM_ID"
  set -- CODE_SIGN_STYLE=Manual "CODE_SIGN_IDENTITY=Apple Distribution"
  EXPORT_SIGNING="  <key>signingStyle</key><string>manual</string>
  <key>signingCertificate</key><string>Apple Distribution</string>
  <key>provisioningProfiles</key><dict><key>$BUNDLE_ID</key><string>$PROFILE_NAME</string></dict>"
  echo "手動署名: プロファイル「$PROFILE_NAME」($PROFILE_UUID)"
fi

if [ ! -f "$ROOT/ios/App/App/public/config.js" ]; then
  echo "ios/App/App/public/config.js がありません。先に API_URL=... REVENUECAT_IOS_KEY=appl_... npm run mobile:sync を実行してください。" >&2
  exit 1
fi
if grep -q '"ios":"test_' "$ROOT/ios/App/App/public/config.js"; then
  echo "埋め込まれている RevenueCat キーが Test Store 用（test_）です。appl_ キーで npm run mobile:sync をやり直してください。" >&2
  exit 1
fi

rm -rf "$OUT"
mkdir -p "$OUT"

echo "==> Archive (build $BUILD_NUMBER)"
xcodebuild archive \
  -workspace "$ROOT/ios/App/App.xcworkspace" \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE" \
  "$@" \
  DEVELOPMENT_TEAM="$IOS_TEAM_ID" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  ${MARKETING_VERSION:+MARKETING_VERSION="$MARKETING_VERSION"}

cat > "$EXPORT_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>$IOS_TEAM_ID</string>
$EXPORT_SIGNING
  <key>uploadSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict>
</plist>
PLIST

echo "==> Upload to App Store Connect"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$EXPORT_PLIST" \
  -exportPath "$OUT/export" \
  -allowProvisioningUpdates \
  $AUTH_ARGS

echo "アップロードしました（build $BUILD_NUMBER）。App Store Connect → TestFlight で処理完了を待ってください。"
