// ユメタン API サーバー（ステートレス）
// 夢の記録は各ユーザーの端末に保存。サーバーは Claude API の呼び出し・知識・利用制限のみを担当。
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

try { process.loadEnvFile(); } catch { /* .env が無ければ環境変数をそのまま使う */ }

const here = path.dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_FILE = path.join(here, "knowledge", "dream_psychology.md");
const SLEEP_KNOWLEDGE_FILE = path.join(here, "knowledge", "sleep_quality.md");
const TYPES_KNOWLEDGE_FILE = path.join(here, "knowledge", "dream_types16.md");
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5";
const PORT = Number(process.env.PORT || 3000);
const HISTORY_FOR_LISTENING = 6;
const INSIGHT_MIN_DREAMS = 2;
const INSIGHT_MAX_DREAMS = 12;
const INTERVIEW_MAX = 12;
// 利用制限（公開配布時に API キーの使いすぎを防ぐ）
const LIMIT_PER_USER_DAY = Number(process.env.LIMIT_PER_USER_DAY || 60);   // 1端末あたり 1日の AI 呼び出し回数
const LIMIT_GLOBAL_DAY = Number(process.env.LIMIT_GLOBAL_DAY || 3000);     // 全体で 1日の AI 呼び出し回数
const ACCESS_CODE = process.env.ACCESS_CODE || "";                          // 設定すると合言葉を知っている人だけ使える

// API キーは「サーバーの環境変数」か「利用者が設定画面で入れた自分のキー（X-Yumetan-Key）」のどちらか。
// どちらも無ければ AI 機能だけ 401 を返し、サーバー自体は（端末内エンジンの配信用に）動き続ける。
const SERVER_KEY = process.env.ANTHROPIC_API_KEY || "";
const clients = new Map();
function clientFor(req) {
  const own = str(req.get("X-Yumetan-Key"), 200).trim();
  const key = own || SERVER_KEY;
  if (!key) throw httpError(401, "AI を使うには Claude API キーが必要です。サーバーの ANTHROPIC_API_KEY か、設定 → 詳細設定で自分の API キーを入力してください。");
  if (!clients.has(key)) { if (clients.size > 200) clients.clear(); clients.set(key, new Anthropic({ apiKey: key })); }
  return clients.get(key);
}
const knowledge = await fs.readFile(KNOWLEDGE_FILE, "utf8");
const sleepKnowledge = await fs.readFile(SLEEP_KNOWLEDGE_FILE, "utf8").catch(() => "");
const typesKnowledge = await fs.readFile(TYPES_KNOWLEDGE_FILE, "utf8").catch(() => "");

// ---------- 言語 ----------
const LANGS = { ja: "日本語", en: "English", ko: "한국어", zh: "中文（简体）" };
const langOf = (req) => { const l = String(req.body?.lang || req.get("X-Yumetan-Lang") || "ja").slice(0, 2).toLowerCase(); return LANGS[l] ? l : "ja"; };
const langInstruction = (lang) => (lang === "ja" ? "" : `\n\n【重要】ユーザーの言語は ${LANGS[lang]} です。reply / title / summary / emotions / themes / hints など、ユーザーに見せる文字列はすべて ${LANGS[lang]} で書いてください（キーや列挙値は英語のまま）。`);

