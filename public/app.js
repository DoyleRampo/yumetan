// ユメタン フロントエンド（Web / PWA / Capacitor ネイティブ 共通）
(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const APP_VERSION = "4.0.0";
  const I18N = window.YumetanI18N, T16 = window.YumetanTypes, SLEEP = window.YumetanSleep;
  const t = (k, p) => I18N.t(k, p);
  const lang = () => I18N.lang;

  // ---------- 実行環境（Capacitor ネイティブか Web か） ----------
  const Cap = window.Capacitor;
  const isNative = Boolean(Cap?.isNativePlatform?.());
  const platform = Cap?.getPlatform?.() || "web";
  const P = Cap?.Plugins || {};
  const nativeSR = isNative && P.SpeechRecognition ? P.SpeechRecognition : null;
  const nativeTTS = isNative && P.TextToSpeech ? P.TextToSpeech : null;
  const nativePrefs = isNative && P.Preferences ? P.Preferences : null;
  const nativeAlarm = isNative && P.YumetanAlarm ? P.YumetanAlarm : null;
  const nativeNotif = isNative && P.LocalNotifications ? P.LocalNotifications : null;

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
      try { if (nativePrefs) await nativePrefs.set({ key, value: s }); else localStorage.setItem(key, s); } catch { toast(t("common.storageFull"), true); }
    },
  };
  const K = { settings: "yumetan.settings", dreams: "yumetan.dreams", diary: "yumetan.diary", insight: "yumetan.insight", user: "yumetan.userId" };

  // ---------- 設定 ----------
  const settings = { speak: false, autosend: true, chara: "woman", code: "", apiBase: "", apiKey: "", engine: "local", speakReset: false, profile: null, introDone: false, lang: "", typeState: null, alarm: { enabled: false, time: "07:00" } };
  const useAI = () => settings.engine === "ai";
  async function loadSettings() {
    const saved = await store.get(K.settings, {});
    Object.assign(settings, saved);
    settings.alarm = { enabled: false, time: "07:00", ...(saved.alarm || {}) };
    if (!settings.speakReset) { settings.speak = false; settings.speakReset = true; await saveSettings(); }
  }
  const saveSettings = () => store.set(K.settings, settings);
  function detectLang() {
    const n = (navigator.language || "ja").toLowerCase();
    return n.startsWith("ko") ? "ko" : n.startsWith("zh") ? "zh" : n.startsWith("en") ? "en" : "ja";
  }
  function applyLang(l, { silent = true } = {}) {
    settings.lang = l; I18N.setLang(l);
    document.body.classList.remove("lang-ja", "lang-en", "lang-ko", "lang-zh"); document.body.classList.add(`lang-${l}`);
    $$(".lang-switch").forEach(renderLangSwitch);
    renderToday(); updateHomeCount(); renderTypeTags(); renderDiaryTags(); updateComposer(); renderCharaBadge();
    if (current === "settings") renderSettings();
    if (current === "chara") renderChara();
    if (current === "diary") renderDiary();
    if (current === "quiz") renderQuiz();
    if (current === "typeresult") renderTypeResult();
    if (current === "history") renderHistory();
    if (current === "home" && !currentDream?.analysis) say("home", greeting());
    if (!silent) toast(t("set.langChanged"));
  }
  function renderLangSwitch(box) {
    box.innerHTML = "";
    for (const l of I18N.LANGS) {
      const b = document.createElement("button"); b.type = "button"; b.className = "lang-btn" + (l.id === lang() ? " active" : ""); b.textContent = l.label;
      b.onclick = async () => { applyLang(l.id, { silent: box.id === "intro-lang" || box.id === "ob-lang" }); await saveSettings(); };
      box.appendChild(b);
    }
  }

  // ---------- API ----------
  let userId = "";
  const apiBase = () => (settings.apiBase || window.YUMETAN_CONFIG?.apiBase || "").replace(/\/$/, "");
  async function api(path, body) {
    let res;
    try {
      res = await fetch(apiBase() + path, {
        method: body ? "POST" : "GET",
        headers: { "Content-Type": "application/json", "X-Yumetan-User": userId, "X-Yumetan-Lang": lang(), ...(settings.code ? { "X-Yumetan-Code": settings.code } : {}), ...(settings.apiKey ? { "X-Yumetan-Key": settings.apiKey } : {}) },
        body: body ? JSON.stringify({ ...body, lang: lang() }) : undefined,
      });
    } catch { throw new Error(t("common.network")); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || t("common.error", { status: res.status }));
    return data;
  }

  // ---------- 夢の記録・日記（端末内） ----------
  let dreams = [], diary = [];
  let cloud = null; // Firebase が使えるときだけ入る
  const cloudOn = () => Boolean(cloud?.state.enabled);
  const saveDreams = () => (cloudOn() ? Promise.resolve() : store.set(K.dreams, dreams));
  const persistDream = async (d) => { if (cloudOn()) { try { await cloud.saveDream(d); } catch (e) { toast(t("cloud.syncFail"), true); } } else await saveDreams(); };
  const removeDream = async (id) => { if (cloudOn()) { try { await cloud.deleteDream(id); } catch {} } else await saveDreams(); };
  const saveDiaryAll = () => (cloudOn() ? Promise.resolve() : store.set(K.diary, diary));
  const persistDiary = async (e) => { if (cloudOn()) { try { await cloud.saveDiary(e); } catch { toast(t("cloud.syncFail"), true); } } else await saveDiaryAll(); };
  const removeDiary = async (id) => { if (cloudOn()) { try { await cloud.deleteDiary(id); } catch {} } else await saveDiaryAll(); };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 3) | 8).toString(16); }));
  const dayKey = (d = new Date()) => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); };
  const yesterdayKey = () => dayKey(new Date(Date.now() - 86400e3));
  const diaryFor = (key) => diary.find((e) => e.date === key) || null;
  // 夢の分析に使う「前日の日記」（朝に書く想定なので前日。無ければ当日）
  const diaryForDream = () => diaryFor(yesterdayKey()) || diaryFor(dayKey());

  // ---------- 16タイプ / レベル ----------
  const typeState = () => settings.typeState;
  const typeName = (id) => T16.text(T16.byId[id]?.name, lang());
  async function saveTypeState(st) {
    settings.typeState = st; await saveSettings();
    if (cloudOn()) { try { await cloud.saveTypeState(st); } catch {} }
    renderCharaBadge();
  }
  const stars = (lv) => "★".repeat(lv) + "☆".repeat(5 - lv);
  function renderCharaBadge() {
    const st = typeState(), badge = $("#home-chara-badge");
    if (!st) { badge.hidden = true; return; }
    badge.hidden = false;
    setTypeImage($("#home-chara-img"), st.typeId);
    $("#home-chara-name").textContent = typeName(st.typeId);
    $("#home-chara-level").textContent = stars(st.level || 1);
  }
  function setTypeImage(img, typeId) {
    img.src = T16.image(typeId);
    img.onerror = () => { img.onerror = null; img.src = T16.placeholder(typeId); };
    img.alt = typeName(typeId);
  }
  // 睡眠の記録からレベルを再計算（上下したら知らせる）
  async function refreshLevel({ announce = true } = {}) {
    const st = typeState(); if (!st) return;
    const records = dreams.filter((d) => d.sleep?.score != null).map((d) => d.sleep);
    const { level, score, n } = SLEEP.currentLevel(records, settings.profile);
    const prev = st.level || 1;
    await saveTypeState({ ...st, level, sleepScore: score, sleepN: n });
    if (announce && n && level !== prev) toast(level > prev ? t("chara.levelUp", { type: typeName(st.typeId), level }) : t("chara.levelDown", { type: typeName(st.typeId), level }));
  }

  // ---------- キャラクター（案内人） ----------
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
    $$(".seg-btn").forEach((b) => { const selected = b.dataset.chara === settings.chara; b.classList.toggle("active", selected); b.setAttribute("aria-pressed", String(selected)); });
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
  async function speak(text) {
    if (!settings.speak) return;
    stopSpeaking();
    const sl = I18N.info().speech;
    if (nativeTTS) { try { await nativeTTS.speak({ text, lang: sl, rate: 0.95, pitch: settings.chara === "man" ? 0.9 : 1.05, category: "ambient" }); } catch {} return; }
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = sl; u.rate = 0.95; u.pitch = settings.chara === "man" ? 0.9 : 1.05;
    const vs = speechSynthesis.getVoices();
    const v = vs.find((v) => v.lang === sl) || vs.find((v) => v.lang?.startsWith(sl.slice(0, 2)));
    if (v) u.voice = v;
    await new Promise((resolve) => { u.onend = resolve; u.onerror = resolve; speechSynthesis.speak(u); setTimeout(resolve, 25000); });
  }
  function stopSpeaking() { try { if (nativeTTS) nativeTTS.stop(); else speechSynthesis?.cancel(); } catch {} }

  // ---------- 音声認識（ネイティブ / Web 共通インターフェース） ----------
  const WebSR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const speech = {
    supported: Boolean(nativeSR || WebSR),
    _rec: null, _listeners: [], _cb: null, _lang: "",
    async start(cb) {
      this._cb = cb;
      const sl = I18N.info().speech;
      if (nativeSR) {
        const perm = await nativeSR.requestPermissions().catch(() => ({ speechRecognition: "denied" }));
        if (perm.speechRecognition !== "granted") throw new Error("not-allowed");
        if (!this._listeners.length) {
          this._listeners.push(await nativeSR.addListener("partialResults", (e) => this._cb?.onText(e.matches?.[0] || "", false)));
          this._listeners.push(await nativeSR.addListener("listeningState", (e) => { if (e.status === "stopped") this._cb?.onEnd(); }));
        }
        await nativeSR.start({ language: sl, partialResults: true, popup: false, maxResults: 1 });
        return;
      }
      if (!this._rec || this._lang !== sl) {
        const r = new WebSR();
        r.lang = sl; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
        r.onresult = (e) => {
          let interim = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const tx = e.results[i][0].transcript;
            if (e.results[i].isFinal) this._cb?.onText(tx, true); else interim += tx;
          }
          if (interim) this._cb?.onText(interim, false);
        };
        r.onerror = (e) => { if (e.error !== "no-speech" && e.error !== "aborted") this._cb?.onError(e.error); };
        r.onend = () => this._cb?.onEnd();
        this._rec = r; this._lang = sl;
      }
      this._rec.start();
    },
    async stop() { try { if (nativeSR) await nativeSR.stop(); else this._rec?.stop(); } catch {} },
  };

  // ---------- 画面遷移 ----------
  let current = "home";
  const stack = [];
  const NO_BACK = new Set(["home", "intro", "quiz", "typeresult"]);
  function go(view, { push = true } = {}) {
    if (view === current) return;
    if (current === "home" && view !== "home" && currentDream?.analysis && !isSaved(currentDream) && !confirm(t("home.unsavedConfirm"))) {
      if (!push) history.pushState({ view: current }, "", `#${current}`);
      return;
    }
    if (current === "home") stopListening({ silent: true });
    stopSpeaking();
    if (push) stack.push(current);
    current = view;
    document.body.dataset.view = view;
    $$(".journal-nav [data-go]").forEach((button) => { if (button.dataset.go === view) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current"); });
    $$(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${view}`));
    $("#back").hidden = NO_BACK.has(view) || (view === "onboard" && !settings.profile);
    window.scrollTo({ top: 0 });
    if (push) history.pushState({ view }, "", `#${view}`);
    onEnter(view);
    const heading = $(`#view-${view} h2`);
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  }
  function back() { const prev = stack.pop() || "home"; go(prev, { push: false }); history.replaceState({ view: prev }, "", `#${prev}`); }
  function resetTo(view) { stack.length = 0; go(view, { push: false }); history.replaceState({ view }, "", `#${view}`); }
  $("#back").onclick = back;
  window.addEventListener("popstate", () => { if (NO_BACK.has(current) && current !== "home") { history.pushState({ view: current }, "", `#${current}`); return; } const prev = stack.pop() || "home"; go(prev, { push: false }); });
  $$("[data-go]").forEach((b) => (b.onclick = () => go(b.dataset.go)));
  function onEnter(view) {
    if (view === "home") { renderToday(); updateHomeCount(); renderCharaBadge(); renderDiaryState(); if (!currentDream?.analysis) say("home", greeting()); }
    if (view === "history") renderHistory();
    if (view === "insight") renderInsight();
    if (view === "settings") renderSettings();
    if (view === "onboard") renderOnboard();
    if (view === "intro") showSlide(0);
    if (view === "quiz") startQuiz();
    if (view === "typeresult") renderTypeResult();
    if (view === "chara") renderChara();
    if (view === "diary") renderDiary();
    if (view === "interview") $("#iv-local-note").hidden = lang() === "ja" || useAI();
  }
  function greeting() {
    const h = new Date().getHours();
    const name = settings.profile?.nickname ? t("home.nameSuffix", { name: settings.profile.nickname }) : "";
    return t(h < 11 ? "home.greetMorning" : h < 18 ? "home.greetDay" : "home.greetEvening", { name });
  }
  function renderToday() {
    $("#today").textContent = new Date().toLocaleDateString(I18N.info().locale, { year: "numeric", month: "long", day: "numeric", weekday: "short" });
  }
  function updateHomeCount() { $("#home-count").textContent = t("common.count", { n: dreams.length }); }
  function renderDiaryState() { $("#home-diary-state").textContent = diaryFor(dayKey()) ? t("home.diaryDone") : t("home.diaryPrompt"); }

  // ---------- 記憶方法の選択 ----------
  let mode = "text";
  $$("[data-mode=interview]").forEach((b) => (b.onclick = () => { startInterview(); go("interview"); }));

  // ---------- 記録画面（全文入力・音声・写真） ----------
  const chatEl = $("#chat"), micBtn = $("#mic"), statusEl = $("#status");
  const wrap = $("#transcript-wrap"), ta = $("#transcript");
  const sendBtn = $("#send"), clearBtn = $("#clear"), newBtn = $("#new-dream");
  let currentDream = null, listening = false, wantListening = false, finalText = "", liveText = "", busy = false;
  const afterEl = $("#after"), saveBtn = $("#save-dream"), askInput = $("#ask-input"), askMic = $("#ask-mic"), askSend = $("#ask-send");
  let listenTarget = ta;
  let afterReady = false;
  let photoData = null; // 手書きノートの写真（縮小した data URL）
  let selectedTags = new Set(); // この夢の特徴（16タイプの id）
  let sleepCheck = {}; // 朝のチェック
  const isSaved = (d) => Boolean(d && dreams.some((x) => x.id === d.id));

  function placeChara(analyzed) {
    const box = $("#view-home .home-chara"); if (!box) return;
    if (analyzed) afterEl.before(box); else $(".dream-column").append(box);
  }
  function applyMode() {
    const analyzed = Boolean(currentDream?.analysis);
    placeChara(analyzed);
    wrap.hidden = analyzed;
    afterEl.hidden = !analyzed || !afterReady;
    $("#headline").innerHTML = t(analyzed ? "home.headlineDone" : "home.headline");
    $("#hero-description").innerHTML = t(analyzed ? "home.descDone" : "home.desc");
    updateComposer();
    clearBtn.hidden = !ta.value.trim();
    micBtn.hidden = !speech.supported;
    askMic.hidden = !speech.supported;
    if (analyzed) {
      const saved = isSaved(currentDream);
      saveBtn.disabled = saved; saveBtn.textContent = t(saved ? "home.savedDream" : "home.saveDream");
      $(".type-tags").hidden = saved; $(".sleep-check").hidden = saved;
      $("#tonight-tip").hidden = !saved || !currentDream.sleep;
      if (saved && currentDream.sleep) renderTonightTip(currentDream.sleep);
    }
  }
  function resetConversation() {
    currentDream = null; mode = "text"; finalText = ""; liveText = ""; ta.value = ""; askInput.value = ""; chatEl.innerHTML = ""; afterReady = false;
    photoData = null; $("#photo-wrap").hidden = true; $("#photo-input").value = "";
    selectedTags = new Set(); sleepCheck = {}; $("#sleep-hours").value = ""; renderTypeTags(); renderSleepSeg();
    applyMode(); setStatus("");
    say("home", greeting());
  }
  function updateComposer() {
    clearBtn.hidden = !ta.value.trim();
    sendBtn.disabled = busy || !ta.value.trim();
    sendBtn.innerHTML = busy ? t("home.sending") : `${t("home.send")} <span aria-hidden="true">✧</span>`;
    wrap.setAttribute("aria-busy", String(busy));
  }
  ta.addEventListener("input", updateComposer);
  $$("[data-prompt]").forEach((button) => {
    button.onclick = () => {
      ta.value += (ta.value && !ta.value.endsWith("\n") ? "\n" : "") + t(button.dataset.prompt);
      finalText = ta.value; updateComposer(); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    };
  });

  // 手書きノートの写真（縮小して保持。AI が使えるときは文字起こし）
  $("#photo-input").onchange = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      photoData = await shrinkImage(file, 1280, 0.82);
      $("#photo-preview").src = photoData; $("#photo-wrap").hidden = false;
      $("#photo-ocr").disabled = !useAI();
      if (!useAI()) setStatus(t("home.ocrNeedAI"));
    } catch { toast(t("home.readFail"), true); }
  };
  $("#photo-remove").onclick = () => { photoData = null; $("#photo-wrap").hidden = true; $("#photo-input").value = ""; setStatus(""); };
  $("#photo-ocr").onclick = async () => {
    if (!photoData) return;
    if (!useAI()) { toast(t("home.ocrNeedAI"), true); return; }
    $("#photo-ocr").disabled = true; setStatus(t("home.statusReadingShort"));
    try {
      const { text } = await api("/api/ocr", { image: photoData });
      ta.value = (ta.value.trim() ? ta.value.trim() + "\n" : "") + (text || ""); finalText = ta.value; updateComposer();
      setStatus(t("home.ocrDone"));
    } catch (err) { toast(err.message, true); setStatus(""); }
    finally { $("#photo-ocr").disabled = false; }
  };
  function shrinkImage(file, max, quality) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file); const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas"); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); resolve(c.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image")); };
      img.src = url;
    });
  }
  const thumb = (dataUrl) => new Promise((resolve) => {
    if (!dataUrl) return resolve(null);
    const img = new Image(); img.onload = () => { const s = Math.min(1, 360 / Math.max(img.width, img.height)); const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); resolve(c.toDataURL("image/jpeg", 0.7)); };
    img.onerror = () => resolve(null); img.src = dataUrl;
  });

  // この夢の特徴（16タイプのチップ、グループごと）
  function renderTypeTags() {
    const box = $("#type-tags"); box.innerHTML = "";
    for (const g of T16.GROUPS) {
      const row = document.createElement("div"); row.className = "tag-group";
      const h = document.createElement("div"); h.className = "tag-group-title"; h.style.setProperty("--g", g.color); h.textContent = T16.text(g.name, lang()); row.appendChild(h);
      const chips = document.createElement("div"); chips.className = "chips";
      for (const id of g.types) {
        const ty = T16.byId[id];
        const b = document.createElement("button"); b.type = "button"; b.className = "chip-btn" + (selectedTags.has(id) ? " on" : ""); b.textContent = T16.text(ty.tag, lang());
        b.onclick = () => { if (selectedTags.has(id)) selectedTags.delete(id); else selectedTags.add(id); b.classList.toggle("on"); };
        chips.appendChild(b);
      }
      row.appendChild(chips); box.appendChild(row);
    }
  }
  // 朝のチェック
  function renderSleepSeg() {
    $$("#after .seg[data-check]").forEach((seg) => { const k = seg.dataset.check; seg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", sleepCheck[k] === b.dataset.v)); });
    previewSleep();
  }
  $$("#after .seg[data-check] button").forEach((b) => (b.onclick = () => { const k = b.closest(".seg").dataset.check; sleepCheck[k] = sleepCheck[k] === b.dataset.v ? undefined : b.dataset.v; renderSleepSeg(); }));
  $("#sleep-hours").addEventListener("input", previewSleep);
  function computeSleep() {
    const hours = $("#sleep-hours").value ? Number($("#sleep-hours").value) : null;
    const d = diaryForDream();
    const check = Object.values(sleepCheck).some(Boolean) ? sleepCheck : null;
    const r = SLEEP.score({ analysis: currentDream?.analysis, check, diary: d, profile: settings.profile, hours });
    return { ...r, check: check || null, hours, diaryDate: d?.date || null };
  }
  function previewSleep() {
    if (!currentDream?.analysis) return;
    const r = computeSleep();
    $("#sleep-preview").textContent = t("sleep.result", { score: r.score, level: r.level }) + `（${t("sleep.levelName." + r.level)}）`;
  }
  function renderTonightTip(sleepRes) {
    const tips = SLEEP.advice(sleepRes, lang(), 1);
    $("#tonight-tip-text").textContent = tips[0]?.text || ""; $("#tonight-tip").hidden = !tips.length;
  }

  const aizuchiList = () => t("home.aizuchi").split("|");
  let aizuchiTimer;
  function aizuchi() { clearTimeout(aizuchiTimer); aizuchiTimer = setTimeout(() => { if (listening) { const a = aizuchiList(); say("home", a[Math.floor(Math.random() * a.length)], { mood: "listening" }); } }, 900); }
  async function startListening(target = ta) {
    stopSpeaking();
    listenTarget = target; finalText = target === ta ? finalText : ""; liveText = "";
    wantListening = true; listening = true;
    (target === ta ? micBtn : askMic).classList.add("listening");
    if (target === ta) { mode = "voice"; micBtn.querySelector("span:last-child").textContent = t("home.micStop"); setStatus(t("home.statusListening")); }
    else { $("#ask-status").hidden = false; $("#ask-status").textContent = t("home.askListening"); }
    say("home", t(target === ta ? "home.listeningSay" : "home.listeningAsk"), { mood: "listening" });
    try {
      await speech.start({
        onText: (tx, isFinal) => {
          if (isFinal) { finalText += tx; liveText = ""; aizuchi(); } else { liveText = tx; if (tx.length % 12 === 0) aizuchi(); }
          listenTarget.value = finalText + liveText; if (listenTarget === ta) updateComposer();
        },
        onEnd: async () => {
          if (nativeSR && liveText) { finalText += liveText; liveText = ""; listenTarget.value = finalText; }
          if (wantListening) { try { await speech.start(speech._cb); return; } catch {} }
          listening = false; micBtn.classList.remove("listening"); askMic.classList.remove("listening");
          if (finalText.trim() && settings.autosend && !busy) (listenTarget === ta ? send() : ask());
        },
        onError: (code) => {
          stopListening({ silent: true });
          const msg = { "not-allowed": t("speech.notAllowed"), "audio-capture": t("speech.noMic"), "network": t("speech.network") }[code] || t("speech.error", { code });
          toast(msg, true);
        },
      });
    } catch (e) {
      stopListening({ silent: true });
      toast(e.message === "not-allowed" ? t("speech.permission") : t("speech.startFail"), true);
    }
  }
  async function stopListening({ silent = false } = {}) {
    wantListening = false;
    await speech.stop();
    if (nativeSR && liveText) { finalText += liveText; liveText = ""; listenTarget.value = finalText; }
    listening = false; clearTimeout(aizuchiTimer);
    micBtn.classList.remove("listening"); askMic.classList.remove("listening"); mood("home", "");
    micBtn.querySelector("span:last-child").textContent = t("home.mic"); $("#ask-status").hidden = true;
    if (silent) return;
    if (listenTarget === ta) setStatus(finalText.trim() ? t(settings.autosend ? "home.statusReadingShort" : "home.statusConfirm") : "");
    if (nativeSR && finalText.trim() && settings.autosend && !busy) (listenTarget === ta ? send() : ask());
  }
  micBtn.onclick = () => (wantListening ? stopListening() : startListening(ta));
  askMic.onclick = () => (wantListening ? stopListening() : startListening(askInput));

  // 前日の日記と夢のつながりを一言（端末内エンジン用。AI のときはサーバーが日記を読む）
  const DIARY_NOTE = {
    stress: { ja: "前日の日記にストレスの記述があり、夢の緊張感とつながっていそうです。", en: "Yesterday's diary mentioned stress, which seems linked to the tension in this dream.", ko: "전날 일기에 스트레스 언급이 있어 꿈의 긴장감과 이어지는 듯해요.", zh: "前一天的日记提到了压力，似乎与这个梦的紧张感有关。" },
    alcohol: { ja: "前日にお酒があったので、夢が鮮明・激しくなりやすい夜でした。", en: "There was alcohol yesterday, which tends to make dreams vivid and intense.", ko: "전날 술이 있어서 꿈이 선명하고 격렬해지기 쉬운 밤이었어요.", zh: "前一天喝了酒，这样的夜晚梦容易变得鲜明而激烈。" },
    late_screen: { ja: "前日は夜更かし気味。眠りが浅く、夢を覚えやすい状態だったかもしれません。", en: "You stayed up late yesterday; sleep may have been light, making the dream easier to recall.", ko: "전날 밤늦게까지 깨어 있었어요. 잠이 얕아 꿈을 기억하기 쉬운 상태였을지도.", zh: "前一天熬夜了，睡眠可能较浅，梦更容易被记住。" },
    low_mood: { ja: "前日の気分が沈んでいたので、夢にもその重さが映っているようです。", en: "Your mood was low yesterday, and that weight seems to show in the dream.", ko: "전날 기분이 가라앉아 있어서 꿈에도 그 무게가 비치는 듯해요.", zh: "前一天心情低落，梦里似乎也映出了那份沉重。" },
    good_mood: { ja: "前日は気分が良かった日。夢の穏やかさとつながっています。", en: "Yesterday was a good day, and it connects with the calm of this dream.", ko: "전날은 기분이 좋았던 날. 꿈의 평온함과 이어져요.", zh: "前一天心情不错，与这个梦的平静相呼应。" },
    exercise: { ja: "前日に運動していたので、眠りは深めだったはずです。", en: "You exercised yesterday, so sleep was likely deeper.", ko: "전날 운동을 해서 잠이 깊었을 거예요.", zh: "前一天运动过，睡眠应该比较深。" },
  };
  function diaryNote(d, a) {
    if (!d || !a) return "";
    const txt = (d.text || "").toLowerCase(); const tags = new Set(d.tags || []);
    const hasF = (id) => tags.has(id) || SLEEP.DIARY_FACTORS.find((f) => f.id === id)?.kw.some((k) => txt.includes(k.toLowerCase()));
    const neg = Number(a.mood) <= -1;
    let key = null;
    if (neg && hasF("stress")) key = "stress";
    else if (hasF("alcohol") && (neg || Number(a.intensity) >= 4)) key = "alcohol";
    else if (neg && Number(d.mood) <= 2) key = "low_mood";
    else if (!neg && Number(d.mood) >= 4) key = "good_mood";
    else if (hasF("late_screen")) key = "late_screen";
    else if (hasF("exercise") && !neg) key = "exercise";
    return key ? (DIARY_NOTE[key][lang()] || DIARY_NOTE[key].ja) : "";
  }

  // 夢を読み取る（この時点では保存しない。「この夢を記憶する」で保存）
  async function send(extraText) {
    const text = (typeof extraText === "string" ? extraText : ta.value).trim();
    if (!text || busy) return;
    busy = true; updateComposer(); micBtn.disabled = true; ta.readOnly = true;
    $$("[data-prompt]").forEach((button) => button.disabled = true);
    addBubble("user", text);
    ta.value = ""; finalText = ""; liveText = "";
    say("home", t("home.thinking"), { mood: "thinking" });
    setStatus(t("home.statusReading"));
    const now = new Date().toISOString();
    const dream = currentDream || { id: uuid(), createdAt: now, updatedAt: now, messages: [], analysis: null };
    dream.messages.push({ role: "user", text, at: now });
    try {
      const history = dreams.filter((d) => d.id !== dream.id && d.analysis).slice(0, 6);
      const d = diaryForDream();
      let analysis;
      if (useAI()) ({ analysis } = await api("/api/listen", { messages: dream.messages, history, diary: d ? { date: d.date, mood: d.mood, tags: d.tags, text: d.text } : null, dreamType: typeState()?.typeId || null, profile: settings.profile }));
      else {
        analysis = window.YumetanEngine.analyzeDream({ messages: dream.messages, history, prev: dream.analysis, askQuestion: false, profile: settings.profile });
        const dn = diaryNote(d, analysis); if (dn) { analysis.diary_note = dn; analysis.note = analysis.note ? `${analysis.note} ${dn}` : dn; }
      }
      dream.messages.push({ role: "assistant", text: analysis.reply, at: new Date().toISOString() });
      dream.analysis = analysis; dream.updatedAt = new Date().toISOString();
      if (photoData && !dream.photo) dream.photo = await thumb(photoData);
      currentDream = dream;
      if (isSaved(dream)) await persistDream(dream);
      renderResult(analysis);
      setStatus("");
      afterReady = false; applyMode();
      say("home", analysis.reply, { mood: "happy", voice: false });
      afterReady = true; renderTypeTags(); renderSleepSeg(); applyMode();
      afterEl.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      dream.messages.pop();
      chatEl.lastElementChild?.remove();
      ta.value = text; finalText = text;
      say("home", t("home.readFail"));
      toast(e.message, true);
      setStatus(t("home.statusFail"));
    } finally { busy = false; ta.readOnly = false; micBtn.disabled = false; $$("[data-prompt]").forEach((button) => button.disabled = false); updateComposer(); }
  }
  function renderResult(a) {
    const card = document.createElement("div"); card.className = "result";
    const label = document.createElement("div"); label.className = "label"; label.textContent = t("home.resultLabel");
    const state = document.createElement("div"); state.className = "state"; state.textContent = a.state_label || typeLabel(a.dream_type) || t("home.resultFallback");
    card.append(label, state, tagRow(a));
    if (a.note) { const n = document.createElement("div"); n.className = "hint"; n.textContent = a.note; card.appendChild(n); }
    chatEl.appendChild(card); card.scrollIntoView({ behavior: "smooth", block: "end" });
    return card;
  }
  async function ask() {
    const text = askInput.value.trim();
    if (!text || !currentDream?.analysis || busy) return;
    askInput.value = ""; finalText = ""; liveText = "";
    if (useAI() || !window.YumetanEngine.isQuestion(text)) { await send(text); return; }
    addBubble("user", text);
    const { reply } = window.YumetanEngine.answerQuestion(text, currentDream.analysis);
    addBubble("ai", reply);
    say("home", reply, { mood: "happy", voice: false });
    afterEl.scrollIntoView({ behavior: "smooth", block: "end" });
  }
  askSend.onclick = ask;
  askInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); ask(); } });
  // この夢を記憶する（睡眠スコア → タイプ更新 → レベル更新）
  saveBtn.onclick = async () => {
    if (!currentDream?.analysis || isSaved(currentDream)) return;
    saveBtn.disabled = true;
    currentDream.tags = [...selectedTags];
    currentDream.sleep = computeSleep();
    if (photoData && !currentDream.photo) currentDream.photo = await thumb(photoData);
    if (!dreams.some((x) => x.id === currentDream.id)) dreams.unshift(currentDream);
    await persistDream(currentDream); updateHomeCount();
    // 16タイプの成長
    const st = typeState();
    if (st) {
      const { state, changed, from, to } = T16.evolve(st, currentDream.analysis, currentDream.tags);
      await saveTypeState(state);
      if (changed) toast(t("chara.changed", { from: typeName(from), to: typeName(to) }));
    }
    await refreshLevel();
    applyMode();
    say("home", t("home.rememberedSay"), { mood: "happy", voice: false });
    toast(t("home.rememberedToast"));
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
    if (useAI()) { stepInterview({}); } else showQuestion("", FIRST_QUESTION);
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
    say("interview", finish ? t("iv.summing") : "…", { mood: "thinking" });
    try {
      const { step } = useAI() ? await api("/api/interview", { answers: iv.answers, finish, more }) : { step: window.YumetanInterview.next({ answers: iv.answers, finish, more }) };
      if (!useAI()) await sleep(350);
      if (step.done) {
        ivDreamText.value = step.dream_text;
        ivConfirm.hidden = false; ivAnswers.hidden = true; $("#iv-finish").hidden = true;
        renderProgress(8);
        say("interview", (step.comment ? step.comment + "\n" : "") + t("iv.wasIt"), { mood: "happy", voice: true });
      } else showQuestion(step.comment, step.question);
    } catch (e) {
      toast(e.message, true);
      if (!finish && !more) { iv.answers.pop(); ivLog.firstElementChild?.remove(); }
      say("interview", t("iv.retry") + "\n" + iv.question);
      ivAnswers.setAttribute("aria-busy", "false");
    } finally { iv.busy = false; }
  }
  function logQA(q, a) { const d = document.createElement("div"); d.className = "qa"; d.innerHTML = `<b>${esc(a)}</b><span>${esc(q)}</span>`; ivLog.prepend(d); }
  $$(".answer").forEach((b) => (b.onclick = () => {
    if (b.dataset.answer === "__other") { ivOther.hidden = false; ivOtherText.value = ""; ivOtherText.focus(); return; }
    answer(b.dataset.answer);
  }));
  $("#iv-other-send").onclick = () => { const x = ivOtherText.value.trim(); if (x) answer(x); };
  $("#iv-other-cancel").onclick = () => (ivOther.hidden = true);
  $("#iv-finish").onclick = () => { if (!iv.answers.length) { toast(t("iv.noAnswers")); return; } stepInterview({ finish: true }); };
  $("#iv-more").onclick = () => { ivConfirm.hidden = true; ivAnswers.hidden = false; $("#iv-finish").hidden = false; stepInterview({ more: true }); };
  $("#iv-restart").onclick = startInterview;
  $("#iv-save").onclick = async () => {
    const text = ivDreamText.value.trim(); if (!text) return;
    $("#iv-save").disabled = true;
    say("interview", t("iv.recording"), { mood: "thinking" });
    try { resetConversation(); resetTo("home"); await send(text); }
    catch (e) { toast(e.message, true); }
    finally { $("#iv-save").disabled = false; }
  };

  // ---------- 表示ヘルパー ----------
  function setStatus(x) { statusEl.textContent = x; }
  function addBubble(role, text) {
    const d = document.createElement("div"); d.className = `bubble ${role}`; d.textContent = text;
    chatEl.appendChild(d); d.scrollIntoView({ behavior: "smooth", block: "end" }); return d;
  }
  const typeLabel = (id) => (I18N.has(`type.${id}`) ? t(`type.${id}`) : id);
  const moodClass = (m) => `mood m${Number(m) < 0 ? "-" + Math.abs(Number(m)) : Number(m) || 0}`;
  function tagRow(a) {
    const row = document.createElement("div"); row.className = "tags";
    row.appendChild(tag(typeLabel(a.dream_type), `type-${a.dream_type}`));
    (a.emotions || []).slice(0, 4).forEach((e) => row.appendChild(tag(e, "emo")));
    (a.themes || []).slice(0, 3).forEach((x) => row.appendChild(tag(x)));
    return row;
  }
  function tag(text, cls = "") { const s = document.createElement("span"); s.className = `tag ${cls}`; s.textContent = text; return s; }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDate = (iso) => new Date(iso).toLocaleString(I18N.info().locale, { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
  const fmtDay = (key) => new Date(key + "T12:00:00").toLocaleDateString(I18N.info().locale, { year: "numeric", month: "long", day: "numeric", weekday: "short" });
  let toastTimer;
  function toast(msg, isError = false) {
    const el = $("#toast"); el.textContent = msg; el.className = `toast ${isError ? "error" : ""}`; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.hidden = true), 4500);
  }

  // ---------- 夢の記録 ----------
  function renderHistory() {
    const el = $("#history");
    const query = $("#history-search").value.trim().toLocaleLowerCase();
    const filtered = dreams.filter((dream) => {
      const a = dream.analysis || {};
      return [a.title, a.summary, ...(a.emotions || []), ...(a.themes || []), ...dream.messages.map((m) => m.text)].join(" ").toLocaleLowerCase().includes(query);
    });
    $("#history-count").textContent = query ? t("hist.found", { n: filtered.length }) : t("hist.total", { n: dreams.length });
    if (!dreams.length) {
      el.innerHTML = `<div class="empty"><span class="empty-symbol" aria-hidden="true">☾</span><strong>${esc(t("hist.emptyTitle"))}</strong>${t("hist.emptyDesc")}<br><button class="btn primary" id="empty-write">${esc(t("hist.emptyBtn"))}</button></div>`;
      $("#empty-write").onclick = () => { go("home"); ta.focus(); };
      return;
    }
    if (!filtered.length) {
      el.innerHTML = `<div class="empty"><span class="empty-symbol" aria-hidden="true">✧</span><strong>${esc(t("hist.noMatchTitle"))}</strong>${esc(t("hist.noMatchDesc"))}<br><button class="btn" id="reset-search">${esc(t("hist.showAll"))}</button></div>`;
      $("#reset-search").onclick = () => { $("#history-search").value = ""; renderHistory(); $("#history-search").focus(); };
      return;
    }
    el.innerHTML = "";
    for (const d of filtered) {
      const a = d.analysis || {};
      const det = document.createElement("details"); det.className = "card";
      det.innerHTML = `
        <summary>
          <div><div class="date">${esc(fmtDate(d.createdAt))}</div><div class="title">${esc(a.title || t("hist.untitled"))}</div></div>
          <div class="${moodClass(a.mood)}" title="${esc(t("hist.moodTitle", { mood: a.mood }))}"></div>
        </summary>
        <div class="tags"></div>
        <div class="body">
          <p>${esc(a.summary || "")}</p>
          <p class="muted">${esc(a.mental_state_hint || "")}</p>
          ${d.sleep ? `<p class="muted">${esc(t("hist.sleep", { score: d.sleep.score, level: d.sleep.level }))}</p>` : ""}
          ${d.tags?.length ? `<div class="tags small">${d.tags.map((id) => `<span class="tag type16">${esc(T16.text(T16.byId[id]?.tag, lang()))}</span>`).join("")}</div>` : ""}
          ${d.photo ? `<img class="dream-photo" src="${d.photo}" alt="">` : ""}
          <div class="convo"></div>
          <div class="actions">
            <button class="btn ghost continue">${esc(t("hist.continue"))}</button>
            <button class="btn ghost danger delete">${esc(t("common.delete"))}</button>
          </div>
        </div>`;
      if (d.analysis) { const x = tagRow(a); x.style.marginTop = "10px"; det.querySelector(".tags").replaceWith(x); }
      const convo = det.querySelector(".convo");
      for (const m of d.messages) { const b = document.createElement("div"); b.className = `bubble ${m.role === "user" ? "user" : "ai"}`; b.textContent = m.text; convo.appendChild(b); }
      det.querySelector(".continue").onclick = () => { openDream(d); go("home"); };
      det.querySelector(".delete").onclick = async () => {
        if (!confirm(t("hist.deleteConfirm", { title: a.title || t("hist.thisDream") }))) return;
        dreams = dreams.filter((x) => x.id !== d.id); await removeDream(d.id); det.remove();
        if (currentDream?.id === d.id) currentDream = null;
        renderHistory(); updateHomeCount(); refreshLevel({ announce: false });
        toast(t("common.deleted"));
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
    say("home", t("home.openDreamSay"));
  }

  // ---------- 心の状態 ----------
  function insightTargets() {
    const since = Date.now() - 14 * 86400e3;
    let x = dreams.filter((d) => d.analysis && Date.parse(d.createdAt) >= since);
    if (x.length < 2) x = dreams.filter((d) => d.analysis).slice(0, 10);
    return x.slice(0, 12);
  }
  const fingerprint = (list) => list.map((d) => `${d.id}:${d.updatedAt}`).join("|") + `|${lang()}`;
  async function renderInsight(refresh = false) {
    const el = $("#insight");
    $("#ins-local-note").hidden = lang() === "ja" || useAI();
    const targets = insightTargets();
    $("#insight-refresh").hidden = targets.length < 2;
    if (targets.length < 2) {
      el.innerHTML = `<div class="empty"><span class="empty-symbol" aria-hidden="true">✧</span><strong>${esc(t("ins.emptyTitle"))}</strong>${esc(t("ins.emptyDesc", { n: 2 - targets.length }))}<br><span class="muted">${esc(t("ins.emptyNote"))}</span><br><button class="btn primary" id="insight-write">${esc(t("ins.emptyBtn"))}</button></div>`;
      $("#insight-write").onclick = () => { go("home"); if (!currentDream?.analysis) ta.focus(); };
      return;
    }
    const cached = await store.get(K.insight);
    let insight = cached?.insight, fromCache = true;
    if (refresh || !cached || cached.fingerprint !== fingerprint(targets) || (cached.insight?.engine === "local") !== !useAI()) {
      el.innerHTML = `<p class="muted">${esc(t("ins.reading"))}</p>`;
      $("#insight-refresh").disabled = true;
      try {
        if (useAI()) ({ insight } = await api("/api/insight", { dreams: targets, profile: settings.profile, dreamType: typeState()?.typeId || null }));
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
          <div class="lbl"><span>${esc(t("ins.stress"))}</span><b>${esc(t("ins.stress." + i.stress_level))}</b></div>
          <div class="bar"><i class="${seg >= 1 ? "on" : ""}"></i><i class="${seg >= 2 ? "on" : ""}"></i><i class="${seg >= 3 ? "on" : ""}"></i></div>
        </div>
        <div class="meta"><span class="tag">${esc(t("ins.trend", { trend: t("ins.trend." + (i.trend || "unknown")) }))}</span>${(i.dominant_emotions || []).map((e) => `<span class="tag emo">${esc(e)}</span>`).join("")}${(i.recurring_themes || []).map((x) => `<span class="tag">${esc(x)}</span>`).join("")}</div>
      </div>
      <div class="note positive"><b>${esc(t("ins.positive"))}</b><span>${esc(i.positive_note)}</span></div>
      <div class="note suggest"><b>${esc(t("ins.suggest"))}</b><span>${esc(i.suggestion)}</span></div>
      ${i.caution ? `<div class="note caution"><b>${esc(t("ins.caution"))}</b><span>${esc(i.caution)}</span></div>` : ""}
      <p class="muted center">${esc(t("ins.basedOn", { n: i.basedOn, date: fmtDate(i.generatedAt), cache: fromCache ? t("ins.cached") : "" }))}</p>`;
  }
  $("#insight-refresh").onclick = () => renderInsight(true);

  // ---------- 16タイプ診断（アンケート） ----------
  const quiz = { i: 0, answers: [] };
  function startQuiz() { quiz.i = 0; quiz.answers = []; renderQuiz(); }
  function renderQuiz() {
    const q = T16.QUIZ[quiz.i]; if (!q) return;
    $("#quiz-progress").textContent = t("quiz.progress", { n: quiz.i + 1, total: T16.QUIZ.length });
    $("#quiz-q").textContent = T16.text(q.q, lang());
    const box = $("#quiz-options"); box.innerHTML = "";
    for (const o of T16.QUIZ_OPTIONS) {
      const b = document.createElement("button"); b.type = "button"; b.className = "quiz-opt" + (quiz.answers[quiz.i]?.value === o.value ? " on" : ""); b.textContent = T16.text(o.label, lang());
      b.onclick = async () => {
        quiz.answers[quiz.i] = { type: q.type, value: o.value };
        if (quiz.i < T16.QUIZ.length - 1) { quiz.i++; renderQuiz(); return; }
        const prev = typeState();
        const st = T16.diagnose(quiz.answers);
        if (prev) { st.level = prev.level; st.sleepScore = prev.sleepScore; st.sleepN = prev.sleepN; st.history = [...(prev.history || []), st.history[0]]; }
        await saveTypeState(st);
        await refreshLevel({ announce: false });
        resetTo("typeresult");
      };
      box.appendChild(b);
    }
    $("#quiz-prev").hidden = quiz.i === 0;
  }
  $("#quiz-prev").onclick = () => { if (quiz.i > 0) { quiz.i--; renderQuiz(); } };
  function typeCard(typeId, { big = false, level = null } = {}) {
    const ty = T16.byId[typeId], g = T16.groupById[ty.group], L = lang();
    const card = document.createElement("div"); card.className = "type-card" + (big ? " big" : ""); card.style.setProperty("--g", g.color); card.style.setProperty("--g-bg", g.bg); card.style.setProperty("--g-line", g.line);
    const img = document.createElement("img"); img.className = "type-img"; setTypeImage(img, typeId);
    card.innerHTML = `<div class="type-group-label"><span class="type-no">${t("type.number", { n: ty.no })}</span><span>${esc(T16.text(g.name, L))}</span></div>`;
    card.appendChild(img);
    const body = document.createElement("div"); body.className = "type-body";
    body.innerHTML = `<div class="type-name">${esc(T16.text(ty.name, L))}<small>${esc(T16.text(ty.sub, L))}</small></div><div class="type-title">${esc(T16.text(ty.title, L))}</div><p class="type-desc">${esc(T16.text(ty.desc, L))}</p>${level ? `<div class="type-level"><span>${esc(t("common.level"))} ${level}</span><span class="stars">${stars(level)}</span></div>` : ""}`;
    card.appendChild(body);
    return card;
  }
  function renderTypeResult() {
    const st = typeState(); if (!st) return;
    const box = $("#type-result-card"); box.innerHTML = ""; box.appendChild(typeCard(st.typeId, { big: true, level: st.level }));
  }
  $("#type-result-start").onclick = () => { resetTo("home"); say("home", greeting()); };
  $("#quiz-retake").onclick = () => { if (!typeState() || confirm(t("quiz.retakeConfirm"))) resetTo("quiz"); };

  // ---------- マイキャラ ----------
  function renderChara() {
    const box = $("#chara-page"); box.innerHTML = "";
    const st = typeState(), L = lang();
    if (!st) {
      box.innerHTML = `<div class="empty"><span class="empty-symbol" aria-hidden="true">✧</span><strong>${esc(t("chara.noType"))}</strong><br><button class="btn primary" id="chara-quiz">${esc(t("chara.startQuiz"))}</button></div>`;
      $("#chara-quiz").onclick = () => resetTo("quiz");
      return;
    }
    const ty = T16.byId[st.typeId];
    box.appendChild(typeCard(st.typeId, { big: true, level: st.level }));
    // レベルと睡眠
    const lv = document.createElement("div"); lv.className = "card-soft";
    const records = dreams.filter((d) => d.sleep?.score != null).map((d) => d.sleep);
    const factors = [...new Set(records.slice(0, 7).flatMap((r) => r.factors || []))];
    const adv = SLEEP.advice({ level: st.level, factors }, L, 3);
    lv.innerHTML = `<div class="section-title">${esc(t("chara.levelTitle"))}</div>
      <div class="level-row"><span class="stars big">${stars(st.level || 1)}</span><b>Lv.${st.level || 1}</b><span class="muted">${esc(t("sleep.levelName." + (st.level || 1)))}</span></div>
      <div class="meter"><div class="bar level-bar"><i style="width:${st.sleepScore ?? 0}%"></i></div></div>
      <p class="muted">${st.sleepN ? esc(t("chara.levelDesc", { n: st.sleepN })) + ` ${esc(t("chara.sleepScore"))}: ${st.sleepScore}` : esc(t("chara.levelNoData"))}</p>
      ${factors.length ? `<div class="section-sub">${esc(t("chara.factors"))}</div><div class="tags small">${factors.slice(0, 8).map((f) => `<span class="tag">${esc(SLEEP.factorLabel(f, L))}</span>`).join("")}</div>` : ""}
      <div class="section-sub">${esc(t("chara.advice"))}</div>${adv.map((a) => `<div class="note suggest"><span>${esc(a.text)}</span></div>`).join("")}`;
    box.appendChild(lv);
    // 傾向
    const tr = document.createElement("div"); tr.className = "card-soft";
    tr.innerHTML = `<div class="section-title">${esc(t("chara.traits"))}</div><p>${esc(T16.text(ty.chara, L))}</p><p class="muted">${esc(T16.text(ty.trait, L))}</p>`;
    box.appendChild(tr);
    // 4グループのバランス
    const gs = T16.groupScores(st.scores || {}); const max = Math.max(1, ...Object.values(gs));
    const bal = document.createElement("div"); bal.className = "card-soft";
    bal.innerHTML = `<div class="section-title">${esc(t("chara.balance"))}</div>` + T16.GROUPS.map((g) => `<div class="bal-row"><span class="bal-name" style="--g:${g.color}">${esc(T16.text(g.name, L))}</span><div class="bal-bar"><i style="width:${Math.round((gs[g.id] / max) * 100)}%;background:${g.color}"></i></div><span class="bal-val">${Math.round(gs[g.id])}</span></div>`).join("");
    const ru = T16.runnerUp(st);
    if (ru) bal.innerHTML += `<p class="muted">${esc(t("chara.runnerUp"))}: <b>${esc(typeName(ru))}</b>（${esc(T16.text(T16.byId[ru].sub, L))}）</p>`;
    box.appendChild(bal);
    // 履歴
    if (st.history?.length) {
      const h = document.createElement("div"); h.className = "card-soft";
      h.innerHTML = `<div class="section-title">${esc(t("chara.history"))}</div>` + [...st.history].reverse().map((e) => `<div class="hist-row"><span class="muted">${esc(fmtDate(e.at))}</span><b>${esc(typeName(e.typeId))}</b><span class="muted">${esc(t(e.reason === "quiz" ? "chara.historyQuiz" : "chara.historyDreams"))}</span></div>`).join("");
      box.appendChild(h);
    }
    // 16タイプ一覧
    const all = document.createElement("details"); all.className = "card-soft all-types";
    all.innerHTML = `<summary class="section-title">${esc(t("chara.allTypes"))}</summary>`;
    for (const g of T16.GROUPS) {
      const gh = document.createElement("div"); gh.className = "tag-group-title"; gh.style.setProperty("--g", g.color); gh.textContent = `${T16.text(g.name, L)} — ${T16.text(g.desc, L)}`; all.appendChild(gh);
      const grid = document.createElement("div"); grid.className = "type-grid";
      for (const id of g.types) { const c = typeCard(id); if (id === st.typeId) c.classList.add("current"); grid.appendChild(c); }
      all.appendChild(grid);
    }
    box.appendChild(all);
    const r = document.createElement("div"); r.className = "row small"; r.innerHTML = `<button class="btn ghost" id="chara-retake">${esc(t("quiz.retake"))}</button>`;
    box.appendChild(r); $("#chara-retake").onclick = () => { if (confirm(t("quiz.retakeConfirm"))) resetTo("quiz"); };
  }
  function renderIntroTypeGrid() {
    const box = $("#intro-type-grid"); if (!box) return; box.innerHTML = "";
    for (const g of T16.GROUPS) { const c = document.createElement("div"); c.className = "type-mini"; c.style.setProperty("--g", g.color); c.innerHTML = `<b>${esc(T16.text(g.name, lang()))}</b><span>${g.types.map((id) => esc(T16.text(T16.byId[id].name, lang()))).join(" / ")}</span>`; box.appendChild(c); }
  }

  // ---------- 今日の日記 ----------
  const DIARY_TAGS = ["caffeine", "alcohol", "exercise", "late_screen", "stress", "nap", "bath", "sunlight", "late_meal"];
  let diaryDraft = { mood: 3, tags: new Set(), text: "" };
  function renderDiaryTags() {
    const box = $("#diary-tags"); box.innerHTML = "";
    for (const id of DIARY_TAGS) { const b = document.createElement("button"); b.type = "button"; b.className = "chip-btn" + (diaryDraft.tags.has(id) ? " on" : ""); b.textContent = t("diary.tag." + id); b.onclick = () => { if (diaryDraft.tags.has(id)) diaryDraft.tags.delete(id); else diaryDraft.tags.add(id); b.classList.toggle("on"); }; box.appendChild(b); }
  }
  function renderDiary() {
    const today = dayKey(); const e = diaryFor(today);
    diaryDraft = { mood: e?.mood || 3, tags: new Set(e?.tags || []), text: e?.text || "" };
    $("#diary-date").textContent = fmtDay(today);
    $("#diary-text").value = diaryDraft.text;
    $$("#diary-mood button").forEach((b) => b.classList.toggle("on", Number(b.dataset.v) === diaryDraft.mood));
    renderDiaryTags();
    renderDiaryTip(e);
    const list = $("#diary-list"); list.innerHTML = "";
    const past = [...diary].sort((a, b) => (a.date < b.date ? 1 : -1));
    if (!past.length) { list.innerHTML = `<p class="muted">${esc(t("diary.empty"))}</p>`; return; }
    for (const d of past) {
      const det = document.createElement("details"); det.className = "card";
      det.innerHTML = `<summary><div><div class="date">${esc(fmtDay(d.date))}</div><div class="title">${["", "😞", "😕", "😐", "🙂", "😄"][d.mood] || ""} ${esc((d.text || "").slice(0, 40))}</div></div></summary>
        <div class="body"><p>${esc(d.text || "")}</p><div class="tags small">${(d.tags || []).map((x) => `<span class="tag">${esc(t("diary.tag." + x))}</span>`).join("")}</div>
        <div class="actions"><button class="btn ghost danger delete">${esc(t("common.delete"))}</button></div></div>`;
      det.querySelector(".delete").onclick = async () => { if (!confirm(t("diary.deleteConfirm", { date: fmtDay(d.date) }))) return; diary = diary.filter((x) => x.id !== d.id); await removeDiary(d.id); renderDiary(); renderDiaryState(); toast(t("common.deleted")); };
      list.appendChild(det);
    }
  }
  function renderDiaryTip(e) {
    const tipEl = $("#diary-tip"); if (!e) { tipEl.hidden = true; return; }
    const r = SLEEP.score({ diary: e, profile: settings.profile, analysis: dreams[0]?.analysis || null });
    const adv = SLEEP.advice({ level: typeState()?.level || r.level, factors: r.factors }, lang(), 2);
    $("#diary-tip-text").textContent = adv.map((a) => a.text).join(" "); tipEl.hidden = !adv.length;
  }
  $$("#diary-mood button").forEach((b) => (b.onclick = () => { diaryDraft.mood = Number(b.dataset.v); $$("#diary-mood button").forEach((x) => x.classList.toggle("on", x === b)); }));
  $("#diary-save").onclick = async () => {
    const today = dayKey(); const prev = diaryFor(today);
    const e = { id: prev?.id || uuid(), date: today, mood: diaryDraft.mood, tags: [...diaryDraft.tags], text: $("#diary-text").value.trim(), createdAt: prev?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    diary = [e, ...diary.filter((x) => x.date !== today)];
    await persistDiary(e);
    toast(t("diary.saved")); renderDiary(); renderDiaryState();
  };

  // ---------- アラーム ----------
  function renderAlarm() {
    $("#alarm-enable").checked = settings.alarm.enabled; $("#alarm-box").hidden = !settings.alarm.enabled;
    $("#alarm-time").value = settings.alarm.time || "07:00";
    $("#alarm-set-device").hidden = !(nativeAlarm || platform === "ios");
    $("#alarm-open-clock").hidden = platform !== "ios";
    $("#alarm-note").textContent = platform === "ios" ? t("alarm.iosNote") : isNative ? "" : t("alarm.webNote");
  }
  $("#alarm-enable").onchange = async (e) => { settings.alarm.enabled = e.target.checked; await saveSettings(); renderAlarm(); if (!settings.alarm.enabled) cancelNotify(); };
  $("#alarm-time").onchange = async (e) => { settings.alarm.time = e.target.value || "07:00"; await saveSettings(); };
  const alarmHM = () => settings.alarm.time.split(":").map(Number);
  $("#alarm-set-device").onclick = async () => {
    const [hour, minutes] = alarmHM();
    try {
      if (nativeAlarm) { await nativeAlarm.set({ hour, minutes, message: t("alarm.label"), days: [] }); toast(t("alarm.setDone", { time: settings.alarm.time })); }
      else if (platform === "ios") { window.open("clock-alarm://", "_system"); }
    } catch (e) { toast(t("alarm.fail", { msg: e.message || e }), true); }
  };
  $("#alarm-open-clock").onclick = () => { try { window.open("clock-alarm://", "_system"); } catch {} };
  let webAlarmTimer = null;
  $("#alarm-notify").onclick = async () => {
    const [hour, minute] = alarmHM();
    try {
      if (nativeNotif) {
        const p = await nativeNotif.requestPermissions(); if (p.display !== "granted") { toast(t("alarm.notifyDenied"), true); return; }
        await nativeNotif.cancel({ notifications: [{ id: 1 }] }).catch(() => {});
        await nativeNotif.schedule({ notifications: [{ id: 1, title: t("alarm.label"), body: t("alarm.notifyBody"), schedule: { on: { hour, minute }, allowWhileIdle: true }, sound: "default" }] });
        toast(t("alarm.notifyDone", { time: settings.alarm.time }));
      } else if ("Notification" in window) {
        const p = await Notification.requestPermission(); if (p !== "granted") { toast(t("alarm.notifyDenied"), true); return; }
        scheduleWebNotify(); toast(t("alarm.notifyDone", { time: settings.alarm.time }) + " " + t("alarm.webNote"));
      } else toast(t("alarm.webNote"), true);
    } catch (e) { toast(t("alarm.fail", { msg: e.message || e }), true); }
  };
  function scheduleWebNotify() {
    clearTimeout(webAlarmTimer);
    const [h, m] = alarmHM(); const now = new Date(); const at = new Date(now); at.setHours(h, m, 0, 0); if (at <= now) at.setDate(at.getDate() + 1);
    webAlarmTimer = setTimeout(() => { try { new Notification(t("alarm.label"), { body: t("alarm.notifyBody"), icon: "icons/icon-192.png" }); } catch {} scheduleWebNotify(); }, at - now);
  }
  function cancelNotify() { clearTimeout(webAlarmTimer); if (nativeNotif) nativeNotif.cancel({ notifications: [{ id: 1 }] }).catch(() => {}); }

  // ---------- 設定 ----------
  function renderSettings() {
    $("#opt-speak").checked = settings.speak;
    $("#opt-autosend").checked = settings.autosend;
    $("#opt-code").value = settings.code || "";
    $("#opt-api").value = settings.apiBase || "";
    $("#opt-apikey").value = settings.apiKey || "";
    $("#opt-ai").checked = useAI();
    $("#sr-support").textContent = speech.supported ? t("speech.support", { kind: t(nativeSR ? "speech.native" : "speech.browser") }) : t("speech.unsupported");
    renderAccount(); renderAlarm(); renderLangSwitch($("#set-lang"));
    const pf = settings.profile;
    $("#profile-info").textContent = pf ? t("set.profileLine", { name: pf.nickname, age: I18N.tv(pf.ageGroup), role: I18N.tv(pf.role), sleep: I18N.tv(pf.sleepHours), wake: I18N.tv(pf.wakeTime) }) + (pf.stressTopics?.length ? t("set.profileWorry", { topics: pf.stressTopics.map(I18N.tv).join("・") }) : "") : t("set.profileNone");
    $("#sync-info").textContent = cloudOn() ? t("set.dataCloud", { id: cloud.uid().slice(0, 8) }) : t("set.dataLocal");
    $("#app-info").textContent = t("set.appInfo", { v: APP_VERSION, platform: t(isNative ? "set.platformApp" : "set.platformWeb"), engine: t(useAI() ? "set.engineAI" : "set.engineLocal"), storage: t(cloudOn() ? "set.storageCloud" : "set.storageLocal"), err: cloud?.state.error ? t("set.fbError", { e: cloud.state.error }) : "" });
    applyChara();
  }
  $("#opt-speak").onchange = (e) => { settings.speak = e.target.checked; saveSettings(); if (!settings.speak) stopSpeaking(); };
  $("#opt-autosend").onchange = (e) => { settings.autosend = e.target.checked; saveSettings(); };
  $("#opt-code").onchange = (e) => { settings.code = e.target.value.trim(); saveSettings(); toast(t("set.codeSaved")); };
  $("#opt-api").onchange = (e) => { settings.apiBase = e.target.value.trim(); saveSettings(); if (useAI()) checkHealth(); };
  $("#opt-apikey").onchange = (e) => { settings.apiKey = e.target.value.trim(); saveSettings(); if (settings.apiKey) toast(t("set.apiKeySaved")); if (useAI()) checkHealth(); };
  $("#opt-ai").onchange = (e) => { settings.engine = e.target.checked ? "ai" : "local"; saveSettings(); if (useAI()) checkHealth(); else toast(t("set.localEngine")); renderSettings(); };
  $$(".seg-btn").forEach((b) => (b.onclick = () => { settings.chara = b.dataset.chara; saveSettings(); applyChara(); speak(t(settings.chara === "man" ? "set.charaMan" : "set.charaWoman")); }));

  // データの書き出し / 読み込み
  const ioWrap = $("#io-wrap"), ioText = $("#io-text");
  $("#export").onclick = () => {
    ioText.value = JSON.stringify({ app: "yumetan", version: APP_VERSION, exportedAt: new Date().toISOString(), dreams, diary, typeState: settings.typeState }, null, 0);
    ioWrap.hidden = false; ioText.select();
    toast(t("set.exportToast"));
  };
  $("#import-toggle").onclick = () => { ioText.value = ""; ioWrap.hidden = false; ioText.focus(); };
  $("#io-copy").onclick = async () => { try { await navigator.clipboard.writeText(ioText.value); toast(t("common.copied")); } catch { ioText.select(); toast(t("common.copyHold")); } };
  $("#io-import").onclick = async () => {
    try {
      const data = JSON.parse(ioText.value);
      const list = Array.isArray(data) ? data : data.dreams;
      if (!Array.isArray(list)) throw new Error();
      const known = new Set(dreams.map((d) => d.id));
      const added = list.filter((d) => d && d.id && d.createdAt && Array.isArray(d.messages) && !known.has(d.id));
      dreams = [...dreams, ...added].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      if (cloudOn()) { for (const d of added) await persistDream(d); } else await saveDreams();
      if (Array.isArray(data.diary)) { const kd = new Set(diary.map((d) => d.date)); const addD = data.diary.filter((d) => d && d.id && d.date && !kd.has(d.date)); diary = [...diary, ...addD]; if (cloudOn()) { for (const d of addD) await persistDiary(d); } else await saveDiaryAll(); }
      if (data.typeState && !settings.typeState) await saveTypeState(data.typeState);
      ioWrap.hidden = true; updateHomeCount(); refreshLevel({ announce: false });
      toast(t("set.imported", { n: added.length }));
    } catch { toast(t("set.importFail"), true); }
  };
  $("#wipe").onclick = async () => {
    if (!confirm(t("set.wipeConfirm"))) return;
    const ids = dreams.map((d) => d.id), dids = diary.map((d) => d.id);
    dreams = []; diary = []; currentDream = null; await saveDreams(); await saveDiaryAll(); await store.set(K.insight, null); updateHomeCount();
    if (cloudOn()) { for (const id of ids) await removeDream(id); for (const id of dids) await removeDiary(id); }
    toast(t("set.wiped"));
  };

  async function checkHealth() {
    try { const h = await api("/api/health"); $("#code-setting").hidden = !h.needsCode; if (h.needsCode && !settings.code) toast(t("set.needCode")); }
    catch { toast(t("set.healthFail"), true); }
  }

  // ---------- オンボーディング（初回のみ、登録の前） ----------
  let slideIndex = 0;
  function showSlide(i) {
    const slides = $$("#intro-slides .slide");
    slideIndex = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach((el, k) => el.classList.toggle("active", k === slideIndex));
    $$("#intro-dots i").forEach((d, k) => d.classList.toggle("on", k <= slideIndex));
    $("#intro-next").textContent = t(slideIndex === slides.length - 1 ? "common.start" : "common.next");
    $("#intro-skip").hidden = slideIndex === slides.length - 1;
    const line = slideIndex === 0 ? t("intro.line1") : slideIndex === 3 ? t("intro.line4") : "";
    const slot = slides[slideIndex].querySelector(".speech-text"); if (slot && line) slot.textContent = line;
    if (slideIndex === 2) renderIntroTypeGrid();
    renderLangSwitch($("#intro-lang"));
    window.scrollTo({ top: 0 });
  }
  async function finishIntro() {
    settings.introDone = true; await saveSettings();
    resetTo(settings.profile ? (settings.typeState ? "home" : "quiz") : "onboard");
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
    $("#ob-kicker").textContent = t(pf ? "ob.kickerEdit" : "ob.kicker");
    $("#ob-title").innerHTML = t(pf ? "ob.titleEdit" : "ob.title");
    renderLangSwitch($("#ob-lang"));
    $("#ob-nickname").value = pf?.nickname || "";
    if (pf) { $("#ob-age").value = pf.ageGroup; $("#ob-gender").value = pf.gender; $("#ob-role").value = pf.role; $("#ob-sleep").value = pf.sleepHours; $("#ob-wake").value = pf.wakeTime; }
    $$("#ob-stress input").forEach((c) => (c.checked = Boolean(pf?.stressTopics?.includes(c.value))));
    const needAccount = !cloudOn() || cloud.isAnonymous();
    $("#ob-account").hidden = !needAccount || (pf && !cloudOn());
    $("#ob-submit").textContent = t(pf ? (needAccount && cloudOn() ? "ob.submitSaveOrReg" : "ob.submitSave") : "ob.submit");
    $("#ob-skip").hidden = Boolean(pf);
    obMsg.hidden = true;
  }
  function readProfile() {
    return {
      nickname: $("#ob-nickname").value.trim(), ageGroup: $("#ob-age").value, gender: $("#ob-gender").value, role: $("#ob-role").value,
      sleepHours: $("#ob-sleep").value, wakeTime: $("#ob-wake").value,
      stressTopics: $$("#ob-stress input:checked").map((c) => c.value), lang: lang(),
      updatedAt: new Date().toISOString(),
    };
  }
  async function saveProfile(pf) {
    settings.profile = pf; await saveSettings();
    if (cloudOn()) { try { await cloud.saveProfile(pf); } catch (e) { console.warn("profile sync failed", e); } }
  }
  const afterFirstProfile = () => resetTo(settings.typeState ? "home" : "quiz");
  obForm.onsubmit = async (e) => {
    e.preventDefault();
    const pf = readProfile();
    if (!pf.nickname) { obMsg.hidden = false; obMsg.textContent = t("ob.needName"); return; }
    const email = $("#ob-email").value.trim(), pass = $("#ob-pass").value;
    $("#ob-submit").disabled = true; obMsg.hidden = true;
    try {
      const wasFirst = !settings.profile;
      await saveProfile(pf);
      if (!$("#ob-account").hidden && (email || pass)) {
        if (!cloudOn()) throw new Error(t("ob.noCloud"));
        if (!email || pass.length < 6) throw new Error(t("ob.needEmailPass"));
        await cloud.signUp(email, pass);
        $("#ob-pass").value = "";
        toast(t("ob.registered", { name: pf.nickname }));
      } else toast(t(wasFirst ? "ob.letsStart" : "common.saved", { name: pf.nickname }));
      if (wasFirst) afterFirstProfile(); else back();
    } catch (err) { obMsg.hidden = false; obMsg.textContent = authMessage(err); }
    finally { $("#ob-submit").disabled = false; }
  };
  $("#ob-skip").onclick = async () => {
    const pf = readProfile();
    if (!pf.nickname) { obMsg.hidden = false; obMsg.textContent = t("ob.needNameOnly"); return; }
    await saveProfile(pf);
    toast(t("ob.letsStart", { name: pf.nickname }));
    afterFirstProfile();
  };

  // ---------- アカウント（ログイン / ログアウト / 削除） ----------
  function renderAccount() {
    const info = $("#account-info"), actions = $("#account-actions");
    actions.innerHTML = "";
    if (!cloudOn()) { info.textContent = t("acct.noCloud"); return; }
    if (cloud.isAnonymous()) {
      info.textContent = t("acct.anon");
      const b = document.createElement("button"); b.className = "btn primary"; b.textContent = t("acct.loginBtn"); b.onclick = () => go("login"); actions.appendChild(b);
    } else {
      info.textContent = t("acct.loggedIn", { email: cloud.email() });
      const out = document.createElement("button"); out.className = "btn"; out.textContent = t("acct.logout");
      out.onclick = async () => { if (!confirm(t("acct.logoutConfirm"))) return; try { await cloud.signOut(); toast(t("acct.loggedOut")); } catch (e) { toast(authMessage(e), true); } };
      const del = document.createElement("button"); del.className = "btn danger"; del.textContent = t("acct.delete");
      del.onclick = async () => {
        if (!confirm(t("acct.deleteConfirm"))) return;
        const pw = prompt(t("acct.deletePw")); if (pw == null) return;
        try { await cloud.deleteAccount(pw); dreams = []; diary = []; currentDream = null; await store.set(K.insight, null); toast(t("acct.deleted")); }
        catch (e) { toast(authMessage(e), true); }
      };
      actions.append(out, del);
    }
  }
  const authMessage = (e) => (e?.code && I18N.has(e.code) ? t(e.code) : e?.message || String(e));
  const loginForm = $("#login-form"), loginMsg = $("#login-msg");
  let loginMode = "signin";
  function setLoginMode(m) {
    loginMode = m;
    $("#login-submit").textContent = t(m === "signup" ? "login.signup" : "login.submit");
    $("#login-signup").textContent = t(m === "signup" ? "login.toSignin" : "login.toSignup");
    $("#login-pass").autocomplete = m === "signup" ? "new-password" : "current-password";
    loginMsg.hidden = true;
  }
  $("#login-signup").onclick = () => setLoginMode(loginMode === "signup" ? "signin" : "signup");
  $("#login-reset").onclick = async () => {
    const email = $("#login-email").value.trim();
    if (!email) { loginMsg.hidden = false; loginMsg.textContent = t("login.needEmail"); return; }
    try { await cloud.resetPassword(email); loginMsg.hidden = false; loginMsg.textContent = t("login.resetSent"); }
    catch (e) { loginMsg.hidden = false; loginMsg.textContent = authMessage(e); }
  };
  loginForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!cloudOn()) { toast(t("login.noCloud"), true); return; }
    const email = $("#login-email").value.trim(), pass = $("#login-pass").value;
    $("#login-submit").disabled = true; loginMsg.hidden = true;
    try {
      if (loginMode === "signup") { await cloud.signUp(email, pass); toast(t("login.signedUp")); }
      else {
        const carry = cloud.isAnonymous() && dreams.length ? dreams.slice() : [];
        const carryD = cloud.isAnonymous() ? diary.slice() : [];
        await cloud.signIn(email, pass);
        if (carry.length && confirm(t("login.carry", { n: carry.length }))) {
          await Promise.race([cloud.ready, sleep(1000)]);
          for (const d of carry) { try { await cloud.saveDream(d); } catch {} }
          for (const d of carryD) { try { await cloud.saveDiary(d); } catch {} }
        }
        toast(t("login.done"));
      }
      $("#login-pass").value = "";
      back();
    } catch (err) { loginMsg.hidden = false; loginMsg.textContent = authMessage(err); }
    finally { $("#login-submit").disabled = false; }
  };

  // クラウド保存を有効化: 読めるか確認 → 端末内の記録を移行 → 変化を購読
  let unsubscribeCloud = null, unsubscribeDiary = null;
  async function activateCloud() {
    if (!cloudOn()) return;
    if (unsubscribeCloud) { try { unsubscribeCloud(); } catch {} unsubscribeCloud = null; }
    if (unsubscribeDiary) { try { unsubscribeDiary(); } catch {} unsubscribeDiary = null; }
    try { await cloud.loadOnce(); }
    catch (e) { cloud.state.enabled = false; cloud.state.error = e?.code || e?.message || String(e); console.warn("Firestore を使えないため端末内保存で動きます:", cloud.state.error); return; }
    try {
      try {
        const cp = await cloud.loadProfile();
        if (cp) { settings.profile = cp; if (cp.lang && cp.lang !== lang()) applyLang(cp.lang); await saveSettings(); if (current === "onboard") resetTo(settings.typeState ? "home" : "quiz"); }
        else if (settings.profile) await cloud.saveProfile(settings.profile);
        const ct = await cloud.loadTypeState();
        if (ct && (!settings.typeState || Date.parse(ct.updatedAt || 0) > Date.parse(settings.typeState.updatedAt || 0))) { settings.typeState = ct; await saveSettings(); renderCharaBadge(); if (current === "quiz") resetTo("home"); }
        else if (settings.typeState) await cloud.saveTypeState(settings.typeState);
      } catch {}
      const local = (await store.get(K.dreams, [])) || [];
      if (local.length) {
        const existing = new Set((await cloud.loadOnce()).map((d) => d.id));
        let n = 0;
        for (const d of local) if (!existing.has(d.id)) { await cloud.saveDream(d); n++; }
        await store.set(K.dreams, []);
        if (n) toast(t("cloud.migrated", { n }));
      }
      const localD = (await store.get(K.diary, [])) || [];
      if (localD.length) { for (const d of localD) { try { await cloud.saveDiary(d); } catch {} } await store.set(K.diary, []); }
      unsubscribeCloud = cloud.subscribe((list) => {
        dreams = list;
        if (currentDream) { const same = dreams.find((d) => d.id === currentDream.id); if (same) currentDream = same; }
        updateHomeCount();
        if (current === "history") renderHistory();
        if (current === "settings") renderSettings();
        if (current === "home") applyMode();
        if (current === "chara") renderChara();
      });
      unsubscribeDiary = cloud.subscribeDiary((list) => { diary = list; renderDiaryState(); if (current === "diary") renderDiary(); });
      cloud.onUser(() => { dreams = []; diary = []; currentDream = null; activateCloud(); renderSettings(); });
    } catch (e) { console.warn("cloud activate failed", e); }
  }

  // ---------- 起動 ----------
  (async () => {
    await loadSettings();
    applyLang(settings.lang || settings.profile?.lang || detectLang());
    userId = await store.get(K.user);
    if (!userId) { userId = uuid(); await store.set(K.user, userId); }
    dreams = (await store.get(K.dreams, [])) || [];
    diary = (await store.get(K.diary, [])) || [];
    mountCharas(); renderTypeTags(); renderDiaryTags();
    if (document.readyState === "loading") await new Promise((r) => document.addEventListener("DOMContentLoaded", r, { once: true }));
    cloud = window.YumetanCloud || null;
    if (cloud) cloud.ready.then(activateCloud).catch((e) => console.warn("cloud init failed", e));
    history.replaceState({ view: "home" }, "", "#home");
    renderToday(); applyMode(); renderCharaBadge(); renderDiaryState();
    if (!settings.profile) go(settings.introDone ? "onboard" : "intro", { push: false });
    else if (!settings.typeState) go("quiz", { push: false });
    say("home", greeting()); updateHomeCount();
    if (settings.alarm.enabled && !isNative && "Notification" in window && Notification.permission === "granted") scheduleWebNotify();
    if (useAI()) checkHealth();
  })();
})();
