# App Store 審査「Guideline 2.1 – Information Needed」対応プラン

作成日: 2026-09-25 / 対象: ユメタン iOS（`com.doyle.yumetan`、バージョン 1.0）

## 1. フィードバックの正しい解釈

- **却下理由はバグや規約違反ではない。** 「App Review 履歴が少ない開発者アカウントからの新規提出なので、審査を完了するために追加情報が必要」という定型の情報要求（Information Needed）。7項目に答えれば審査が再開される。
- ただし、**要求項目はそのまま審査基準のチェックリスト**になっている。回答を用意する過程で以下の必須要件を満たしていないと、次は該当ガイドラインで却下される。
  - アカウント作成があるアプリは **アプリ内からのアカウント削除** が必須（Guideline 5.1.1(v)）。
  - サブスクリプション購入画面には **各プランの名称・期間・価格**、および **利用規約（EULA）とプライバシーポリシーへのリンク** が必須（Guideline 3.1.2 / Schedule 2）。
  - ユーザー生成コンテンツ（UGC）には **通報とブロック** の仕組みが必須（Guideline 1.2）。
  - ログインが必要な機能は **審査用デモアカウント** を App Store Connect に登録（Guideline 2.1）。
  - App 内課金商品はバイナリと **同時に提出** されていること（Guideline 3.1.1）。
- 回答は App Store Connect の「Reply」だけでなく、**App Review Information の Notes 欄にも同じ内容を記載**する（次回以降の提出で参照されるため）。
- 「Prevent Common Issues」節は一般的な注意喚起であり、個別の指摘ではない。ただしスクリーンショット（2.3.3）と IAP 同時提出（3.1.1）は該当しうるので事前確認する。

## 2. 現状とのギャップ

| # | Apple の要求 | 現状（リポジトリ調査） | 対応 |
| --- | --- | --- | --- |
| 1a | 実機での画面録画（起動→典型フロー） | 未作成 | §4-1 の台本で撮影 |
| 1b | 登録・ログイン・**アカウント削除** の録画 | Google / Apple / LINE ログインとゲスト利用はある。**アカウント削除は未実装**（`public/i18n.js` に文言 `acct.delete` があるだけで、UI・API とも存在しない） | **§3-A 実装必須** |
| 1c | UGC の通報・ブロックの録画 | 「みんなの夢」に通報（`/api/community/posts/:id/report`）・ブロック（`…/block`）・コメント削除・ブロック解除あり | 実装済み。有料プランのデモアカウントで録画（§3-D） |
| 1d | 課金フローの録画（名称・期間・価格・利用規約・プライバシーポリシーのリンク） | プラン比較・詳細画面に価格と月/年の表示はある。**利用規約・プライバシーポリシーのリンクがアプリ内に存在しない**。プラン詳細の「購入」ボタン付近に名称・期間・価格の再掲もない | **§3-B 実装必須** |
| 2 | 目的・対象ユーザーの説明 | README にあるが英語の審査向け文章はない | §4-2 の文案 |
| 3 | セットアップ手順・ログイン情報 | デモアカウントなし。コミュニティと AI は有料プラン限定 | §3-D + §4-3 |
| 4 | 外部サービス一覧 | 未整理 | §4-4 の一覧 |
| 5 | 地域差 | 機能は全地域共通、4言語対応 | §4-5 |
| 6 | 規制業種・第三者著作物 | 医療機器ではない旨の免責あり。キャラクターは自作 AI 生成画像 | §4-6 |
| 7 | IAP の概要と導線 | 4つの自動更新サブスクリプション（RevenueCat 経由） | §4-7 |

補足で見つかった不整合:

- `capacitor.config.json` の `appId` が `com.hikaso.yumetan`、Xcode プロジェクトは `com.doyle.yumetan`。ビルドには Xcode 側が使われるため審査には影響しないが、`npx cap sync` 時の混乱を避けるため `com.doyle.yumetan` に揃える。
- `docs/auth/LOGIN_AND_SYNC.md` に「メール/パスワードも利用可能」とあるが、`public/core/auth-providers.js` は Google / Apple / LINE の3種のみ。ドキュメントを修正する（デモアカウントの設計に関わる）。

## 3. 修正タスク（コード）

### A. アカウント削除（必須・最優先）

Apple の要件: アプリ内から開始でき、**一時停止や無効化ではなく本当に削除**すること。削除前に確認と、サブスクリプションは別途 App Store の「サブスクリプション」設定から解約が必要である旨の案内を出すこと。

