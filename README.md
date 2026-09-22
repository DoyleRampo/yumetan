# ユメタン / Yumetan

夢の傾向を16タイプ・4グループで楽しみ、夢と睡眠の記録でキャラクターが変化するアプリです。日本語・韓国語・中国語（簡体字）・英語に対応します。Web / PWA / Capacitor Android・iOS 共通の画面です。

## v4 の体験

1. 呼び名・年代・言語を入力し、16問に回答。中断したアンケートは端末内で再開できます。
2. 悪夢・予知・明晰・反復の4グループ、各4タイプからキャラクターを表示。
3. 夢の文章・音声入力・テーマ選択・ノート写真・睡眠チェックインを保存。
4. 直近の夢からタイプを再計算。夢を記録した回数で「夢レベル」が上がります（ホームにゲージと「あと〇回でLv.〇」を表示）。睡眠の質は判定しません。
5. 日記にはカレンダー日付を保存し、夢の目覚めた日の**前日**の日記だけを参照。
6. 「夢の記録」「日記」の各画面で日付を選ぶと、その日の記録を見返す・編集する・削除できます。別画面の一覧はなく、「最近の夢 / 最近の日記」から日付へ移動できます。
7. 有料プランでは「AIで読み解く」を押すと、GPTが夢の内容と最近の日記から「いまの心の状態」と娯楽としての「今日の占い」（今日の流れ・気分・ラッキーヒント・ひとつの行動）を返します。

16タイプは独自の娯楽的な分類です。MBTIや医学的・心理学的な診断ではありません。「予知」は夢の印象を表す分類名であり、未来の予測を意味しません。キャラクターは動物版「月あかりの仲間たち」を初期表示にし、人間版「夜を渡る16人」はスターター以上のプランで設定 → 表示キャラクターから選べます（フリーでは動物版に固定）。両シリーズ各16枚のAI生成画像と4言語の設定を、診断結果・ホーム・図鑑に表示します。ログイン中は選択もアカウントに同期され、記録・判定・夢レベルには影響しません。[人間版素材集](docs/characters/dreamwalkers-v1/README.md) / [動物版素材集](docs/characters/README.md) に原本・設定・生成プロンプトを保存しています。

## 実行

Node.js 22以上。

```sh
npm ci
npm start
# http://localhost:3000
```

**APIキーなしで起動し、端末内のルールで利用できます。** 画面・結果・助言はすべて4言語の静的カタログにあります。本人が書いた夢・日記や過去のAI出力の原文を自動翻訳することはありません。言語を切り替えた場合、異なる言語で生成済みのAI出力に代えて、選択言語のローカル振り返りを表示します。

## v4.5.2: iOSのLINE・Appleログインをネイティブに

- iOSアプリの「Appleで続ける」はシステムのサインインシートで完結し、IDトークンでFirebaseへ直接ログインします（Services ID・Web不要）。
- iOSアプリの「LINEで続ける」はLINE SDKでLINEアプリを開き、戻るとログイン完了。`POST /api/auth/line` がLINEのIDトークンを検証してFirebaseカスタムトークンを発行します。設定は [docs/auth/LOGIN_AND_SYNC.md](docs/auth/LOGIN_AND_SYNC.md) を参照。

## v4.5.1: 戻る導線・夢レベル

- タブバーの4ページと設定以外のすべての画面に「← 前のページ」リンクを置き、画面左端から右へスワイプしても1つ前の画面へ戻れます（ブラウザ・Androidの戻る操作も同じ）。
- 「睡眠レベル」を廃止し、夢を記録した回数で上がる「夢レベル」に変更。ホームにゲージと「あと〇回でLv.〇」を表示します。
- ホームのキャラクター（画像・名前）をタップするとキャラクターの詳細を開きます。
- 起床アラーム機能を削除。ヘッダーの余白を詰め、各画面の見出しを細めの明朝体1行にそろえました。

## v4.5: 画面構成の見直しとAI夢診断

- 下部のタブバーはホーム・夢の記録・日記・みんなの夢の4つのアイコンだけ。画面下から浮いたピル型で、ハイライトを指でスライドしてもページを切り替えられます。設定はヘッダー右上の歯車、言語は設定内で選びます。
- 「記録」一覧画面を廃止し、夢と日記の画面で日付を選んで記録を見返す方式に統一。日付の枠は小さくし、前の日・次の日ボタンを付けました。
- 設定は「プロフィール → プラン → 表示と言語 → 表示キャラクター → 起床アラーム → アカウント → このアプリについて」の順。開発者向けのAI・APIサーバー・バックアップ項目は削除しました。
- 有料プランのAI読み解きは、心の状態の見立てと今日の占いを返します（`server/prompts.js`）。
- 無料プランは動物キャラクターのみ。人間キャラクターはスターター以上で選べます。

