# サブスクリプションの表示名・説明文（App Store Connect 用）

App Store Connect → ユメタン → 「サブスクリプション」→ 各プラン → 「App Store のローカライズ」に貼る文面。
回数は `public/core/plans.js` の `PLANS` の値（夢・日記・AI 読み解きは 1 日あたり、手書き認識は 1 か月あたり）。
「月 90 回」「月 30 回」のような月あたりの表現は使わない（アプリの表示と食い違うため）。
表示名は 30 文字以内、説明は 45 文字以内（App Store Connect の上限）。

## スターター 月額（com.doyle.yumetan.starter.monthly）

| 言語 | 表示名 | 説明 |
| --- | --- | --- |
| 日本語 | スターター（月額） | 夢3件・日記5件・AI読み解き3回/日、手書き認識5回/月 |
| English | Starter (Monthly) | 3 dreams, 5 diaries, 3 AI readings a day. 5 OCR/mo |

## スターター 年額（com.doyle.yumetan.starter.yearly）

| 言語 | 表示名 | 説明 |
| --- | --- | --- |
| 日本語 | スターター（年額） | 夢3件・日記5件・AI読み解き3回/日、手書き認識5回/月 |
| English | Starter (Yearly) | 3 dreams, 5 diaries, 3 AI readings a day. 5 OCR/mo |

## スタンダード 月額（com.doyle.yumetan.standard.monthly）

| 言語 | 表示名 | 説明 |
| --- | --- | --- |
| 日本語 | スタンダード（月額） | 夢10件・日記10件・AI読み解き10回/日、手書き認識20回/月 |
| English | Standard (Monthly) | 10 dreams, 10 diaries, 10 AI readings a day. 20 OCR/mo |

## スタンダード 年額（com.doyle.yumetan.standard.yearly）

| 言語 | 表示名 | 説明 |
| --- | --- | --- |
| 日本語 | スタンダード（年額） | 夢10件・日記10件・AI読み解き10回/日、手書き認識20回/月 |
| English | Standard (Yearly) | 10 dreams, 10 diaries, 10 AI readings a day. 20 OCR/mo |

## サブスクリプショングループの説明（任意欄がある場合）

| 言語 | 文面 |
| --- | --- |
| 日本語 | 1 日に記録できる夢・日記と AI 読み解きの回数が増え、みんなの夢の全文を読めます。 |
| English | More dreams, diaries and AI readings each day, plus full access to the dream feed. |

## 根拠（plans.js の値）

| プラン | 夢 / 日 | 日記 / 日 | AI 読み解き / 日 | 手書き認識 / 月 | 投稿閲覧 / 日 | 月額 | 年額 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| フリー | 1 | 3 | 1 | 0 | 0 | ¥0 | ¥0 |
| スターター | 3 | 5 | 3 | 5 | 30 | ¥490 | ¥4,900 |
| スタンダード | 10 | 10 | 10 | 20 | 150 | ¥980 | ¥9,800 |
