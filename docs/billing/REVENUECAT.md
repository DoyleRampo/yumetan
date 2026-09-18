# RevenueCat でのプラン作成（iOS / App Store）

`public/core/plans.js` の `PLANS` / `ENTITLEMENTS` / `STORE_PRODUCTS` / `OFFERING` が唯一の定義です。ストア・RevenueCat・Stripe・サーバーの値がずれないよう、価格や回数を変えるときは先に `plans.js` を変え、テストを通してから各所へ反映してください。

配信は **App Store のみ** です。Google Play での配信・課金は行いません（Android プロジェクトは開発・検証用に残しています）。アプリの Bundle ID は `com.doyle.yumetan` です。

## 全体像

- **RevenueCat を会員状態の単一ソース**にします。iOS は RevenueCat SDK で購入、Web は既存の Stripe Checkout を RevenueCat の Stripe 連携に流し込み、どの経路でも同じエンタイトルメントになります。
- **app_user_id は Firebase UID**（ログイン後に `logIn(uid)`）。匿名 UID では購入させません。既存の `memberships/{uid}` の意味は変えず、Stripe Webhook と同じ形式で RevenueCat Webhook からも書き込む方針です。
- Apple の手数料（標準30%、App Store Small Business Program で15%）と RevenueCat の料金（月間取引額 US$2,500 超で1%）は [PLANS_AND_SETUP.md](PLANS_AND_SETUP.md) の試算の「手数料30%」に含めています。

## 作るもの一覧

### エンタイトルメント（2つ）

| lookup key | 表示名 | 付与されるプラン |
|---|---|---|
| `starter` | Yumetan Starter | スターター（夢3件/日、GPT30回/月、OCR5回/月、みんなの夢） |
| `standard` | Yumetan Standard | スタンダード（夢10件/日、GPT90回/月、OCR20回/月、みんなの夢） |

1人のユーザーが同時に持つエンタイトルメントは1つです。サーバーは `standard` があればそれを優先し、なければ `starter`、どちらもなければ無料として扱います。

### プロダクト（App Store 4つ、Stripe 4つ）

| キー | プラン / 周期 | 価格（税込・JPY） | App Store product ID | Stripe price（Web） |
|---|---|---:|---|---|
| `starter_monthly` | スターター / 月 | 490円 | `com.doyle.yumetan.starter.monthly` | `STRIPE_PRICE_STARTER_MONTHLY` |
| `starter_yearly` | スターター / 年 | 4,800円 | `com.doyle.yumetan.starter.yearly` | `STRIPE_PRICE_STARTER_YEARLY` |
| `standard_monthly` | スタンダード / 月 | 980円 | `com.doyle.yumetan.standard.monthly` | `STRIPE_PRICE_STANDARD_MONTHLY` |
| `standard_yearly` | スタンダード / 年 | 9,800円 | `com.doyle.yumetan.standard.yearly` | `STRIPE_PRICE_STANDARD_YEARLY` |

- App Store は1つのサブスクリプショングループ「Yumetan Plans」に4つを入れ、ランクは スタンダード年 > スタンダード月 > スターター年 > スターター月 の順（アップグレード/ダウングレードの判定に使われます）。
- 無料トライアル・イントロ価格は設定しません（無料枠がお試しの役割）。年額は「2か月分お得」の表示で訴求します。
- App Store Connect の日本円プライスポイントに 490円 / 4,800円 が無い場合は 480円 / 4,800円 など最も近い値にし、`plans.js` と Stripe 価格も同じ値に揃えてください（サーバーは Stripe 価格の金額一致を検証します）。

### オファリング（1つ）とパッケージ（4つ）

| オファリング | パッケージ lookup key | 表示名 | 含むプロダクト |
|---|---|---|---|
| `default`（current） | `$rc_monthly` | Standard monthly | `standard_monthly`（iOS / Stripe） |
|  | `$rc_annual` | Standard yearly | `standard_yearly` |
|  | `starter_monthly` | Starter monthly | `starter_monthly` |
|  | `starter_yearly` | Starter yearly | `starter_yearly` |

`$rc_monthly` / `$rc_annual` は SDK の `offerings.current.monthly` / `.annual` で取れる標準キーで、おすすめのスタンダードに割り当てます。スターターは独自キーで `availablePackages` から取り出します。

## 手順

### 1. App Store Connect

1. アプリ `com.doyle.yumetan` → 「サブスクリプション」→ サブスクリプショングループを作成し、参照名を「Yumetan Plans」にする。
2. 上表の product ID で4つの自動更新サブスクリプションを作成し、期間（1か月/1年）、日本を基準国にした日本円の価格、4言語（日・英・韓・中）のローカライズ（表示名・説明）を入力。
3. グループ内のランクを スタンダード年 > スタンダード月 > スターター年 > スターター月 にする。
4. 「ユーザとアクセス」→「統合」→「App内課金」で **In-App Purchase Key（.p8）** を発行し、Issuer ID・Key ID とともに控える（RevenueCat に登録する）。
5. 「App情報」→「App Store Server Notifications」の Production / Sandbox URL に、手順3で RevenueCat が表示する URL を貼る。
6. 「ユーザとアクセス」→「Sandbox」でテスターを1人以上作る。
7. 審査用に、各サブスクリプションの審査情報にスクリーンショットとメモを入れる。購入画面には「購入の復元」ボタンと利用規約・プライバシーポリシーへのリンクが必要（アプリ側の実装項目）。

### 2. RevenueCat プロジェクト

