# RevenueCat でのプラン作成（iOS / Android ストア内課金）

`public/core/plans.js` の `PLANS` / `ENTITLEMENTS` / `STORE_PRODUCTS` / `OFFERING` が唯一の定義です。ストア・RevenueCat・Stripe・サーバーの値がずれないよう、価格や回数を変えるときは先に `plans.js` を変え、テストを通してから各ストアへ反映してください。

## 全体像

- **RevenueCat を会員状態の単一ソース**にします。iOS/Android は RevenueCat SDK で購入、Web は既存の Stripe Checkout を RevenueCat の Stripe 連携に流し込み、どの経路でも同じエンタイトルメントになります。
- **app_user_id は Firebase UID**（ログイン後に `logIn(uid)`）。匿名 UID では購入させません。既存の `memberships/{uid}` の意味は変えず、Stripe Webhook と同じ形式で RevenueCat Webhook からも書き込む方針です。
- ストアの手数料（Apple/Google 最大30%、小規模事業者プログラムで15%）と RevenueCat の料金（月間取引額 US$2,500 超で1%）は [PLANS_AND_SETUP.md](PLANS_AND_SETUP.md) の試算の「手数料30%」に含めています。

## 作るもの一覧

### エンタイトルメント（2つ）

| lookup key | 表示名 | 付与されるプラン |
|---|---|---|
| `starter` | Yumetan Starter | スターター（夢3件/日、GPT30回/月、OCR5回/月、みんなの夢） |
| `standard` | Yumetan Standard | スタンダード（夢10件/日、GPT90回/月、OCR20回/月、みんなの夢） |

1人のユーザーが同時に持つエンタイトルメントは1つです。サーバーは `standard` があればそれを優先し、なければ `starter`、どちらもなければ無料として扱います。

### プロダクト（ストアごとに4つ）

| キー | プラン / 周期 | 価格（税込・JPY） | App Store product ID | Google Play（subscription:basePlan） | Stripe price |
|---|---|---:|---|---|---|
| `starter_monthly` | スターター / 月 | 490円 | `com.hikaso.yumetan.starter.monthly` | `yumetan_starter:monthly` | `STRIPE_PRICE_STARTER_MONTHLY` |
| `starter_yearly` | スターター / 年 | 4,800円 | `com.hikaso.yumetan.starter.yearly` | `yumetan_starter:yearly` | `STRIPE_PRICE_STARTER_YEARLY` |
| `standard_monthly` | スタンダード / 月 | 980円 | `com.hikaso.yumetan.standard.monthly` | `yumetan_standard:monthly` | `STRIPE_PRICE_STANDARD_MONTHLY` |
| `standard_yearly` | スタンダード / 年 | 9,800円 | `com.hikaso.yumetan.standard.yearly` | `yumetan_standard:yearly` | `STRIPE_PRICE_STANDARD_YEARLY` |

- App Store は1つのサブスクリプショングループ「Yumetan Plans」に4つを入れ、ランクは スタンダード年 > スタンダード月 > スターター年 > スターター月 の順（アップグレード/ダウングレードの判定に使われます）。
- Google Play は `yumetan_starter` と `yumetan_standard` の2つのサブスクリプションを作り、それぞれに `monthly`（P1M）と `yearly`（P1Y）のベースプランを作ります。RevenueCat の product identifier は `サブスクリプションID:ベースプランID` です。
- 無料トライアル・イントロ価格は設定しません（無料枠がお試しの役割）。年額は「2か月分お得」の表示で訴求します。
- App Store Connect の日本円プライスポイントに 490円 / 4,800円 が無い場合は 480円 / 4,800円 など最も近い値にし、`plans.js` と Stripe 価格も同じ値に揃えてください（サーバーは Stripe 価格の金額一致を検証します）。

### オファリング（1つ）とパッケージ（4つ）

| オファリング | パッケージ lookup key | 表示名 | 含むプロダクト |
|---|---|---|---|
| `default`（current） | `$rc_monthly` | Standard monthly | `standard_monthly`（iOS/Android/Stripe） |
|  | `$rc_annual` | Standard yearly | `standard_yearly` |
|  | `starter_monthly` | Starter monthly | `starter_monthly` |
|  | `starter_yearly` | Starter yearly | `starter_yearly` |

`$rc_monthly` / `$rc_annual` は SDK の `offerings.current.monthly` / `.annual` で取れる標準キーで、おすすめのスタンダードに割り当てます。スターターは独自キーで `availablePackages` から取り出します。

## 手順

### 1. App Store Connect

