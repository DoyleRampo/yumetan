# ログインとアカウント保存（v4.4）

## 利用者の操作

- 新規ユーザーの順序は **オンボーディング（4 ページ、スキップ可）→ ログイン → ユーザー登録（呼び名・年代・言語）→ 16 タイプ診断 → ホーム**。Firebase が設定されている環境ではログインなしに登録へ進めない（ゲストモードは無い）。記録は常にアカウントの領域に保存され、端末だけに残るデータは作らない。
- 一度登録したアカウントで再ログインすると、登録画面と診断は表示せずにそのままホームへ進む（プロフィール・記録はアカウントから復元）。
- 「タイプについて」の説明は 16 タイプ診断の結果画面にだけ表示する。
- 初期画面または設定から **LINE / Apple / Google** でログイン。従来のメール/パスワードも利用可能。
- ゲストから初めて外部アカウントを作る場合は、Firebaseのリンク機能でUIDと記録を維持する。
- すでに存在するアカウントへログインする場合は、ゲスト記録を取り込むか確認する。既存プロフィール・同日の既存日記は保持。拒否しても元のキャッシュは残り、設定の「ゲストの記録を取り込む」から再実行できる。
- ログイン済みの設定では別のログイン方法を追加できる。Appleの匿名メールを含む連携は確認後に実行。他のアカウントで利用中の認証情報は勝手に統合しない。
- メールアドレスや表示名が同じだけでは同一アカウントとして扱わない。別々に登録したアカウントは別のUID。複数の方法で同じ記録を開きたい場合は、元のアカウントの設定から連携する。

## 保存先と同期

本人のFirebase UIDをキーに既存のFirestore `(default)` へ保存する。無料プランでもアカウント同期は利用できる。Firestoreルールは引き続き `/users/{uid}/...` の本人だけを許可。

| 保存先 | 内容 |
|---|---|
| `users/{uid}` の `profile` | プロフィール・言語・診断回答・表示キャラクター・分析モード・更新日時 |
| `users/{uid}/dreams/{id}` | 夢・睡眠・分析結果・添付写真 |
| `users/{uid}/diary/{id}` | 日記 |
| `users/{uid}/deleted/{id}` | 削除履歴（別端末からの復活防止） |

端末のlocalStorage / Preferencesはオフライン用キャッシュ。ログイン時、保存時、画面への復帰、オンライン復帰、Firestoreの変更通知で同期する。サーバーからの読み込み・トランザクション完了後だけ「同期済み」を表示する。失敗時はキャッシュを保持して「同期待ち」を表示。別端末への復元には最初のオンライン同期が必要。

- レコードとプロフィールは更新日時を比較し、古い端末のデータが新しいデータを上書きしないようトランザクション内でも再確認。
- 削除履歴は保持し、オフラインの古いコピーから削除済み記録を再作成しない。
- 写真も本人限定の夢ドキュメントに保存（既存の最大1000px・圧縮データ500,000文字以下）。コミュニティには含めない。
- 旧版で端末内だけに保存した写真は、その端末で更新後にログイン・同期するとアップロードされる。すでに失われた旧端末の写真は復元できない。
- キャラクターのタイプ・レベルは同期した診断回答、夢、睡眠データから計算する。
- アラーム・通知時刻、接続先URL、途中の入力と未完了アンケートは端末固有。完了した診断回答は同期する。
- ゲストの匿名UIDは端末の認証情報が失われると復旧できない。機種変更前に外部アカウントと連携するかJSONバックアップを取る。
- ログアウトはアカウントのクラウドデータを消さない。キャッシュは元のUIDの領域に保持し、新しいゲストには表示しない。別タブでアカウントが変わった場合は画面を再読み込みして古い入力画面を無効化する。

## 本番で必要な設定

コードだけでは外部サービスのログインを有効化できない。運用者が所有するFirebase / Apple / LINEの設定が必要。秘密鍵を `public/` やGitに置かない。

### Firebase共通・Google・ゲスト

