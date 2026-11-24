# App Store 用スクリーンショット

## 構成（v1.1〜）

- `<機種>/01-home.png`〜`05-plans.png`: **App Store に載せる画像**。アプリ画面を端末の枠に入れ、見出し・説明・キャラクターを夜空の背景に配置したもの。`scripts/appstore-marketing.mjs` が `raw/` から作る。大きさは元の画面と同じ（下表）。
- `raw/<機種>/`: 元のアプリ画面。`scripts/appstore-screenshots.mjs` が撮影。
- `subscriptions/`: サブスクリプション審査用。購入画面そのものを見せるため、枠や文言は付けない。

| フォルダ | App Store Connect の欄 | 大きさ |
| --- | --- | --- |
| `iphone-6.9` | Dynamic Island搭載iPhone（大型ディスプレイ） | 1320×2868 |
| `iphone-6.7` | 同上の予備（1320×2868 が通らないとき） | 1290×2796 |
| `iphone-6.3` | Dynamic Island搭載iPhone（中型ディスプレイ） | 1206×2622 |
| `iphone-6.5` | Face ID搭載iPhone（大型ディスプレイ） | 1242×2688 |
| `ipad-13` | iPad 13インチディスプレイ | 2064×2752 |

作り直すとき（`PORT=3187 npm start` を起動した状態で）:

```
node scripts/appstore-screenshots.mjs docs/appstore/screenshots/raw
node scripts/appstore-screenshots.mjs docs/appstore/screenshots/raw --only=iphone-6.3
node scripts/appstore-screenshots.mjs docs/appstore/screenshots/raw --only=iphone-6.7
node scripts/appstore-marketing.mjs
```

1 行目は `raw/subscriptions` も作るので、審査用を更新するときは `subscriptions/` に移す。見出しと説明文は `scripts/appstore-marketing.mjs` の `SLIDES` にある。

---

以下は v1.0 時点の記録。

`scripts/appstore-screenshots.mjs` で、現行ビルドのアプリ本体を iPhone / iPad の実ピクセルで描画して撮影したもの。合成・枠付け・ステータスバーの描き込みは無し。ステータスバー領域（セーフエリア上部）はアプリ自身の背景のまま（実機では OS が時計を重ねる）。他プラットフォームへの言及（Google Play / Android）は含まれない。

撮影日: 2026-10-03 / ビルド: develop（Google Play 言及削除後）

## iPhone 6.9 インチ（App Store Connect: 「iPhone 6.9 インチ」欄）

iPhone 16 Pro Max 相当（440×956 pt, @3x）。受付サイズ 1320×2868。

| ファイル | 画面 | ピクセル |
| --- | --- | --- |
| `iphone-6.9/01-home.png` | ホーム（キャラクターと夢レベル） | 1320×2868 |
| `iphone-6.9/02-record.png` | 夢の記録（本文入力済み） | 1320×2868 |
| `iphone-6.9/03-reading.png` | AI の夢診断（結果表示） | 1320×2868 |
| `iphone-6.9/04-community.png` | みんなの夢（当日の投稿） | 1320×2868 |
| `iphone-6.9/05-plans.png` | プラン比較 | 1320×2868 |

## iPhone 6.5 インチ（App Store Connect: 「iPhone 6.5 インチ」欄）

iPhone 11 Pro Max 相当（414×896 pt, @3x）。受付サイズ 1242×2688。

| ファイル | 画面 | ピクセル |
| --- | --- | --- |
| `iphone-6.5/01-home.png` | ホーム（キャラクターと夢レベル） | 1242×2688 |
| `iphone-6.5/02-record.png` | 夢の記録（本文入力済み） | 1242×2688 |
| `iphone-6.5/03-reading.png` | AI の夢診断（結果表示） | 1242×2688 |
| `iphone-6.5/04-community.png` | みんなの夢（当日の投稿） | 1242×2688 |
| `iphone-6.5/05-plans.png` | プラン比較 | 1242×2688 |

## iPad 13 インチ（App Store Connect: 「iPad 13 インチ」欄）

iPad Pro 13 インチ相当（1032×1376 pt, @2x）。受付サイズ 2064×2752。

| ファイル | 画面 | ピクセル |
| --- | --- | --- |
| `ipad-13/01-home.png` | ホーム（キャラクターと夢レベル） | 2064×2752 |
| `ipad-13/02-record.png` | 夢の記録（本文入力済み） | 2064×2752 |
| `ipad-13/03-reading.png` | AI の夢診断（結果表示） | 2064×2752 |
| `ipad-13/04-community.png` | みんなの夢（当日の投稿） | 2064×2752 |
| `ipad-13/05-plans.png` | プラン比較 | 2064×2752 |

## サブスクリプション審査用（各サブスクリプション → 審査情報 → スクリーンショット）

iPhone 6.9 インチ、無料会員の状態で各プランの詳細を開いたもの。価格・期間・購読ボタン・「App Store のサブスクリプション設定から解約」の注記が写っている。

| ファイル | 画面 | ピクセル |
| --- | --- | --- |
| `subscriptions/standard-monthly.png` | スタンダード 月額の詳細（com.doyle.yumetan.standard.monthly） | 1320×2868 |
| `subscriptions/standard-yearly.png` | スタンダード 年額の詳細（com.doyle.yumetan.standard.yearly） | 1320×2868 |
| `subscriptions/starter-monthly.png` | スターター 月額の詳細（com.doyle.yumetan.starter.monthly） | 1320×2868 |
| `subscriptions/starter-yearly.png` | スターター 年額の詳細（com.doyle.yumetan.starter.yearly） | 1320×2868 |

## 撮り直し方

```
PORT=3187 npm start   # 別ターミナル
CHROMIUM_PATH=<Chrome/Chromium の実行ファイル> node scripts/appstore-screenshots.mjs docs/appstore/screenshots
```

`--only=iphone-6.9` / `--only=ipad-13` / `--only=subscriptions` で一部だけ撮れる。バックエンドはブラウザ内でモックされ、Firebase / OpenAI / RevenueCat へは通信しない。
