# 開発者本人が行う作業（App Store 再提出まで）

コード側の対応は `develop` に入っています（アカウント削除の拡張、規約ページ、購入ボタン直上のプラン名・期間・価格、店頭価格の表示、`appId` 統一）。以下は **Apple / Firebase / RevenueCat の管理画面や実機が必要で、本人にしかできない作業** です。上から順に進めてください。

## 0. デプロイ（10分）

1. `develop` への push で TestFlight ビルドが自動実行される（Actions の「iOS TestFlight」を確認）。
2. サーバー（Fly.io / Render）にも同じコミットをデプロイする。規約ページと削除 API はサーバー側なので、**アプリだけ更新しても動かない**。
3. 確認: ブラウザで `https://<サーバー>/legal/privacy.html?lang=en` と `.../legal/terms.html?lang=ja` が開く。

## 1. 規約ページのプレースホルダーを埋め、リンク先を切り替える（20分）

`public/legal/privacy.html` と `public/legal/terms.html` の赤い下線（`<span class="placeholder">`）を実際の値に書き換え、`class="placeholder"` を外す。日本語と英語の2か所ずつある。

| 箇所 | 入れる値 |
| --- | --- |
| 【事業者名】 / [Operator name] | 個人名または屋号・会社名（App Store の販売者名と一致させる） |
| 【連絡先メールアドレス】 / [contact email address] | 問い合わせ用メール（サポートサイトと同じでよい） |
| 【管轄裁判所】 / [court] | 例: 東京地方裁判所 / Tokyo District Court |
| 13歳以上 / 13 and over | 対象年齢。App Store Connect の年齢制限指定と揃える |

埋め終わったら `public/core/help-content.js` の `HELP_LINKS` を切り替える:

```js
privacy: "https://<サーバー>/legal/privacy.html",
terms: "https://<サーバー>/legal/terms.html",
```

（現在は privacy が外部サイト、terms が Apple 標準 EULA。切り替えるまではそのままでも審査上の支障はない。切り替えたら `npm run test:browser` の `help` 系テストが URL を見ていないか確認。）

## 2. Firebase（10分）

1. Firebase Console → Authentication → Sign-in method で **「メール/パスワード」を有効化**する（審査員用のデモアカウントに使う）。
2. Firestore のインデックスを反映する:

   ```sh
   npx firebase-tools deploy --project yumetan-a31f0 --only firestore:indexes
   ```

   反映しないと、アカウント削除時に「他人の投稿に付けたスタンプ」の横断検索が index エラーになる（コンソールのエラーリンクから作成してもよい）。
3. サーバーのサービスアカウントに Firebase Authentication のユーザー削除権限があることを確認する（`Firebase Admin SDK Administrator Service Agent` ロール）。

## 3. デモアカウントを2つ作る（20分）

**LINE や2段階認証付き Google は審査員が使えないので、メール/パスワードで作る。**

1. TestFlight 版で「メールでログイン」から以下の2アカウントを新規登録する。パスワードは12文字以上のランダム文字列。
   - `review-standard@<自分のドメイン>`: 有料機能の確認用
   - `review-free@<自分のドメイン>`: 購入フローの確認用（Free のまま）
2. Firebase Console → Authentication で `review-standard` の **UID** を控える。
3. Firestore で `memberships/<そのUID>` を作成（サーバー専用領域なのでコンソールから手動）:

   ```json
   { "plan": "standard", "status": "active", "paidUntil": 4102444800000, "cycle": "yearly", "source": "manual" }
   ```

   `paidUntil` は 2100-01-01 のミリ秒。これで購入なしに他人の投稿の全文・スタンプ・AI 読み解きが使える。
4. `review-standard` で夢を1件記録して公開する。さらに **別のアカウントでも2〜3件公開**して、フィードに他人の投稿がある状態にする。
5. 各アカウントで24問の診断まで済ませておく。

## 4. 通報・ブロックをどうするか決める（判断のみ）

