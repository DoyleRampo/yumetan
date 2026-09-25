# 開発者本人が行う作業（App Store 再提出まで）

コード側の対応（アカウント削除、規約ページ、購入画面の表示、店頭価格表示、`appId` 統一）はブランチ `claude/beautiful-einstein-46ib3a` に入っています。以下は **Apple / Firebase / RevenueCat の管理画面や実機が必要で、本人にしかできない作業** です。上から順に進めてください。

## 0. ブランチを取り込む（5分）

1. GitHub で `claude/beautiful-einstein-46ib3a` → `develop` の Pull Request を作ってマージする（`develop` への push で TestFlight ビルドが自動実行される）。
2. サーバー（Fly.io / Render）も同じコミットをデプロイする。`/legal/privacy.html` と `/api/account/delete` はサーバー側の変更なので、**アプリだけ更新しても動かない**。
3. 確認: ブラウザで `https://<サーバー>/legal/privacy.html?lang=en` と `.../legal/terms.html?lang=ja` が開く。

## 1. 規約ページのプレースホルダーを埋める（15分）

`public/legal/privacy.html` と `public/legal/terms.html` の中で、赤い下線（`<span class="placeholder">`）になっている箇所を実際の値に書き換え、`class="placeholder"` を外す。

| 箇所 | 入れる値 |
| --- | --- |
| 【事業者名】 / [Operator name] | 個人名または屋号・会社名（App Store の販売者名と一致させる） |
| 【連絡先メールアドレス】 / [contact email address] | 問い合わせ用メール（`SUPPORT_URL` のページと同じでよい） |
| 【管轄裁判所】 / [court] | 例: 東京地方裁判所 / Tokyo District Court |
| 13歳以上 / 13 and over | 対象年齢。App Store Connect の年齢制限指定と揃える |

両ファイルとも日本語セクションと英語セクションの2か所ずつある。書き換えたらコミットして再デプロイ。

## 2. Firebase（10分）

1. Firebase Console → Authentication → Sign-in method で **「メール/パスワード」を有効化**する（アプリの設定画面にメールログイン欄は既にある。審査員用のデモアカウントに使う）。
2. Firestore のインデックスを反映する: リポジトリ直下で

   ```sh
   npx firebase-tools deploy --only firestore:indexes
   ```

   反映しないと、アカウント削除時にコメント・スタンプ・ブロックの横断検索が「index required」エラーになる（コンソールのエラーリンクから作成してもよい）。
3. サーバーのサービスアカウントに Firebase Authentication の削除権限があることを確認する（`Firebase Admin SDK Administrator Service Agent` ロール、または `roles/firebaseauth.admin`）。

## 3. デモアカウントを2つ作る（20分）

App Store 審査員が使うアカウント。**LINE や2段階認証付き Google は審査員が使えないので、メール/パスワードで作る。**

1. アプリ（TestFlight 版）で「設定 → アカウント・同期 → メールでログイン」を開き、以下の2アカウントを「新規登録」で作る。パスワードは12文字以上のランダム文字列にする。
   - `review-standard@<自分のドメイン>`: 有料機能の確認用
   - `review-free@<自分のドメイン>`: 購入フローの確認用（Free のまま）
2. Firebase Console → Authentication で `review-standard` の **UID** を控える。
3. Firestore で `memberships/<そのUID>` ドキュメントを作成（サーバー専用領域なのでコンソールから手動で）:

   ```json
   { "plan": "standard", "status": "active", "paidUntil": 4102444800000, "cycle": "yearly", "source": "manual" }
   ```

   `paidUntil` は 2100-01-01 のミリ秒。これで購入なしに「みんなの夢」「AI振り返り」「通報・ブロック」が使える。
4. `review-standard` でログインし、夢を1件記録して「公開」しておく。さらに **自分の本番アカウント（または3つ目のアカウント）でも2〜3件公開**して、フィードに他人の投稿がある状態にする（通報・ブロックは他人の投稿にしか出ない）。
5. 各アカウントで16問診断まで済ませておく（診断前だと審査員が診断画面から始めることになるが、それ自体は問題ない）。

## 4. App Store Connect（30分）

### 4-1. App 情報