// ---------- 構造化出力スキーマ ----------
const DREAM_TYPES = ["ordinary", "nightmare", "recurring", "lucid", "pleasant", "fragment"];
const DreamAnalysis = z.object({
  reply: z.string().describe("ユーザーへの返答。2〜4文。共感し、印象的な場面か感情について質問を1つだけ。話が十分なら質問せず締める"),
  title: z.string().describe("夢の短いタイトル（10字前後）"),
  summary: z.string().describe("夢の要約。1〜2文"),
  emotions: z.array(z.string()).describe("夢の中の感情（日本語、最大4つ）"),
  symbols: z.array(z.string()).describe("印象的な象徴・モチーフ（最大5つ）"),
  themes: z.array(z.string()).describe("典型夢テーマや心理テーマ（例: 追跡, 落下, 評価不安, 喪失）最大4つ"),
  mood: z.number().int().describe("夢全体の情動価。-2(とても嫌)〜2(とても良い)"),
  intensity: z.number().int().describe("感情の強さ 1〜5"),
  dream_type: z.string().describe(`次のいずれか: ${DREAM_TYPES.join(" | ")}`),
  mental_state_hint: z.string().describe("この夢だけから読める心の状態の仮説。1文。断定しない"),
});
const Insight = z.object({
  headline: z.string().describe("最近の心の状態を一言で（15字以内）"),
  state: z.string().describe("最近の心の状態の説明。2〜3文。夢の具体例に触れる"),
  stress_level: z.string().describe("次のいずれか: low | medium | high"),
  dominant_emotions: z.array(z.string()).describe("目立つ感情 最大3つ"),
  recurring_themes: z.array(z.string()).describe("繰り返しテーマ 最大3つ"),
  trend: z.string().describe("次のいずれか: improving | stable | worsening | unknown"),
  positive_note: z.string().describe("良い面。1文"),
  suggestion: z.string().describe("小さく具体的な提案。1文"),
  caution: z.string().nullable().describe("危険サインがある場合のみ、やさしい相談の勧め。無ければnull"),
});
const InterviewStep = z.object({
  comment: z.string().describe("直前の回答への短い相槌（例: なるほど。/ そうでしたか。）10字前後。最初の質問や done のときは空文字"),
  question: z.string().describe("次の質問。「はい」「いいえ」で答えられる短い一文。done が true のときは空文字"),
  done: z.boolean().describe("夢の内容をまとめるのに十分な情報が集まった、または質問数の上限に達したら true"),
  dream_text: z.string().describe("done が true のとき、回答をつなぎ合わせた夢の内容。本人の一人称・口語で2〜5文。「いいえ」の情報は原則書かない。done が false なら空文字"),
});

const SleepAssessment = z.object({
  score: z.number().int().describe("睡眠の質スコア 0〜100（知識の第1〜5章の配点に従う）"),
  level: z.number().int().describe("レベル 1〜5（80以上=5, 65以上=4, 50以上=3, 35以上=2, それ未満=1）"),
  factors: z.array(z.string()).describe("影響した要因のID（例: nightmare, paralysis, caffeine, alcohol, late_screen, short_sleep, wakeups_many, onset_bad, feel_tired, stress, pleasant）最大6つ"),
  summary: z.string().describe("昨夜の眠りについて1〜2文。やわらかい口語"),
  advice: z.array(z.string()).describe("今夜できる具体的な行動レベルのアドバイス。1〜3個。各1文"),
});
const TypeDiagnosis = z.object({
  typeId: z.string().describe("16タイプのID: chase | loss | bound | collapse | future | intuition | symbol | dejavu | lucid | partial | observer | challenge | place | person | story | emotion"),
  groupId: z.string().describe("nightmare | premonition | lucid | recurring"),
  confidence: z.number().describe("0〜1"),
  reason: z.string().describe("そのタイプにした根拠。2〜3文。夢の具体例に触れる"),
  runnerUp: z.string().nullable().describe("次に近いタイプのID。無ければ null"),
});
const OcrResult = z.object({
  text: z.string().describe("画像に書かれている文字を、書かれている言語のまま、改行を保って書き起こしたもの。判読できない部分は［?］"),
  language: z.string().describe("書かれている言語（ja / en / ko / zh / other）"),
  is_dream_note: z.boolean().describe("夢の記録・日記らしい内容なら true"),
});

// ---------- プロンプト ----------
const PERSONA = `あなたは「ユメタン」。起きたばかりの人が、寝ぼけたまま口で話す夢を聞く専属の聞き役です。

役割:
- まず聞く。共感を短く返し、夢の一番印象的な場面か、そのとき感じた気持ちについて質問を1つだけする。
- ユーザーは音声で話しているので、言い間違い・言い直し・「えーと」などは自然に読み取る。
- 分析は仮説として控えめに。診断しない。夢占いのように吉凶を言わない。
- 返答は口語の日本語。やわらかく、短く。朝に読んで負担にならない長さ。
- 話が十分に出ている、またはユーザーが「以上」「終わり」「もう大丈夫」と言ったら、質問せずに温かく締める。
- 過去の夢の記録が渡されたら、繰り返しやつながりに気づいたときだけ一言触れる（毎回は触れない）。

以下は、夢と心の状態の対応についてあなたが持っている知識です。返答と分析の根拠として使ってください。

====== 知識 ======
${knowledge}
====== 知識ここまで ======`;

