// ユメタン フロントエンド（Web / PWA / Capacitor ネイティブ 共通）
(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const APP_VERSION = "3.5.0";

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
  const K = { settings: "yumetan.settings", dreams: "yumetan.dreams", insight: "yumetan.insight", user: "yumetan.userId", migrated: "yumetan.migrated" };

  // ---------- 設定 ----------
  const settings = { speak: false, autosend: true, chara: "woman", code: "", apiBase: "", engine: "local", speakReset: false, profile: null, introDone: false };
  const useAI = () => settings.engine === "ai";
  async function loadSettings() {
    Object.assign(settings, await store.get(K.settings, {}));
    if (!settings.speakReset) { settings.speak = false; settings.speakReset = true; await saveSettings(); } // 読み上げは既定オフに変更（1回だけ）
  }
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
  let cloud = null; // Firebase が使えるときだけ入る
  const cloudOn = () => Boolean(cloud?.state.enabled);
  // 全体保存（端末内）。クラウド時は個別保存を使う
  const saveDreams = () => (cloudOn() ? Promise.resolve() : store.set(K.dreams, dreams));
  const persistDream = async (d) => { if (cloudOn()) { try { await cloud.saveDream(d); } catch (e) { toast("同期に失敗しました（あとで再送します）", true); } } else await saveDreams(); };
  const removeDream = async (id) => { if (cloudOn()) { try { await cloud.deleteDream(id); } catch {} } else await saveDreams(); };
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
    for (const slot of $$("[data-character-preview]")) {
      const portrait = tpl.content.querySelector(".chara-svg").cloneNode(true);
      portrait.classList.toggle("man", slot.dataset.characterPreview === "man");
      slot.replaceChildren(portrait);
    }
    applyChara();
  }
  function applyChara() {
    $$(".chara-slot .chara-svg, .home-chara .chara-svg").forEach((svg) => svg.classList.toggle("man", settings.chara === "man"));
    $$(".seg-btn").forEach((b) => {
      const selected = b.dataset.chara === settings.chara;
      b.classList.toggle("active", selected);
      b.setAttribute("aria-pressed", String(selected));
    });
  }
  function say(view, text, { mood = "", voice = false } = {}) {
    const c = charas.get(view); if (!c) return;
    clearTimeout(c.timer);
    c.text.textContent = ""; c.text.textContent = text;
    c.svg.setAttribute("class", `chara-svg ${settings.chara === "man" ? "man" : ""} ${mood} talking`);
    c.timer = setTimeout(() => c.svg.classList.remove("talking"), Math.min(4000, 600 + text.length * 60));
    return voice ? speak(text) : Promise.resolve();
  }
  function mood(view, m) { const c = charas.get(view); if (!c) return; c.svg.classList.remove("listening", "thinking", "happy"); if (m) c.svg.classList.add(m); }

  // ---------- 読み上げ ----------
  // 読み上げ（話し終わるまで待てる）
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
    await new Promise((resolve) => { u.onend = resolve; u.onerror = resolve; speechSynthesis.speak(u); setTimeout(resolve, 25000); });
  }
  // 話しかけモードのときだけ声で返す（文字モードは文字だけ）
  const voiceOut = () => mode === "voice" && settings.speak;
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
    if (current === "home" && view !== "home" && currentDream?.analysis && !isSaved(currentDream) && !confirm("この夢はまだ記憶していません。記憶せずに移動しますか？")) {
      if (!push) history.pushState({ view: current }, "", `#${current}`);
      return;
    }
    if (current === "home") stopListening({ silent: true });
    stopSpeaking();
    if (push) stack.push(current);
    current = view;
    document.body.dataset.view = view;
    $$(".journal-nav [data-go]").forEach((button) => {
      if (button.dataset.go === view) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    $$(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${view}`));
    $("#back").hidden = view === "home" || view === "intro" || (view === "onboard" && !settings.profile);
    window.scrollTo({ top: 0 });
    if (push) history.pushState({ view }, "", `#${view}`);
    onEnter(view);
    const heading = $(`#view-${view} h2`);
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  }
  function back() { const prev = stack.pop() || "home"; go(prev, { push: false }); history.replaceState({ view: prev }, "", `#${prev}`); }
  $("#back").onclick = back;
  window.addEventListener("popstate", () => { const prev = stack.pop() || "home"; go(prev, { push: false }); });
  $$("[data-go]").forEach((b) => (b.onclick = () => go(b.dataset.go)));
  function onEnter(view) {
    if (view === "home") { renderToday(); updateHomeCount(); if (!currentDream?.analysis) say("home", greeting()); }
    if (view === "history") renderHistory();
    if (view === "insight") renderInsight();
    if (view === "settings") renderSettings();
    if (view === "onboard") renderOnboard();
    if (view === "intro") showSlide(0);
  }
  function greeting() {
    const h = new Date().getHours();
    const name = settings.profile?.nickname ? `${settings.profile.nickname}さん、` : "";
    return h < 11 ? `${name}おはようございます。断片でも大丈夫、そのまま書いて（話して）ください。` : h < 18 ? `${name}こんにちは。覚えている夢、聞かせてください。` : `${name}こんばんは。今日は夢の話をしましょう。`;
  }
  function renderToday() {
    const d = new Date();
    $("#today").textContent = d.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
  }
  function updateHomeCount() { $("#home-count").textContent = `${dreams.length}件`; }

  // ---------- 記憶方法の選択 ----------
  let mode = "text"; // 「話す」を使ったら voice（返答の出し方は共通で文字）
  $$("[data-mode=interview]").forEach((b) => (b.onclick = () => { startInterview(); go("interview"); }));

  // ---------- 記録画面（全文入力・音声） ----------
  const chatEl = $("#chat"), micBtn = $("#mic"), statusEl = $("#status");
  const wrap = $("#transcript-wrap"), ta = $("#transcript");
  const sendBtn = $("#send"), clearBtn = $("#clear"), newBtn = $("#new-dream");
  let currentDream = null, listening = false, wantListening = false, finalText = "", liveText = "", busy = false;
  const afterEl = $("#after"), saveBtn = $("#save-dream"), askInput = $("#ask-input"), askMic = $("#ask-mic"), askSend = $("#ask-send");
  let listenTarget = ta; // 音声の書き込み先（夢の本文 or 質問欄）
  let afterReady = false; // 読み取り結果を伝え終わったら true（記憶ボタンと質問欄を出す）
  const isSaved = (d) => Boolean(d && dreams.some((x) => x.id === d.id));

  function placeChara(analyzed) {
    const box = $("#view-home .home-chara"); if (!box) return;
    if (analyzed) afterEl.before(box);
    else $(".dream-column").append(box);
  }
  function applyMode() {
    const analyzed = Boolean(currentDream?.analysis);
    placeChara(analyzed);
    wrap.hidden = analyzed;
    afterEl.hidden = !analyzed || !afterReady;
    $("#headline").innerHTML = analyzed ? "夢から届いた、<br>あなたへのメッセージ。" : "夢のかけらに、<br>心の声を見つけよう。";
    $("#hero-description").textContent = analyzed ? "心に響いた言葉を、そっと持ち帰ってください。" : "消えてしまう前に、そっと残す。あなたの夢を、ユメタンが一緒に読み解きます。";
    updateComposer();
    clearBtn.hidden = !ta.value.trim();
    micBtn.hidden = !speech.supported;
    askMic.hidden = !speech.supported;
    if (analyzed) {
      const saved = isSaved(currentDream);
      saveBtn.disabled = saved; saveBtn.textContent = saved ? "記憶しました" : "この夢を記憶する";
    }
  }
  function resetConversation() {
    currentDream = null; mode = "text"; finalText = ""; liveText = ""; ta.value = ""; askInput.value = ""; chatEl.innerHTML = ""; afterReady = false;
    applyMode(); setStatus("");
    say("home", greeting());
  }
  function updateComposer() {
    clearBtn.hidden = !ta.value.trim();
    sendBtn.disabled = busy || !ta.value.trim();
    sendBtn.innerHTML = busy ? "読み解いています…" : '夢を読み解く <span aria-hidden="true">✧</span>';
    wrap.setAttribute("aria-busy", String(busy));
  }
  ta.addEventListener("input", updateComposer);
  $$("[data-prompt]").forEach((button) => {
    button.onclick = () => {
      ta.value += (ta.value && !ta.value.endsWith("\n") ? "\n" : "") + button.dataset.prompt;
      finalText = ta.value;
      updateComposer();
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    };
  });

  let aizuchiTimer;
  function aizuchi() { clearTimeout(aizuchiTimer); aizuchiTimer = setTimeout(() => { if (listening) say("home", AIZUCHI[Math.floor(Math.random() * AIZUCHI.length)], { mood: "listening" }); }, 900); }
  async function startListening(target = ta) {
    stopSpeaking();
    listenTarget = target; finalText = target === ta ? finalText : ""; liveText = "";
    wantListening = true; listening = true;
    (target === ta ? micBtn : askMic).classList.add("listening");
    if (target === ta) { mode = "voice"; micBtn.querySelector("span").textContent = "止める"; setStatus("聞いています… 話し終わったら「止める」"); }
    else { $("#ask-status").hidden = false; $("#ask-status").textContent = "聞いています… 終わったらもう一度押す"; }
    say("home", target === ta ? "はい、聞いています。" : "どうぞ、聞いています。", { mood: "listening" });
    try {
      await speech.start({
        onText: (t, isFinal) => {
          if (isFinal) { finalText += t; liveText = ""; aizuchi(); } else { liveText = t; if (t.length % 12 === 0) aizuchi(); }
          listenTarget.value = finalText + liveText; if (listenTarget === ta) updateComposer();
        },
        onEnd: async () => {
          // ネイティブは一区切りごとに止まるので、続けたい間は再開する
          if (nativeSR && liveText) { finalText += liveText; liveText = ""; listenTarget.value = finalText; }
          if (wantListening) { try { await speech.start(speech._cb); return; } catch {} }
          listening = false; micBtn.classList.remove("listening"); askMic.classList.remove("listening");
          if (finalText.trim() && settings.autosend && !busy) (listenTarget === ta ? send() : ask());
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
    if (nativeSR && liveText) { finalText += liveText; liveText = ""; listenTarget.value = finalText; }
    listening = false; clearTimeout(aizuchiTimer);
    micBtn.classList.remove("listening"); askMic.classList.remove("listening"); mood("home", "");
    micBtn.querySelector("span").textContent = "声で話す"; $("#ask-status").hidden = true;
    if (silent) return;
    if (listenTarget === ta) setStatus(finalText.trim() ? (settings.autosend ? "読み取っています…" : "内容を確認して「夢を読み解く」を押してください") : "");
    if (nativeSR && finalText.trim() && settings.autosend && !busy) (listenTarget === ta ? send() : ask()); // ネイティブは onEnd が来ないことがあるためここでも送る
  }
  micBtn.onclick = () => (wantListening ? stopListening() : startListening(ta));
  askMic.onclick = () => (wantListening ? stopListening() : startListening(askInput));

  // 夢を読み取る（この時点では保存しない。「この夢を記憶する」で保存）
  async function send(extraText) {
    const text = (typeof extraText === "string" ? extraText : ta.value).trim();
    if (!text || busy) return;
    busy = true; updateComposer(); micBtn.disabled = true; ta.readOnly = true;
    $$("[data-prompt]").forEach((button) => button.disabled = true);
    addBubble("user", text);
    ta.value = ""; finalText = ""; liveText = "";
    say("home", "なるほど…少し整理しますね。", { mood: "thinking" });
    setStatus("ユメタンが読み取っています…");
    const now = new Date().toISOString();
    const dream = currentDream || { id: uuid(), createdAt: now, updatedAt: now, messages: [], analysis: null };
    dream.messages.push({ role: "user", text, at: now });
    try {
      const history = dreams.filter((d) => d.id !== dream.id && d.analysis).slice(0, 6);
      const { analysis } = useAI()
        ? await api("/api/listen", { messages: dream.messages, history })
        : { analysis: window.YumetanEngine.analyzeDream({ messages: dream.messages, history, prev: dream.analysis, askQuestion: false, profile: settings.profile }) };
      dream.messages.push({ role: "assistant", text: analysis.reply, at: new Date().toISOString() });
      dream.analysis = analysis; dream.updatedAt = new Date().toISOString();
      currentDream = dream;
      if (isSaved(dream)) await persistDream(dream); // 記憶済みの夢に追記したときだけ自動更新
      renderResult(analysis);
      setStatus("");
      afterReady = false; applyMode();
      say("home", analysis.reply, { mood: "happy", voice: false }); // 読み取り結果は文字のみ
      afterReady = true; applyMode();
      afterEl.scrollIntoView({ behavior: "smooth", block: "end" });
    } catch (e) {
      dream.messages.pop();
      chatEl.lastElementChild?.remove();
      ta.value = text; finalText = text;
      say("home", "うまく読み取れませんでした。もう一度お願いします。");
      toast(e.message, true);
      setStatus("読み取れませんでした。もう一度お試しください");
    } finally { busy = false; ta.readOnly = false; micBtn.disabled = false;
      $$("[data-prompt]").forEach((button) => button.disabled = false); updateComposer(); }
  }
  // 結果の吹き出し（状態ラベル + 返事 + タグ）
  function renderResult(a) {
    const card = document.createElement("div"); card.className = "result";
    const label = document.createElement("div"); label.className = "label"; label.textContent = "今の心の状態";
    const state = document.createElement("div"); state.className = "state"; state.textContent = a.state_label || TYPE_JA[a.dream_type] || "読み取り結果";
    card.append(label, state, tagRow(a));
    if (a.note) { const n = document.createElement("div"); n.className = "hint"; n.textContent = a.note; card.appendChild(n); }
    chatEl.appendChild(card); card.scrollIntoView({ behavior: "smooth", block: "end" });
    return card;
  }
  // 読み取り後の質問（または夢の追加情報）
  async function ask() {
    const text = askInput.value.trim();
    if (!text || !currentDream?.analysis || busy) return;
    askInput.value = ""; finalText = ""; liveText = "";
    if (useAI() || !window.YumetanEngine.isQuestion(text)) { await send(text); return; } // 追加の内容なら読み取り直す
    addBubble("user", text);
    const { reply } = window.YumetanEngine.answerQuestion(text, currentDream.analysis);
    addBubble("ai", reply);
    say("home", reply, { mood: "happy", voice: false });
    afterEl.scrollIntoView({ behavior: "smooth", block: "end" });
  }
  askSend.onclick = ask;
  askInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); ask(); } });
  // この夢を記憶する
  saveBtn.onclick = async () => {
    if (!currentDream?.analysis || isSaved(currentDream)) return;
    if (!dreams.some((x) => x.id === currentDream.id)) dreams.unshift(currentDream);
    await persistDream(currentDream); updateHomeCount();
    applyMode();
    say("home", "記憶しました。数日分たまると、最近の心の状態が読めるようになります。", { mood: "happy", voice: false });
    toast("この夢を記憶しました");
  };
  sendBtn.onclick = send;
  clearBtn.onclick = () => { ta.value = ""; finalText = ""; liveText = ""; updateComposer(); ta.focus(); };
  newBtn.onclick = resetConversation;
  ta.addEventListener("input", () => { if (!listening) finalText = ta.value; });
  ta.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send(); });

  // ---------- 質問形式（アキネーター風） ----------
  const FIRST_QUESTION = window.YumetanInterview.FIRST_QUESTION;
  const iv = { answers: [], question: "", busy: false };
  const ivAnswers = $("#iv-answers"), ivOther = $("#iv-other"), ivOtherText = $("#iv-other-text"), ivConfirm = $("#iv-confirm"), ivDreamText = $("#iv-dream-text"), ivLog = $("#iv-log"), ivProgress = $("#iv-progress");
  function startInterview() {
    iv.answers = []; iv.question = FIRST_QUESTION; iv.busy = false;
    ivLog.innerHTML = ""; ivOther.hidden = true; ivConfirm.hidden = true; ivAnswers.hidden = false; $("#iv-finish").hidden = false;
    showQuestion("", FIRST_QUESTION);
  }
  function renderProgress(n, total = 8) {
    ivProgress.innerHTML = "";
    for (let i = 0; i < total; i++) { const d = document.createElement("i"); if (i < n) d.className = "on"; ivProgress.appendChild(d); }
  }
  function showQuestion(comment, q) {
    iv.question = q;
    renderProgress(iv.answers.length + 1);
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
      const { step } = useAI() ? await api("/api/interview", { answers: iv.answers, finish, more }) : { step: window.YumetanInterview.next({ answers: iv.answers, finish, more }) };
      if (!useAI()) await sleep(350); // 考えている間を少しだけ見せる
      if (step.done) {
        ivDreamText.value = step.dream_text;
        ivConfirm.hidden = false; ivAnswers.hidden = true; $("#iv-finish").hidden = true;
        renderProgress(8);
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
      resetConversation();
      stack.length = 0; go("home");
      await send(text);
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
  const moodClass = (m) => `mood m${Number(m) < 0 ? "-" + Math.abs(Number(m)) : Number(m) || 0}`;
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
    const query = $("#history-search").value.trim().toLocaleLowerCase();
    const filtered = dreams.filter((dream) => {
      const a = dream.analysis || {};
      return [a.title, a.summary, ...(a.emotions || []), ...(a.themes || []), ...dream.messages.map((m) => m.text)].join(" ").toLocaleLowerCase().includes(query);
    });
    $("#history-count").textContent = query ? `${filtered.length}件の夢が見つかりました` : `${dreams.length}件の夢を記録しています`;
    if (!dreams.length) {
      el.innerHTML = `<div class="empty"><span class="empty-symbol" aria-hidden="true">☾</span><strong>最初の夢を、この場所に。</strong>覚えているひとことから始めましょう。<br>読み解いたあとに「この夢を記憶する」で残せます。<br><button class="btn primary" id="empty-write">夢を書いてみる</button></div>`;
      $("#empty-write").onclick = () => { go("home"); ta.focus(); };
      return;
    }
    if (!filtered.length) {
      el.innerHTML = `<div class="empty"><span class="empty-symbol" aria-hidden="true">✧</span><strong>その言葉の夢は、まだ見つかりません。</strong>別の言葉でも探してみてください。<br><button class="btn" id="reset-search">すべての夢を見る</button></div>`;
      $("#reset-search").onclick = () => { $("#history-search").value = ""; renderHistory(); $("#history-search").focus(); };
      return;
    }
    el.innerHTML = "";
    for (const d of filtered) {
      const a = d.analysis || {};
      const det = document.createElement("details"); det.className = "card";
      det.innerHTML = `
        <summary>
          <div><div class="date">${esc(fmtDate(d.createdAt))}</div><div class="title">${esc(a.title || "（無題）")}</div></div>
          <div class="${moodClass(a.mood)}" title="気分 ${a.mood}"></div>
        </summary>
        <div class="tags"></div>
        <div class="body">
          <p>${esc(a.summary || "")}</p>
          <p class="muted">${esc(a.mental_state_hint || "")}</p>
          <div class="convo"></div>
          <div class="actions">
            <button class="btn ghost continue">この夢について聞く</button>
            <button class="btn ghost danger delete">削除</button>
          </div>
        </div>`;
      if (d.analysis) { const t = tagRow(a); t.style.marginTop = "10px"; det.querySelector(".tags").replaceWith(t); }
      const convo = det.querySelector(".convo");
      for (const m of d.messages) { const b = document.createElement("div"); b.className = `bubble ${m.role === "user" ? "user" : "ai"}`; b.textContent = m.text; convo.appendChild(b); }
      det.querySelector(".continue").onclick = () => { openDream(d); go("home"); };
      det.querySelector(".delete").onclick = async () => {
        if (!confirm(`「${a.title || "この夢"}」の記録を削除しますか？`)) return;
        dreams = dreams.filter((x) => x.id !== d.id); await removeDream(d.id); det.remove();
        if (currentDream?.id === d.id) currentDream = null;
        renderHistory(); updateHomeCount();
        toast("削除しました");
      };
      el.appendChild(det);
    }
  }
  $("#history-search").addEventListener("input", renderHistory);
  function openDream(d) {
    currentDream = d; finalText = ""; liveText = ""; ta.value = ""; askInput.value = ""; chatEl.innerHTML = "";
    for (const m of d.messages) addBubble(m.role === "user" ? "user" : "ai", m.text);
    if (d.analysis) { chatEl.lastElementChild.remove(); renderResult(d.analysis); }
    afterReady = true; applyMode();
    setStatus("");
    say("home", "この夢について、聞きたいことがあればどうぞ。");
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
    $("#insight-refresh").hidden = targets.length < 2;
    if (targets.length < 2) {
      el.innerHTML = `<div class="empty"><span class="empty-symbol" aria-hidden="true">✧</span><strong>夢がつながると、心が見えてくる。</strong>あと ${2 - targets.length} 件の夢を記録すると、傾向を読み解けます。<br><span class="muted">毎日でなくても大丈夫。あなたのペースで。</span><br><button class="btn primary" id="insight-write">夢を記録する</button></div>`;
      $("#insight-write").onclick = () => { go("home"); if (!currentDream?.analysis) ta.focus(); };
      return;
    }
    const cached = await store.get(K.insight);
    let insight = cached?.insight, fromCache = true;
    if (refresh || !cached || cached.fingerprint !== fingerprint(targets) || (cached.insight?.engine === "local") !== !useAI()) {
      el.innerHTML = `<p class="muted">夢の記録を読み返しています…</p>`;
      $("#insight-refresh").disabled = true;
      try {
        if (useAI()) ({ insight } = await api("/api/insight", { dreams: targets }));
        else insight = window.YumetanInsight.compute(targets, settings.profile);
        await store.set(K.insight, { insight, fingerprint: fingerprint(targets) });
        fromCache = false;
      } catch (e) { if (!insight) { el.innerHTML = `<p class="empty">${esc(e.message)}</p>`; $("#insight-refresh").disabled = false; return; } toast(e.message, true); }
      finally { $("#insight-refresh").disabled = false; }
    }
    const i = insight;
    const seg = { low: 1, medium: 2, high: 3 }[i.stress_level] || 2;
    el.innerHTML = `
      <div class="card">
        <p class="headline">${esc(i.headline)}</p>
        <p>${esc(i.state)}</p>
        <div class="meter ${esc(i.stress_level)}">
          <div class="lbl"><span>ストレス</span><b>${{ low: "低め", medium: "中くらい", high: "高め" }[i.stress_level] || ""}</b></div>
          <div class="bar"><i class="${seg >= 1 ? "on" : ""}"></i><i class="${seg >= 2 ? "on" : ""}"></i><i class="${seg >= 3 ? "on" : ""}"></i></div>
        </div>
        <div class="meta"><span class="tag">傾向: ${TREND_JA[i.trend] || ""}</span>${(i.dominant_emotions || []).map((e) => `<span class="tag emo">${esc(e)}</span>`).join("")}${(i.recurring_themes || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
      </div>
      <div class="note positive"><b>良い面</b><span>${esc(i.positive_note)}</span></div>
      <div class="note suggest"><b>提案</b><span>${esc(i.suggestion)}</span></div>
      ${i.caution ? `<div class="note caution"><b>相談</b><span>${esc(i.caution)}</span></div>` : ""}
      <p class="muted center">${esc(i.basedOn)}件の夢をもとに ${esc(fmtDate(i.generatedAt))} に分析${fromCache ? "（前回の結果）" : ""}。診断ではなく、夢から見える傾向の目安です。</p>`;
  }
  $("#insight-refresh").onclick = () => renderInsight(true);

  // ---------- 設定 ----------
  function renderSettings() {
    $("#opt-speak").checked = settings.speak;
    $("#opt-autosend").checked = settings.autosend;
    $("#opt-code").value = settings.code || "";
    $("#opt-api").value = settings.apiBase || "";
    $("#opt-ai").checked = useAI();
    $("#sr-support").textContent = speech.supported ? `音声入力: 使えます（${nativeSR ? "ネイティブ" : "ブラウザ"}）` : "音声入力: このブラウザでは使えません（Chrome / Safari / Edge、またはアプリ版を使ってください）";
    renderAccount();
    const pf = settings.profile;
    $("#profile-info").textContent = pf ? `${pf.nickname}さん / ${pf.ageGroup} / ${pf.role} / 睡眠 ${pf.sleepHours} / 起床 ${pf.wakeTime}${pf.stressTopics?.length ? " / 気がかり: " + pf.stressTopics.join("・") : ""}` : "未登録";
    $("#sync-info").textContent = cloudOn()
      ? `夢の記録はクラウド（Firebase）に同期されています。この端末の同期ID: ${cloud.uid().slice(0, 8)}…。圏外でも使え、つながったときに同期します。`
      : "夢の記録はこの端末（アプリ）の中だけに保存されます。機種変更や別のブラウザに移すときは書き出してください。";
    $("#app-info").textContent = `ユメタン v${APP_VERSION} / ${isNative ? "アプリ版" : "Web版"} / 分析: ${useAI() ? "AI（Claude）" : "端末内エンジン"} / 保存: ${cloudOn() ? "クラウド" : "端末内"}${cloud?.state.error ? "（Firebase 接続失敗: " + cloud.state.error + "）" : ""}`;
    applyChara();
  }
  $("#opt-speak").onchange = (e) => { settings.speak = e.target.checked; saveSettings(); if (!settings.speak) stopSpeaking(); };
  $("#opt-autosend").onchange = (e) => { settings.autosend = e.target.checked; saveSettings(); };
  $("#opt-code").onchange = (e) => { settings.code = e.target.value.trim(); saveSettings(); toast("合言葉を保存しました"); };
  $("#opt-api").onchange = (e) => { settings.apiBase = e.target.value.trim(); saveSettings(); if (useAI()) checkHealth(); };
  $("#opt-ai").onchange = (e) => { settings.engine = e.target.checked ? "ai" : "local"; saveSettings(); if (useAI()) checkHealth(); else toast("端末内の分析エンジンを使います（通信不要）"); };
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
      if (cloudOn()) { for (const d of added) await persistDream(d); } else await saveDreams();
      ioWrap.hidden = true; updateHomeCount();
      toast(`${added.length}件を読み込みました`);
    } catch { toast("読み込めませんでした。書き出したデータをそのまま貼り付けてください。", true); }
  };
  $("#wipe").onclick = async () => {
    if (!confirm("この端末の夢の記録をすべて削除します。元に戻せません。よろしいですか？")) return;
    const ids = dreams.map((d) => d.id);
    dreams = []; currentDream = null; await saveDreams(); await store.set(K.insight, null); updateHomeCount();
    if (cloudOn()) for (const id of ids) await removeDream(id);
    toast("すべて削除しました");
  };

  async function checkHealth() {
    try { const h = await api("/api/health"); $("#code-setting").hidden = !h.needsCode; if (h.needsCode && !settings.code) toast("このサーバーは合言葉が必要です。設定画面で入力してください。"); }
    catch { toast("サーバーに接続できません。通信環境か設定のサーバーURLを確認してください。", true); }
  }

  // ---------- オンボーディング（初回のみ、登録の前） ----------
  const INTRO_LINES = ["はじめまして。ユメタンです。あなたの夢を聞いて、覚えて、心の状態を読み取ります。", "", "", "無理に意味づけはしません。気づきのきっかけとして、そばにいます。"];
  let slideIndex = 0;
  function showSlide(i) {
    const slides = $$("#intro-slides .slide");
    slideIndex = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach((el, k) => el.classList.toggle("active", k === slideIndex));
    $$("#intro-dots i").forEach((d, k) => d.classList.toggle("on", k <= slideIndex));
    $("#intro-next").textContent = slideIndex === slides.length - 1 ? "はじめる" : "次へ";
    $("#intro-skip").hidden = slideIndex === slides.length - 1;
    const line = INTRO_LINES[slideIndex];
    const slot = slides[slideIndex].querySelector(".speech-text"); if (slot && line) slot.textContent = line;
    window.scrollTo({ top: 0 });
  }
  async function finishIntro() {
    settings.introDone = true; await saveSettings();
    const next = settings.profile ? "home" : "onboard"; // 別端末で登録済みならホームへ
    stack.length = 0; go(next, { push: false }); history.replaceState({ view: next }, "", `#${next}`);
  }
  $("#intro-next").onclick = () => { if (slideIndex >= $$("#intro-slides .slide").length - 1) finishIntro(); else showSlide(slideIndex + 1); };
  $("#intro-skip").onclick = finishIntro;
  let touchX = null;
  $("#intro-slides").addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  $("#intro-slides").addEventListener("touchend", (e) => { if (touchX == null) return; const dx = e.changedTouches[0].clientX - touchX; touchX = null; if (dx < -50) showSlide(slideIndex + 1); else if (dx > 50) showSlide(slideIndex - 1); }, { passive: true });

  // ---------- 初回登録（プロフィール + ログイン情報） ----------
  const obForm = $("#ob-form"), obMsg = $("#ob-msg");
  $("#profile-edit").onclick = () => go("onboard");
  function renderOnboard() {
    const pf = settings.profile;
    $("#ob-kicker").textContent = pf ? "プロフィール" : "はじめまして";
    $("#ob-title").innerHTML = pf ? "あなたのことを、<br>更新します。" : "あなたのことを、<br>すこし教えてください。";
    $("#ob-nickname").value = pf?.nickname || "";
    if (pf) { $("#ob-age").value = pf.ageGroup; $("#ob-gender").value = pf.gender; $("#ob-role").value = pf.role; $("#ob-sleep").value = pf.sleepHours; $("#ob-wake").value = pf.wakeTime; }
    $$("#ob-stress input").forEach((c) => (c.checked = Boolean(pf?.stressTopics?.includes(c.value))));
    const needAccount = !cloudOn() || cloud.isAnonymous();
    $("#ob-account").hidden = !needAccount || (pf && !cloudOn());
    $("#ob-submit").textContent = pf ? (needAccount && cloudOn() ? "保存する（登録もする場合はメール入力）" : "保存する") : "登録してはじめる";
    $("#ob-skip").hidden = Boolean(pf);
    $("#ob-skip").textContent = "登録せずに、この端末だけで使う";
    obMsg.hidden = true;
  }
  function readProfile() {
    return {
      nickname: $("#ob-nickname").value.trim(), ageGroup: $("#ob-age").value, gender: $("#ob-gender").value, role: $("#ob-role").value,
      sleepHours: $("#ob-sleep").value, wakeTime: $("#ob-wake").value,
      stressTopics: $$("#ob-stress input:checked").map((c) => c.value),
      updatedAt: new Date().toISOString(),
    };
  }
  async function saveProfile(pf) {
    settings.profile = pf; await saveSettings();
    if (cloudOn()) { try { await cloud.saveProfile(pf); } catch (e) { console.warn("profile sync failed", e); } }
  }
  obForm.onsubmit = async (e) => {
    e.preventDefault();
    const pf = readProfile();
    if (!pf.nickname) { obMsg.hidden = false; obMsg.textContent = "呼び名を入力してください。"; return; }
    const email = $("#ob-email").value.trim(), pass = $("#ob-pass").value;
    $("#ob-submit").disabled = true; obMsg.hidden = true;
    try {
      const wasFirst = !settings.profile;
      await saveProfile(pf);
      if (!$("#ob-account").hidden && (email || pass)) {
        if (!cloudOn()) throw new Error("クラウドに接続できないため、登録は後で設定画面から行ってください。");
        if (!email || pass.length < 6) throw new Error("メールアドレスと6文字以上のパスワードを入力してください。");
        await cloud.signUp(email, pass);
        $("#ob-pass").value = "";
        toast(`${pf.nickname}さん、登録しました`);
      } else toast(wasFirst ? `${pf.nickname}さん、はじめましょう` : "保存しました");
      if (wasFirst) { stack.length = 0; go("home", { push: false }); history.replaceState({ view: "home" }, "", "#home"); } else back();
    } catch (err) { obMsg.hidden = false; obMsg.textContent = authMessage(err); }
    finally { $("#ob-submit").disabled = false; }
  };
  $("#ob-skip").onclick = async () => {
    const pf = readProfile();
    if (!pf.nickname) { obMsg.hidden = false; obMsg.textContent = "呼び名だけ入力してください。"; return; }
    await saveProfile(pf);
    toast(`${pf.nickname}さん、はじめましょう`);
    stack.length = 0; go("home", { push: false }); history.replaceState({ view: "home" }, "", "#home");
  };

  // ---------- アカウント（ログイン / ログアウト / 削除） ----------
  function renderAccount() {
    const info = $("#account-info"), actions = $("#account-actions");
    actions.innerHTML = "";
    if (!cloudOn()) { info.textContent = "クラウド未接続のため、アカウント機能は使えません（通信環境を確認してください）。"; return; }
    if (cloud.isAnonymous()) {
      info.textContent = "今は登録なしで使っています（この端末だけ）。ログインすると、別の端末でも同じ記録が使えます。";
      const b = document.createElement("button"); b.className = "btn primary"; b.textContent = "ログイン / 新規登録"; b.onclick = () => go("login"); actions.appendChild(b);
    } else {
      info.textContent = `ログイン中: ${cloud.email()}`;
      const out = document.createElement("button"); out.className = "btn"; out.textContent = "ログアウト";
      out.onclick = async () => {
        if (!confirm("ログアウトしますか？ 記録はアカウントに残り、次にログインすると戻ります。")) return;
        try { await cloud.signOut(); toast("ログアウトしました"); } catch (e) { toast(authMessage(e), true); }
      };
      const del = document.createElement("button"); del.className = "btn danger"; del.textContent = "アカウント削除";
      del.onclick = async () => {
        if (!confirm("アカウントと、クラウド上の夢の記録をすべて削除します。元に戻せません。よろしいですか？")) return;
        const pw = prompt("確認のため、パスワードを入力してください");
        if (pw == null) return;
        try { await cloud.deleteAccount(pw); dreams = []; currentDream = null; await store.set(K.insight, null); toast("アカウントを削除しました"); }
        catch (e) { toast(authMessage(e), true); }
      };
      actions.append(out, del);
    }
  }
  const authMessage = (e) => ({
    "auth/invalid-email": "メールアドレスの形式が正しくありません。",
    "auth/user-not-found": "そのメールアドレスは登録されていません。",
    "auth/wrong-password": "パスワードが違います。",
    "auth/invalid-credential": "メールアドレスかパスワードが違います。",
    "auth/email-already-in-use": "そのメールアドレスはすでに登録されています。「ログイン」を押してください。",
    "auth/credential-already-in-use": "そのメールアドレスはすでに登録されています。「ログイン」を押してください。",
    "auth/weak-password": "パスワードは6文字以上にしてください。",
    "auth/too-many-requests": "試行回数が多すぎます。しばらく待ってからお試しください。",
    "auth/requires-recent-login": "安全のため、もう一度ログインしてからお試しください。",
    "auth/operation-not-allowed": "サーバー側でメールログインが有効になっていません（Firebase コンソール → Authentication → メール/パスワード を有効化）。",
    "auth/network-request-failed": "通信できませんでした。",
  }[e?.code] || e?.message || String(e));
  const loginForm = $("#login-form"), loginMsg = $("#login-msg");
  let loginMode = "signin";
  function setLoginMode(m) {
    loginMode = m;
    $("#login-submit").textContent = m === "signup" ? "新規登録" : "ログイン";
    $("#login-signup").textContent = m === "signup" ? "ログインはこちら" : "新規登録はこちら";
    $("#login-pass").autocomplete = m === "signup" ? "new-password" : "current-password";
    loginMsg.hidden = true;
  }
  $("#login-signup").onclick = () => setLoginMode(loginMode === "signup" ? "signin" : "signup");
  $("#login-reset").onclick = async () => {
    const email = $("#login-email").value.trim();
    if (!email) { loginMsg.hidden = false; loginMsg.textContent = "メールアドレスを入力してから押してください。"; return; }
    try { await cloud.resetPassword(email); loginMsg.hidden = false; loginMsg.textContent = "パスワード再設定のメールを送りました。"; }
    catch (e) { loginMsg.hidden = false; loginMsg.textContent = authMessage(e); }
  };
  loginForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!cloudOn()) { toast("クラウドに接続できていません", true); return; }
    const email = $("#login-email").value.trim(), pass = $("#login-pass").value;
    $("#login-submit").disabled = true; loginMsg.hidden = true;
    try {
      if (loginMode === "signup") {
        await cloud.signUp(email, pass);
        toast("登録しました。この端末の記録はそのまま使えます");
      } else {
        const carry = cloud.isAnonymous() && dreams.length ? dreams.slice() : [];
        await cloud.signIn(email, pass);
        if (carry.length && confirm(`この端末にある ${carry.length} 件の記録を、ログインしたアカウントにも入れますか？`)) {
          await Promise.race([cloud.ready, sleep(1000)]);
          for (const d of carry) { try { await cloud.saveDream(d); } catch {} }
        }
        toast("ログインしました");
      }
      $("#login-pass").value = "";
      back();
    } catch (err) { loginMsg.hidden = false; loginMsg.textContent = authMessage(err); }
    finally { $("#login-submit").disabled = false; }
  };

  // クラウド保存を有効化: 読めるか確認 → 端末内の記録を移行 → 変化を購読
  let unsubscribeCloud = null;
  async function activateCloud() {
    if (!cloudOn()) return;
    if (unsubscribeCloud) { try { unsubscribeCloud(); } catch {} unsubscribeCloud = null; }
    try { await cloud.loadOnce(); }
    catch (e) { cloud.state.enabled = false; cloud.state.error = e?.code || e?.message || String(e); console.warn("Firestore を使えないため端末内保存で動きます:", cloud.state.error); return; }
    try {
      // プロフィール: クラウドにあれば取り込み、無ければ端末のものを上げる
      try { const cp = await cloud.loadProfile(); if (cp) { settings.profile = cp; await saveSettings(); if (current === "onboard") { stack.length = 0; go("home", { push: false }); } } else if (settings.profile) await cloud.saveProfile(settings.profile); } catch {}
      const local = (await store.get(K.dreams, [])) || [];
      if (local.length) {
        const existing = new Set((await cloud.loadOnce()).map((d) => d.id));
        let n = 0;
        for (const d of local) if (!existing.has(d.id)) { await cloud.saveDream(d); n++; }
        await store.set(K.dreams, []); // 移行済みの端末内コピーは消す（以後はクラウドが正）
        if (n) toast(`${n}件の記録をクラウドに移しました`);
      }
      unsubscribeCloud = cloud.subscribe((list) => {
        dreams = list; // 別端末での追加・削除もここに届く
        if (currentDream) { const same = dreams.find((d) => d.id === currentDream.id); if (same) currentDream = same; }
        updateHomeCount();
        if (current === "history") renderHistory();
        if (current === "settings") renderSettings();
        if (current === "home") applyMode();
      });
      cloud.onUser(() => { dreams = []; currentDream = null; activateCloud(); renderSettings(); });
    } catch (e) { console.warn("cloud activate failed", e); }
  }

  // ---------- 起動 ----------
  (async () => {
    await loadSettings();
    userId = await store.get(K.user);
    if (!userId) { userId = uuid(); await store.set(K.user, userId); }
    dreams = (await store.get(K.dreams, [])) || [];
    mountCharas();
    // Firebase が設定されていれば、初期化が終わり次第クラウド保存に切り替える（起動は待たない）
    // cloud.js は module（HTML 解析後に実行）なので、DOMContentLoaded まで待ってから参照する
    if (document.readyState === "loading") await new Promise((r) => document.addEventListener("DOMContentLoaded", r, { once: true }));
    cloud = window.YumetanCloud || null;
    if (cloud) cloud.ready.then(activateCloud).catch((e) => console.warn("cloud init failed", e));
    history.replaceState({ view: "home" }, "", "#home");
    renderToday(); applyMode();
    if (!settings.profile) go(settings.introDone ? "onboard" : "intro", { push: false });
    say("home", greeting()); updateHomeCount();
    if (useAI()) checkHealth();
  })();
})();
