# 開発者本人が行う作業（App Store 再提出まで）

コード側の対応は `develop` に入っています。決定済み: 通報・ブロックは削除のまま（Notes で説明）、事業者名「ユメタン運営」、連絡先 080-8978-7788、対象年齢 13 歳以上（App Store の年齢制限指定は別途 4+ で可）。以下は **Apple / Firebase の管理画面や実機が必要で、本人にしかできない作業** です。上から順に進めてください。所要時間の目安は合計 3〜4 時間です。

## 1. サーバーとアプリを最新にする

1. Fly.io / Render の管理画面で `develop` の最新コミットをデプロイする（自動デプロイ設定なら push 済みで完了）。
2. ブラウザで次の 2 つが開くことを確認する（`<サーバー>` は `API_URL` と同じホスト）:
   - `https://<サーバー>/legal/privacy.html?lang=ja`
   - `https://<サーバー>/legal/terms.html?lang=en`
3. GitHub → Actions → 「iOS TestFlight」が `develop` の push で成功していることを確認する（失敗していたらログの赤い行を送ってください）。
4. iPhone の TestFlight アプリで新しいビルドをインストールする。

## 2. Firebase（10 分）

1. https://console.firebase.google.com → プロジェクト `yumetan-a31f0` → **Authentication → Sign-in method** → 「新しいプロバイダを追加」→ **メール / パスワード** → 有効にして保存。
2. **Firestore のインデックス**を反映する。PC のターミナルでリポジトリ直下に移動して:

   ```sh
   npx firebase-tools login
   npx firebase-tools deploy --project yumetan-a31f0 --only firestore:indexes
   ```

   反映しないと、アカウント削除時に「他人の投稿に付けたスタンプ」の横断検索で index エラーになる。
3. Google Cloud Console → IAM で、サーバーが使うサービスアカウント（`FIREBASE_SERVICE_ACCOUNT_JSON` の `client_email`）に **Firebase Admin SDK Administrator Service Agent** ロールがあることを確認する（Auth ユーザー削除に必要）。

## 3. デモアカウントを 2 つ作る（20 分）

審査員は LINE や 2 段階認証付き Google を使えないので、**メール / パスワード**で作る。

1. TestFlight 版アプリを起動 → 導入 → ログイン画面の「メールでログイン」→ **新規登録**:
   - `review-standard@<自分のドメイン>`（有料機能の確認用）
   - `review-free@<自分のドメイン>`（購入フローの確認用。Free のまま）
   - パスワードは 12 文字以上のランダム文字列。2 つとも控える。
2. それぞれ呼び名を入れて 24 問の診断まで進め、夢を 1 件記録しておく。
3. Firebase Console → **Authentication → Users** で `review-standard` の **UID** をコピー。
4. Firebase Console → **Firestore Database** → コレクション `memberships` → 「ドキュメントを追加」→ ドキュメント ID に UID を貼り、フィールドを追加:

   | フィールド | 型 | 値 |
   | --- | --- | --- |
   | plan | string | standard |
   | status | string | active |
   | paidUntil | number | 4102444800000 |
   | cycle | string | yearly |
   | source | string | manual |

   これで購入なしに他人の投稿の全文・スタンプ・AI 読み解きが使える（2100 年まで有効）。
5. `review-standard` でログインし、夢を 1 件「公開する」で公開する。さらに **自分の本番アカウントでも 2〜3 件公開**して、フィードに他人の投稿がある状態にする。

## 4. App Store Connect（30 分）

https://appstoreconnect.apple.com → マイ App → ユメタン。

### 4-1. App 情報（左メニュー「App 情報」）

- **プライバシーポリシー URL**: `https://<サーバー>/legal/privacy.html`
- **使用許諾契約（EULA）**: 「カスタム使用許諾契約」に `https://<サーバー>/legal/terms.html?lang=en` の英語本文をコピーして貼る（空欄なら Apple 標準 EULA が適用され、アプリ内の「利用規約」リンクは自前ページを開く。どちらでも可）。
- **年齢制限指定**: 「編集」→ 質問に答える。UGC（ユーザー生成コンテンツ）の項目は「はい」。結果が 4+ / 9+ / 12+ のどれになっても問題ない。

### 4-2. App のプライバシー（左メニュー「App のプライバシー」）

「データの収集を開始」→ 収集するデータ:

| データ | 用途 | ユーザーに関連付け | トラッキング |
| --- | --- | --- | --- |
| 連絡先情報 → メールアドレス | App の機能 | はい | いいえ |
| ユーザーコンテンツ → 写真またはビデオ、その他のユーザーコンテンツ | App の機能 | はい | いいえ |
| 健康とフィットネス → 健康 | App の機能 | はい | いいえ |
| 識別子 → ユーザー ID | App の機能 | はい | いいえ |
| 購入 → 購入履歴 | App の機能 | はい | いいえ |
| 使用状況データ → 製品の操作 | App の機能、アナリティクス | はい | いいえ |

