# 有料プラン・夢の交流・GPT運用（v4.3）

## プラン

価格は指定された日本円の請求総額としてStripe価格に登録します。年額は年1回の一括請求です。

| 機能 | フリー | スターター | スタンダード |
|---|---:|---:|---:|
| 月額 | 0円 | 490円 | 980円 |
| 年額 | 0円 | 4,800円 | 9,800円 |
| 夢の記録（日付ごと） | 1件 | 3件 | 10件 |
| 今日の日記（日付ごと） | 1ページ | 1ページ | 1ページ |
| GPT振り返り（月） | なし | 30回 | 90回 |
| 手書きOCR（月） | なし | 5回 | 20回 |
| 他ユーザーの投稿表示（日） | なし | 30件 | 150件 |
| 新しく公開する夢（日） | なし | 1件 | 3件 |
| 同時公開数 | なし | 10件 | 50件 |
| コメント（日） | なし | 10件 | 30件 |
| スタンプ操作（日） | なし | 30回 | 100回 |
| GPT費用の月間内部上限 | 0 | US$0.50 | US$1.25 |

全プランで16タイプ・2シリーズのキャラクター、睡眠レベル、端末内分析、画像添付（OCRを除く）、過去の閲覧・編集、JSONバックアップを使えます。日記は1日1ページを何度でも編集する設計です。

記録枠は「その日付に保存されている件数」です。編集は新規枠を使わず、削除すればその枠が空きます。過去の記録やバックアップの復元は削除せず保持します。端末内記録の制限はUIの製品ルールであり、端末データの改変まで防止するDRMではありません。通信不能で会員確認できない間の新規記録は無料枠を使います。既存の記録の編集は可能です。

交流枠は毎日0:00 UTC、AI枠は毎月1日0:00 UTC（日本時間9:00）にリセット。月額/年額とも同じ枠で、繰り越しなし。プラン変更で使用数はリセットしません。年額を12か月分まとめて使うこともできません。交流はオンラインかつ非匿名ログインが必要です。

投稿表示は一覧で返した件数＋詳細表示回数。再読み込み、コメント/スタンプ後の詳細再取得も表示枠を使います。自分の投稿の管理は対象外。1投稿につき300コメント、1コメント500文字、公開本文4,000文字、タイトル80文字、ニックネーム30文字。スタンプは1ユーザー1投稿につき1つで置換/取消可能。操作ごとに日次枠を使います。

## 公開とプライバシー

- 新しい夢と既存の夢は自動公開しません。保存した夢の詳細 → 公開設定で、公開用の文章・呼び名を確認し、同意して公開。
- 公開は有料会員に対してのみ。検索エンジンや匿名ユーザーには返しません。
- 投稿には公開用の本文・タイトル・ニックネーム・タイプ・選んだキャラクターだけを複製。日記、AI分析、睡眠データ、年代、メールアドレス、添付写真は含めません。
- 夢を編集しても公開済み文章は変わりません。再度公開設定から明示的に更新します。
- 非公開に戻すと本文/タイトル/ニックネームを公開用文書から除去し、コメントも他ユーザーは読めなくなります。元の夢は保持。
- 支払期間終了/支払失敗後は、その作者の投稿も他ユーザーから非表示になります。有料状態に戻ると公開設定のままの投稿は再び見えます。無料に戻った本人も「自分の公開設定」から非公開にできます。
- ログイン中に夢を削除するときは先に公開状況をオンライン確認し、該当投稿を非公開にします。通信失敗時は削除を止め、公開投稿だけが取り残されることを防ぎます。
- 投稿APIには `Cache-Control: no-store`。Service WorkerでもAPIをキャッシュしません。ただし、閲覧済み文章のスクリーンショットなどを取り消すことはできません。
- 投稿/コメントはOpenAI Moderationで確認してから公開。判定サービスの失敗時は公開しません。ブロック・通報・コメント削除に対応し、運営者による通報確認と非表示処理を用意しています。

## GPT費用の考え方