const INSIGHT_PERSONA = `あなたは「ユメタン」。ユーザーの夢の記録を複数日分読み、最近の心の状態を簡潔に伝えます。

ルール:
- 上の知識の第5〜8章に従う。複数の夢に共通するパターンを重視し、1つの夢で決めつけない。
- 診断しない。「〜の傾向」「〜のサイン」として伝える。
- 必ず良い面も拾う。提案は1つだけ、小さく具体的に。
- 危険サイン（第7章）に当てはまるときだけ caution を書く。それ以外は null。
- 文体はやわらかい口語の日本語。

====== 知識 ======
${knowledge}
====== 知識ここまで ======`;

const INTERVIEW_PERSONA = `あなたは「ユメタン」。夢をうまく言葉にできない人に、はい／いいえで答えられる質問を1つずつ投げかけて、夢の内容を汲み取る聞き役です。

ルール:
- 質問は1回に1つ。短く、「はい」「いいえ」で答えられる形にする。選択肢を並べない。
- 順番の目安: 登場人物（知っている人か）→ 場所（見覚えがあるか）→ 何が起きたか（追われた・落ちた・探した・話した等の典型テーマを当てにいく）→ 夢の中の気持ち（怖い・楽しい・焦り等）→ 結末・目覚め方 → 一番印象に残った物や場面。
- 直前の回答に合わせて掘り下げる。「いいえ」なら別の候補に切り替える。「スキップ」なら別の話題に移る。「その他」の自由記述は最重要の手がかりとして使う。
- 同じ質問を繰り返さない。すでに分かったことを聞き直さない。
- 質問は最大 ${INTERVIEW_MAX} 問。8問前後で十分な情報（人物・場所・出来事・感情のうち3つ以上）が集まったら done にする。
- 「finish」が指示されたら、その時点の情報だけで done にしてまとめる。情報が少なければ短くまとめ、分からない部分は書かない。
- dream_text は本人が話したかのような一人称の口語（例:「知らない街で誰かに追いかけられていた。怖くて必死に走ったけど足が重くて、逃げ切れないまま目が覚めた。」）。
- 相槌（comment）は短く自然に。診断や解釈はしない。

====== 参考知識（典型的な夢テーマ） ======
${knowledge.split("## 3.")[1]?.split("## 4.")[0] ?? ""}
====== ここまで ======`;

const SLEEP_PERSONA = `あなたは「ユメタン」。夢の内容・朝の自己申告・前日の日記・プロフィールから「睡眠の質」を推定し、レベル（1〜5）と今夜のアドバイスを出します。
以下の知識の配点表に従って score を計算し、level に変換してください。診断ではなく目安として、やわらかい口語で。

====== 知識 ======
${sleepKnowledge}
====== 知識ここまで ======`;

const TYPE_PERSONA = `あなたは「ユメタン」。アンケートの回答と夢の記録から、その人の夢の傾向を「16タイプ」のどれかに当てはめます。
以下の定義に従い、typeId は必ず16個のIDのいずれかにしてください。

====== 16タイプの定義 ======
${typesKnowledge}
====== ここまで ======

====== 夢と心の知識（テーマの参考） ======
${knowledge.split("## 3.")[1]?.split("## 4.")[0] ?? ""}
====== ここまで ======`;

const OCR_PERSONA = `あなたは手書きの夢ノート・日記を書き起こすアシスタントです。画像の文字を、書かれている言語のまま正確に書き起こしてください。要約や解釈はせず、書かれていない内容を補わないでください。`;

const systemBlocks = (persona, extra, lang = "ja") => {
  const blocks = [{ type: "text", text: persona, cache_control: { type: "ephemeral" } }];
  const li = langInstruction(lang);
  if (extra || li) blocks.push({ type: "text", text: [extra, li].filter(Boolean).join("\n") });
  return blocks;
};
const fmtDate = (iso) => new Date(iso).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Tokyo" });
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(n) || 0)));
const oneOf = (v, allowed, fallback) => (allowed.includes(String(v).trim().toLowerCase()) ? String(v).trim().toLowerCase() : fallback);
const str = (v, max) => String(v ?? "").slice(0, max);