1. Project「Yumetan」を作成し、「Apps & providers」→「+ New」で **App Store** アプリを追加。Bundle ID `com.doyle.yumetan`、手順1の In-App Purchase Key を登録し、表示される Server Notifications URL を App Store Connect に貼る。
2. Web を統合する場合は **Stripe** アプリも追加して Stripe アカウントを接続する（既存の Stripe 価格 ID をそのまま RevenueCat のプロダクトとして登録できます）。
3. App Store アプリの **Public API key** を控える（Capacitor SDK の `configure` に使う値）。
4. Project Settings → API keys で **v2 secret key**（Products / Entitlements / Offerings の read+write 権限）を作成し、`.env` に `REVENUECAT_SECRET_API_KEY` と `REVENUECAT_PROJECT_ID` を設定。
5. まずドライランで作成内容を確認し、問題なければ適用します。

```sh
node scripts/revenuecat-setup.mjs           # 作成予定の一覧を表示するだけ
node scripts/revenuecat-setup.mjs --apply   # 無いものだけ作成（削除はしない）
```

ダッシュボードで手作業する場合も、上表と同じ lookup key / product ID を使ってください。オファリング `default` を **Current** にするのを忘れずに。

6. Integrations → Webhooks で本番サーバーの `/api/billing/revenuecat`（実装予定）を登録し、Authorization ヘッダーの値を控える。

### 3. サーバー連携（実装済み）

`server/revenuecat.js` が `POST /api/billing/revenuecat` を受け取り、`memberships/{uid}` を Stripe と同じ形式で更新します。

- 認証：リクエストの `Authorization` ヘッダーが環境変数 `REVENUECAT_WEBHOOK_AUTH` と完全一致しなければ 401。RevenueCat の Webhook 設定で同じ値を入れます。
- `app_user_id` / `original_app_user_id` / `aliases` のうち Firebase UID 形式のものを会員として扱い、`$RCAnonymousID:` は無視します（SDK に UID を渡す前の購入は会員に結びつきません。アプリはログイン後にのみ購入ボタンを有効にします）。
- `product_id` を `storeProductPlan()` でプラン・周期へ写像。未知の商品は無料扱い。
- `expiration_at_ms` を `paidUntil` に採用。INITIAL_PURCHASE / RENEWAL / UNCANCELLATION / PRODUCT_CHANGE / SUBSCRIPTION_EXTENDED / TEMPORARY_ENTITLEMENT_GRANT は有効化、CANCELLATION（解約予約）/ BILLING_ISSUE / SUBSCRIPTION_PAUSED は期限まで有効で `cancelAtPeriodEnd: true`、EXPIRATION と返金（期限が過去）は無料へ。TEST や TRANSFER などは 200 で受け取り無視。
- 同じイベント ID の再送は無視。`event_timestamp_ms` が既存より古いイベントも無視。
- `environment: SANDBOX` は `REVENUECAT_ALLOW_SANDBOX=true` のときだけ反映（TestFlight / Sandbox テスト用。本番は false）。
- Stripe の有効期間のほうが長い場合は Stripe を維持し、ストア購入の期限が長ければ `provider: "revenuecat"` に切り替えます。

### 4. アプリ連携（実装済み）

- `@revenuecat/purchases-capacitor` を依存に追加。`npx cap sync ios` で Pod が入ります。
- `public/core/native-billing.js` が iOS でのみ動き、`configure({ apiKey, appUserID: uid })`、ログイン時 `logIn`、ログアウト時 `logOut` を行います。公開 SDK キーは `npm run mobile:build` 実行時の環境変数 `REVENUECAT_APPLE_API_KEY` から `dist/config.js` に埋め込みます（`sk_` で始まる秘密キーは拒否）。
- プラン画面の購入ボタンは iOS では `purchasePackage` を呼び、完了後に `/api/account` を数回再取得してプラン反映を待ちます。「購入を復元」ボタンと App Store の契約管理リンクを表示し、Stripe の導線は出しません。
- ボタンが有効になる条件：iOS、SDK キーあり、サーバーが `REVENUECAT_WEBHOOK_AUTH` を設定済み（`/api/account` の `nativeBillingConfigured`）、非匿名ログイン。

### 5. テスト

- サーバーの `.env` に `REVENUECAT_WEBHOOK_AUTH` と、テスト中は `REVENUECAT_ALLOW_SANDBOX=true` を設定。
- `REVENUECAT_APPLE_API_KEY=<公開SDKキー> API_URL=https://<公開URL> npm run mobile:sync` → Xcode で実機にインストール。
- iOS Sandbox テスターで購入 → `memberships` が `active` になるか、期限（Sandbox は短縮）で `free` に戻るか、復元、アップグレード/ダウングレード、支払い失敗を確認。
- RevenueCat の Test webhook イベントでサーバーの受信を確認。
- 本番切替時は Webhook URL、Authorization、v2 secret key、Public API key を本番プロジェクトの値に揃える。

## 参考

- [RevenueCat REST API v2](https://www.revenuecat.com/docs/api-v2)
- [Product configuration](https://www.revenuecat.com/docs/offerings/products-overview)
- [Entitlements](https://www.revenuecat.com/docs/getting-started/entitlements) / [Offerings](https://www.revenuecat.com/docs/offerings/overview)
- [Webhooks](https://www.revenuecat.com/docs/integrations/webhooks) / [Event types](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields)
- [Capacitor SDK](https://www.revenuecat.com/docs/getting-started/installation/capacitor)
- [Stripe Billing との連携](https://www.revenuecat.com/docs/web/integrations/stripe)