対象: `yumetan-a31f0`。`public/firebase-config.js` は公開SDK設定。現在の `apiKey` はサーバー秘密鍵ではない。

1. Firebase Console → Authentication → Sign-in method で **Google** と **Anonymous** を有効化（メールログインを残す場合はEmail/Passwordも）。Googleのサポートメールを設定。
2. Authentication → Settings → Authorized domains に実際のWeb/認証ページのホストを登録。例: `yumetan.onrender.com`、実際に利用しているHostingドメイン。プロトコルやパスを含めない。開発時のみ `localhost` を追加。
3. 既存Firestore `(default)` と本人限定ルールを確認。新規DBや公開ルールは不要。
4. 認証ページとAPIを同じHTTPSオリジンで配信。モバイルの `API_URL` はそのオリジンを指定。

公式: [Googleログイン](https://firebase.google.com/docs/auth/web/google-signin)、[匿名認証とアカウント連携](https://firebase.google.com/docs/auth/web/anonymous-auth)、[プロバイダ連携](https://firebase.google.com/docs/auth/web/account-linking)。

### Google（iOSアプリ: Google Sign-In SDK のアプリ内シート）

iOS アプリでは Safari に遷移せず、Google Sign-In SDK（`GoogleSignIn` pod）のシートでログインし、返ってきた ID トークンで Firebase に直接ログインします（`GoogleLogin` プラグイン、`ios/App/App/SceneDelegate.swift`）。

1. Firebase Console → プロジェクトの設定 → iOS アプリ `com.doyle.yumetan` の `GoogleService-Info.plist` をダウンロードし、`CLIENT_ID`（`…apps.googleusercontent.com`）を控える。
2. GitHub Secrets に `GOOGLE_IOS_CLIENT_ID` としてその値を登録する。`scripts/build-mobile.mjs` が `config.js` に埋め込み、`scripts/ios-google-signin.mjs` がビルド時に `Info.plist` へ逆順クライアント ID（`com.googleusercontent.apps.…`）の URL スキームを追加する。
3. 未設定なら従来どおりブラウザ経由（`/auth.html`）にフォールバックする。

### Apple（iOSアプリ: システムのサインインシート）

iOSアプリでは `AuthenticationServices` の標準シートで Sign in with Apple を行い、返ってきた ID トークンと nonce で Firebase に直接ログインします（`AppleLogin` プラグイン、`ios/App/App/SceneDelegate.swift`）。ブラウザも Services ID も使いません。ゲストからのログインは Firebase のリンクで UID を維持し、既に使われている Apple ID なら「取り込み確認」に進みます。

必要な設定:

1. Apple Developer → Identifiers → App ID `com.doyle.yumetan` の **Sign in with Apple** を有効化。
2. `ios/App/App/App.entitlements`（`com.apple.developer.applesignin`）をプロジェクトに追加済み。Capability を追加した後は **App Store 用プロビジョニングプロファイルを作り直し**、GitHub Secret `IOS_PROVISIONING_PROFILE` を更新する（古いプロファイルには entitlement が無く、CI の署名で失敗します）。
3. Firebase Console → Authentication → Sign-in method → **Apple** を有効化。iOS だけなら Services ID・Team ID・Key ID・秘密鍵の欄は空でよい。
4. Firebase のプロジェクト設定でバンドル ID `com.doyle.yumetan` の iOS アプリを登録しておく（Firebase はトークンの対象 ID をこのバンドル ID で照合します）。

### Apple（Web / Android: ブラウザ経由）

1. Apple DeveloperでSign in with Appleを有効にしたApp IDと、Web認証用Services IDを用意。
2. ドメインとReturn URLを登録。現在のFirebase設定ならReturn URLは `https://yumetan-a31f0.firebaseapp.com/__/auth/handler`。
3. Firebase AuthenticationのAppleプロバイダを有効化し、Services ID、Apple Team ID、Key ID、秘密鍵を設定。Appleから必要とされる審査・ドメイン設定も完了する。
4. Appleの「メールを非公開」を使う場合も連携・再ログインを確認。Firebaseからメールを送る場合はPrivate Email Relayの送信元設定も行う。

公式: [Firebase Appleログイン](https://firebase.google.com/docs/auth/web/apple)、[Apple Web設定](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web)。

### LINE（iOSアプリ: LINEアプリへ直接遷移）

iOSアプリでは LINE SDK（`LineSDKSwift`）でログインし、LINEアプリがあればそのまま LINE アプリに遷移して認証します。Safari も Identity Platform も使いません。

1. LINE Developers のLINEログインチャネルで **アプリタイプに「モバイルアプリ」を追加**し、iOS の **バンドルID `com.doyle.yumetan`** を登録（URLスキームは `line3rdp.com.doyle.yumetan` が自動で使われます）。ユニバーサルリンクは未設定でも動作します。
2. サーバー（Render）の環境変数 `LINE_CHANNEL_ID` にチャネルIDを設定。チャネルシークレットは不要です（ID トークンは LINE の `oauth2/v2.1/verify` で検証）。
3. GitHub Secrets に `LINE_CHANNEL_ID` を追加。`scripts/build-mobile.mjs` が `config.js` に埋め込み、未設定なら従来のブラウザ経由にフォールバックします。
4. 流れ: アプリ → `LineLogin` プラグイン（`ios/App/App/SceneDelegate.swift`）→ LINE ID トークン → `POST /api/auth/line` → `lineUsers/{LINEユーザーID}` の対応表で Firebase UID を決定（初回は `line:<LINEユーザーID>`、連携時はログイン中の UID）→ カスタムトークンでログイン。
5. ゲストから LINE でログインした場合は Firebase の「リンク」ではなく、既存の「ゲストの記録を取り込む」確認で引き継ぎます。設定からの「LINE を連携」は対応表にログイン中の UID を登録します。別アカウントに登録済みの LINE は連携できません。

`lineUsers` はクライアントの Firestore ルールで拒否されるサーバー専用コレクションです。Web 版と Android 版の LINE ログインは引き続き下記の Identity Platform OIDC を使うため、同じ LINE アカウントでも iOS ネイティブとは別 UID になります。両方を同一アカウントにしたい場合は、片方でログイン後に設定から「連携」してください。

### LINE（Web / Android: ブラウザ経由）

Firebase Authentication with **Identity Platform** のOIDC連携を使用。プロジェクトのアップグレード・利用料金確認が必要。今回の作業では有料サービスへのアップグレードは実行していない。

1. LINE DevelopersでLINE Loginチャネルを作成（Webアプリ）。実際のサービス名、プライバシーポリシー等を登録。
2. Identity Platform / FirebaseでOpenID Connectプロバイダを追加し、IDを **`oidc.line`** にする。
3. 認可コードフローを選択。Client ID = LINE Channel ID、Client secret = Channel secret、Issuer = **`https://access.line.me`**。
4. Firebaseが示すコールバックURLをLINEのCallback URLへ登録。現在の設定では `https://yumetan-a31f0.firebaseapp.com/__/auth/handler`。
5. LINEチャネルを公開し、開発者以外のアカウントでも確認。本実装の追加scopeは `profile` のみ（OIDCのopenidはFirebaseが付与）。メールアドレス取得権限は不要。

公式: [Firebase OIDC](https://firebase.google.com/docs/auth/web/openid-connect)、[LINE Web連携](https://developers.line.biz/en/docs/line-login/integrate-line-login/)、[LINE discovery](https://access.line.me/.well-known/openid-configuration)。LINEのdiscoveryからissuer・codeフロー・署名方式を確認済み。

### iOS / Android

WebView内のOAuthポップアップは使用せず、独自の小さな `AuthBrowser` プラグインから端末の標準ブラウザを開く。ブラウザの認証完了画面から利用者がアプリへ戻ると、元の端末だけが認証結果を取得する。ブラウザページでは追加の「続ける」タップでFirebaseのポップアップを開く。

- サーバーに `FIREBASE_PROJECT_ID` とFirebase Admin認証（サービスアカウントJSONまたはADC）が必要。ADCはカスタムトークン署名権限も必要。`docs/billing/PLANS_AND_SETUP.md` のサーバー認証設定を参照。
- `/api/auth/start`, `/bootstrap`, `/complete`, `/consume` と `/auth.html` をHTTPSで配信。
- 引き渡しセッションは `authHandoffs/{randomId}` に保存。Firestore TTLポリシーを **`authHandoffs` コレクショングループの `expiresAt`** に設定して期限切れドキュメントを掃除する。TTL未設定でもコードは5分で拒否する。
- 開始・完了に別のランダム秘密値を使い、サーバーにはハッシュのみ保存。端末の秘密値はURLに含めず、FirebaseトークンもURL/DBに保存しない。引き渡しはトランザクションで一度だけ消費。
- ブラウザ側の一時秘密値はURLフラグメントに含め、ページ起動時にURLから削除。Firebase認証はブラウザではメモリ内だけに保持し、完了後ログアウトする。
- サーバーはFirebaseトークン、認証時刻、対象プロバイダ、無効ユーザー、連携時の元UIDを確認する。クライアントが送ったUIDだけでログインしない。
- `authHandoffs` と `authRateLimits` は既存Firestoreクライアントルールで許可されないサーバー専用領域。
- 起動前の未完了フローは5分まで復帰可能。他アカウントへの切り替え後に以前の認証結果を適用しない。
- Render の無料インスタンスは休止から復帰するまで 50 秒以上かかる。アプリはログイン開始前に `GET /api/health` で最大約 1 分サーバーを起こし、認証リクエストは 20 秒のタイムアウト後に 1 回だけ再試行する（`public/core/native-auth.js`）。`AbortSignal.timeout` が無い iOS 15 の WebView でも動作する。
- `GET /api/health` の `authConfigured` でサーバー側の Firebase Admin 認証情報の有無を確認できる。
- Firebase Web SDK は `public/vendor/firebase/` に同梱し、同一オリジンから読み込む（CDN はフォールバック）。アプリ起動時に gstatic.com から約 700KB をダウンロードする必要がなくなる。更新は `node scripts/vendor-firebase.mjs`（バージョンは `public/core/firebase-sdk.js`）。
- iOS / Android の WebView では `getAuth()` を使わず、`initializeAuth(app, { persistence: [indexedDB, localStorage] })` でポップアップ用リゾルバ無しに初期化する（`public/cloud.js`）。`getAuth()` は起動時に authDomain のポップアップ用 iframe を先読みしようとし、`capacitor://localhost` では認証初期化が長時間止まる。各初期化ステップは 10 秒で打ち切り、`ready` は必ず解決する。
- 起動時 3 秒以内に接続できなくてもログイン画面は「クラウドに接続しています…」と表示して待ち続け、準備でき次第ボタンを有効にする。初期化に失敗した場合は「接続できません」の後ろに Firebase のエラーコードを表示する。

## 検証と残る本番確認

自動テストはFirebase/外部プロバイダの代替を用い、実コードのアカウント分離・同期・競合・削除・写真・ゲスト引き継ぎ・認証セッション改変/再利用拒否を検証する。実際のGoogle/Apple/LINEへの認証、実機ブラウザからの復帰、異なる実端末でのFirestore同期は、上記設定後に実アカウントで確認する。

本作業のFirebase管理APIは `serviceusage.services.use` 不足の403で、DB Edition・IAM・プロバイダ有効化状態は確認できなかった。既存アプリのFirestore APIを継続利用し、本番DBやルールの変更・自動課金サービスへのアップグレード・デプロイは実行していない。

検証結果: `npm test` 37件、Playwright 27件成功。iOSシミュレータ向け署名なしビルド成功。Androidは既存生成物のファイル読み込み待ちを回避するため一時出力先とAndroid Studio付属Javaで `assembleDebug` を実行し成功。既存の生成物を削除する変更はしていない。