1. **サーバー**: `POST /api/account/delete`（非匿名の Firebase Bearer トークン必須、`auth_time` が直近5分以内でなければ `reauthRequired` を返す）。
   - Firestore: ユーザー UID 配下の `dreams` / `diary` / プロフィール / 診断回答 / 表示キャラクター / `memberships/{uid}` / 公開投稿（`communityPosts` の本人分は非公開化ではなく削除）/ 本人のコメント / スタンプ / `communityBlocks/{uid}` / 本人が出した通報 を削除。`firebase-admin` の `recursiveDelete` を利用。
   - RevenueCat: `DELETE /v1/subscribers/{uid}`（`REVENUECAT_SECRET_API_KEY`）で購読者情報を削除。失敗しても Firebase 側の削除は継続し、ログに残す。
   - 最後に `getAuth().deleteUser(uid)`。
   - 監査用に `accountDeletions/{hash(uid)}`（UID のハッシュ・日時のみ、個人情報なし）を残してもよい。
2. **クライアント**: 設定 → アカウント欄（`public/app.js` の `account-card`）に「アカウント削除」ボタン（`acct.delete` の文言を利用。4言語）。
   - 確認ダイアログ: 削除される内容、復元不可、**サブスクリプションは自動で解約されないので App Store で解約が必要**、という文面（4言語を `public/core/auth-i18n.js` に追加）。
   - `reauthRequired` の場合は、既存の外部ブラウザ認証フロー（`AuthBrowser`）で再ログインしてから再実行。
   - 成功後: ローカルキャッシュ（localStorage / Capacitor Preferences の `yumetan.v4.*`）を全消去し、初期画面へ戻す。
   - ゲスト（匿名 UID）にも「端末内の記録をすべて消去」（匿名ユーザー削除＋ローカル消去）を提供する。
3. **テスト**: `tests/` に API 契約テスト（未認証・匿名・再認証要求・正常削除でコレクションが空になること）。Playwright に UI からの削除フローを追加。
4. **ストア設定**: App Store Connect の「App のプライバシー」で削除に関する記述は不要だが、Notes に削除手順（設定 → アカウント → アカウント削除）を書く。

### B. 課金画面の必須表示（必須）

1. **法的ページを用意**: `public/legal/privacy.html` と `public/legal/terms.html`（4言語、または日本語＋英語）を静的配信。内容は最低限、収集データ（夢・日記・写真・音声の文字起こし・ログイン情報）、送信先（Firebase、OpenAI、RevenueCat）、保存期間、削除方法、問い合わせ先。利用規約には自動更新・解約条件・免責（医学的診断ではない）・UGC ルールを記載。独自の EULA を作らない場合は Apple 標準 EULA（`https://www.apple.com/legal/internet-services/itunes/dev/stdeula/`）にリンクしてもよいが、プライバシーポリシーは自前で必須。
2. **プラン画面**（`public/community.js` の `plansView` / `planDetailsView`）:
   - 「購入」ボタンの直上に **プラン名 / 期間（1か月 or 1年、自動更新）/ 価格** を再掲。価格は RevenueCat の `getOfferings()` から取得したストア表示価格（`product.priceString`）を優先し、取得できない時だけ `PLANS` の円建て定価を表示する（ストアフロント別価格との不一致を避けるため）。
   - 「利用規約（EULA）」「プライバシーポリシー」のリンクを **購入ボタンと同じ画面に** 表示（Capacitor の `Browser` か `window.open` で外部ブラウザ）。
   - 既存の `renewalNote`（自動更新・解約案内）はそのまま残す。
3. **設定画面** にも同じ2リンクと問い合わせ先（`SUPPORT_URL`）を置く。
4. **App Store Connect**: 「プライバシーポリシー URL」と、必要なら「使用許諾契約（EULA）」を登録。App 内課金の各商品に「審査用スクリーンショット」と説明を設定し、**バイナリと同じ提出に4商品を含める**（3.1.1）。
5. Info.plist の `LSApplicationQueriesSchemes` に加え、外部リンクを開くため `Browser` プラグインを使うなら `@capacitor/browser` を追加。

### C. 通報・ブロック（実装済み、確認のみ）

- 通報理由の選択 → 送信、ブロック → フィードから消える、ブロック解除、自分の投稿の非公開化、コメント削除、が動くことを Sandbox の2アカウントで確認する。
- 運営側の通報処理（`/api/moderation/reports`）は Custom Claim `moderator: true` を持つ運営アカウントで一度実行しておき、Notes に「通報は24時間以内に運営が確認・非表示処理する」と明記する（1.2 の要件: 通報への対応体制）。