async function callClaude({ client, system, messages, schema, effort }) {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4096,
    system,
    messages,
    output_config: { format: zodOutputFormat(schema), effort },
  });
  if (response.stop_reason === "refusal") throw httpError(422, "AIが応答を控えました。表現を変えてもう一度話してみてください。");
  if (!response.parsed_output) throw httpError(502, "AIの応答を読み取れませんでした。もう一度お試しください。");
  return response.parsed_output;
}
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

// クライアントから送られてくる記録を安全な形に整える
function sanitizeHistory(list) {
  return (Array.isArray(list) ? list : []).slice(0, INSIGHT_MAX_DREAMS).map((d) => ({
    createdAt: Number.isFinite(Date.parse(d?.createdAt)) ? d.createdAt : new Date().toISOString(),
    title: str(d?.analysis?.title, 60),
    summary: str(d?.analysis?.summary, 300),
    emotions: (Array.isArray(d?.analysis?.emotions) ? d.analysis.emotions : []).slice(0, 5).map((x) => str(x, 20)),
    symbols: (Array.isArray(d?.analysis?.symbols) ? d.analysis.symbols : []).slice(0, 6).map((x) => str(x, 20)),
    themes: (Array.isArray(d?.analysis?.themes) ? d.analysis.themes : []).slice(0, 5).map((x) => str(x, 20)),
    mood: clamp(d?.analysis?.mood, -2, 2),
    intensity: clamp(d?.analysis?.intensity, 1, 5),
    dream_type: oneOf(d?.analysis?.dream_type, DREAM_TYPES, "ordinary"),
    userText: (Array.isArray(d?.messages) ? d.messages : []).filter((m) => m?.role === "user").map((m) => str(m.text, 600)).join(" ").slice(0, 600),
  }));
}
// 前日の日記・プロフィール・現在の16タイプ（夢の読み取りの補助情報）
function extraContext(body) {
  const parts = [];
  const d = body?.diary;
  if (d && (d.text || d.mood)) parts.push(`【前日の日記（${str(d.date, 10)}）】気分: ${clamp(d.mood, 1, 5)}/5 / したこと: ${(Array.isArray(d.tags) ? d.tags : []).slice(0, 10).map((x) => str(x, 20)).join("、") || "なし"}\n${str(d.text, 800)}\n（この日記と夢につながりがあれば、返事か mental_state_hint で一言だけ触れてください。無理にはつなげない）`);
  const p = body?.profile;
  if (p && typeof p === "object") parts.push(`【プロフィール】呼び名: ${str(p.nickname, 20)} / ${str(p.ageGroup, 10)} / ${str(p.role, 20)} / 睡眠 ${str(p.sleepHours, 10)} / 起床 ${str(p.wakeTime, 10)} / 気がかり: ${(Array.isArray(p.stressTopics) ? p.stressTopics : []).map((x) => str(x, 20)).join("、") || "なし"}`);
  if (body?.dreamType) parts.push(`【このユーザーの現在の夢タイプ（16タイプ）】${str(body.dreamType, 20)}`);
  return parts.join("\n\n");
}
function historyContext(history) {
  const recent = history.slice(0, HISTORY_FOR_LISTENING);
  if (!recent.length) return "";
  return `【参考: このユーザーの最近の夢の記録（新しい順）】\n` + recent.map((d) =>
    `- ${fmtDate(d.createdAt)}「${d.title}」: ${d.summary} / 感情: ${d.emotions.join("、") || "不明"} / テーマ: ${d.themes.join("、") || "なし"}`).join("\n");
}

// ---------- 利用制限 ----------
const usage = { day: "", perUser: new Map(), global: 0 };
function checkQuota(userId) {
  const today = new Date().toISOString().slice(0, 10);
  if (usage.day !== today) { usage.day = today; usage.perUser.clear(); usage.global = 0; }
  if (usage.global >= LIMIT_GLOBAL_DAY) throw httpError(429, "今日はたくさんの人が使ってくれたので、上限に達しました。明日また話してください。");
  const n = usage.perUser.get(userId) || 0;
  if (n >= LIMIT_PER_USER_DAY) throw httpError(429, "今日の利用回数の上限に達しました。明日また話してください。");
  usage.perUser.set(userId, n + 1);
  usage.global += 1;
}

