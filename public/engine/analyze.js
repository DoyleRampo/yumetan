// ユメタン ルールエンジン: 1つの夢を瞬時に分析する（API不要）
(function (root) {
  const L = root.YumetanLexicon;
  const DREAM_TYPES = ["ordinary", "nightmare", "recurring", "lucid", "pleasant", "fragment"];
  const CAT_EMOTION = { threat: "不安", control: "焦り", evaluation: "不安", loss: "悲しみ", social: "不安", freedom: "解放感", positive: "喜び", body: "嫌悪", transition: "驚き", place: "懐かしさ", surreal: "混乱" };
  const CLOSING_WORDS = ["以上", "終わり", "おわり", "もう大丈夫", "それだけ", "もういい", "おしまい", "終了"];

  const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
  const pick = (arr, seed, offset = 0) => arr[(hash(seed) + offset) % arr.length];
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(n)));
  const compact = (t) => String(t || "").replace(/[\s　]+/g, "");

  function countMatches(text, kws) {
    const hits = [];
    for (const k of kws) {
      if (k instanceof RegExp) { const m = text.match(k); if (m) hits.push(m[0]); }
      else if (text.includes(k)) hits.push(k);
    }
    return hits;
  }

  // emotionMood: 感情語から分かった気分（テーマと向きが合うものを優先する）
  function detectThemes(text, emotionMood = null) {
    const found = [];
    const len = Math.max(text.length, 1);
    for (const th of L.THEMES) {
      const hits = countMatches(text, th.kw);
      if (!hits.length) continue;
      const first = Math.min(...hits.map((h) => text.indexOf(h)));
      let score = hits.length * (L.CAT_WEIGHT[th.cat] ?? 1) + (1 - first / len) * 0.5;
      if (emotionMood != null && emotionMood !== 0 && Math.sign(th.mood) === Math.sign(emotionMood)) score += 0.6;
      if (emotionMood != null && emotionMood !== 0 && th.mood !== 0 && Math.sign(th.mood) !== Math.sign(emotionMood)) score -= 0.4;
      found.push({ theme: th, score, hits });
    }
    found.sort((a, b) => b.score - a.score || b.theme.intensity - a.theme.intensity);
    return found;
  }
  const THEME_MIN_SCORE = 1.0; // これ未満（場所だけ1語など）は「テーマ不明」として汎用回答を使う
  function detectEmotions(text) {
    const found = [];
    for (const e of L.EMOTIONS) { const hits = countMatches(text, e.kw); if (hits.length) found.push({ e, n: hits.length }); }
    found.sort((a, b) => b.n - a.n);
    return found.map((f) => f.e);
  }
  function detectOutcome(text) {
    for (const key of ["good", "bad", "wake"]) if (countMatches(text, L.OUTCOMES[key].kw).length) return key;
    return null;
  }
  const has = (text, kws) => countMatches(text, kws).length > 0;

  function summarize(text) {
    const t = String(text).trim().replace(/\s+/g, " ");
    if (t.length <= 70) return t;
    const cut = t.slice(0, 70);
    const idx = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("、"), cut.lastIndexOf(" "));
    return (idx > 25 ? cut.slice(0, idx) : cut) + "…";
  }

  // messages: [{role, text}], history: 過去の夢（analysis付き）, prev: この夢の直前の分析
  // 今の心の状態を短いラベルにする（結果カードの見出し）
  function stateLabel({ mood, intensity, emotions, topTheme, dream_type }) {
    const emo = emotions.slice(0, 2).join("・");
    let level;
    if (dream_type === "nightmare" || (mood <= -1 && intensity >= 4)) level = "心の負荷が高め";
    else if (mood <= -1) level = "少し疲れ気味";
    else if (mood === 0) level = "頭の中を整理中";
    else if (mood === 1) level = "落ち着いている";
    else level = "気持ちに余裕あり";
    return emo ? `${level}（${emo}）` : level;
  }

  function analyzeDream({ messages, history = [], prev = null, askQuestion = false }) {
    const userTexts = messages.filter((m) => m.role === "user").map((m) => String(m.text || "").trim());
    const latest = userTexts[userTexts.length - 1] || "";
    const full = userTexts.join("。");
    const text = compact(full);
    const turn = userTexts.length;
    const seed = full;

    // 夢を見ていない・覚えていない
    if (has(compact(latest), L.TYPE_KW.none) && text.length < 60 && !detectThemes(text).length) {
      return {
        reply: pick(L.NO_DREAM.replies, seed), title: "夢を覚えていない日", summary: summarize(full), emotions: [], symbols: [], themes: [], theme_ids: [],
        mood: 0, intensity: 1, dream_type: "fragment", outcome: null, mental_state_hint: L.NO_DREAM.hints[0], note: "", asked: [], engine: "local",
        state_label: "よく眠れた日", category: "mundane",
      };
    }

    const emotionsFound = detectEmotions(text);
    const emotionMood = emotionsFound.length ? Math.sign(emotionsFound.slice(0, 2).reduce((a, e) => a + e.mood, 0)) : null;
    const themes = detectThemes(text, emotionMood);
    const topThemes = themes.slice(0, 4);
    const strong = topThemes.filter((t) => t.score >= THEME_MIN_SCORE);
    const outcome = detectOutcome(text);
    const intensifiers = countMatches(text, L.INTENSIFIERS).length;

    // 感情
    let emotions = emotionsFound.map((e) => e.label);
    if (!emotions.length && topThemes.length) emotions = [CAT_EMOTION[topThemes[0].theme.cat] || "不安"];
    emotions = [...new Set(emotions)].slice(0, 4);

    // 気分値
    let moodSum = 0, moodW = 0;
    for (const t of topThemes) { moodSum += t.theme.mood * t.score; moodW += t.score; }
    for (const e of emotionsFound.slice(0, 3)) { moodSum += e.mood * 3; moodW += 3; }
    if (outcome) { moodSum += L.OUTCOMES[outcome].mood * 1.5; moodW += 1.5; }
    const mood = moodW ? clamp(moodSum / moodW, -2, 2) : 0;

    // 強さ
    let intensity = topThemes.length ? Math.max(...topThemes.map((t) => t.theme.intensity)) : 2;
    intensity += Math.min(2, intensifiers);
    if (emotionsFound.length >= 3) intensity += 1;
    intensity = clamp(intensity, 1, 5);

    // 種類
    const threat = topThemes.some((t) => t.theme.cat === "threat");
    const fear = emotionsFound.some((e) => e.label === "恐怖");
    let dream_type = "ordinary";
    if (has(text, L.TYPE_KW.lucid)) dream_type = "lucid";
    else if (has(text, L.TYPE_KW.recurring)) dream_type = "recurring";
    else if (has(text, L.TYPE_KW.nightmare) || (fear && mood <= -1) || (mood <= -2 && intensity >= 4)) dream_type = "nightmare";
    else if (text.length < 12 || (has(text, L.TYPE_KW.fragment) && text.length < 40)) dream_type = "fragment";
    else if (mood >= 1 && !threat) dream_type = "pleasant";

    // 繰り返し（過去の記録に同じテーマ）
    const recent = history.filter((d) => d && d.analysis).slice(0, 6);
    const recurLabel = topThemes.map((t) => t.theme.label).find((label) => recent.filter((d) => (d.analysis.themes || []).includes(label)).length >= 2);

    // 心の状態の仮説
    const top = strong[0]?.theme;
    let hint = top ? pick(top.hints, seed) : pick(L.FALLBACK_HINTS, seed);
    if (recurLabel && top && top.label === recurLabel) hint = `同じ「${recurLabel}」の夢が続いています。` + hint;
    const note = top?.body || "";

    // 返答
    const asked = [...(prev?.asked || [])];
    const ack = mood <= -1 ? pick(L.ACKS.neg, seed) : mood >= 1 ? pick(L.ACKS.pos, seed) : pick(L.ACKS.neu, seed);
    const wantsClose = has(compact(latest), CLOSING_WORDS);
    let reply;
    const recurNote = recurLabel ? pick(L.RECUR_NOTES, seed).replace("{theme}", recurLabel) + " " : "";
    if (!askQuestion) {
      reply = (!topThemes.length && text.length < 10) ? `${pick(L.SHORT_INPUT.replies, seed)} ${hint}` : `${ack} ${recurNote}${hint}`;
    } else if (wantsClose || turn >= 3) {
      reply = `${pick(L.CLOSINGS, seed)}${turn === 1 ? " " + hint : ""}`;
    } else if (!topThemes.length && text.length < 10) {
      reply = pick(L.SHORT_INPUT.replies, seed);
    } else {
      let q = null;
      for (const t of strong) { q = t.theme.questions.find((x) => !asked.includes(x)); if (q) break; }
      if (!q) q = L.FALLBACK_QUESTIONS.find((x) => !asked.includes(x)) || pick(L.FALLBACK_QUESTIONS, seed);
      asked.push(q);
      reply = turn === 1 ? `${ack} ${recurNote}${hint} ${q}` : `${ack} ${q}`;
    }

    // タイトル・象徴
    const symbols = [...new Set(topThemes.flatMap((t) => t.hits))].slice(0, 5);
    const title = top ? pick(top.titles, seed) : dream_type === "fragment" ? "断片の夢" : symbols[0] ? `${symbols[0]}の夢` : "不思議な夢";

    return {
      reply, title, summary: summarize(full), emotions, symbols,
      themes: topThemes.map((t) => t.theme.label), theme_ids: topThemes.map((t) => t.theme.id),
      mood, intensity, dream_type: DREAM_TYPES.includes(dream_type) ? dream_type : "ordinary", outcome,
      mental_state_hint: hint, note, asked, engine: "local",
      state_label: stateLabel({ mood, intensity, emotions, topTheme: top, dream_type }),
      category: top?.cat || (topThemes[0]?.theme.cat) || "surreal",
    };
  }

  // ---------- 心の状態を出したあとの質問に答える（ルールベース） ----------
  const QA = [
    { id: "why", kw: ["なぜ", "なんで", "何で", "どうして", "原因", "理由", "意味", "なに", "何を表", "何の夢"], },
    { id: "how", kw: ["どうすれ", "どうしたら", "どうすべ", "対処", "対策", "改善", "よくな", "良くな", "治", "アドバイス", "何をした", "コツ", "防"], },
    { id: "judge", kw: ["悪い夢", "いい夢", "良い夢", "大丈夫", "やばい", "ヤバい", "危険", "病気", "おかしい", "変？", "普通", "正常", "異常"], },
    { id: "stress", kw: ["ストレス", "疲れ", "しんどい", "限界", "メンタル", "精神状態", "心の状態", "今の状態"], },
    { id: "recur", kw: ["また見", "またこの", "また夢", "また同じ", "繰り返", "くり返", "何度も", "同じ夢", "続く", "毎日", "毎回", "見なくな", "見る？", "見るの", "見ちゃう"], },
    { id: "prophecy", kw: ["予知", "正夢", "予言", "現実にな", "本当にな", "占い", "運勢", "吉", "凶"], },
    { id: "feel", kw: ["気持ち", "感情", "どう感じ", "何を感じ"], },
    { id: "sleep", kw: ["眠", "睡眠", "寝", "夜中", "起き"], },
    { id: "save", kw: ["記憶", "保存", "残し", "記録"], },
    { id: "thanks", kw: ["ありがと", "助かった", "分かった", "わかった", "なるほど", "了解", "おっけ", "OK", "ok"], },
  ];
  const QA_TEXT = {
    why: (a, th) => `${th ? `「${th.label}」の夢は、` : "この夢は、"}${a.mental_state_hint} 夢は、起きている間に心を強く動かしたことを引き継ぎます。前日か数日内に、似た気持ちになった場面がなかったか思い出してみてください。${a.note ? " " + a.note : ""}`,
    how: (a, th) => `${(L.CATEGORY_INFO[a.category] || L.CATEGORY_INFO.mundane).suggestion} 夢そのものを変えようとするより、日中の気がかりを一つ軽くするほうが効きます。`,
    judge: (a) => a.dream_type === "nightmare" ? "怖い夢でしたが、それ自体は異常ではありません。健康な人でも夢の感情の8割はネガティブです。ただ、週1回以上の悪夢が2週間以上続いて眠るのが怖くなるようなら、睡眠外来や心療内科で相談すると楽になります。"
      : a.mood >= 1 ? "良い夢です。心が休めているサインで、ストレスが下がっている時期に増えます。" : "良い・悪いで言えば『ふつう』の範囲です。嫌な夢でも、心が感情を処理している証拠なので心配いりません。",
    stress: (a) => `今回の夢から読むと「${a.state_label}」です。${a.intensity >= 4 ? "感情の強さが高めなので、体も緊張しているかもしれません。肩と顎の力を抜いてみてください。" : "感情の強さはほどほどで、極端な負荷は見えません。"} 数日分たまると「最近の心の状態」でもっと正確に読めます。`,
    recur: (a, th) => `同じ夢が繰り返されるのは、未解決の気がかりが残っているサインです。${th ? `「${th.label}」の夢は特にそうで、` : ""}原因の出来事が片付くか、夢の中で対処できるようになると自然に減っていきます。記憶しておくと、繰り返しを追えます。`,
    prophecy: () => "夢は未来の予告ではなく、今の気持ちの映し方です。当たったように感じるのは、心配していたことが現実でも起きやすいからで、夢が原因ではありません。",
    feel: (a) => a.emotions.length ? `夢の中の気持ちは「${a.emotions.join("・")}」が中心でした。この気持ちが、今の生活のどこかで小さく続いている可能性があります。` : "はっきりした感情は読み取れませんでした。起きたときの気分が一番のヒントです。",
    sleep: (a) => `${a.dream_type === "nightmare" || a.intensity >= 4 ? "強い夢は眠りが浅いときに残りやすいです。" : "夢をしっかり覚えているのは、眠りの後半で目が覚めた証拠です。"} 寝る前1時間のスマホとカフェインを減らすと、夢が穏やかになりやすいです。${a.note ? " " + a.note : ""}`,
    save: () => "下の「この夢を記憶する」ボタンを押すと、この端末に保存されます。数日分たまると「最近の心の状態」が読めるようになります。",
    thanks: () => "こちらこそ。今日も無理せず過ごしてください。記憶しておくなら、下のボタンをどうぞ。",
    fallback: (a) => `${pick(L.FALLBACK_HINTS, a.summary + "q")} 夢の細かい筋書きより、起きたときの気分が今の心の天気です。`,
  };
  const QUESTION_MARKS = ["？", "?", "なぜ", "なんで", "どう", "何", "なに", "か。", "かな", "ですか", "ますか", "の？", "って"];
  function isQuestion(text) {
    const t = compact(text);
    return QUESTION_MARKS.some((m) => t.includes(m)) || t.length <= 12;
  }
  function answerQuestion(question, analysis) {
    const t = compact(question);
    const mentioned = L.THEMES.find((th) => countMatches(t, th.kw).length) || null;
    const top = L.THEMES.find((th) => th.id === analysis.theme_ids?.[0]) || null;
    let intent = QA.find((q) => countMatches(t, q.kw).length)?.id;
    const weakPlace = mentioned && ["place", "mundane"].includes(mentioned.cat) && countMatches(t, mentioned.kw).length < 2;
    if (!intent && mentioned && mentioned !== top && !weakPlace) return { reply: `「${mentioned.label}」の夢は、${pick(mentioned.hints, t)}${mentioned.body ? " " + mentioned.body : ""}`, intent: "theme" };
    if (!intent) intent = "fallback";
    return { reply: QA_TEXT[intent](analysis, mentioned || top), intent };
  }

  root.YumetanEngine = { analyzeDream, detectThemes, detectEmotions, hash, pick, answerQuestion, isQuestion, stateLabel };

})(typeof window !== "undefined" ? window : globalThis);