### D. 審査用デモアカウント（必須）

- アプリのログイン手段は Google / Apple / LINE のみで、Apple は審査時に LINE や 2段階認証付き Google を使えないことがある。次のいずれかを選ぶ（推奨は 1）。
  1. **Firebase の「メール/パスワード」プロバイダを有効化し、設定画面に「審査・サポート用ログイン」としてメールログインを追加**する。デモ用に `review@…` のアカウントを作り、ID・パスワードを App Store Connect の「サインイン情報」に登録。
  2. 2段階認証を無効にした専用 Google アカウントを用意し、その ID・パスワードを登録（Google 側のセキュリティチャレンジで失敗するリスクあり）。
- デモアカウントの `memberships/{uid}` を運営が Firestore で `plan: "standard", status: "active", paidUntil: <十分先>` に設定し、コミュニティと AI 振り返りを購入なしで見られるようにする（サーバーは Firestore の会員情報だけで認可するので購入不要）。
- 別のデモアカウント（無料プラン）も用意し、**そのアカウントで Sandbox 購入** ができる状態にしておく。審査の IAP は自動的に Sandbox 環境で行われる。
- フィードに投稿が数件ある状態にしておく（空だと通報・ブロックの導線が見えない）。デモ投稿は運営アカウントで作成し、実ユーザーの夢を使わない。

### E. その他の整備

- `capacitor.config.json` の `appId` を `com.doyle.yumetan` に統一。
- `docs/auth/LOGIN_AND_SYNC.md` の「メール/パスワード」の記述を実装に合わせる（D-1 を実装するなら実装後に更新）。
- App Store のスクリーンショットが「起動画面やタイトルだけ」になっていないか確認（2.3.3）。ホーム・診断結果・記録・図鑑・プラン画面など実画面を使う。
- 対応デバイス（iPhone / iPad）すべての実機で TestFlight ビルドを確認。iPad 対応を外すなら Xcode の `TARGETED_DEVICE_FAMILY` を iPhone のみにする。

## 4. 提出物（App Store Connect の返信 + Notes）

### 4-1. 画面録画の台本（実機 iPhone、最新 iOS、1本で 3〜5分）

1. ホーム画面からアプリを起動（アイコンタップから撮り始める）。
2. 初回登録: 呼び名・年代・言語 → 16問診断 → キャラクター表示。
3. 夢の記録: 文章入力 → テーマ選択 → 睡眠チェックイン → 保存 → 詳細表示。
4. 設定 → ログイン（デモアカウント）→ 同期状態の表示。
5. 設定 → プラン → プラン詳細（名称・期間・価格・自動更新の注記・**利用規約とプライバシーポリシーのリンクをタップして表示**）→ 「購入」→ Sandbox の購入シート → 完了 → プランが反映される。
6. 「みんなの夢」: フィード閲覧 → 投稿詳細 → スタンプ → コメント → **通報（理由選択→送信）** → **ブロック** → フィードから消える → ブロック一覧から解除。
7. 自分の夢の公開 → 非公開に戻す。
8. 設定 → **アカウント削除** → 確認ダイアログ → 削除完了 → 初期画面に戻る。
9. 録画は `.mov` / `.mp4` のまま App Store Connect の返信に添付（サイズ上限があるため必要なら 1080p に圧縮）。

### 4-2. アプリの目的・対象ユーザー（英語文案）

> Yumetan is a dream and sleep journal. Users answer a 16-question quiz to get one of 16 playful "dream type" characters, then record dreams (text, voice, or a photo of a handwritten note) and daily sleep check-ins. The app re-computes the dream type from recent entries and shows a sleep level (1–5) based on rest, hours and awakenings. Paid members can optionally publish an anonymised copy of a dream to a members-only feed and react/comment, and can use AI-generated reflections (OpenAI). Target audience: adults and teens (13+) who want to remember their dreams and build better sleep habits. It is entertainment and self-reflection, not a medical or psychological diagnosis; this is stated in the app.

### 4-3. セットアップ手順とログイン情報（英語文案）

> No setup is required: the app works without an account ("Continue as guest"). To review account features, sign in via Settings → Account with the demo credentials in the Sign-in information section (email/password). The demo account already has the Standard plan so "Members' Dreams", reporting, blocking and AI reflection are available without purchase. A second demo account on the Free plan is provided to test the subscription purchase flow (Settings → Plans → Starter/Standard → Details → Choose plan; purchases run in the App Store sandbox). Account deletion: Settings → Account → Delete account. Sample content: the feed already contains demo posts; a sample handwritten note image is not required (any photo of text works for OCR).