// ---------- HTTP ----------
const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "6mb" })); // 手書きノートの画像（data URL）も受ける
app.use((req, res, next) => {
  // ネイティブアプリ（capacitor://localhost 等）や別ドメインからの呼び出しを許可
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Yumetan-User, X-Yumetan-Code, X-Yumetan-Key, X-Yumetan-Lang");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
// 画面のファイルは常に最新を確認させる（更新後に古い画面が残るのを防ぐ）。画像だけ長くキャッシュ
app.use(express.static(path.join(here, "public"), { etag: true, setHeaders: (res, p) => {
  res.setHeader("Cache-Control", /\.(png|jpg|jpeg|webp|svg|ico)$/.test(p) ? "public, max-age=604800" : "no-cache");
} }));

const asyncRoute = (fn) => (req, res, next) => fn(req, res, next).catch(next);
function aiGate(req) {
  if (ACCESS_CODE && req.get("X-Yumetan-Code") !== ACCESS_CODE) throw httpError(403, "合言葉が違います。設定画面で確認してください。");
  const userId = str(req.get("X-Yumetan-User"), 64) || req.ip;
  if (!req.get("X-Yumetan-Key")) checkQuota(userId); // 自分のキーを使う人は回数制限の対象外
  return clientFor(req);
}

app.get("/api/health", (req, res) => res.json({ ok: true, model: MODEL, needsCode: Boolean(ACCESS_CODE), hasServerKey: Boolean(SERVER_KEY), acceptsUserKey: true, limits: { perUserDay: LIMIT_PER_USER_DAY }, langs: Object.keys(LANGS) }));
app.get("/api/knowledge/sleep", (req, res) => res.type("text/markdown").send(sleepKnowledge));
app.get("/api/knowledge/types", (req, res) => res.type("text/markdown").send(typesKnowledge));
app.get("/api/knowledge", (req, res) => res.type("text/markdown").send(knowledge));

// 夢を聞く（会話全体と最近の記録を受け取り、返事と分析を返す）
app.post("/api/listen", asyncRoute(async (req, res) => {
  const client = aiGate(req); const lang = langOf(req);
  const messages = (Array.isArray(req.body?.messages) ? req.body.messages : [])
    .filter((m) => (m?.role === "user" || m?.role === "assistant") && str(m.text, 1).trim())
    .slice(-20)
    .map((m) => ({ role: m.role, content: str(m.text, 4000) }));
  if (!messages.length || messages[0].role !== "user") throw httpError(400, "夢の内容が空です");
  const history = sanitizeHistory(req.body?.history);
  const analysis = await callClaude({ client, system: systemBlocks(PERSONA, [historyContext(history), extraContext(req.body)].filter(Boolean).join("\n\n"), lang), messages, schema: DreamAnalysis, effort: "medium" });
  analysis.mood = clamp(analysis.mood, -2, 2);
  analysis.intensity = clamp(analysis.intensity, 1, 5);
  analysis.dream_type = oneOf(analysis.dream_type, DREAM_TYPES, "ordinary");
  analysis.engine = "ai";
  res.json({ analysis });
}));

// 質問形式（アキネーター風）
app.post("/api/interview", asyncRoute(async (req, res) => {
  const client = aiGate(req); const lang = langOf(req);
  const answers = (Array.isArray(req.body?.answers) ? req.body.answers : []).slice(0, INTERVIEW_MAX);
  const finish = Boolean(req.body?.finish), more = Boolean(req.body?.more);
  const lines = answers.map((a, i) => `Q${i + 1}: ${str(a?.question, 200)}\nA${i + 1}: ${str(a?.answer, 400)}`);
  const count = answers.length;
  let ask = count === 0 ? "最初の質問を出してください。"
    : `ここまでの質問と回答です。\n\n${lines.join("\n\n")}\n\n現在 ${count} 問目まで終了（上限 ${INTERVIEW_MAX} 問）。次の質問を1つ出すか、十分なら done にしてまとめてください。`;
  if (finish || count >= INTERVIEW_MAX) ask += "\n\nfinish: ユーザーが「もう十分」を選びました。これ以上質問せず、今ある情報だけで done にして dream_text をまとめてください。";
  else if (more) ask += "\n\nmore: ユーザーは「もう少し質問してほしい」と言っています。done は false にして、まだ聞いていない切り口の質問を1つ出してください。";
  const step = await callClaude({ client, system: systemBlocks(INTERVIEW_PERSONA, "", lang), messages: [{ role: "user", content: ask }], schema: InterviewStep, effort: "low" });
  if (finish || count >= INTERVIEW_MAX) step.done = true;
  if (step.done && !step.dream_text.trim()) {
    step.dream_text = answers.filter((a) => a?.answer && !["いいえ", "スキップ"].includes(a.answer)).map((a) => `${a.question} → ${a.answer}`).join("。") || "（内容をうまく聞き取れませんでした）";
  }
  res.json({ step, count });
}));

// 最近の心の状態（端末に保存された記録を受け取って分析）
app.post("/api/insight", asyncRoute(async (req, res) => {
  const client = aiGate(req); const lang = langOf(req);
  const dreams = sanitizeHistory(req.body?.dreams);
  if (dreams.length < INSIGHT_MIN_DREAMS) throw httpError(400, `分析には夢の記録が${INSIGHT_MIN_DREAMS}件以上必要です`);
  const listing = dreams.map((d) => [
    `## ${fmtDate(d.createdAt)}「${d.title}」(${d.dream_type}, mood ${d.mood}, 強さ ${d.intensity})`,
    `要約: ${d.summary}`,
    `感情: ${d.emotions.join("、")} / 象徴: ${d.symbols.join("、")} / テーマ: ${d.themes.join("、")}`,
    `本人の言葉: ${d.userText}`,
  ].join("\n")).join("\n\n");
  const insight = await callClaude({
    client,
    system: systemBlocks(INSIGHT_PERSONA, extraContext({ profile: req.body?.profile, dreamType: req.body?.dreamType }), lang),
    messages: [{ role: "user", content: `今日は ${fmtDate(new Date().toISOString())} です。以下は最近の夢の記録（新しい順、${dreams.length}件）です。最近の心の状態を教えてください。\n\n${listing}` }],
    schema: Insight,
    effort: "high",
  });
  insight.stress_level = oneOf(insight.stress_level, ["low", "medium", "high"], "medium");
  insight.trend = oneOf(insight.trend, ["improving", "stable", "worsening", "unknown"], "unknown");
  res.json({ insight: { ...insight, generatedAt: new Date().toISOString(), basedOn: dreams.length, engine: "ai" } });
}));

// 手書きノートの写真 → 文字起こし（Claude の画像入力）
app.post("/api/ocr", asyncRoute(async (req, res) => {
  const client = aiGate(req); const lang = langOf(req);
  const image = String(req.body?.image || "");
  const m = image.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw httpError(400, "画像が正しくありません（JPEG / PNG / WebP の data URL）");
  if (m[2].length > 5.5 * 1024 * 1024) throw httpError(413, "画像が大きすぎます");
  const result = await callClaude({
    client,
    system: systemBlocks(OCR_PERSONA, "", lang),
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } },
      { type: "text", text: "この画像の手書き文字を書き起こしてください。" },
    ] }],
    schema: OcrResult, effort: "low",
  });
  res.json({ text: str(result.text, 4000), language: str(result.language, 10), isDreamNote: Boolean(result.is_dream_note) });
}));

