# 🌙 ユメタン — 夢を聞いてくれるAI

起きてすぐ、寝ぼけたまま口で夢を話すだけ。担当キャラクターが聞いて、覚えて、最近の心の状態を簡潔に教えてくれます。

## v4.0.0 の新機能（16タイプ・睡眠の質・多言語）

- **16タイプ診断（MBTI 風）**: 初回登録のあと 16 問のアンケートに答えると、**悪夢 / 予知 / 明晰 / 反復** の 4 グループ × 4 = 16 タイプから「あなたのキャラクター」が決まります。夢を記録するたびにスコアが動き、タイプが **変わる** こともあります（`public/engine/types.js`、定義は `knowledge/dream_types16.md`）。
- **レベル（1〜5）= 睡眠の質**: 夢の内容 + 朝の 3 問チェック + 前日の日記 + プロフィールから睡眠の質スコア（0〜100）を出し、直近 7 件の加重平均でキャラクターのレベルが上下します（`public/engine/sleep.js`、根拠は `knowledge/sleep_quality.md`）。
- **寝る前のアドバイス**: 睡眠の質の要因（悪夢・金縛り・カフェイン・夜更かし…）に合わせて「今夜できること」を 1〜3 個提案します。
- **今日の日記**: 気分（5 段階）・したこと（カフェイン／お酒／運動…）・数行のメモ。翌朝の夢の読み取りで **前日の日記を参照** します。
- **手書きノートの写真**: 夢ノートを撮って記録に添付。AI（API キー）があれば文字起こしします（`POST /api/ocr`）。
- **アラーム**: Android は端末標準の時計アプリにアラームを登録（自作 Capacitor プラグイン `YumetanAlarm`）。iOS は時計アプリを開く + アプリ通知。Web は通知のみ。
- **4 言語**: 日本語 / English / 한국어 / 中文。登録時と設定で切り替え。UI・16 タイプ・アドバイス・診断はすべて翻訳済み。端末内エンジンの「夢の読み取り文」は日本語のみで、AI を有効にすると選んだ言語で返します。
- **自分の API キー**: 「設定 → 詳細設定」に Claude API キーを入れると、サーバーにキーが無くても AI 機能が使えます（`X-Yumetan-Key` ヘッダー。サーバーには保存しません）。

用意してほしい素材（16 タイプの画像など）は **`docs/ASSETS_REQUEST.md`** を見てください。

- **聞く**: 「話しかける」「質問に答える（はい/いいえ/スキップ/その他）」「自分で全文を書く」「手書きノートを撮る」の4つの方法。
- **覚える**: 夢の記録・日記・タイプ状態は端末内（Firebase 設定時はクラウド）に保存。タイトル・要約・感情・象徴・テーマ・睡眠スコアを自動で付与。
- **読み取る**: 複数日の夢のパターンから「最近の心の状態」を2〜3文で。
- **知識を持つ**: 夢と精神状態の対応知識（`knowledge/dream_psychology.md`）、睡眠の質（`knowledge/sleep_quality.md`）、16タイプ（`knowledge/dream_types16.md`）を AI の「記憶」として使用。

**分析は端末内のルールエンジンで行います（AI・API不要、通信不要、無料）。** Claude API を使う分析は「設定 → 詳細設定 → AIで分析する」で切り替えられます（サーバーの API キー、または自分の API キー）。

3つの使い方があります。

| 形 | 向いている人 | 必要なもの |
|---|---|---|
| **Web / PWA** | リンクを配るだけで誰でも使える | 公開サーバー（下記）だけ |
| **iOSアプリ** | ネイティブ音声認識、ホーム画面のアイコン | 公開サーバー + Xcode |
| **Androidアプリ** | 同上 | 公開サーバー + Android Studio |

---

## 1. サーバーを公開する（全員に必要）

Claude API のキーはサーバーだけが持ちます。利用者にはキーを配りません。

### Render.com（無料枠あり、いちばん簡単）

1. このフォルダを GitHub にプッシュ
2. https://dashboard.render.com → **New → Blueprint** → リポジトリを選ぶ（`render.yaml` が読み込まれる）
3. 環境変数 `ANTHROPIC_API_KEY` に Claude API キーを入力（任意で `ACCESS_CODE` に合言葉）
4. デプロイ完了後の URL（例 `https://yumetan.onrender.com`）が **配布用リンク** です

無料枠はアクセスが無いとスリープし、最初の1回だけ起動に数十秒かかります。気になる場合は有料プランへ。

### Fly.io

```bash
fly launch --no-deploy --copy-config
fly secrets set ANTHROPIC_API_KEY=sk-ant-...
fly deploy
```

### Docker が動くサーバーなら何でも

```bash
docker build -t yumetan .
docker run -p 3000:3000 -e ANTHROPIC_API_KEY=sk-ant-... yumetan
```

### 環境変数

| 変数 | 意味 | 既定 |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude API キー（任意。無い場合は利用者が設定画面で自分のキーを入れたときだけ AI が動く） | – |
| `CLAUDE_MODEL` | 使うモデル | `claude-opus-5`（`render.yaml` / `fly.toml` は安い `claude-sonnet-5`） |
| `LIMIT_PER_USER_DAY` | 1端末あたり 1日の AI 呼び出し上限 | 60 |
| `LIMIT_GLOBAL_DAY` | 全体で 1日の AI 呼び出し上限 | 3000 |
| `ACCESS_CODE` | 合言葉。設定すると知っている人だけ使える | 空（誰でも） |
| `PORT` | ポート | 3000 |