## v4.4: LINE・Apple・Googleログインとアカウント同期

初期画面・設定から3種類の外部ログインとゲスト利用を選べます。夢・日記・写真・プロフィール・診断回答・表示キャラクターを本人のアカウントへ同期し、別端末から復元できます。ゲスト記録の引き継ぎと、設定からのログイン方法の連携にも対応します。iOS/Androidは標準ブラウザで認証します。

**本番ではFirebaseのプロバイダ設定、Apple/LINEの認証情報が必要です。iOSアプリのLINEログインはLINE SDKでLINEアプリへ直接遷移し（`LINE_CHANNEL_ID`）、Web/AndroidはIdentity PlatformのOIDCを利用します。** [接続設定・同期仕様・検証手順](docs/auth/LOGIN_AND_SYNC.md)を参照してください。

## v4.3: プランと「みんなの夢」

無料・スターター（月490円 / 年4,900円）・スタンダード（月980円 / 年9,800円）を追加しました。[全利用制限・費用試算・運用手順](docs/billing/PLANS_AND_SETUP.md)を参照してください。

- 無料でも日付ごとに夢1件・日記1ページ。過去の記録の閲覧・編集・端末内分析は継続できます。
- 有料会員は「みんなの夢」で他ユーザーの公開投稿を閲覧し、スタンプとコメントで交流できます。
- 夢は初期状態で非公開。保存後の詳細 → 公開設定で、公開用ニックネーム・タイトル・本文を確認し、同意して公開します。元の日記・写真・睡眠・AI分析は公開しません。
- プランは端末の値で認可せず、Firebase IDトークンとサーバー専用会員情報で確認。RevenueCatのWebhookとサーバーからの契約照会により反映します。
- GPT振り返り/OCRは有料プランの回数・費用上限内で使用。保存は常にローカル処理で、AI呼び出しは明示操作時だけです。
- 購入はiOS / Androidアプリ内のストア課金（App Store / Google Play、RevenueCat経由）だけです。Webでは購入ボタンを表示せず、アプリで購入したプランを同じアカウントで利用できます。

## GPT・課金・投稿機能の接続

`.env.example`を`.env`へコピーし、OpenAI、同じFirebaseプロジェクトのサーバー認証情報、RevenueCatの秘密APIキーとWebhook認証値を設定してください。キーをGitHubへ保存しないでください。未設定時も無料の端末内記録は使えますが、未設定の有料サービスを購入可能とは表示しません。

有料会員が「AIで読み解く」を押したときだけ、夢・睡眠チェックイン・前日の日記・直近7日分の日記（各1,500文字まで）がOpenAIへ送られ、OCR時は写真が送られます。設定画面にAI・APIサーバー・バックアップの項目はありません（AIはプランで自動的に有効になります）。システムプロンプトは `server/prompts.js` にあります。公開文章とコメントも安全性確認のためOpenAIへ送られます。個人APIキーによる制限回避は提供しません。旧Claude用エンドポイントは廃止しました。

主なAPI（会員・投稿・AI・課金の操作には非匿名のFirebase Bearerトークンが必要）:

- `GET /api/health`：接続設定の有無（秘密値は返しません）。`authConfigured` が false ならサーバーに Firebase Admin の認証情報（`FIREBASE_SERVICE_ACCOUNT_JSON`）が無く、アプリ内ログインは失敗します
- `GET /api/account`：会員状態・使用数・次回AI枠更新
- `POST /api/billing/sync`：ストア購入・復元後にRevenueCatの契約状態をサーバーへ反映
- `POST /api/billing/revenuecat`：RevenueCat Webhook（Authorizationヘッダーの共有秘密で検証）
- `GET /api/community/feed`、`POST /api/community/publish`、`GET /api/community/mine`
- `POST /api/community/posts/:id/private`、`GET /api/community/posts/:id`
- `POST /api/community/posts/:id/reaction`、`POST /api/community/posts/:id/comments`
- 通報・ブロック・コメント削除、運営者専用の通報確認/非表示API
- `POST /api/auth/line`：LINE IDトークン → Firebaseカスタムトークン（iOSネイティブLINEログイン）
- `POST /api/reflect`（`text`・`date`・`typeTags`・`diary`・`recentDiaries`・`sleep`・`dreamType`）、`POST /api/handwriting`：GPT-5.6 Luna。読み解きは `mood_weather`・`mood_label`・`mental_state`・`fortune_overview`・`fortune_mood`・`lucky_hint`・`advice` を返します
- `GET /api/sleep-knowledge`：参照文献と暫定評価ルール