// 睡眠の質（夢 + 朝のチェック + 前日の日記 + プロフィール → スコア / レベル / アドバイス）
app.post("/api/sleep", asyncRoute(async (req, res) => {
  const client = aiGate(req); const lang = langOf(req);
  const a = req.body?.analysis || {};
  const check = req.body?.check || {};
  const lines = [
    `【夢の分析】種類: ${oneOf(a.dream_type, DREAM_TYPES, "ordinary")} / 気分 ${clamp(a.mood, -2, 2)} / 強さ ${clamp(a.intensity, 1, 5)} / 感情: ${(Array.isArray(a.emotions) ? a.emotions : []).map((x) => str(x, 20)).join("、")} / テーマ: ${(Array.isArray(a.themes) ? a.themes : []).map((x) => str(x, 20)).join("、")} / 結末: ${str(a.outcome, 10) || "不明"}`,
    `【夢の本文】${str(req.body?.text, 1500)}`,
    `【朝のチェック】寝つき: ${str(check.onset, 10) || "未回答"} / 中途覚醒: ${str(check.wakeups, 10) || "未回答"} / 目覚め: ${str(check.feel, 10) || "未回答"} / 睡眠時間: ${req.body?.hours != null ? clamp(req.body.hours, 0, 16) + "時間" : "未回答"}`,
    extraContext({ diary: req.body?.diary, profile: req.body?.profile }),
  ].filter(Boolean).join("\n\n");
  const r = await callClaude({ client, system: systemBlocks(SLEEP_PERSONA, "", lang), messages: [{ role: "user", content: `昨夜の睡眠の質を評価してください。\n\n${lines}` }], schema: SleepAssessment, effort: "medium" });
  r.score = clamp(r.score, 0, 100);
  r.level = r.score >= 80 ? 5 : r.score >= 65 ? 4 : r.score >= 50 ? 3 : r.score >= 35 ? 2 : 1;
  res.json({ sleep: { ...r, factors: (r.factors || []).slice(0, 6).map((x) => str(x, 30)), advice: (r.advice || []).slice(0, 3).map((x) => str(x, 300)), at: new Date().toISOString(), engine: "ai" } });
}));