---

## 2. リンクで配る（Web / PWA）

公開した URL をそのまま送るだけ。スマホで開いて **「ホーム画面に追加」** するとアプリのように使えます（アイコン・全画面・オフラインでも画面は開く）。

- iPhone: Safari で開く → 共有ボタン → ホーム画面に追加
- Android: Chrome で開く → メニュー → ホーム画面に追加（またはインストール）

合言葉を設定した場合は、利用者に「設定 → 合言葉」に入れてもらってください。

---

## 3. iOS / Android ネイティブアプリ

Capacitor で `public/` をそのままアプリ化しています。音声認識・読み上げ・保存は端末のネイティブ機能を使います。

必要なもの:
- iOS: Mac + Xcode + CocoaPods（`brew install cocoapods`。音声認識プラグインが CocoaPods 専用のため）
- Android: Android Studio（JDK 同梱）

```bash
# 1) 接続先（公開サーバーのURL）を埋め込んで dist/ を作り、ネイティブプロジェクトへ同期
API_URL=https://yumetan.onrender.com npm run mobile:sync

# 2-a) iOS: Xcode が開く → 左上でチーム（Signing）を選ぶ → 実機/シミュレータで ▶
npx cap open ios

# 2-b) Android: Android Studio が開く → ▶
npx cap open android
```

- アイコン・スプラッシュは `assets/icon.png` `assets/splash.png` から `npm run mobile:assets` で生成済み。差し替えたら再実行。
- App Store / Google Play に出すときは、それぞれの開発者アカウント（Apple: 年 ¥15,800 前後、Google: 一回 $25）が必要です。
- 配布前テストは iOS は TestFlight、Android は「内部テスト」か APK 直配布が手軽です。
- `public/` を変更したら `npm run mobile:sync` をもう一度。
- ターミナルで `pod install` 関連のエラーが出たら `export LANG=en_US.UTF-8` を実行してから再試行。
- シミュレータでローカルのサーバーに繋いで試すときは `API_URL=http://localhost:3000 npm run mobile:sync`。

---

## 4. 手元で動かす（開発）

```bash
npm install
cp .env.example .env     # ANTHROPIC_API_KEY を書く
npm start                # http://localhost:3000
```

---

## 仕組み

```
利用者の端末（ブラウザ / PWA / iOS / Android）
  ├─ 夢の記録・設定を端末内に保存（localStorage / Capacitor Preferences）
  ├─ 音声認識・読み上げ（Web Speech API / ネイティブ）
  ├─ 分析（既定）: public/engine/ のルールエンジン
  │     lexicon.js   判断材料（テーマ・感情・結末・汎用回答・テンプレート）
  │     analyze.js   1つの夢 → タイトル / 感情 / テーマ / 気分 / 悪夢判定 / 心の状態の一文 / 返事
  │     insight.js   複数の夢 → ストレス度 / 傾向 / 反復テーマ / 良い面 / 提案 / 注意
  │     interview.js はい・いいえの分岐シナリオ → 夢の文章
  │
  │     types.js     16タイプ: アンケート診断 / 夢の記録による成長・交代 / 4グループ
  │     sleep.js     睡眠の質: スコア(0-100) / レベル(1-5) / 寝る前のアドバイス
  │  i18n.js        4言語の文言（data-i18n 属性 + t()）
  │
  │  （AIをオンにしたときだけ。lang を送ると選んだ言語で返る）
  │  POST /api/listen     { messages, history, diary, profile, dreamType } → 返事 + 分析
  │  POST /api/interview  { answers, finish, more } → 次の質問 or まとめ
  │  POST /api/insight    { dreams, profile }     → 最近の心の状態
  │  POST /api/ocr        { image(dataURL) }      → 手書きノートの文字起こし
  │  POST /api/sleep      { analysis, check, diary, hours } → 睡眠スコア / レベル / アドバイス
  │  POST /api/type       { quiz, dreams }        → 16タイプの再判定
  │  GET  /api/knowledge, /api/knowledge/sleep, /api/knowledge/types → 知識ファイル
  ▼
server.js（ステートレス。データを保存しない）
  ├─ knowledge/*.md を system prompt に注入（prompt caching）
  ├─ API キー: 環境変数 ANTHROPIC_API_KEY か、利用者の X-Yumetan-Key ヘッダー（自分のキーの人は回数制限なし）
  ├─ Claude API（structured outputs）
  └─ 1端末/日・全体/日 の回数制限、合言葉、CORS
```

利用者は `X-Yumetan-User`（端末ごとのランダムID）で識別され、回数制限にだけ使われます。

### Android のアラーム連携

`android/app/src/main/java/com/hikaso/yumetan/YumetanAlarmPlugin.java` が `AlarmClock.ACTION_SET_ALARM` で端末の時計アプリにアラームを登録します（`MainActivity` で登録済み、`SET_ALARM` 権限は Manifest に追加済み）。通知は `@capacitor/local-notifications`（`npm install` 後に `npx cap sync`）。

---

## 注意

ユメタンは医療機器でも診断ツールでもありません。悪夢が2週間以上続く、眠るのが怖い、日中の落ち込みが強い、といったときは睡眠外来や心療内科に相談してください。