### 4-3. App 内課金（左メニュー「サブスクリプション」）

- 4 つの自動更新サブスクリプション（`com.doyle.yumetan.starter.monthly` / `starter.yearly` / `standard.monthly` / `standard.yearly`）が **「提出準備完了」** であること。「メタデータが不足」なら、表示名・説明・**審査用スクリーンショット**（プラン詳細画面のスクショ）・審査メモを埋める。
- サブスクリプショングループの「ローカライズ」（日本語・英語）が入っていること。
- 今回提出するバージョンのページ → 「App 内課金とサブスクリプション」欄 → **4 つとも追加**する（バイナリと同時提出。3.1.1 対策）。

### 4-4. Sandbox テスター（左上「ユーザとアクセス」→「Sandbox」）

- 「テスター」を 1 人追加（実在しないメールでよい。Apple ID として使うのでパスワードを控える）。
- iPhone の **設定 → App Store → 下にスクロール → サンドボックスアカウント** でこのテスターにサインインしておく（録画で購入シートを出すため）。

### 4-5. App Review に関する情報（バージョンページの下部）

- **サインインが必要** にチェック → ユーザー名 `review-standard@…` / パスワード。
- **連絡先情報**: 名前、電話 080-8978-7788、メール。
- **メモ**: `docs/appstore/REVIEW_NOTES.md` の `---` から `---` までを貼る。`[model]` `[version]` `[domain]` `[password]` `[server]` `[Fly.io / Render]` を実際の値に置き換え、`review-free` の ID・パスワードも書く。

### 4-6. スクリーンショット

- 6.9 インチ（iPhone 16 Pro Max 等）と 6.5 インチ用に、実際の画面（ホーム・診断結果・夢の記録・みんなの夢・プラン）を 4〜6 枚。起動画面・タイトルだけの画像は不可（2.3.3）。iPad 対応を残すなら iPad 用も必要。

## 5. 実機で画面録画（40 分）

iPhone（最新 iOS）で **設定 → コントロールセンター → 「画面収録」を追加** し、コントロールセンターから録画を開始。1 本で次の順に操作する（`REVIEW_NOTES.md` の「Screen recording」と同じ）:

1. ホーム画面でユメタンのアイコンをタップ（録画はここから始める）。
2. 導入 → 「メールでログイン」→ `review-free` でログイン（すでに登録済み）→ ホーム。
3. 「夢を記録」→ 本文を入力 → 「この夢を診断」→ 結果 → 保存 → 日付から開き直す。
4. 設定 → 「プランを見る」→ スターターの「詳細」→ **「利用規約 ↗」をタップして開き、戻る → 「プライバシーポリシー ↗」をタップして開き、戻る** → 購入ボタン → Sandbox の購入シート → 「購読」→ 「現在のプラン」になる。
5. 設定 → ログアウト → `review-standard` でログイン → 「みんなの夢」→ 投稿を開く → スタンプを付ける。
6. 自分の夢を開き、読み解きページで「みんなの夢に公開する」をオン → 保存 → オフ → 保存。
7. 設定 → アカウント → **「アカウントを削除」** → 確認 → 初回画面に戻る（`review-standard` で行う。消えたら手順 3 で作り直す。`review-free` は Sandbox 購入が紐づくので残す）。
8. 録画を止める。写真アプリで確認し、長ければ不要部分をトリミング。ファイルが 500MB を超える場合は iMovie 等で 1080p に書き出す。

録画後、`review-standard` を手順 3 の方法で作り直し（同じメール可）、`memberships` に Standard を付与し直す。

## 6. 返信と再提出（15 分）

1. App Store Connect → バージョンページ上部の「App Review」メッセージ → **返信**: `REVIEW_NOTES.md` の英語本文を貼り、録画ファイルを添付して送信。
2. 「ビルド」欄で **最新の TestFlight ビルド**（アカウント削除の拡張・規約ページ入り）を選び直す。
3. 「審査へ提出」。

## 7. 審査後も続けること

- サポートサイト（`https://yumetan-support.ni23al.chatgpt.site/support/`）に届いた投稿の通報は、Firestore で `communityPosts/{id}` の `hidden` を `true` に、悪質なユーザーは `memberships/{uid}` の `suspended` を `true` にして対応する。
- Guideline 1.2（通報・ブロック）で再度指摘された場合は、`main` ブランチにある通報・ブロックの実装を移植する（「通報・ブロックを復活させて」と依頼）。