AIは振り返りとOCRを補います。タイプ分類と睡眠点数は引き続き端末内のルールで計算します。

## 判定ルール

### タイプ

各設問は特定の1タイプに対応し、「よくある」2点、「たまにある」1点、「ほとんどない」0点。直近12件の夢に付いたテーマは、1件・1テーマにつき1点加算します。日記はタイプへの投票に使いません。最多得点のタイプを採用し、同点は図鑑順で決定して仮のタイプと表示。各夢のテーマは手動選択が優先、未選択なら4言語のキーワードで推定します。キーワード処理は否定や文脈を完全には理解しないため、ユーザーがテーマを修正できます。

### 夢レベル

`public/core/level.js`。夢の記録件数だけで決まるゲーム風の経験値テーブルです（日記は数えません）。

| Lv | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 以降 |
|---|---|---|---|---|---|---|---|---|---|---|
| 必要な夢の累計 | 3 | 7 | 12 | 20 | 30 | 42 | 56 | 72 | 90 | +25ずつ |

キャラクターの星は3レベルごとに1つ増え、最大5つ。上限はありません。睡眠チェックイン（時間・回数・目覚めの気分）は任意のメモで、「今夜の小さなヒント」を選ぶ参考とAI読み解きの文脈にだけ使い、点数やレベルにはしません。旧 `public/core/sleep.js` の睡眠スコア関数は互換用に残していますが画面では使いません。

