# 有料プラン・夢の交流・GPT運用（v4.3）

## プラン

価格は指定された日本円の請求総額としてApp Store Connect / Google Play Consoleのサブスクリプション価格に登録します。年額は年1回の一括請求です。

| 機能 | フリー | スターター | スタンダード |
|---|---:|---:|---:|
| 月額 | 0円 | 490円 | 980円 |
| 年額 | 0円 | 4,900円 | 9,800円 |
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

2026-09-18確認。GPT-5.6 Lunaは2026-07-30の値下げ後、入力100万トークンUS$0.20、出力US$1.20（GPT-4.1 miniのUS$0.40 / US$1.60より安価）。画像入力と構造化出力に対応します。推論モデルのため `reasoning_effort: "none"` を指定し、推論トークンによる費用・出力枠の変動をなくして採用しました。[公式モデル/料金](https://developers.openai.com/api/docs/models/gpt-5.6-luna)

- モデルを `gpt-5.6-luna-2026-07-09` に固定。変更時は費用計算（`server/openai.js` の単価係数）も見直すこと。
- 振り返りの出力800トークン、OCR出力1,600トークン。入力テキスト（指示/スキーマを含む）30,000 UTF-8バイト以内。画像は低詳細設定。
- UTF-8バイト数をテキストのトークン数の保守的上限として扱い、画像/メッセージの予備枠を加えて呼び出し前に費用枠を確保。実請求額の会計ではなく、過大寄りの利用制限です。
- 回数・ユーザー別費用・サービス全体費用をFirestoreの同一トランザクションで確保。同時アクセスや再起動による回数超過を防ぎます。
- 自動リトライなし、45秒タイムアウト。API実行開始後は失敗/タイムアウトも回数・確保費用を消費（提供元で請求が発生したか判別できないため）。入力不正・枠不足は送信前に拒否。
- 保存ボタンはAIを呼ばず、分析ボタンまたはOCRだけがAI枠を使います。`store: false`でAPI出力の保存を要求しません。
- 本番の `AI_GLOBAL_MONTHLY_USD` は初期値20ドル。OpenAI側の月間リロード上限と同じ値にしておくと、枠切れ時にアプリ側が先に分かりやすいメッセージで止まります。利用者増加時に料金収入と照合して変更。OpenAIプロジェクト側の予算/通知も別途設定してください。Moderation、Firebase、ストア手数料、ホスティング等はこのGPT上限に含みません。

### 試算（為替1ドル=160円、販売手数料30%を仮定した厳しめのシナリオ）

為替・手数料は試算上の仮定であり、現在の為替相場や実契約の手数料を示すものではありません。税、返金、サポート、サーバー費を引く前です。

| 年額会員の月換算 | スターター | スタンダード |
|---|---:|---:|
| 売上 | 約408円 | 約817円 |
| 手数料30%控除後 | 約286円 | 約572円 |
| GPT月間費用上限 | 80円 | 200円 |
| その他経費に充てられる残額 | 約206円 | 約372円 |

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
| `memberships` | RevenueCat由来のプラン・周期・期限・解約予定・停止状態 |
| `usage` / `serviceBudgets` | 日次/月次回数とGPT費用予約 |
| `communityPosts` と `comments` / `reactions` サブコレクション | 公開用コピーと交流 |
| `communityStats` | 同時公開数 |
| `communityBlocks` / `communityReports` | ブロック・通報 |

期限/回数はサーバー時刻で判定し、ブラウザのプラン名・UIDヘッダー・APIキーは権限の根拠にしません。Firebase IDトークンは失効を含め検証します。

### 2. OpenAI

`OPENAI_API_KEY` をサーバー環境へ設定。入力/出力制限に一致するモデルを利用できるプロジェクトを使ってください。個人キー入力欄、Claude API、キーによる無料枠迂回は廃止しています。

### 3. RevenueCat（App Store / Google Play のサブスクリプション）

購入はiOS / Androidアプリ内のストア課金だけです。Web版に決済はなく、アプリで購入したプランを同じアカウントでWebでも使えます。Stripeは廃止しました。

**ストア側**

- App Store Connect: 有料App契約に同意し、自動更新サブスクリプションを4つ作成（月490円 / 年4,900円のスターター、月980円 / 年9,800円のスタンダード）。製品IDは `com.doyle.yumetan.starter.monthly`、`com.doyle.yumetan.starter.yearly`、`com.doyle.yumetan.standard.monthly`、`com.doyle.yumetan.standard.yearly`（別のIDでも、`starter`/`standard` と `monthly`/`yearly`（または `year`/`annual`）を含んでいればアプリが一致させます）。Sandboxテスターも作成。
- Google Play Console（Androidを配布する場合）: 同じ製品IDで定期購入を作成し、基本プランを月/年で設定。ライセンステスターを登録。

**RevenueCat側**（プロジェクト: ユメタン）

- Apps: iOS / Android のアプリを登録し、App Store Connect の In-App Purchase Key と Google Play のサービスアカウントを接続。
- Products: ストアの4製品を取り込む。
- Entitlements: `starter` と `standard` の2つを作り、月/年の製品をそれぞれ紐づける。サーバーはこのEntitlement名でプランを決め、製品IDから月/年を判定します。
- Offerings: `default` に4製品のPackageを追加（カスタム識別子 `starter_monthly` / `starter_yearly` / `standard_monthly` / `standard_yearly`）。初期のTest Store用Package（Monthly / Yearly / Lifetime）は削除してよい。
- API keys: 各アプリの公開SDKキー（`appl_…` / `goog_…`）はアプリのビルド時に `REVENUECAT_IOS_KEY` / `REVENUECAT_ANDROID_KEY` として `npm run mobile:build` へ渡す。秘密APIキー（`sk_…`）はサーバーの `REVENUECAT_SECRET_API_KEY` にだけ設定。
- Integrations → Webhooks: URL `https://<サーバー>/api/billing/revenuecat`、Authorization header に自分で決めた長いランダム文字列を入力し、同じ値をサーバーの `REVENUECAT_WEBHOOK_AUTH` に設定。

**サーバーの動作**

- アプリはRevenueCatの App User ID にFirebase UIDを使います。購入・復元後に `POST /api/billing/sync` を呼び、サーバーがRevenueCat REST API（`GET /v1/subscribers/{uid}`）で契約を照会して `memberships/{uid}` を更新します。
- Webhookは Authorization ヘッダーを定数時間比較で検証し、イベント本文の権利情報は信用せず、含まれるユーザーIDについて同じ照会を行います。匿名ID（`$RCAnonymousID:…`）は無視します。`TEST` イベントは受理のみ。
- 期限切れ・未知の製品は無料扱い。解約予定は `cancelAtPeriodEnd` として表示。古い照会結果が後から届いても上書きしません（`request_date_ms` で判定）。
- Sandbox購入も有効化します（Sandboxテスター/ライセンステスターは開発者が登録した人だけが使えるため）。本番配布前にSandboxで購入・復元・解約・期限切れ・Webhook再送を確認してください。

参考: [RevenueCat Webhooks](https://www.revenuecat.com/docs/integrations/webhooks)、[REST API v1](https://www.revenuecat.com/docs/api-v1)、[Capacitor SDK](https://github.com/RevenueCat/purchases-capacitor)。

### 4. 運営・ストア

- `SUPPORT_URL` に問い合わせページを設定。通報は定期確認し、必要に応じユーザーを停止。`memberships/{uid}.suspended=true` は管理者のみが設定。
- 運営者のFirebase Custom Claimに `moderator: true` を付与。`GET /api/moderation/reports` で未処理通報、`POST /api/moderation/reports/:id` に `{ "action": "hide" }` または `dismiss` で処理。一般ユーザーはアクセス不可。
- iOS/Androidでは外部決済ボタンを表示せず、ストア内購入・復元だけを提供します。自動更新・取消条件・事業者/問い合わせ情報をアプリ内とストア掲載情報に明記してください。配布地域/ストア条件の審査は別途必要です。[Appleのガイドライン](https://developer.apple.com/jp/app-store/review/guidelines/)

## 検証の範囲

ロジックとブラウザでは、テスト用Firebase認証・メモリ上のトランザクション・RevenueCat/GPTスタブを使用し、実ユーザーの夢を投稿したり課金したりしません。Firestore APIは本番アクセスできていないため、インデックス/IAM/ストア購入/Webhookは上記手順で実環境の確認が必要です。

### 依存関係

Node.js 22以上が必要です。`npm ci`で再現可能なことを確認。互換範囲の更新を適用しましたが、`npm audit`には8件（moderate 4 / high 3 / critical 1）が残ります。high/criticalは既存の画像生成・Capacitor開発ツール依存です。production側にもGoogle認証のgaxios/uuid由来のmoderateが残り、今回の範囲では破壊的な依存変更をしていません。公開前の依存更新・運用レビュー事項として記録します。