// 16タイプ診断（アンケート + 夢の記録 → タイプ）
const TYPE_IDS = ["chase", "loss", "bound", "collapse", "future", "intuition", "symbol", "dejavu", "lucid", "partial", "observer", "challenge", "place", "person", "story", "emotion"];
const GROUP_OF = Object.fromEntries(TYPE_IDS.map((id, i) => [id, ["nightmare", "premonition", "lucid", "recurring"][Math.floor(i / 4)]]));
app.post("/api/type", asyncRoute(async (req, res) => {
  const client = aiGate(req); const lang = langOf(req);
  const quiz = (Array.isArray(req.body?.quiz) ? req.body.quiz : []).slice(0, 16).map((q) => `${str(q?.type, 20)}: ${clamp(q?.value, 0, 2)}`).join(", ");
  const dreams = sanitizeHistory(req.body?.dreams);
  const listing = dreams.map((d) => `- ${fmtDate(d.createdAt)}「${d.title}」(${d.dream_type}) ${d.summary} / 感情: ${d.emotions.join("、")} / テーマ: ${d.themes.join("、")}`).join("\n");
  const content = `【アンケート（タイプID: 点数。2=よくある 1=たまに 0=ほとんどない）】${quiz || "なし"}\n\n【夢の記録（新しい順、${dreams.length}件）】\n${listing || "なし"}\n\n【現在のタイプ（ルールエンジン）】${str(req.body?.currentType, 20) || "なし"}\n\nこの人の16タイプを決めてください。`;
  const r = await callClaude({ client, system: systemBlocks(TYPE_PERSONA, "", lang), messages: [{ role: "user", content }], schema: TypeDiagnosis, effort: "medium" });
  r.typeId = oneOf(r.typeId, TYPE_IDS, "observer");
  r.groupId = GROUP_OF[r.typeId];
  r.runnerUp = r.runnerUp && TYPE_IDS.includes(String(r.runnerUp).toLowerCase()) ? String(r.runnerUp).toLowerCase() : null;
  res.json({ type: { ...r, engine: "ai" } });
}));

app.use((err, req, res, next) => {
  const noAuth = err instanceof Anthropic.AuthenticationError || /resolve authentication/i.test(err.message || "");
  const status = err.status || (noAuth ? 401 : err instanceof Anthropic.APIError ? 502 : 500);
  let message = err.message || "エラーが発生しました";
  if (noAuth) message = "Claude API キーが無効か未設定です（サーバーの ANTHROPIC_API_KEY、または設定画面の自分の API キーを確認してください）。";
  else if (err instanceof Anthropic.RateLimitError) message = "少し混み合っています。しばらくしてからもう一度話してください。";
  else if (err instanceof Anthropic.APIConnectionError) message = "Claude APIに接続できません。";
  else if (err.type === "entity.too.large") message = "送信データが大きすぎます。";
  if (status >= 500 || noAuth) console.error(`[${new Date().toISOString()}]`, err);
  res.status(status).json({ error: message });
});

app.listen(PORT, "0.0.0.0", () => console.log(`ユメタン API 起動: http://localhost:${PORT}  (model: ${MODEL}, serverKey: ${SERVER_KEY ? "on" : "off (利用者のキーのみ)"}, accessCode: ${ACCESS_CODE ? "on" : "off"})`));
