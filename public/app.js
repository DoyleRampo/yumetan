// ユメタン フロントエンド（Web / PWA / Capacitor ネイティブ 共通）
(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const APP_VERSION = "2.0.0";

  // ---------- 実行環境（Capacitor ネイティブか Web か） ----------
  const Cap = window.Capacitor;
  const isNative = Boolean(Cap?.isNativePlatform?.());
  const P = Cap?.Plugins || {};
  const nativeSR = isNative && P.SpeechRecognition ? P.SpeechRecognition : null;
  const nativeTTS = isNative && P.TextToSpeech ? P.TextToSpeech : null;
  const nativePrefs = isNative && P.Preferences ? P.Preferences : null;

  // ---------- 端末内ストレージ ----------
  const store = {
    async get(key, fallback = null) {
      try {
        if (nativePrefs) { const { value } = await nativePrefs.get({ key }); return value == null ? fallback : JSON.parse(value); }
        const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v);
      } catch { return fallback; }
    },
    async set(key, value) {
      const s = JSON.stringify(value);
      try { if (nativePrefs) await nativePrefs.set({ key, value: s }); else localStorage.setItem(key, s); } catch { toast("保存できませんでした（容量不足の可能性）", true); }
    },
  };
  const K = { settings: "yumetan.settings", dreams: "yumetan.dreams", insight: "yumetan.insight", user: "yumetan.userId" };

  // ---------- 設定 ----------
  const settings = { speak: true, autosend: true, chara: "woman", code: "", apiBase: "" };
  async function loadSettings() { Object.assign(settings, await store.get(K.settings, {})); }
  const saveSettings = () => store.set(K.settings, settings);

  // ---------- API ----------
  let userId = "";
  const apiBase = () => (settings.apiBase || window.YUMETAN_CONFIG?.apiBase || "").replace(/\/$/, "");
  async function api(path, body) {
    let res;
    try {
      res = await fetch(apiBase() + path, {
        method: body ? "POST" : "GET",
        headers: { "Content-Type": "application/json", "X-Yumetan-User": userId, ...(settings.code ? { "X-Yumetan-Code": settings.code } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch { throw new Error("サーバーに接続できません。通信環境を確認してください。"); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `エラー (${res.status})`);
    return data;
  }

  // ---------- 夢の記録（端末内） ----------
  let dreams = [];
  const saveDreams = () => store.set(K.dreams, dreams);
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 3) | 8).toString(16); }));

  // ---------- キャラクター ----------
  const AIZUCHI = ["うん、うん。", "それで？", "なるほど…", "続けてください。", "ふむふむ。", "聞いています。", "そうでしたか。"];
  const charas = new Map();
  function mountCharas() {
    const tpl = $("#chara-tpl");
    for (const slot of $$(".chara-slot, .home-chara")) {
      const node = tpl.content.firstElementChild.cloneNode(true);
      slot.appendChild(node);
      const view = slot.closest(".view").id.replace("view-", "");
      charas.set(view, { svg: node.querySelector(".chara-svg"), text: node.querySelector(".speech-text"), timer: null });
    }
    applyChara();
  }
  function applyChara() {
    for (const c of charas.values()) c.svg.classList.toggle("man", settings.chara === "man");
    $$(".seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.chara === settings.chara));
  }
  function say(view, text, { mood = "", voice = false } = {}) {
    const c = charas.get(view); if (!c) return;
    clearTimeout(c.timer);
    c.text.textContent = ""; c.text.textContent = text;
    c.svg.setAttribute("class", `chara-svg ${settings.chara === "man" ? "man" : ""} ${mood} talking`);
    c.timer = setTimeout(() => c.svg.classList.remove("talking"), Math.min(4000, 600 + text.length * 60));
    if (voice) speak(text);
  }
  function mood(view, m) { const c = charas.get(view); if (!c) return; c.svg.classList.remove("listening", "thinking", "happy"); if (m) c.svg.classList.add(m); }

  // ---------- 読み上げ ----------
  async function speak(text) {
    if (!settings.speak) return;
    stopSpeaking();
    if (nativeTTS) { try { await nativeTTS.speak({ text, lang: "ja-JP", rate: 0.95, pitch: settings.chara === "man" ? 0.9 : 1.05, category: "ambient" }); } catch {} return; }
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP"; u.rate = 0.95; u.pitch = settings.chara === "man" ? 0.9 : 1.05;
    const vs = speechSynthesis.getVoices();
    const v = vs.find((v) => v.lang === "ja-JP" && /Kyoko|O-ren|Google|Hattori|Otoya/.test(v.name)) || vs.find((v) => v.lang?.startsWith("ja"));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  }
  function stopSpeaking() { try { if (nativeTTS) nativeTTS.stop(); else speechSynthesis?.cancel(); } catch {} }

  // ---------- 音声認識（ネイティブ / Web 共通インターフェース） ----------
  const WebSR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const speech = {
    supported: Boolean(nativeSR || WebSR),
    _rec: null, _listeners: [], _cb: null,
    async start(cb) {
      this._cb = cb;
      if (nativeSR) {
        const perm = await nativeSR.requestPermissions().catch(() => ({ speechRecognition: "denied" }));
        if (perm.speechRecognition !== "granted") throw new Error("not-allowed");
        if (!this._listeners.length) {
          this._listeners.push(await nativeSR.addListener("partialResults", (e) => this._cb?.onText(e.matches?.[0] || "", false)));
          this._listeners.push(await nativeSR.addListener("listeningState", (e) => { if (e.status === "stopped") this._cb?.onEnd(); }));
        }
        await nativeSR.start({ language: "ja-JP", partialResults: true, popup: false, maxResults: 1 });
        return;
      }
      if (!this._rec) {
        const r = new WebSR();
        r.lang = "ja-JP"; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
        r.onresult = (e) => {
          let interim = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const t = e.results[i][0].transcript;
            if (e.results[i].isFinal) this._cb?.onText(t, true); else interim += t;
          }
          if (interim) this._cb?.onText(interim, false);
        };
        r.onerror = (e) => { if (e.error !== "no-speech" && e.error !== "aborted") this._cb?.onError(e.error); };
        r.onend = () => this._cb?.onEnd();
        this._rec = r;
      }
      this._rec.start();
    },
    async stop() { try { if (nativeSR) await nativeSR.stop(); else this._rec?.stop(); } catch {} },
  };

  // ---------- 画面遷移 ----------
  let current = "home";
  const stack = [];
  function go(view, { push = true } = {}) {
    if (view === current) return;
    if (current === "record") stopListening({ silent: true });
    stopSpeaking();
    if (push) stack.push(current);
    current = view;
    $$(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${view}`));
    $("#back").hidden = view === "home";
    window.scrollTo({ top: 0 });
    if (push) history.pushState({ view }, "", `#${view}`);
    onEnter(view);
  }
  function back() { const prev = stack.pop() || "home"; go(prev, { push: false }); history.replaceState({ view: prev }, "", `#${prev}`); }
  $("#back").onclick = back;
  window.addEventListener("popstate", () => { const prev = stack.pop() || "home"; go(prev, { push: false }); });
  $$("[data-go]").forEach((b) => (b.onclick = () => go(b.dataset.go)));
  function onEnter(view) {
    if (view === "home") { say("home", greeting()); updateHomeCount(); }
    if (view === "mode") say("mode", "どの方法でも大丈夫です。話しやすいものを選んでください。");
    if (view === "history") renderHistory();
    if (view === "insight") renderInsight();
    if (view === "knowledge") renderKnowledge();
    if (view === "settings") renderSettings();
  }
  function greeting() {
    const h = new Date().getHours();
    return h < 11 ? "おはようございます。今日はどんな夢でしたか？" : h < 18 ? "こんにちは。覚えている夢、聞かせてください。" : "こんばんは。今日は夢の話をしましょう。";
  }
  function updateHomeCount() { $("#home-count").textContent = dreams.length ? `${dreams.length}件` : ""; }

  // ---------- 記憶方法の選択 ----------
  let mode = "voice";
  $$(".mode-btn").forEach((b) => (b.onclick = () => {
    if (b.dataset.mode === "interview") { startInterview(); go("interview"); return; }
    mode = b.dataset.mode;
    if (mode === "voice" && !speech.supported) { toast("この環境では音声入力が使えません。文字入力に切り替えます。", true); mode = "text"; }
    resetConversation();
    go("record");
  }));

  // ---------- 記録画面（全文入力・音声） ----------
  const chatEl = $("#chat"), micBtn = $("#mic"), statusEl = $("#status"), micArea = $("#mic-area");
  const wrap = $("#transcript-wrap"), ta = $("#transcript");
  const sendBtn = $("#send"), clearBtn = $("#clear"), newBtn = $("#new-dream");
  let currentDream = null, listening = false, wantListening = false, finalText = "", liveText = "", busy = false;

  function applyMode() {
    const voice = mode === "voice";
    micArea.hidden = !voice;
    wrap.hidden = voice && !ta.value.trim();
    if (!voice) setTimeout(() => ta.focus(), 50);
  }
  function resetConversation() {
    currentDream = null; finalText = ""; liveText = ""; ta.value = ""; chatEl.innerHTML = ""; newBtn.hidden = true;
    applyMode();
    setStatus(mode === "voice" ? "マイクを押して、夢を話してください" : "");
    say("record", mode === "voice" ? "マイクを押して、そのまま話してください。整理しなくて大丈夫です。" : "覚えている範囲で書いてください。断片でも、順番がばらばらでも構いません。");
  }

  let aizuchiTimer;
  function aizuchi() { clearTimeout(aizuchiTimer); aizuchiTimer = setTimeout(() => { if (listening) say("record", AIZUCHI[Math.floor(Math.random() * AIZUCHI.length)], { mood: "listening" }); }, 900); }
  async function startListening() {
    stopSpeaking();
    wantListening = true; listening = true; liveText = "";
    micBtn.classList.add("listening");
    setStatus("聞いています… 話し終わったらマイクをもう一度押す");
    say("record", "はい、聞いています。", { mood: "listening" });
    try {
      await speech.start({
        onText: (t, isFinal) => {
          if (isFinal) { finalText += t; liveText = ""; aizuchi(); } else { liveText = t; if (t.length % 12 === 0) aizuchi(); }
          ta.value = finalText + liveText; wrap.hidden = false;
        },
        onEnd: async () => {
          // ネイティブは一区切りごとに止まるので、続けたい間は再開する
          if (nativeSR && liveText) { finalText += liveText; liveText = ""; ta.value = finalText; }
          if (wantListening) { try { await speech.start(speech._cb); return; } catch {} }
          listening = false; micBtn.classList.remove("listening");
          if (finalText.trim() && settings.autosend && !busy) send();
        },
        onError: (code) => {
          stopListening({ silent: true });
          const msg = { "not-allowed": "マイクの使用が許可されていません。設定でマイクと音声認識を許可してください。", "audio-capture": "マイクが見つかりません。", "network": "音声認識サービスに接続できません。" }[code] || `音声認識エラー: ${code}`;
          toast(msg, true);
        },
      });
    } catch (e) {
      stopListening({ silent: true });
      toast(e.message === "not-allowed" ? "マイクと音声認識の許可が必要です。端末の設定から許可してください。" : "音声認識を開始できませんでした。文字入力をお試しください。", true);
    }
  }
  async function stopListening({ silent = false } = {}) {
    wantListening = false;
    await speech.stop();
    if (nativeSR && liveText) { finalText += liveText; liveText = ""; ta.value = finalText; }
    listening = false; clearTimeout(aizuchiTimer);
    micBtn.classList.remove("listening"); mood("record", "");
    if (silent) return;
    setStatus(finalText.trim() ? (settings.autosend ? "送っています…" : "内容を確認して「聞いてもらう」を押してください") : "マイクを押して、夢を話してください");
    if (nativeSR && finalText.trim() && settings.autosend && !busy) send(); // ネイティブは onEnd が来ないことがあるためここでも送る
  }
  micBtn.onclick = () => (wantListening ? stopListening() : startListening());

  async function send() {
    const text = ta.value.trim();
    if (!text || busy) return;
    busy = true; sendBtn.disabled = true; micBtn.disabled = true;
    addBubble("user", text);
    ta.value = ""; finalText = ""; liveText = ""; if (mode === "voice") wrap.hidden = true;
    say("record", "なるほど…少し整理しますね。", { mood: "thinking" });
    setStatus("ユメタンが考えています…");
    const now = new Date().toISOString();
    const dream = currentDream || { id: uuid(), createdAt: now, updatedAt: now, messages: [], analysis: null };
    dream.messages.push({ role: "user", text, at: now });
    try {
      const { analysis } = await api("/api/listen", { messages: dream.messages, history: dreams.filter((d) => d.id !== dream.id && d.analysis).slice(0, 6) });
      dream.messages.push({ role: "assistant", text: analysis.reply, at: new Date().toISOString() });
      dream.analysis = analysis; dream.updatedAt = new Date().toISOString();
      if (!currentDream) { dreams.unshift(dream); currentDream = dream; }
      await saveDreams();
      const b = addBubble("ai", analysis.reply); b.appendChild(tagRow(analysis));
      say("record", analysis.reply, { mood: "happy", voice: true });
      newBtn.hidden = false;
      setStatus(mode === "voice" ? "続きを話すならマイクを。終わりなら「新しい夢を話す」" : "続きを書くこともできます");
    } catch (e) {
      dream.messages.pop();
      chatEl.lastElementChild?.remove();
      ta.value = text; finalText = text; wrap.hidden = false;
      say("record", "うまく聞き取れませんでした。もう一度お願いします。");
      toast(e.message, true);
      setStatus("送れませんでした。もう一度お試しください");
    } finally { busy = false; sendBtn.disabled = false; micBtn.disabled = false; }
  }
  sendBtn.onclick = send;
  clearBtn.onclick = () => { ta.value = ""; finalText = ""; liveText = ""; if (mode === "voice") wrap.hidden = true; };
  newBtn.onclick = resetConversation;
  ta.addEventListener("input", () => { if (!listening) finalText = ta.value; });
  ta.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send(); });

  // ---------- 質問形式（アキネーター風） ----------
  const FIRST_QUESTION = "夢に、知っている人が出てきましたか？";
  const iv = { answers: [], question: "", busy: false };
  const ivAnswers = $("#iv-answers"), ivOther = $("#iv-other"), ivOtherText = $("#iv-other-text"), ivConfirm = $("#iv-confirm"), ivDreamText = $("#iv-dream-text"), ivLog = $("#iv-log"), ivProgress = $("#iv-progress");
  function startInterview() {
    iv.answers = []; iv.question = FIRST_QUESTION; iv.busy = false;
    ivLog.innerHTML = ""; ivOther.hidden = true; ivConfirm.hidden = true; ivAnswers.hidden = false; $("#iv-finish").hidden = false;
    showQuestion("", FIRST_QUESTION);
  }
  function showQuestion(comment, q) {
    iv.question = q;
    ivProgress.textContent = `${iv.answers.length + 1}問目`;
    say("interview", (comment ? comment + "\n" : "") + q, { voice: true });
    ivAnswers.setAttribute("aria-busy", "false");
  }
  async function answer(text) {
    if (iv.busy) return;
    iv.answers.push({ question: iv.question, answer: text });
    logQA(iv.question, text);
    await stepInterview({});
  }
  async function stepInterview({ finish = false, more = false }) {
    iv.busy = true; ivAnswers.setAttribute("aria-busy", "true"); ivOther.hidden = true;
    say("interview", finish ? "分かりました。まとめますね…" : "…", { mood: "thinking" });
    try {
      const { step } = await api("/api/interview", { answers: iv.answers, finish, more });
      if (step.done) {
        ivDreamText.value = step.dream_text;
        ivConfirm.hidden = false; ivAnswers.hidden = true; $("#iv-finish").hidden = true;
        ivProgress.textContent = `${iv.answers.length}問で整理しました`;
        say("interview", (step.comment ? step.comment + "\n" : "") + "まとめるとこんな夢でしたか？", { mood: "happy", voice: true });
      } else showQuestion(step.comment, step.question);
    } catch (e) {
      toast(e.message, true);
      if (!finish && !more) { iv.answers.pop(); ivLog.firstElementChild?.remove(); }
      say("interview", "うまくつながりませんでした。もう一度答えてください。\n" + iv.question);
      ivAnswers.setAttribute("aria-busy", "false");
    } finally { iv.busy = false; }
  }
  function logQA(q, a) { const d = document.createElement("div"); d.className = "qa"; d.innerHTML = `<b>${esc(a)}</b><span>${esc(q)}</span>`; ivLog.prepend(d); }
  $$(".answer").forEach((b) => (b.onclick = () => {
    if (b.dataset.answer === "__other") { ivOther.hidden = false; ivOtherText.value = ""; ivOtherText.focus(); return; }
    answer(b.dataset.answer);
  }));
  $("#iv-other-send").onclick = () => { const t = ivOtherText.value.trim(); if (t) answer(t); };
  $("#iv-other-cancel").onclick = () => (ivOther.hidden = true);
  $("#iv-finish").onclick = () => { if (!iv.answers.length) { toast("まだ何も答えていません"); return; } stepInterview({ finish: true }); };
  $("#iv-more").onclick = () => { ivConfirm.hidden = true; ivAnswers.hidden = false; $("#iv-finish").hidden = false; stepInterview({ more: true }); };
  $("#iv-restart").onclick = startInterview;
  $("#iv-save").onclick = async () => {
    const text = ivDreamText.value.trim(); if (!text) return;
    $("#iv-save").disabled = true;
    say("interview", "記録しますね…", { mood: "thinking" });
    try {
      mode = "text"; resetConversation(); ta.value = text;
      stack.length = 0; go("record");
      await send();
    } catch (e) { toast(e.message, true); }
    finally { $("#iv-save").disabled = false; }
  };

  // ---------- 表示ヘルパー ----------
  function setStatus(t) { statusEl.textContent = t; }
  function addBubble(role, text) {
    const d = document.createElement("div"); d.className = `bubble ${role}`; d.textContent = text;
    chatEl.appendChild(d); d.scrollIntoView({ behavior: "smooth", block: "end" }); return d;
  }
  const TYPE_JA = { ordinary: "ふつうの夢", nightmare: "悪夢", recurring: "くり返す夢", lucid: "明晰夢", pleasant: "いい夢", fragment: "断片" };
  const MOOD = { "-2": "😰", "-1": "😟", "0": "😐", "1": "🙂", "2": "😊" };
  function tagRow(a) {
    const row = document.createElement("div"); row.className = "tags";
    row.appendChild(tag(TYPE_JA[a.dream_type] || a.dream_type, `type-${a.dream_type}`));
    (a.emotions || []).slice(0, 4).forEach((e) => row.appendChild(tag(e, "emo")));
    (a.themes || []).slice(0, 3).forEach((t) => row.appendChild(tag(t)));
    return row;
  }
  function tag(text, cls = "") { const s = document.createElement("span"); s.className = `tag ${cls}`; s.textContent = text; return s; }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDate = (iso) => new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
  let toastTimer;
  function toast(msg, isError = false) {
    const t = $("#toast"); t.textContent = msg; t.className = `toast ${isError ? "error" : ""}`; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 4500);
  }

  // ---------- 夢の記録 ----------
  function renderHistory() {
    const el = $("#history");
    if (!dreams.length) { el.innerHTML = `<p class="empty">まだ記録がありません。ホームの「夢を記憶する」から話してみてください。</p>`; return; }
    el.innerHTML = "";
    for (const d of dreams) {
      const a = d.analysis || {};
      const det = document.createElement("details"); det.className = "card";
      det.innerHTML = `
        <summary>
          <div><div class="date">${esc(fmtDate(d.createdAt))}</div><div class="title">${esc(a.title || "（無題）")}</div></div>
          <div class="mood">${MOOD[String(a.mood)] || ""}</div>
        </summary>
        <div class="body">
          <p>${esc(a.summary || "")}</p>
          <div class="tags"></div>
          <p class="muted">${esc(a.mental_state_hint || "")}</p>
          <div class="convo"></div>
          <div class="actions">
            <button class="btn ghost continue">この夢の続きを話す</button>
            <button class="btn ghost danger delete">削除</button>
          </div>
        </div>`;
      if (d.analysis) det.querySelector(".tags").replaceWith(tagRow(a));
      const convo = det.querySelector(".convo");
      for (const m of d.messages) { const b = document.createElement("div"); b.className = `bubble ${m.role === "user" ? "user" : "ai"}`; b.textContent = m.text; convo.appendChild(b); }
      det.querySelector(".continue").onclick = () => { mode = "text"; openDream(d); go("record"); };
      det.querySelector(".delete").onclick = async () => {
        if (!confirm(`「${a.title || "この夢"}」の記録を削除しますか？`)) return;
        dreams = dreams.filter((x) => x.id !== d.id); await saveDreams(); det.remove();
        if (currentDream?.id === d.id) currentDream = null;
        if (!dreams.length) renderHistory();
        toast("削除しました");
      };
      el.appendChild(det);
    }
  }
  function openDream(d) {
    currentDream = d; finalText = ""; liveText = ""; ta.value = ""; chatEl.innerHTML = "";
    for (const m of d.messages) addBubble(m.role === "user" ? "user" : "ai", m.text);
    if (d.analysis) chatEl.lastElementChild.appendChild(tagRow(d.analysis));
    newBtn.hidden = false; applyMode();
    setStatus("この夢の続きを話せます");
    say("record", "この夢の続き、聞かせてください。");
  }

  // ---------- 心の状態 ----------
  const LEVEL_JA = { low: "ストレス: 低め", medium: "ストレス: 中くらい", high: "ストレス: 高め" };
  const TREND_JA = { improving: "上向き ↗", stable: "横ばい →", worsening: "下向き ↘", unknown: "まだ判断できない" };
  function insightTargets() {
    const since = Date.now() - 14 * 86400e3;
    let t = dreams.filter((d) => d.analysis && Date.parse(d.createdAt) >= since);
    if (t.length < 2) t = dreams.filter((d) => d.analysis).slice(0, 10);
    return t.slice(0, 12);
  }
  const fingerprint = (list) => list.map((d) => `${d.id}:${d.updatedAt}`).join("|");
  async function renderInsight(refresh = false) {
    const el = $("#insight");
    const targets = insightTargets();
    if (targets.length < 2) { el.innerHTML = `<p class="empty">分析にはあと ${2 - targets.length} 件の夢が必要です。<br><span class="muted">毎朝ひとつ話すと、数日で傾向が見えてきます。</span></p>`; return; }
    const cached = await store.get(K.insight);
    let insight = cached?.insight, fromCache = true;
    if (refresh || !cached || cached.fingerprint !== fingerprint(targets)) {
      el.innerHTML = `<p class="muted">夢の記録を読み返しています…（少し時間がかかります）</p>`;
      $("#insight-refresh").disabled = true;
      try {
        ({ insight } = await api("/api/insight", { dreams: targets }));
        await store.set(K.insight, { insight, fingerprint: fingerprint(targets) });
        fromCache = false;
      } catch (e) { if (!insight) { el.innerHTML = `<p class="empty">${esc(e.message)}</p>`; $("#insight-refresh").disabled = false; return; } toast(e.message, true); }
      finally { $("#insight-refresh").disabled = false; }
    }
    const i = insight;
    el.innerHTML = `
      <div class="card">
        <p class="headline">${esc(i.headline)}</p>
        <p>${esc(i.state)}</p>
        <div class="meta">
          <span class="tag level-${esc(i.stress_level)}">${LEVEL_JA[i.stress_level] || ""}</span>
          <span class="tag">傾向: ${TREND_JA[i.trend] || ""}</span>
        </div>
        <div class="meta">${(i.dominant_emotions || []).map((e) => `<span class="tag emo">${esc(e)}</span>`).join("")}${(i.recurring_themes || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
        <p class="positive">🌱 ${esc(i.positive_note)}</p>
        <p>💡 ${esc(i.suggestion)}</p>
      </div>
      ${i.caution ? `<div class="card caution">🤍 ${esc(i.caution)}</div>` : ""}
      <p class="muted">${esc(i.basedOn)}件の夢をもとに ${esc(fmtDate(i.generatedAt))} に分析${fromCache ? "（前回の結果）" : ""}。診断ではなく、夢から見える傾向の目安です。</p>`;
  }
  $("#insight-refresh").onclick = () => renderInsight(true);

  // ---------- じてん ----------
  let knowledgeLoaded = false;
  async function renderKnowledge() {
    if (knowledgeLoaded) return;
    const el = $("#knowledge");
    try { const res = await fetch(apiBase() + "/api/knowledge"); el.innerHTML = md(await res.text()); knowledgeLoaded = true; }
    catch { el.innerHTML = `<p class="empty">読み込めませんでした（通信環境を確認してください）</p>`; }
  }
  function md(src) {
    const inline = (s) => esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/(^|[^"'>])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
    const lines = src.split("\n"); const out = []; let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (/^\s*$/.test(l)) { i++; continue; }
      if (/^---+$/.test(l.trim())) { out.push("<hr>"); i++; continue; }
      const h = l.match(/^(#{1,4})\s+(.*)/); if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
      if (l.startsWith("|")) {
        const rows = []; while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++]);
        const cells = (r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        const [head, ...rest] = rows.filter((r) => !/^[\s|:-]+$/.test(r));
        out.push(`<table><thead><tr>${cells(head).map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rest.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
        continue;
      }
      if (/^\s*[-*]\s+/.test(l)) { const items = []; while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, "")); out.push(`<ul>${items.map((x) => `<li>${inline(x)}</li>`).join("")}</ul>`); continue; }
      if (/^\s*\d+\.\s+/.test(l)) { const items = []; while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\.\s+/, "")); out.push(`<ol>${items.map((x) => `<li>${inline(x)}</li>`).join("")}</ol>`); continue; }
      const para = []; while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#|\||---|\s*[-*]\s|\s*\d+\.\s)/.test(lines[i])) para.push(lines[i++]);
      out.push(`<p>${inline(para.join("\n"))}</p>`);
    }
    return out.join("\n");
  }

  // ---------- 設定 ----------
  function renderSettings() {
    $("#opt-speak").checked = settings.speak;
    $("#opt-autosend").checked = settings.autosend;
    $("#opt-code").value = settings.code || "";
    $("#opt-api").value = settings.apiBase || "";
    $("#sr-support").textContent = speech.supported ? `音声入力: 使えます（${nativeSR ? "ネイティブ" : "ブラウザ"}）` : "音声入力: このブラウザでは使えません（Chrome / Safari / Edge、またはアプリ版を使ってください）";
    $("#app-info").textContent = `ユメタン v${APP_VERSION} / ${isNative ? "アプリ版" : "Web版"} / 接続先: ${apiBase() || "同じサーバー"}`;
    applyChara();
  }
  $("#opt-speak").onchange = (e) => { settings.speak = e.target.checked; saveSettings(); if (!settings.speak) stopSpeaking(); };
  $("#opt-autosend").onchange = (e) => { settings.autosend = e.target.checked; saveSettings(); };
  $("#opt-code").onchange = (e) => { settings.code = e.target.value.trim(); saveSettings(); toast("合言葉を保存しました"); };
  $("#opt-api").onchange = (e) => { settings.apiBase = e.target.value.trim(); saveSettings(); knowledgeLoaded = false; checkHealth(); };
  $$(".seg-btn").forEach((b) => (b.onclick = () => { settings.chara = b.dataset.chara; saveSettings(); applyChara(); speak(settings.chara === "man" ? "はい、担当を替わりました。" : "はい、私が担当します。"); }));

  // データの書き出し / 読み込み
  const ioWrap = $("#io-wrap"), ioText = $("#io-text");
  $("#export").onclick = () => {
    ioText.value = JSON.stringify({ app: "yumetan", version: APP_VERSION, exportedAt: new Date().toISOString(), dreams }, null, 0);
    ioWrap.hidden = false; ioText.select();
    toast("下の欄の内容をコピーして、メモなどに保存してください");
  };
  $("#import-toggle").onclick = () => { ioText.value = ""; ioWrap.hidden = false; ioText.focus(); };
  $("#io-copy").onclick = async () => { try { await navigator.clipboard.writeText(ioText.value); toast("コピーしました"); } catch { ioText.select(); toast("長押しでコピーしてください"); } };
  $("#io-import").onclick = async () => {
    try {
      const data = JSON.parse(ioText.value);
      const list = Array.isArray(data) ? data : data.dreams;
      if (!Array.isArray(list)) throw new Error();
      const known = new Set(dreams.map((d) => d.id));
      const added = list.filter((d) => d && d.id && d.createdAt && Array.isArray(d.messages) && !known.has(d.id));
      dreams = [...dreams, ...added].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      await saveDreams(); ioWrap.hidden = true; updateHomeCount();
      toast(`${added.length}件を読み込みました`);
    } catch { toast("読み込めませんでした。書き出したデータをそのまま貼り付けてください。", true); }
  };
  $("#wipe").onclick = async () => {
    if (!confirm("この端末の夢の記録をすべて削除します。元に戻せません。よろしいですか？")) return;
    dreams = []; currentDream = null; await saveDreams(); await store.set(K.insight, null); updateHomeCount(); toast("すべて削除しました");
  };

  async function checkHealth() {
    try { const h = await api("/api/health"); $("#code-setting").hidden = !h.needsCode; if (h.needsCode && !settings.code) toast("このサーバーは合言葉が必要です。設定画面で入力してください。"); }
    catch { toast("サーバーに接続できません。通信環境か設定のサーバーURLを確認してください。", true); }
  }

  // ---------- 起動 ----------
  (async () => {
    await loadSettings();
    userId = await store.get(K.user);
    if (!userId) { userId = uuid(); await store.set(K.user, userId); }
    dreams = (await store.get(K.dreams, [])) || [];
    mountCharas();
    history.replaceState({ view: "home" }, "", "#home");
    say("home", greeting()); updateHomeCount();
    checkHealth();
  })();
})();