1. アプリ `com.hikaso.yumetan` → サブスクリプション → グループ「Yumetan Plans」を作成。
2. 上表の product ID で4つの自動更新サブスクリプションを作成し、期間（1か月/1年）、日本円の価格、4言語のローカライズ（表示名・説明）を入力。
3. App Store Server Notifications V2 の URL に RevenueCat が案内する URL を設定。
4. 「App 固有共有シークレット」または In-App Purchase Key（推奨）を RevenueCat に登録。
5. Sandbox テスターを作成。

### 2. Google Play Console

1. アプリ `com.hikaso.yumetan` → 収益化 → サブスクリプションで `yumetan_starter` / `yumetan_standard` を作成。
2. それぞれにベースプラン `monthly`（1か月・自動更新）と `yearly`（1年・自動更新）を追加し、日本円の価格を設定して有効化。
3. Google Cloud のサービスアカウント（Pub/Sub 付き）の JSON を RevenueCat に登録し、リアルタイム開発者通知を RevenueCat のトピックに向ける。
4. ライセンステスターを登録。

### 3. RevenueCat プロジェクト

1. Project「Yumetan」を作成し、App Store / Play Store のアプリを追加（Web を統合する場合は Stripe アプリも追加）。
2. Project Settings → API keys で **v2 secret key**（Products/Entitlements/Offerings の write 権限）を作成し、`.env` に `REVENUECAT_SECRET_API_KEY` と `REVENUECAT_PROJECT_ID` を設定。
3. まずドライランで作成内容を確認し、問題なければ適用します。

```sh
node scripts/revenuecat-setup.mjs           # 作成予定の一覧を表示するだけ
node scripts/revenuecat-setup.mjs --apply   # 無いものだけ作成（削除はしない）
```

ダッシュボードで手作業する場合も、上表と同じ lookup key / product ID を使ってください。オファリング `default` を **Current** にするのを忘れずに。

4. Integrations → Webhooks で本番サーバーの `/api/billing/revenuecat`（実装予定）を登録し、Authorization ヘッダーの値を控える。

### 4. サーバー連携（次の実装）

`memberships/{uid}` の書き込み元を Stripe に加えて RevenueCat にも広げます。方針:

- `POST /api/billing/revenuecat`：Authorization ヘッダーが `REVENUECAT_WEBHOOK_AUTH` と一致しなければ 401。イベントの `app_user_id`（Firebase UID）と `aliases` を確認し、**イベント本文を信じず** `GET /v2/projects/{id}/customers/{uid}/active_entitlements` で現在のエンタイトルメントと期限を取り直してから書き込む。
- 書き込み内容は Stripe と同じ `{ plan, cycle, status: "active", paidUntil, cancelAtPeriodEnd, provider: "revenuecat", lastEventCreated }`。`standard` と `starter` が両方あれば `standard`。
- `EXPIRATION` / `CANCELLATION`（返金）/ `BILLING_ISSUE` で期限切れなら `plan: "free"`、`paidUntil: 0`。猶予期間中は RevenueCat の期限に従う。
- `storeProductPlan(product_id)` で product ID をプランへ写像し、未知の product ID は無料扱い。
- 同じ UID に Stripe と RevenueCat の両方があるとき、期限が遠いほうを採用（二重課金は Customer Portal / ストアで解約案内）。

### 5. アプリ連携（次の実装）

- `@revenuecat/purchases-capacitor` を追加し、ネイティブ起動時に `configure({ apiKey, appUserID: uid })`、ログイン時に `logIn`、ログアウトで `logOut`。
- プラン画面の購入ボタンをネイティブでは `purchasePackage` に切り替え、Web は従来の Stripe Checkout のまま。購入後は `/api/account` を再取得して表示（サーバーの会員状態が正）。
- 「購入の復元」ボタン（Apple 審査要件）と、契約管理はストアの購読管理画面へのリンク。
- iOS/Android では外部決済（Stripe）のボタンやリンクを出さない（ストア規約）。

### 6. テスト

- iOS Sandbox / Play ライセンステスターで購入 → `memberships` が `active` になるか、期限（Sandbox は短縮）で `free` に戻るか、復元、アップグレード/ダウングレード、支払い失敗を確認。
- RevenueCat の Test webhook イベントでサーバーの受信を確認。
- 本番切替時は Webhook URL、Authorization、v2 secret key を本番プロジェクトの値に揃える。

## 参考

- [RevenueCat REST API v2](https://www.revenuecat.com/docs/api-v2)
- [Product configuration](https://www.revenuecat.com/docs/offerings/products-overview)
- [Entitlements](https://www.revenuecat.com/docs/getting-started/entitlements) / [Offerings](https://www.revenuecat.com/docs/offerings/overview)
- [Webhooks](https://www.revenuecat.com/docs/integrations/webhooks) / [Event types](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields)
- [Capacitor SDK](https://www.revenuecat.com/docs/getting-started/installation/capacitor)
- [Stripe Billing との連携](https://www.revenuecat.com/docs/web/integrations/stripe)