`develop` では「みんなの夢」のコメント・通報・ブロックを削除してある。Apple の Guideline 1.2 は UGC を表示するアプリに通報とブロックを求めるため、そのまま出すと却下される可能性がある。

- **復活させる（推奨）**: 「通報・ブロックを `main` の実装から復活させて」と依頼すれば移植できる。
- **説明で通す**: `REVIEW_NOTES.md` の 3 番に書いてある「投稿は公開前に OpenAI で安全性確認、運営が非表示、サポートサイトから通報」の説明のまま提出する。

## 5. App Store Connect（30分）

### 5-1. App 情報

- 「プライバシーポリシー URL」: `HELP_LINKS.privacy` と同じ URL。
- 「使用許諾契約（EULA）」: 自前の規約を使うなら `https://<サーバー>/legal/terms.html` の内容を登録。空欄なら Apple 標準 EULA。
- 「App のプライバシー」: 連絡先情報（メール）、ユーザーコンテンツ（写真・その他 = 夢・日記）、健康とフィットネス（睡眠チェックイン）、識別子（ユーザーID）、購入（購入履歴）、使用状況データ。いずれも「ユーザーに関連付けられる」「トラッキングには使用しない」。

### 5-2. App 内課金

- 4つの自動更新サブスクリプション（`com.doyle.yumetan.starter.monthly` / `starter.yearly` / `standard.monthly` / `standard.yearly`）が「提出準備完了」で、**今回のバージョンの「App 内課金とサブスクリプション」欄に4つとも追加されている**ことを確認する（3.1.1）。
- 各商品に「審査用スクリーンショット」（プラン詳細画面）と「審査メモ」を付ける。

### 5-3. App Review Information

- 「サインインが必要」にチェックし、`review-standard@…` とパスワードを入れる。
- 「メモ」に `REVIEW_NOTES.md` の内容を貼る（2つ目のアカウントの ID・パスワードもここに書く）。
- 「連絡先情報」に電話番号・メールを入れる。

### 5-4. スクリーンショット

- 起動画面・タイトルだけの画像になっていないか確認する（2.3.3）。ホーム・診断結果・記録・図鑑・プラン画面など実際の画面を用意する。

## 6. 実機で確認して録画する（60分）

iPhone（最新 iOS）に TestFlight の最新ビルドを入れ、画面収録で1本にまとめて撮る。順序は `REVIEW_NOTES.md` の「Screen recording」節と同じ:

1. ホーム画面でアイコンをタップして起動
2. 導入 → メールで新規登録（`review-free`）→ 呼び名 → 24問診断 → キャラクター表示
3. 夢の記録 → 「この夢を診断」→ 保存 → 日付から見返す
4. 設定 → プラン → スターター詳細 → **「利用規約」「プライバシーポリシー」をタップして開く** → 戻る → 購入ボタン → Sandbox の購入シート → 完了 → 「現在のプラン」になる
   - Sandbox 購入には、設定 → App Store → サンドボックスアカウント に Sandbox テスター（App Store Connect → ユーザとアクセス → Sandbox）でログインしておく
5. ログアウト → `review-standard` でログイン → みんなの夢 → 投稿を開く → スタンプ →（通報・ブロックを復活させた場合はその操作）
6. 自分の夢の読み解きページで「公開する」をオン → オフ
7. 設定 → アカウント → **アカウントを削除** → 確認 → 初回画面に戻る（消してよい `review-free` で行い、`review-standard` は残す）

録画後、削除したデモアカウントは 3 の手順で作り直す。

## 7. App Store Connect に返信して再提出（15分）

1. 「App Review」のメッセージに返信: `REVIEW_NOTES.md` の英語本文を貼り、画面録画（.mp4 / .mov、大きければ 1080p に圧縮）を添付する。
2. 同じ内容を App Review Information の「メモ」に貼る。
3. 新しいビルドを選び直して「審査へ提出」。