### 4-4. 外部サービス一覧

| 用途 | サービス |
| --- | --- |
| 認証 | Firebase Authentication（Google、Sign in with Apple、LINE Login via Identity Platform OIDC、匿名＝ゲスト） |
| データ保存・同期 | Cloud Firestore（Firebase プロジェクト `yumetan-a31f0`） |
| 課金 | App Store In-App Purchase（自動更新サブスクリプション）＋ RevenueCat（購読状態の照会・Webhook） |
| AI | OpenAI API（有料プランの「振り返り」生成、手書きノートの OCR、公開文章・コメントの安全性チェック）。ユーザーが明示的に操作した時だけ送信 |
| 音声入力 | iOS 標準の音声認識（`@capacitor-community/speech-recognition`） |
| 通知 | ローカル通知（起床通知） |
| サーバー | Node.js（Express）を Fly.io / Render にホスト（`API_URL`） |

### 4-5. 地域差

> The app functions identically in all regions. The interface is available in Japanese, Korean, Simplified Chinese and English, selected by the user. Subscription prices are set per storefront in App Store Connect; there is no region-locked content or feature.

### 4-6. 規制業種・第三者著作物

> Yumetan is not a medical device or health service. Sleep scores are a provisional in-app indicator, and the app states that it does not diagnose sleep quality, illness, or sleep stages; it links to public NHLBI/NINDS sleep-habit references only. The 16 characters and illustrations are original works generated for this app; no third-party licensed characters, music or trademarks are used. No documentation or credentials are therefore required.

### 4-7. In-App Purchase の概要と導線

> Four auto-renewable subscriptions: Starter Monthly (¥490 / 1 month), Starter Yearly (¥4,900 / 1 year), Standard Monthly (¥980 / 1 month), Standard Yearly (¥9,800 / 1 year). They unlock more dream entries per day, AI reflections and handwriting OCR, and the members-only "Members' Dreams" feed (read, publish, react, comment). Navigation: Settings → Plans → choose Monthly/Annual → "Details" on Starter or Standard → "Choose plan". Restore purchases and Manage/cancel buttons are on the same screen. The Free plan keeps one dream and one diary page per day, with all past entries viewable.

（価格はストアフロントごとに変わる旨を添える。実際の Notes には各サブスクリプションの製品 ID `com.doyle.yumetan.<starter|standard>.<monthly|yearly>` も書く。）

## 5. 再提出前チェックリスト

- [ ] A: アカウント削除が実機で動く（削除後に同じアカウントで再ログインすると新規扱いになる）
- [ ] B: プラン詳細画面に名称・期間・価格・利用規約・プライバシーポリシーが同時に見える
- [ ] B: App Store Connect にプライバシーポリシー URL 登録、IAP 4商品を「提出準備完了」でバイナリに添付
- [ ] C: 通報・ブロック・解除・コメント削除・非公開化が Sandbox の2アカウントで動く
- [ ] D: デモアカウント（Standard 付与済み）とデモアカウント（Free、Sandbox 購入用）を「サインイン情報」に登録
- [ ] D: フィードにデモ投稿がある
- [ ] E: `appId` 統一、スクリーンショットが実画面、対応端末で TestFlight 確認
- [ ] `npm test` / `npm run check` / `npm run test:browser` が通る
- [ ] 画面録画を撮り、返信と Notes に §4 の全項目を貼る

## 6. 優先度と目安

| 優先 | 作業 | 目安 |
| --- | --- | --- |
| 1 | A アカウント削除（サーバー＋UI＋テスト） | 1〜1.5日 |
| 2 | B 法的ページ＋プラン画面のリンク・表示 | 0.5〜1日 |
| 3 | D メール/パスワードログイン追加＋デモアカウント作成・プラン付与・デモ投稿 | 0.5日 |
| 4 | C 通報・ブロックの Sandbox 動作確認、運営処理の実施 | 0.5日 |
| 5 | E 細かな整備、スクリーンショット、TestFlight 実機確認 | 0.5日 |
| 6 | 画面録画・回答文の作成、App Store Connect 更新、再提出 | 0.5日 |

A と B を終えないまま返信すると、次は 5.1.1(v) と 3.1.2 で却下される可能性が高いので、**回答の送信は A・B の完了後**にする。