- 「プライバシーポリシー URL」: `https://<サーバー>/legal/privacy.html`
- 「使用許諾契約（EULA）」: 独自規約を使うなら `https://<サーバー>/legal/terms.html` の内容を登録。空欄なら Apple 標準 EULA が適用される（アプリ内の「利用規約」リンクは自前ページを開く）。
- 「App のプライバシー」: 収集データを申告する。目安 → 連絡先情報（メール）、ユーザーコンテンツ（写真・その他のユーザーコンテンツ = 夢・日記）、健康とフィットネス（睡眠チェックイン。「その他の健康データ」でよい）、識別子（ユーザーID）、購入（購入履歴）、使用状況データ（製品の操作）。いずれも「ユーザーに関連付けられる」「トラッキングには使用しない」。

### 4-2. App 内課金

- 4つの自動更新サブスクリプション（`com.doyle.yumetan.starter.monthly` / `starter.yearly` / `standard.monthly` / `standard.yearly`）が「提出準備完了」になっていて、**今回のバージョンの「App 内課金とサブスクリプション」欄に4つとも追加されている**ことを確認する（3.1.1 対策）。
- 各商品に「審査用スクリーンショット」（プラン詳細画面）と「審査メモ」を付ける。
- サブスクリプショングループの「ローカライズ」と各商品の表示名・説明が入っていることを確認。

### 4-3. App Review Information（サインイン情報 / メモ）

- 「サインインが必要」にチェックし、ユーザー名 `review-standard@…`、パスワードを入れる。
- 「メモ」に `REVIEW_NOTES.md`（このフォルダ）の内容を貼る（2つ目のアカウントの ID・パスワードもここに書く）。
- 「連絡先情報」に自分の電話番号・メールを入れる。

### 4-4. スクリーンショット

- 起動画面・タイトルだけの画像になっていないか確認する（2.3.3）。ホーム・診断結果・記録・図鑑・プラン画面など、実際の画面を6.9インチと6.5インチ（必要なら iPad）で用意する。

## 5. 実機で確認して録画する（60分）

iPhone（最新 iOS）に TestFlight の最新ビルドを入れ、**画面収録（設定 → コントロールセンター → 画面収録）** で1本にまとめて撮る。順序は `REVIEW_NOTES.md` の「Screen recording」節と同じにする:

1. ホーム画面でアイコンをタップして起動
2. 呼び名・年代 → 16問診断 → キャラクター表示
3. 夢の記録 → テーマ → 睡眠チェックイン → 保存 → 詳細
4. 設定 → メールでログイン（`review-free`）
5. 設定 → プラン → スターター詳細 → **「利用規約」「プライバシーポリシー」をタップして開く** → 戻る → 「このプランを選ぶ」→ Sandbox の購入シート → 完了 → 「スタンダード/スターター」が「現在のプラン」になる
   - Sandbox 購入には、設定 → App Store → サンドボックスアカウント に Sandbox テスター（App Store Connect → ユーザとアクセス → Sandbox）でログインしておく
6. ログアウト → `review-standard` でログイン → みんなの夢 → 投稿を開く → スタンプ → コメント → **通報（理由を選んで送信）** → **ブロック** → フィードから消える → 「ブロック」一覧 → 解除
7. 自分の夢の詳細 → 公開 → 非公開に戻す
8. 設定 → アカウント・同期 → **アカウントの削除** → 確認ダイアログ → 初期画面に戻る（`review-free` など、消してよいアカウントで行う。`review-standard` は消さない）

録画後、削除したデモアカウントは 3 の手順で作り直す。

## 6. App Store Connect に返信して再提出（15分）

1. 「App Review」のメッセージに返信: `REVIEW_NOTES.md` の英語本文を貼り、画面録画（.mp4 / .mov、大きければ 1080p に圧縮）を添付する。
2. 同じ内容を App Review Information の「メモ」に貼る（Apple の指示）。
3. 新しいビルド（規約・削除機能入り）を選び直して「審査へ提出」。

## 7. 運営側の準備（審査後も継続）

- Firebase で運営アカウントに Custom Claim `moderator: true` を付与し、`GET /api/moderation/reports` で通報を定期確認する（1.2: 通報に対応する体制）。
- `SUPPORT_URL` に問い合わせページを設定する（未設定ならコミュニティ画面にサポートリンクが出ない）。
