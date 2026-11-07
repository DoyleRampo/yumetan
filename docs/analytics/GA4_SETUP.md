# ユーザーのアクセス分析（GA4）セットアップ

LP（公開サイト）のクリック・コンバージョンと、アプリ（Web / iOS / Android）の画面・操作・アクティブ状態を Google アナリティクス 4（GA4）で計測するための設計と手順です。対象の GA4 プロパティは `properties/552897004`（アカウント `407012149`）、Firebase プロジェクトは `yumetan-a31f0` です。

- GA4: https://analytics.google.com/analytics/web/#/a407012149p552897004/reports/intelligenthome
- Firebase: https://console.firebase.google.com/project/yumetan-a31f0

## 1. 全体の設計

| 場所 | 計測方法 | 送信先ストリーム | 設定値の場所 |
| --- | --- | --- | --- |
| LP `landing/`（Firebase Hosting） | gtag.js（`landing/assets/analytics.js`） | ウェブストリーム「ユメタン LP」 | `landing/assets/release-config.mjs` の `GA4_MEASUREMENT_ID` |
| アプリ（Web / PWA） | gtag.js（`public/core/analytics.js`） | ウェブストリーム「ユメタン アプリ」 | `public/config.js` の `ga4MeasurementId` |
| アプリ（iOS / Android の Capacitor WebView） | 同じ gtag.js。クライアント ID はアプリの保存領域に保持 | 同上 | モバイルビルド時の `GA4_MEASUREMENT_ID`（未指定なら `public/config.js` の値） |
| API サーバー（RevenueCat Webhook） | Measurement Protocol（`server/analytics.js`） | 同上（アプリ） | 環境変数 `GA4_MEASUREMENT_ID` と `GA4_API_SECRET` |

ポイント:

- **ネイティブ SDK は使いません。** iOS / Android も WebView 内の同じ JS が計測するため、1 つのウェブストリームと 1 つのイベント定義で全プラットフォームを扱えます。プラットフォームは `app_platform`（web / ios / android）で区別します。GoogleService-Info.plist 等の追加は不要です。
- **クライアント ID はアプリが発行**し（`yumetan.analytics.client`）、Cookie が不安定な iOS WebView でも同じ端末を同じユーザーとして数えます。`capacitor.config.json` で `CapacitorCookies` を有効にし、gtag のセッション Cookie も保持されるようにしています。
- **ログイン中は Firebase UID を `user_id`** として送るため、端末をまたいだユーザー分析（User-ID レポート）ができます。
- **本文・写真・呼び名・メールアドレスは送信しません。** 文字数は区分（`1-30` など）だけ、エラーはコードだけです。
- **広告機能は無効**（`allow_google_signals: false`、`allow_ad_personalization_signals: false`）。有効にする場合はプライバシーポリシーの更新が必要です。
- 測定 ID が空なら、どこからも何も送信されません（テスト・ローカル開発の既定）。

## 2. 設定手順（初回）

### 2-1. GA4 プロパティを自動設定する

`scripts/ga4-setup.mjs` が GA Admin API でプロパティを設定します（何度実行しても既存のものは維持され、足りないものだけ作られます）。

```bash
gcloud auth application-default login --scopes=https://www.googleapis.com/auth/analytics.edit,https://www.googleapis.com/auth/cloud-platform
```

```bash
npm run ga4:setup -- --dry-run
```

```bash
npm run ga4:setup -- --write
```

作られる・確認されるもの:

1. プロパティのタイムゾーン `Asia/Tokyo`・通貨 `JPY`（既存データのある場合は `--keep-locale` で変更しない）
2. ウェブストリーム「ユメタン LP」（URL は `release-config.mjs` の `SITE_URL`）と「ユメタン アプリ」。拡張計測はスクロール・外部リンクを有効、アプリ側の「ページの変更」は無効（アプリが画面ごとに `page_view` を送るため）
3. カスタムディメンション（イベント 34 個・ユーザー 8 個）とカスタム指標 3 個（§4 の一覧）
4. キーイベント（コンバージョン）: `sign_up` `quiz_complete` `dream_save` `dream_read` `diary_save` `dream_share` `begin_checkout` `purchase_confirmed` `app_store_click` `support_contact_click` `demo_submit`（`purchase` は既定でキーイベント）
5. データ保持 14 か月
6. サーバー用の Measurement Protocol シークレット `yumetan-server`（値は作成時に一度だけ表示。`GA4_API_SECRET` に設定）
7. オーディエンス「有料会員」「夢を記録した人」「プラン画面を見て未購入」（`--no-audiences` で省略）
8. `--write` で測定 ID を `public/config.js` と `landing/assets/release-config.mjs` に書き込み

Google アカウントにはプロパティの **編集者** 権限が必要です。`gcloud` が使えない場合は `--token <アクセストークン>` か環境変数 `GA4_ACCESS_TOKEN` で渡せます（[OAuth Playground](https://developers.google.com/oauthplayground/) で `https://www.googleapis.com/auth/analytics.edit` を選んで取得）。

### 2-2. 手で行うこと（API では設定できない項目）

GA4 管理画面（左下の歯車）で:

1. **Firebase との連携**: 管理 → プロダクトのリンク → Firebase のリンク → `yumetan-a31f0` を選択。Firebase コンソール側でも「プロジェクトの設定 → 統合 → Google アナリティクス」で同じプロパティを選びます。これで Firebase コンソールから同じレポートが見られ、将来ネイティブ SDK を足すときも同じプロパティに入ります。
2. **BigQuery エクスポート**（任意・推奨）: 管理 → プロダクトのリンク → BigQuery → プロジェクト `yumetan-a31f0`、データロケーション `asia-northeast1`、毎日。生データで自由に分析できます。
3. **内部トラフィックの除外**: 管理 → データストリーム → 各ストリーム → タグ設定を行う → 内部トラフィックの定義 → 自分の IP を登録 → データフィルタ「内部トラフィック」を「有効」に。
4. **参照元の除外**: 同じ「タグ設定を行う」→ 除外する参照のリスト → `apps.apple.com`、`accounts.google.com`、`appleid.apple.com`、`access.line.me`、`yumetan-a31f0.firebaseapp.com`（ログインから戻ったときに新しいセッションにしないため）。
5. **レポート用 ID**: 管理 → レポート用識別子 → 「ハイブリッド」または「計測データと User-ID」。
6. **Google シグナル**: 既定で無効のまま。有効にする場合はプライバシーポリシーの「広告目的の利用は無効」の文を直してから。
7. **探索レポート（ファネル）** は §6 の定義を手で作ります（API 非対応）。

### 2-3. アプリ・LP・サーバーに測定 ID を配る

| 対象 | 設定 |
| --- | --- |
| Web 版アプリ | `public/config.js` の `ga4MeasurementId`（`--write` で済み）をデプロイ |
| iOS / Android | GitHub Secrets に `GA4_MEASUREMENT_ID`（未設定なら `public/config.js` の値を使う）。`npm run mobile:sync` でも同じ |
| LP | `landing/assets/release-config.mjs` の `GA4_MEASUREMENT_ID`（`--write` で済み）→ `npm run landing:deploy` |
| API サーバー | `.env` / Render / Fly に `GA4_MEASUREMENT_ID`（アプリのストリーム）と `GA4_API_SECRET`。`GET /api/health` の `analyticsConfigured` が `true` になれば有効 |

### 2-4. 動作確認（DebugView）

- Web / LP: URL に `?ga_debug=1` を付けて開く → GA4 管理 → DebugView に端末が現れ、イベントが流れます。
- iOS / Android: `GA4_DEBUG` はありません。TestFlight ビルドで通常のリアルタイムレポート（反映まで数十秒）か、`window.YUMETAN_CONFIG.ga4Debug = true` を `scripts/build-mobile.mjs` に一時的に足した開発ビルドで DebugView を使います。
- サーバー: `GA4_DEBUG=1` を付けて起動すると Measurement Protocol の検証エンドポイントに送り、GA には入りません（ログで `GA4 Measurement Protocol refused` が出なければ形式は正しい）。

## 3. LP の公開 URL（ChatGPT サイトからの移行）

これまでの `https://yumetan-support.ni23al.chatgpt.site/` は ChatGPT が生成したサブドメインで、独自の計測もできませんでした。LP を `landing/` としてリポジトリに取り込み、Firebase Hosting（同じ Firebase プロジェクト）で配信します。

| ページ | URL |
| --- | --- |
| トップ | `https://yumetan-a31f0.web.app/` |
| サポート | `https://yumetan-a31f0.web.app/support/` |
| プライバシーポリシー | `https://yumetan-a31f0.web.app/privacy/` |
| 利用規約 | `https://yumetan-a31f0.web.app/terms/` → `/legal/terms.html?lang=ja`（アプリと同じ文書） |

デプロイ:

```bash
npm run landing:deploy
```

（`firebase.json` の `hosting.landing` が `scripts/build-landing.mjs` を実行して `dist-landing/` を作り、`public/legal/` と `robots.txt`・`sitemap.xml` を含めて配信します。初回は `npx firebase-tools login` が必要です。）

他サービスの LP にならった構成: 1 つのブランドドメイン直下にトップ、`/support/`、`/privacy/`、`/terms/`。`canonical`・OGP・Twitter カード・JSON-LD（`MobileApplication`）・`sitemap.xml`・`robots.txt`・404 ページ・favicon / apple-touch-icon を付けています。

**独自ドメインにする場合**（例: `yumetan.app` / `yumetan.jp`）:

1. ドメインを取得し、Firebase コンソール → Hosting → カスタムドメインを追加 → 表示される DNS レコード（TXT と A）を登録。
2. `landing/assets/release-config.mjs` の `SITE_URL` と `public/core/help-content.js` の `SITE_URL` を新しいドメインに変更して再デプロイ（canonical・sitemap・アプリのサポートリンクが追従）。
3. GA4 のストリーム「ユメタン LP」の URL と、App Store Connect のサポート URL / マーケティング URL / プライバシーポリシー URL を更新。
4. 旧 `chatgpt.site` の公開を止める（または最上部に新 URL への案内を置く）。

アプリ側は `HELP_LINKS.support` が新 URL になっています（`docs/appstore/OWNER_TASKS.md` の記載も更新済み）。App Store Connect の「サポート URL」も `https://yumetan-a31f0.web.app/support/` に変更してください。

## 4. イベント辞書

### アプリ（`public/core/analytics.js`）

共通パラメータ: `app_platform`（web / ios / android）。すべてのイベントに付きます。

| イベント | いつ | 主なパラメータ |
| --- | --- | --- |
| `page_view` | 画面が切り替わるたび（`navigate`）と起動時 | `screen_name` / `page_title`（画面 ID: home, record, diary, reading, plans, …） |
| `app_open` | 起動して最初の画面が出たとき | `first_run` `signed_in` `screen` |
| `app_foreground` | ネイティブアプリが前面に戻ったとき | `screen` |
| `tutorial_begin` / `tutorial_complete` / `tutorial_skip` | 導入 4 ページ | `step` |
| `sign_up` | メール登録完了、または初めてのログインで登録画面に進んだとき | `method`（password / google / apple / line） |
| `login` / `logout` | ログイン完了・ログアウト | `method` |
| `quiz_start` / `quiz_complete` | 24 問診断の開始・完了 | `retake` / `dream_type` |
| `dream_read` | 「この夢を読み解く」の結果 | `engine`（ai / local）`error_code` `text_length` `themes` |
| `dream_save` | 夢を保存 | `engine` `text_length` `has_sleep` `has_photo` `themes` `shared` `is_new` `level_up` `type_changed` `dreams_total` |
| `level_up` | 夢レベルが上がった | `level` `character` |
| `diary_save` | 日記を保存 | `text_length` `is_new` |
| `record_delete` | 夢・日記の削除 | `kind` |
| `dream_share` / `dream_unshare` / `dream_share_failed` | みんなの夢への公開・取り下げ | `source`（record / share-page / community）`error_code` |
| `community_post_open` / `community_react` | 投稿を開く・スタンプ | `stamp` `removed` `plan` |
| `view_plans` | プラン画面を開いた | `source`（settings / freeQuota / diaryQuota / 遷移元画面） |
| `select_plan` | プラン詳細を開いた | `plan` `cycle` |
| `begin_checkout` / `purchase_confirmed` / `purchase_cancelled` / `purchase_failed` | ストア購入の開始・ストア確認・キャンセル・失敗 | `plan` `cycle` `store_confirmed` `server_verified` `plan_after` `error_code` |
| `restore_purchases` / `restore_confirmed` | 購入の復元 | `plan` `cycle` |
| `manage_subscription` | ストアの契約管理を開いた | `plan` |
| `photo_ocr` / `voice_input` | 手書き文字認識・音声入力 | `text_length` / `screen` |
| `language_change` / `character_set_change` | 設定変更 | `language` / `character_set` |
| `external_link` | サポート・規約・ポリシーを開いた | `link_kind` `screen` |
| `account_delete` | アカウント削除完了 | `deleted_by`（server / device） |
| `app_error` | コード付きの失敗（API の応答など） | `error_code` `screen` |

ユーザープロパティ（`setUser`、ログイン中は `user_id` = Firebase UID）: `plan` `dream_type` `dream_level` `language` `character_set` `login_provider` `app_platform` `app_version`。

GA4 が自動で送るもの: `first_visit` `session_start` `user_engagement`（アクティブ状態・滞在時間の元データ）。

### サーバー（`server/analytics.js`、RevenueCat Webhook）

| RevenueCat | GA4 イベント | パラメータ |
| --- | --- | --- |
| INITIAL_PURCHASE / NON_RENEWING_PURCHASE | `purchase`（GA4 標準の収益イベント） | `transaction_id` `value` `currency` `items[]` `plan` `cycle` `store` `period_type` |
| RENEWAL | `subscription_renewal` | 同上 |
| CANCELLATION / UNCANCELLATION | `subscription_cancel` / `subscription_uncancel` | `cancel_reason` |
| EXPIRATION | `subscription_expire` | `expiration_reason` |
| BILLING_ISSUE / SUBSCRIPTION_PAUSED / SUBSCRIPTION_EXTENDED | `subscription_billing_issue` / `subscription_pause` / `subscription_extend` | |
| PRODUCT_CHANGE | `subscription_change` | `new_product_id` |
| TRANSFER | `subscription_transfer` | `transferred`（to / from） |

`user_id` は UID、`client_id` はアプリが API 呼び出しの `X-Yumetan-Analytics` ヘッダーで知らせた値（`memberships/{uid}.analytics.clientId`）。未取得なら UID から導いた固定値。サンドボックス購入は `GA4_SEND_SANDBOX=1` のときだけ送ります。

### LP（`landing/assets/analytics.js`）

| イベント | 意味 | パラメータ |
| --- | --- | --- |
| `app_store_click` | App Store リンクのクリック（主要コンバージョン） | `location`（header / hero=page / features / download / footer / dock …）`link_text` |
| `support_contact_click` | メール（mailto）リンク | `location` |
| `section_view` | トップページの各セクションが表示された | `section`（about / features / experience / companions / faq / download） |
| `nav_click` / `page_link_click` / `outbound_click` | ページ内ナビ / サイト内リンク / 外部リンク | `target` / `link_domain` |
| `feature_tab` / `companion_browse` / `faq_open` | 機能タブ / キャラクター切り替え / FAQ を開く | `feature` / `action` `value` / `question` |
| `demo_sample` / `demo_submit` / `demo_reset` | ページ内の「おためし」記録（本文は送らない） | `text_length` `mood` |

共通: `page_name`（home / support / privacy）。拡張計測で `scroll`（90%）と `click`（外部リンク）も自動で入ります。

## 5. Firebase 側の変更

- **`memberships/{uid}.analytics`**（新規フィールド）: `{ clientId, platform, seenAt }`。API サーバーが認証済みリクエストの `X-Yumetan-Analytics` / `X-Yumetan-Platform` ヘッダーから保存します。`memberships` はサーバー専用コレクションなので `firestore.rules` の変更は不要です。アカウント削除時は membership ごと消えます。
- **`/api/health`** に `analyticsConfigured` を追加。
- **CORS** の許可ヘッダーに `X-Yumetan-Analytics` `X-Yumetan-Platform` を追加。
- **Firebase Hosting** を LP 配信に使用（`firebase.json` の `hosting` target `landing`、`.firebaserc` で既定サイト `yumetan-a31f0` に割り当て）。認証ハンドラ `/__/auth/handler` は Hosting の予約パスなので影響しません。別サイトにしたい場合は `npx firebase-tools hosting:sites:create yumetan-lp` のあと `.firebaserc` の `landing` を `["yumetan-lp"]` に変えます。
- Firestore のインデックス・ルールは変更ありません。GA4 と Firebase の**プロジェクト連携**（§2-2）は管理画面から行います。
- `firebase-config.js` に `measurementId` は加えていません（Firebase Analytics SDK ではなく gtag を使うため）。将来ネイティブ SDK（`@capacitor-firebase/analytics`）へ移す場合も、同じイベント名・パラメータをそのまま使えます。

## 6. まず見るレポート・作るファネル

- **リアルタイム / DebugView**: 配信直後の確認。
- **ユーザー獲得**: LP ストリームの参照元（SNS・検索）× `app_store_click`。
- **エンゲージメント → イベント**: `dream_save`・`dream_read`・`view_plans`・`begin_checkout`。ディメンション「画面名」「プラン」「プラットフォーム」を比較に使う。
- **収益化**: `purchase` の `value`（Webhook 由来、本番のみ）。
- **維持率**: アプリストリームの「アクティブユーザー」「維持率」レポート（`user_engagement` から自動計算）。
- **探索 → ファネルデータ探索（アプリ）**: `app_open` → `tutorial_complete` → `sign_up` or `login` → `quiz_complete` → `dream_save` → `view_plans` → `begin_checkout` → `purchase_confirmed`。
- **探索 → ファネル（LP）**: `page_view`（home）→ `section_view=features` → `section_view=download` → `app_store_click`。
- **探索 → セグメント**: ユーザープロパティ `plan` = starter / standard と free を比較。

LP → ストア → アプリは App Store を挟むため同一ユーザーとして機械的にはつながりません（Apple の制約）。LP の `app_store_click` 数、App Store Connect の「製品ページの表示 → ダウンロード」、アプリの `first_open`（GA4 自動）・`sign_up` を並べて、段階ごとの転換率として見ます。

## 7. プライバシー

- アプリ内のプライバシーポリシー（`public/legal/privacy.html` 日・英）と LP の `/privacy/` に Google アナリティクスの項目を追加済み（送る情報・送らない情報・広告目的の無効化・オプトアウト）。電気通信事業法の外部送信規律に沿って、送信先・送信内容・目的を明記しています。
- App Store Connect の「App のプライバシー」で「使用状況データ（製品の操作）」と「識別子（ユーザー ID・デバイス ID）」を「分析」目的で収集、ユーザーに紐付く、と申告してください。
- 同意バナーは置いていません（日本の利用者が中心のため）。EU 向けに配信する場合は Consent Mode の導入を検討してください。

## 8. テスト

```bash
npm test                       # analytics / server-analytics / ga4-setup を含む単体テスト
```

```bash
PORT=3187 npm start            # 別ターミナル
```

```bash
npx playwright test tests/browser/analytics.spec.js tests/browser/landing.spec.js --trace off
```

ブラウザテストでは gtag の読み込みをブロックし、データレイヤーに積まれた内容だけを検証します。Google には何も送られません。