資料: [NHLBIの睡眠習慣](https://www.nhlbi.nih.gov/health/sleep-deprivation/healthy-sleep-habits)、[年代別睡眠時間](https://www.nhlbi.nih.gov/health/sleep/how-much-sleep)、[NINDSの睡眠解説](https://www.ninds.nih.gov/sites/default/files/2025-05/understanding-sleep.pdf)。夢だけから睡眠の質・病気・睡眠段階を判定しないという限界をデータとAI指示にも記載しています。

## アラーム

v4.5.1でアプリ内の起床アラーム・起床通知の設定画面を削除しました。Androidの `SystemAlarm` プラグインとiOSの通知権限のネイティブコードは残していますが、画面からは呼びません。

## 保存と互換性

- ログイン時の保存先はFirebase UID別のFirestore。ブラウザのlocalStorage、ネイティブのCapacitor Preferencesはオフライン用キャッシュ。
- `yumetan.v4.*` の新しい保存領域へ従来の記録・プロフィールを移行。元データは変更しません。main v4の別コレクションの日記・`typeState.quiz`・旧タイプIDも移行します。旧配点の睡眠スコアは `legacySleep` に保持し、新尺度に自動換算しません。
- Firebase設定がある場合は既存のAuth/Firestoreを利用。アカウント別の端末保存領域を使い、日記と夢を、それぞれ既存の `diary` / `dreams` コレクションへ同期します。
- 画像は最大1000px・JPEGへ縮小し、本人限定の夢データとともにクラウド同期。写真を含むJSONバックアップも利用できます。
- 保存容量不足はエラーを表示し、保存成功として扱いません。
- 初回・保存後・オンライン復帰・画面復帰・Firestoreの変更通知・「再同期」で同期。失敗時はキャッシュを保持して同期待ちを表示。削除履歴を保存して別端末からの復活を防ぎます。
- ログイン先を変えると別の保存領域へ切り替えます。従来データの初回引き継ぎは起動時のアカウントに一度だけ行います。

## モバイル

```sh
API_URL=https://your-server.example.com npm run mobile:sync
npx cap open android
# または npx cap open ios
```

Xcode・Android Studio・署名環境は別途必要です。Webファイル変更後は再同期してください。

### TestFlight への自動アップロード

`develop` ブランチへ push すると GitHub Actions（`.github/workflows/ios-testflight.yml`）が macOS ランナーで `npm run mobile:sync` 相当の同期と `npm run ios:upload` を実行し、App Store Connect（TestFlight）へアップロードします。`android/`・`docs/`・`*.md` だけの変更では動きません。Actions タブの「iOS TestFlight」から手動実行（表示バージョンの指定も可）もできます。ビルド番号は実行時刻（例: `202609211230`）なので毎回前回より大きくなります。

必要な Repository secrets（Settings → Secrets and variables → Actions）:

| Secret | 値 |
| --- | --- |
| `API_URL` | アプリが接続する公開サーバーの URL |
| `REVENUECAT_IOS_KEY` | RevenueCat の iOS 公開キー（`appl_…`。`test_` は不可） |
| `LINE_CHANNEL_ID` | LINE ログインチャネルの ID（LINE アプリへ直接遷移するログイン用） |
| `GOOGLE_IOS_CLIENT_ID` | Firebase に登録した iOS アプリの OAuth クライアント ID（`GoogleService-Info.plist` の `CLIENT_ID`、`…apps.googleusercontent.com`）。アプリ内で完結する Google ログイン用 |
| `IOS_TEAM_ID` | Apple Developer の Team ID（10桁） |
| `IOS_DIST_CERT_P12` | **Apple Distribution** 証明書（Apple Development ではない）を Keychain Access から秘密鍵ごと .p12 で書き出し、`base64 -i 証明書.p12` した文字列 |
| `IOS_DIST_CERT_PASSWORD` | .p12 書き出し時のパスワード |
| `IOS_PROVISIONING_PROFILE` | developer.apple.com → Certificates, Identifiers & Profiles → Profiles で作った **App Store Connect** 配布用プロファイル（App ID `com.doyle.yumetan`、上の Distribution 証明書を選択）の .mobileprovision を `base64 -i` した文字列 |
| `ASC_KEY_ID` / `ASC_ISSUER_ID` | App Store Connect → Users and Access → Integrations → Team Keys の Key ID と Issuer ID（役割は App Manager） |
| `ASC_API_KEY_P8` | ダウンロードした `AuthKey_*.p8` の中身（BEGIN 行から END 行まで） |

CI では Xcode の自動署名を使わず、`scripts/ios-manual-signing.mjs` がビルド時のチェックアウト上で App ターゲットの Release 構成だけを上記プロファイルによる手動署名に切り替えます（リポジトリの Xcode プロジェクトは自動署名のまま）。

Mac 上で同じ手順を手動で行う場合は `IOS_TEAM_ID=<Team ID> npm run ios:upload`（Xcode にログイン済みの Apple ID による自動署名）。`ASC_KEY_ID` / `ASC_ISSUER_ID` / `ASC_API_KEY_PATH`（.p8 のパス）を付けるとアップロードに API キーを使い、`IOS_PROVISIONING_PROFILE`（.mobileprovision のパス）を付けると CI と同じ手動署名になります。

## テスト

```sh
npm test                   # 分類・睡眠・日付・移行・AI契約の自動テスト
npm run check              # JavaScript構文
PORT=3187 npm start         # 別ターミナルで起動
npm run test:browser        # Chromeがインストールされた環境
API_URL=https://example.com npm run mobile:build
cd android
./gradlew :app:assembleDebug
```

ブラウザテストではFirebase通信を無効化し、利用者の記録に触れずに、4言語登録・16問診断・リロード・日付ごとの夢と日記・夢レベル・戻るリンクと左端スワイプ・画像添付・削除・タブバーのスワイプ・AI診断カード・AIエラー・オフライン動作を検証します。AIへの有料実リクエストはテストしません。画像OCRと生成結果はモックのAPI契約テストで検証します。

## 次に必要な素材・仕様

- キャラクター16体の基本画像・名前・設定は制作済み。追加するなら、各5段階の専用差分/表情/アニメーションや、背景透過版。現在は背景付きの基本画像とUI上の星で成長を表現。
- チーム作成の `yumenote_v3.html` 元データ、16問全文、判定の重みと同点処理。本実装は添付画像の分類を参考にした暫定設問です。
- 専門家レビューを経た睡眠の評価基準、対象年齢、アドバイス文章。現在の「10代」は年齢を細分できないため研究上の年齢区分とは一致しません。
- 4言語のネイティブチェック。現在は簡体字のみで、繁体字は未対応。
- 利用するAIモデルと予算、プライバシーポリシー、画像や日記の同期方針。APIキーはGitHubに入れずデプロイ先の環境変数に設定。

## main v4との統合

AndroidのYumetanAlarmプラグイン、iOS通知依存、知識資料と素材案を保持しています。旧Claude APIはv4.3で有料GPT振り返り/OCRへ移行しました。現行画面は `public/core/` のルールと4言語カタログを使用します。旧 `public/engine/types.js`・`sleep.js` は互換資料として保持していますが、現行画面からは呼びません。旧配点を科学的に検証済みとは扱いません。
