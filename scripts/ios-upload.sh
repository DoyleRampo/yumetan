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
#
# 署名は Xcode に登録済みの Apple ID による自動署名（-allowProvisioningUpdates）を使う。
# Xcode → Settings → Accounts に Apple ID が追加されていること。
set -eu

: "${IOS_TEAM_ID:?IOS_TEAM_ID（Apple Developer の Team ID）を指定してください}"
BUILD_NUMBER="${BUILD_NUMBER:-$(date +%Y%m%d%H%M)}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/build/ios"
ARCHIVE="$OUT/App.xcarchive"
EXPORT_PLIST="$OUT/ExportOptions.plist"

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
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$IOS_TEAM_ID" \
  CODE_SIGN_STYLE=Automatic \
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
  <key>signingStyle</key><string>automatic</string>
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
  -allowProvisioningUpdates

echo "アップロードしました（build $BUILD_NUMBER）。App Store Connect → TestFlight で処理完了を待ってください。"