2026-09-17確認。GPT-4.1 miniは入力100万トークンUS$0.40、出力US$1.60。画像入力と構造化出力に対応し、推論トークンの追加変動がないため、本アプリの短い振り返りに採用しました。[公式モデル/料金](https://developers.openai.com/api/docs/models/gpt-4.1-mini)

- モデルを `gpt-4.1-mini-2025-04-14` に固定。変更時は費用計算も見直すこと。
- 振り返りの出力800トークン、OCR出力1,600トークン。入力テキスト（指示/スキーマを含む）30,000 UTF-8バイト以内。画像は低詳細設定。
- UTF-8バイト数をテキストのトークン数の保守的上限として扱い、画像/メッセージの予備枠を加えて呼び出し前に費用枠を確保。実請求額の会計ではなく、過大寄りの利用制限です。
- 回数・ユーザー別費用・サービス全体費用をFirestoreの同一トランザクションで確保。同時アクセスや再起動による回数超過を防ぎます。
- 自動リトライなし、45秒タイムアウト。API実行開始後は失敗/タイムアウトも回数・確保費用を消費（提供元で請求が発生したか判別できないため）。入力不正・枠不足は送信前に拒否。
- 保存ボタンはAIを呼ばず、分析ボタンまたはOCRだけがAI枠を使います。`store: false`でAPI出力の保存を要求しません。
- 本番の `AI_GLOBAL_MONTHLY_USD` は初期値20ドル。利用者増加時に料金収入と照合して変更。OpenAIプロジェクト側の予算/通知も別途設定してください。Moderation、Firebase、Stripe、ホスティング等はこのGPT上限に含みません。

### 試算（為替1ドル=160円、販売手数料30%を仮定した厳しめのシナリオ）

為替・手数料は試算上の仮定であり、現在の為替相場や実契約の手数料を示すものではありません。税、返金、サポート、サーバー費を引く前です。

| 年額会員の月換算 | スターター | スタンダード |
|---|---:|---:|
| 売上 | 400円 | 約817円 |
| 手数料30%控除後 | 280円 | 約572円 |
| GPT月間費用上限 | 80円 | 200円 |
| その他経費に充てられる残額 | 200円 | 約372円 |

通常の振り返りを入力4,000/出力800トークンと仮定すると1回約0.46円、月30回約14円、90回約42円。長文・OCRに余裕を残しつつ内部上限を設けています。利益は保証できないため、実際の入力量・会員数・解約率・Firebase使用量で月次レビューしてください。無制限のGPTや無制限の投稿閲覧は設定していません。

## 本番接続手順

### 1. Firebase

既存プロジェクト `yumetan-a31f0` の `(default)` に接続します。新しいデータベースは作成していません。本作業の管理アカウントでは403のためデータベースEditionと本番IAMを確認できませんでした。既存アプリが使う通常のFirestore API向けの実装です。運用者の権限でEdition/APIモードとIAMを確認してください。

- Render等に `FIREBASE_PROJECT_ID`、必要に応じ `FIRESTORE_DATABASE_ID`、`FIREBASE_SERVICE_ACCOUNT_JSON` またはApplication Default Credentialsを設定。クライアントと必ず同じプロジェクトにすること。
- サービスアカウントにはFirestore読み書き、Firebase Authのトークン失効/無効ユーザー確認に必要な権限を設定。秘密JSONは公開フォルダやGitへ置かないこと。
- `npx firebase-tools deploy --project yumetan-a31f0 --only firestore:indexes` で追加インデックスを反映。
- 既存 `firestore.rules` は変更していません。許可は本人の `/users/{uid}/...` に限定され、以下のサービス用ルートはクライアントSDKからすべて拒否される設計です。本番に同じルールが反映されていることを確認。

| サーバー専用コレクション | 用途 |
|---|---|
| `memberships` | Stripe由来のプラン・期限・停止状態 |
| `billingCustomers` / `billingEvents` | Stripe顧客との対応・イベント重複防止 |
| `usage` / `serviceBudgets` | 日次/月次回数とGPT費用予約 |
| `communityPosts` と `comments` / `reactions` サブコレクション | 公開用コピーと交流 |
| `communityStats` | 同時公開数 |
| `communityBlocks` / `communityReports` | ブロック・通報 |

期限/回数はサーバー時刻で判定し、ブラウザのプラン名・UIDヘッダー・APIキーは権限の根拠にしません。Firebase IDトークンは失効を含め検証します。

### 2. OpenAI

`OPENAI_API_KEY` をサーバー環境へ設定。入力/出力制限に一致するモデルを利用できるプロジェクトを使ってください。個人キー入力欄、Claude API、キーによる無料枠迂回は廃止しています。

### 3. Stripe（まずテストモード）

- 月490円・年4,800円のStarter、月980円・年9,800円のStandardの4つの継続価格を作成（JPY、1か月/1年、数量1）。環境変数に価格IDを指定。
- `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`、`PUBLIC_APP_URL`（HTTPSの公開元）を設定。
- Webhook URLを `/api/billing/webhook` にし、`checkout.session.completed`、`customer.subscription.created/updated/deleted`、`invoice.paid`、`invoice.payment_failed` を購読。
- Webhook署名と現在のSubscription・Invoice・Priceを検証してから権限を更新します。Checkoutから戻っただけでは権限を与えません。未知の価格、未払い、期限切れは無料扱い。
- Customer Portalを有効化し、対象4価格だけを公開。解約は期間末、プラン変更のタイミングと差額精算はStripe側で明示して設定。自動更新・取消条件・事業者/問い合わせ情報を公開。
- 二重購入防止のため既存SubscriptionがあればPortalへ案内、未完了Checkoutがあれば再利用します。
- テストカードで購入、更新、年額、期間末解約、支払失敗、価格変更、Webhook再送を実環境で確認してから、すべてのキー/価格IDを本番モードへ揃えて切り替え。

参考: [StripeのSubscription Webhook](https://docs.stripe.com/billing/subscriptions/webhooks)、[Checkout](https://docs.stripe.com/payments/checkout/build-subscriptions)。

### 4. 運営・ストア

- `SUPPORT_URL` に問い合わせページを設定。通報は定期確認し、必要に応じユーザーを停止。`memberships/{uid}.suspended=true` は管理者のみが設定。
- 運営者のFirebase Custom Claimに `moderator: true` を付与。`GET /api/moderation/reports` で未処理通報、`POST /api/moderation/reports/:id` に `{ "action": "hide" }` または `dismiss` で処理。一般ユーザーはアクセス不可。
- iOS/Androidでは外部決済ボタンを表示せず、ストア内購入はRevenueCat経由で提供します（次節）。既存Web会員はログインして利用できます。配布地域/ストア条件の審査は別途必要です。[Appleのガイドライン](https://developer.apple.com/jp/app-store/review/guidelines/)

### 5. RevenueCat（iOS / Android のストア内課金）

ネイティブアプリの購入は `@revenuecat/purchases-capacitor` で行い、権限付与はサーバーがRevenueCatの購読者情報を秘密キーで読み直して決めます。端末が返す値、Webhook本文のプラン名は権限の根拠にしません。Stripe（Web）とRevenueCat（ストア）は同じ `memberships/{uid}` に書き込み、`source` に現在プランを付与している側を記録します。

本アプリはCapacitor製のため、RevenueCatダッシュボードが表示するSwiftUI用の `Purchases.configure(withAPIKey:)` はそのまま使いません。同じ設定を `public/core/store-billing.js` からJavaScriptで行い、ネイティブビルド時に `scripts/build-mobile.mjs` が公開SDKキーを `dist/config.js` に埋め込みます。

#### ダッシュボード側の設定

1. **Products**: App Store Connect / Google Play Console に4つの自動更新サブスクリプションを作成し、RevenueCatに登録。商品IDは次の語を含めてください（プラン名と `monthly` / `yearly` で判定します）。

   | プラン | 周期 | 商品ID（推奨） |
   |---|---|---|
   | スターター | 月額 | `yumetan_starter_monthly` |
   | スターター | 年額 | `yumetan_starter_yearly` |
   | スタンダード | 月額 | `yumetan_standard_monthly` |
   | スタンダード | 年額 | `yumetan_standard_yearly` |

   Google Playは `商品ID:ベースプランID`（例 `yumetan_starter:monthly`）の形でも判定できます。
2. **Entitlements**: `starter` と `standard` の2つを作成し、上の商品をそれぞれに紐付け。サーバーはこの2つの識別子だけを見ます（`server/revenuecat.js` の `ENTITLEMENTS`）。
3. **Offerings**: `default` オファリングに4パッケージを追加。アプリは商品IDでプラン・周期を判定するため、パッケージ識別子は任意です。
4. **API keys**: 公開SDKキー（`appl_…` / `goog_…`）はモバイルビルドの環境変数へ、秘密キー（`sk_…`）はサーバーの `.env` へ。ダッシュボードの「Install the SDK」に表示される `test_…` キーはTest Store用で、実課金なしに購入フローを確認できます。
5. **Webhooks**: URLを `https://<サーバー>/api/billing/revenuecat/webhook`、Authorization headerに推測できない値（例 `Bearer <ランダム文字列>`）を設定し、同じ文字列を `REVENUECAT_WEBHOOK_AUTH` に入れます。サーバーはこのヘッダーを固定時間比較で照合し、本文のユーザーIDについてRevenueCatから購読者を再取得します。`TEST` イベントは受理のみ。

#### サーバー環境変数

| 変数 | 内容 |
|---|---|
| `REVENUECAT_SECRET_API_KEY` | 秘密APIキー。`GET /v1/subscribers/{uid}` の読み取りに使用 |
| `REVENUECAT_WEBHOOK_AUTH` | Webhookに設定したAuthorization headerの値そのもの |
| `REVENUECAT_ACCEPT_SANDBOX` | `true`（初期値）ならサンドボックス/Test Store購入も有料扱い。本番サーバーでは `false` を推奨 |

`REVENUECAT_SECRET_API_KEY` が無いと `/api/account` の `storeBillingConfigured` が `false` になり、アプリの購入ボタンは無効のまま「準備中」と表示します。

#### モバイルビルド

```sh
API_URL=https://your-server.example.com \
REVENUECAT_IOS_API_KEY=appl_xxx REVENUECAT_ANDROID_API_KEY=goog_xxx \
npm run mobile:sync
```

キー未指定ならTest Storeキーで `dist/config.js` を生成し、警告を出します。ストア公開ビルドでは必ず本番キーを指定してください。iOSはXcodeの Signing & Capabilities で **In-App Purchase** を追加し、`pod install`（`npx cap sync ios`）で `RevenuecatPurchasesCapacitor` を取り込みます。AndroidはGradle同期で `revenuecat-purchases-capacitor` が追加され、課金権限はSDKのマニフェストから統合されます。

#### 動作

- ログイン済み（非匿名）のFirebase UIDをRevenueCatのApp User IDとして `logIn` し、ログアウト時は `logOut`。ゲストはRevenueCat上でも匿名です。購入はログイン後のみ可能で、購入ボタンは未ログイン・未設定時に無効です。
- 「このプランを選ぶ」→ `Purchases.purchasePackage` → 成功後に `POST /api/billing/revenuecat/sync`。サーバーがRevenueCatを読み直し、`memberships/{uid}` に `plan` / `cycle` / `paidUntil`（entitlementの `expires_date`）/ `source: "revenuecat"` を保存。有効期限が過ぎた後の同期でフリーに戻します。
- 「購入を復元」→ `restorePurchases` → 同じ同期。機種変更・再インストール時に使用。
- 「契約管理・解約」→ RevenueCatの `managementURL`（App Store / Google Playの購読設定）を開く。ストア購読の変更・解約・返金はストア側で行い、アプリからは行いません。
- Stripe会員が有効な間は、ストアの同ランク以下のプランで上書きしません（より上位のプランは反映）。逆にストア会員はStripe Checkoutで `manageSubscription` を返し二重契約を防ぎます。未払いのStripeイベントがストア会員のプランを取り消すこともありません。
- 有料期間中はStripeと同じ利用枠。日次/月次リセット、AI費用上限、コミュニティ制限は共通です。

#### 確認手順

1. Test Storeキーでビルドし、Xcode/Android Studioから起動。ログイン後にプラン画面で購入 → 「購入を反映しました」と表示され、`memberships/{uid}.source` が `revenuecat` になること。
2. RevenueCatダッシュボードのCustomer画面で該当UIDにentitlementが付き、Webhook配信履歴が200であること。
3. サンドボックスで期限切れ・解約・復元・別端末ログイン後の復元を確認。
4. App Store/Google Playの本番商品・本番キーへ切り替え、`REVENUECAT_ACCEPT_SANDBOX=false` にしてから配信。

参考: [RevenueCat Capacitor SDK](https://www.revenuecat.com/docs/getting-started/installation/capacitor)、[Webhooks](https://www.revenuecat.com/docs/integrations/webhooks)、[REST API: Get subscriber](https://www.revenuecat.com/docs/api-v1)。

## 検証の範囲

ロジックとブラウザでは、テスト用Firebase認証・メモリ上のトランザクション・Stripe/GPTスタブを使用し、実ユーザーの夢を投稿したり課金したりしません。Firestore APIは本番アクセスできていないため、インデックス/IAM/実決済/ストア購入は上記手順で実環境の確認が必要です。

### 依存関係

Node.js 22以上が必要です。`npm ci`で再現可能なことを確認。互換範囲の更新を適用しましたが、`npm audit`には8件（moderate 4 / high 3 / critical 1）が残ります。high/criticalは既存の画像生成・Capacitor開発ツール依存です。production側にもGoogle認証のgaxios/uuid由来のmoderateが残り、今回の範囲では破壊的な依存変更をしていません。公開前の依存更新・運用レビュー事項として記録します。
