import {
  TYPES,
  GROUPS,
  LANGUAGES,
  localized,
  typeById,
  classify,
} from "./core/types.js";
import { translator, locales, languageNames } from "./core/i18n.js";
import {
  localDate,
  validDate,
  previousDiary,
  sleepScore,
  growth,
  adviceKeys,
  validateSleep,
} from "./core/sleep.js";
import {
  read,
  write,
  normalizeRecord,
  normalizeProfile,
  parseBackup,
  mergeRecords,
} from "./core/storage.js";
import { reflect } from "./core/reflection.js";
const $ = (s) => document.querySelector(s);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const id = () => crypto.randomUUID();
const cap = window.Capacitor,
  native = cap?.isNativePlatform?.(),
  plugins = cap?.Plugins || {};
let state = { version: 4, profile: null, records: [], deleted: [] },
  options = { language: "ja", engine: "local", apiBase: "", code: "" };
let storageKey = "yumetan.v4.local",
  page = "home",
  selectedId = null,
  draft = null,
  dirty = false,
  processing = false;
let t = translator("ja"),
  quizAnswers = Array(16).fill(null),
  quizIndex = 0,
  pendingResult = null,
  cloud = null,
  syncTask = null,
  voice = null;
const language = () => options.language;
const name = (type) => localized(type.names, language());
const group = (type) => GROUPS.find((g) => g.id === type.group);
const dateText = (date) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(locales[language()], {
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short",
  });
const button = (text, action, cls = "") =>
  `<button type="button" class="btn ${cls}" data-action="${action}">${esc(t(text))}</button>`;
const input = (label, key, value = "", type = "text", attrs = "") =>
  `<label class="field"><span>${esc(t(label))}</span><input class="input" id="${key}" name="${key}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
const area = (label, key, value = "", placeholder = "") =>
  `<label class="field"><span>${esc(t(label))}</span><textarea id="${key}" name="${key}" rows="6" maxlength="20000" placeholder="${esc(placeholder)}">${esc(value)}</textarea></label>`;
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("#toast").classList.remove("visible"), 6500);
}
async function commit(next) {
  try {
    await write(storageKey, next);
    state = next;
  } catch {
    throw new Error(t("storageError"));
  }
}
const currentType = () =>
  state.profile?.typeAnswers
    ? classify(state.profile.typeAnswers, state.records)
    : null;
function avatar(type, level = 1, mini = false) {
  const index = Math.max(
      0,
      TYPES.findIndex((x) => x.id === type?.id),
    ),
    item = TYPES[index],
    color = group(item).color;
  // Original SVG placeholder family. Stable motifs distinguish all 16 types; no third-party art is embedded.
  return `<svg class="avatar level-${level || 1} ${mini ? "mini-avatar" : ""}" viewBox="0 0 240 220" role="img" aria-label="${esc(name(item))}" style="--accent:${color}">
  <circle class="halo" cx="120" cy="110" r="98" fill="${color}" opacity=".07"/><circle cx="120" cy="110" r="90" fill="none" stroke="${color}" opacity=".18" stroke-dasharray="2 8"/>
  <ellipse cx="120" cy="193" rx="60" ry="9" fill="#0d0c1c" opacity=".6"/>
  <path d="M68 180 Q60 145 68 96 Q65 56 87 45 L104 64 Q122 58 139 65 L158 45 Q176 65 172 100 Q181 153 170 180 Q146 205 120 188 Q94 204 68 180Z" fill="${color}"/>
  <path d="M83 105 Q120 82 157 105 L154 163 Q119 182 86 163Z" fill="#fff7e8" opacity=".86"/>
  <ellipse cx="100" cy="118" rx="4" ry="6" fill="#393044"/><ellipse cx="141" cy="118" rx="4" ry="6" fill="#393044"/>
  <path d="M115 132 Q121 ${level >= 4 ? 143 : 138} 127 132" fill="none" stroke="#393044" stroke-width="3" stroke-linecap="round"/>
  <ellipse cx="91" cy="132" rx="8" ry="4" fill="#d78f9d" opacity=".35"/><ellipse cx="150" cy="132" rx="8" ry="4" fill="#d78f9d" opacity=".35"/>
  <path d="M80 162 Q120 179 160 162 L157 180 Q120 197 83 181Z" fill="#343047"/><text x="120" y="180" text-anchor="middle" fill="${color}" font-size="25">${item.symbol}</text>
  ${Array.from({ length: level || 1 }, (_, i) => `<text class="star" x="${35 + i * 40}" y="${32 - Math.sin(i) * 10}" fill="${color}" font-size="${i === 2 ? 21 : 15}">✦</text>`).join("")}</svg>`;
}
function header() {
  document.documentElement.lang = language();
  document.title = `${t("brand")} / Yumetan`;
  $("#header").innerHTML =
    `<button class="brand" data-go="home">☾ ${esc(t("brand"))}<small>DREAM & GROW</small></button><label><span class="sr-only">${t("language")}</span><select id="language" class="lang">${LANGUAGES.map((l) => `<option value="${l}" ${l === language() ? "selected" : ""}>${languageNames[l]}</option>`).join("")}</select></label>`;
  $("#nav").hidden =
    !state.profile?.typeAnswers || ["quiz", "result", "onboard"].includes(page);
  $("#nav").setAttribute("aria-label", t("brand"));
  $("#nav").innerHTML = [
    ["home", "☾"],
    ["record", "✎"],
    ["diary", "▤"],
    ["history", "▦"],
    ["settings", "⚙"],
  ]
    .map(
      ([p, s]) =>
        `<button data-go="${p}" ${page === p ? 'aria-current="page"' : ""}><span aria-hidden="true">${s}</span>${t(p)}</button>`,
    )
    .join("");
  $("#language").onchange = async (e) => {
    if (page === "settings" && dirty && !confirm(t("unsaved"))) {
      e.target.value = language();
      return;
    }
    capture();
    options.language = e.target.value;
    t = translator(language());
    try {
      await write("yumetan.v4.options", options);
      if (state.profile)
        await commit({
          ...state,
          profile: { ...state.profile, language: language() },
        });
      render();
    } catch {
      toast(t("storageError"));
    }
  };
}
function render() {
  header();
  const views = {
    home: homeView,
    onboard: profileView,
    quiz: quizView,
    result: resultView,
    catalog: catalogView,
    record: recordView,
    diary: diaryView,
    history: historyView,
    detail: detailView,
    settings: settingsView,
  };
  $("#app").innerHTML = (views[page] || homeView)();
  bindForms();
}

function navigate(next, force = false) {
  if (processing && !force) return;
  if (!force && dirty && !confirm(t("unsaved"))) return;
  stopVoice();
  dirty = false;
  draft = null;
  if (!state.profile && next !== "onboard") next = "onboard";
  else if (
    state.profile &&
    !state.profile.typeAnswers &&
    !["onboard", "quiz", "result"].includes(next)
  )
    next = "quiz";
  page = next;
  history.replaceState(null, "", `#${page}`);
  render();
  window.scrollTo(0, 0);
  $("#app").focus({ preventScroll: true });
}
function profileView() {
  const p = draft || state.profile || {};
  return `<div class="narrow"><p class="eyebrow">WELCOME TO YOUR DREAM WORLD</p><h1>${t("welcome")}</h1><p class="muted">${t("profileHint")}</p><form id="profile-form" class="card">
 ${input("nickname", "nickname", p.nickname, "text", 'required maxlength="20" autocomplete="nickname"')}
 <label class="field"><span>${t("age")}</span><select id="ageGroup" class="input">${["10", "20", "30", "40", "50", "60"].map((a) => `<option value="${a === "60" ? "60代以上" : a + "代"}" ${p.ageGroup === (a === "60" ? "60代以上" : a + "代") ? "selected" : ""}>${t("age" + a)}</option>`).join("")}</select></label>
 <p class="help">${t("language")}: ${languageNames[language()]}</p><button class="btn primary full" type="submit">${t(state.profile?.typeAnswers ? "save" : "startQuiz")}</button></form><p class="help">${t("typeNote")}</p></div>`;
}
function quizView() {
  const q = TYPES[quizIndex];
  return `<div class="narrow"><p class="eyebrow">FIND YOUR DREAM TYPE</p><h1>${t("quiz")}</h1><p class="muted">${t("quizHint")}</p><div class="row between"><span>${quizIndex + 1} / 16</span><span>${Math.round(((quizIndex + 1) / 16) * 100)}%</span></div><progress class="progress" max="16" value="${quizIndex + 1}" aria-label="${t("quiz")}"></progress>
 <div class="card quiz-card"><h2>${localized(q.questions, language())}</h2><div class="quiz-answers">${[2, 1, 0].map((v, i) => `<button class="btn ${quizAnswers[quizIndex] === v ? "selected" : ""}" data-answer="${v}" aria-pressed="${quizAnswers[quizIndex] === v}">${t(["often", "sometimes", "rarely"][i])}</button>`).join("")}</div></div>
 <div class="row between">${button("back", "quiz-back", "ghost")}<button class="btn primary" data-action="quiz-next" ${quizAnswers[quizIndex] === null ? "disabled" : ""}>${t(quizIndex === 15 ? "result" : "next")}</button></div><p class="help">${t("typeNote")}</p></div>`;
}
function resultView() {
  const result = pendingResult || currentType(),
    type = typeById(result.id);
  return `<div class="narrow center"><p class="eyebrow">YOUR DREAM, YOUR CHARACTER</p><h1>${t("yourType")}</h1><div class="card accent" style="--accent:${group(type).color}">${avatar(type)}<span class="tag-label">${name(group(type))}</span><h2>${name(type)}</h2><p>${localized(type.questions, language())}</p>${result.tied ? `<p class="help">${t("tie")}</p>` : ""}</div><p>${t("characterHint")}</p>${button("begin", "begin", "primary full")}<p class="help">${t("typeNote")}</p></div>`;
}
function levelCard() {
  const value = growth(state.records, state.profile?.ageGroup);
  return `<div class="card"><p class="eyebrow">SLEEP & GROW</p><h2>${t("level")}</h2><div class="score">${value.level ?? "—"} <small>/ 5</small></div><div class="level-bars">${Array.from({ length: 5 }, (_, i) => `<i class="${i < value.level ? "on" : ""}"></i>`).join("")}</div><p class="help">${value.days ? `${value.score} / 100 · ${value.days} / 7` : t("unmeasured")}</p><p class="help">${t("levelHint")}</p></div>`;
}
function adviceCard() {
  const latest = [...state.records]
    .filter((r) => r.date <= localDate() && validateSleep(r.sleep))
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    )[0];
  const keys = adviceKeys(latest?.sleep, state.profile?.ageGroup);
  return `<div class="card"><p class="eyebrow">A GENTLE NIGHT</p><h2>${t("advice")}</h2><ul class="advice-list">${keys.map((k) => `<li>${t(k === "nightmare" ? "nightmareAdvice" : k)}</li>`).join("")}</ul><details><summary>${t("sources")}</summary><p class="help">${t("ruleText")}</p><a href="https://www.nhlbi.nih.gov/health/sleep-deprivation/healthy-sleep-habits" target="_blank" rel="noopener">NIH / NHLBI · Healthy Sleep Habits</a></details></div>`;
}
function homeView() {
  const result = currentType(),
    type = typeById(result?.id) || TYPES[0],
    value = growth(state.records, state.profile?.ageGroup);
  return `<section class="hero"><div><p class="eyebrow">${esc(dateText(localDate()))} · ${esc(state.profile?.nickname)}</p><h1>${t("hero")}</h1><p class="muted">${t("heroText")}</p><div class="row">${button("record", "record", "primary")}${button("diary", "diary", "ghost")}</div></div>${avatar(type, value.level)}</section>
 <div class="card accent character-row" style="--accent:${group(type).color}">${avatar(type, value.level, true)}<div><span class="tag-label">${name(group(type))}</span><h2>${name(type)}</h2><p class="help">${t("characterHint")}</p>${button("catalog", "catalog", "small ghost")}</div></div><div class="grid">${levelCard()}${adviceCard()}</div><div class="card" style="margin-top:22px"><div class="row between"><div><h3>${t("alarm")}</h3><span class="muted">${esc(options.alarmTime || "07:00")}</span></div>${button("alarm", "alarm", "ghost")}</div></div><p class="help">${t("typeNote")}</p>`;
}
function catalogView() {
  const active = currentType()?.id;
  return `<h1>${t("catalog")}</h1><p class="muted">${t("typeNote")}</p>${GROUPS.map(
    (g) =>
      `<h2 class="group-heading" style="--accent:${g.color}">${name(g)}</h2><div class="catalog">${TYPES.filter(
        (x) => x.group === g.id,
      )
        .map(
          (type) =>
            `<div class="type-card ${type.id === active ? "active" : ""}" style="--accent:${g.color}">${avatar(type)}<b>${name(type)}</b><p class="help">${localized(type.questions, language())}</p></div>`,
        )
        .join("")}</div>`,
  ).join(
    "",
  )}<div class="row" style="margin-top:28px">${button("retake", "retake", "ghost")}${button("home", "home", "primary")}</div>`;
}
function freshDream() {
  return {
    id: id(),
    kind: "dream",
    date: localDate(),
    text: "",
    typeTags: [],
    sleep: null,
    photo: null,
    analysis: null,
    createdAt: new Date().toISOString(),
  };
}
function themes(selected) {
  return GROUPS.map(
    (g) =>
      `<div style="--accent:${g.color}"><h3 class="group-heading">${name(g)}</h3><div class="tags">${TYPES.filter(
        (type) => type.group === g.id,
      )
        .map(
          (type) =>
            `<button type="button" class="tag" data-tag="${type.id}" aria-pressed="${selected.includes(type.id)}">${name(type)}</button>`,
        )
        .join("")}</div></div>`,
  ).join("");
}
function recordView() {
  draft ||= freshDream();
  const d = draft,
    previous = previousDiary(state.records, d.date);
  return `<div class="narrow"><p class="eyebrow">DREAM JOURNAL</p><h1>${t("recordTitle")}</h1><form id="dream-form">
 <div class="card">${input("date", "dream-date", d.date, "date", `required max="${localDate()}"`)}${area("dreamText", "dream-text", d.text, t("dreamPlaceholder"))}<div class="row">${button("voice", "voice", "small ghost")}</div><details ${d.photo ? "open" : ""}><summary>${t("photo")}</summary><p class="help">${t("photoHint")}</p><label class="field"><span>${t("photo")}</span><input type="file" id="photo-file" accept="image/jpeg,image/png,image/webp"></label>${d.photo ? `<img class="photo" src="${esc(d.photo)}" alt="${t("photoAlt")}"><div class="row">${button("recognize", "recognize", "small")}${button("removePhoto", "remove-photo", "small ghost")}</div>` : ""}</details></div>
 <div class="card"><h2>${t("tags")}</h2><p class="help">${t("tagHint")}</p>${themes(d.typeTags)}</div>
 <div class="card"><h2>${t("sleep")}</h2><label class="check"><input type="checkbox" id="include-sleep" ${d.sleep ? "checked" : ""}><span>${t("sleepOptional")}</span></label><div id="sleep-fields" ${d.sleep ? "" : "hidden"}><div class="grid">${input("hours", "hours", d.sleep?.hours ?? "", "number", 'min="0" max="24" step="0.25"')}${input("awakenings", "awakenings", d.sleep?.awakenings ?? "", "number", 'min="0" max="30" step="1"')}</div><label class="field"><span>${t("rested")}</span><select class="input" id="rested"><option value="">—</option>${[1, 2, 3, 4, 5].map((v) => `<option value="${v}" ${d.sleep?.rested === v ? "selected" : ""}>${v}</option>`).join("")}</select></label><label class="check"><input type="checkbox" id="nightmare" ${d.sleep?.nightmare ? "checked" : ""}><span>${t("nightmare")}</span></label></div><p class="help">${t("sleepNote")}</p></div>
 <div class="card"><h3>${t("previousDiary")}</h3><p class="help">${previous ? esc(previous.text.slice(0, 500)) : t("noDiary")}</p></div>
 <div class="row">${button("analyze", "analyze", "ghost")}<button type="submit" class="btn primary">${t("save")}</button></div>
 ${d.analysis ? analysisCard(d) : ""}</form></div>`;
}
function analysisCard(d) {
  const prev = previousDiary(state.records, d.date),
    tags = d.typeTags || [];
  const sameLanguage = d.analysis?.language === language();
  const common = reflect({
    ...d,
    records: state.records,
    language: language(),
  }).sharedThemes;
  return `<div class="card" style="margin-top:22px"><h2>${t("reflection")}</h2><div class="tags">${tags
    .map(typeById)
    .filter(Boolean)
    .map((type) => `<span class="tag-label">${name(type)}</span>`)
    .join(
      "",
    )}</div><p class="prose">${d.analysis?.engine === "ai" && sameLanguage ? esc(d.analysis.reply || d.analysis.summary) : t(tags.length ? "reflectionText" : "noTheme")}</p>${prev ? `<h3>${t("previousDiary")} · ${esc(dateText(prev.date))}</h3><p class="prose">${esc(prev.text)}</p><p class="help">${t("diaryContext")}</p>${common.length ? `<p>${t("sharedThemes")}: ${common.map(typeById).map(name).join(" · ")}</p>` : ""}` : `<p class="help">${t("noDiary")}</p>`}${d.sleep ? `<p>${t("level")}: ${sleepScore(d.sleep, state.profile?.ageGroup)?.level ?? "—"} / 5</p>` : ""}${button("speak", "speak", "small ghost")}</div>`;
}
function diaryView() {
  draft ||= {
    kind: "diary",
    date: localDate(),
    text:
      state.records.find((r) => r.kind === "diary" && r.date === localDate())
        ?.text || "",
  };
  return `<div class="narrow"><p class="eyebrow">A PAGE OF TODAY</p><h1>${t("diaryTitle")}</h1><p class="muted">${t("diaryHint")}</p><form id="diary-form" class="card">${input("diaryDate", "diary-date", draft.date, "date", `required max="${localDate()}"`)}${area("diaryText", "diary-text", draft.text)}<button type="submit" class="btn primary full">${t("save")}</button></form></div>`;
}
function historyView() {
  return `<h1>${t("history")}</h1><div class="row"><label class="field" style="flex:1"><span class="sr-only">${t("search")}</span><input id="search" class="input" placeholder="${t("search")}"></label><label class="field"><span class="sr-only">${t("all")}</span><select class="input" id="history-filter"><option value="all">${t("all")}</option><option value="dream">${t("dreams")}</option><option value="diary">${t("diaries")}</option></select></label></div><div id="entries" class="list">${entries()}</div>`;
}
function entries(query = "", filter = "all") {
  const list = [...state.records]
    .filter(
      (r) =>
        (filter === "all" || r.kind === filter) &&
        `${r.text} ${r.analysis?.title || ""}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
  return list.length
    ? list
        .map(
          (r) =>
            `<button class="entry" data-entry="${esc(r.id)}"><time>${esc(dateText(r.date))} · ${t(r.kind === "diary" ? "diary" : "dreams")}</time><strong>${esc((r.text || r.analysis?.title || t("sleep")).slice(0, 90))}</strong><p class="help">${(r.typeTags || []).map(typeById).filter(Boolean).map(name).join(" · ")}</p></button>`,
        )
        .join("")
    : `<p class="empty">${t("empty")}</p>`;
}
function detailView() {
  const r = state.records.find((r) => r.id === selectedId);
  if (!r) return `<p>${t("empty")}</p>`;
  return `<div class="narrow"><p class="eyebrow">${esc(dateText(r.date))}</p><h1>${t("detail")}</h1><div class="card"><p class="prose">${esc(r.text)}</p>${r.photo ? `<img class="photo" src="${esc(r.photo)}" alt="${t("photoAlt")}">` : ""}${r.sleep ? `<p class="help">${t("hours")}: ${r.sleep.hours} · ${t("awakenings")}: ${r.sleep.awakenings} · ${t("rested")}: ${r.sleep.rested}</p>` : ""}</div>${r.kind === "dream" && r.analysis ? analysisCard(r) : ""}<div class="row">${button("edit", "edit", "primary")}${button("delete", "delete", "danger ghost")}${button("history", "history", "ghost")}</div></div>`;
}
function settingsView() {
  const cloudOn = cloud?.state.enabled,
    signed = cloudOn && !cloud.isAnonymous();
  return `<div class="narrow"><h1>${t("settings")}</h1><div class="card"><h2>${t("profile")}</h2><p>${esc(state.profile?.nickname)} · ${languageNames[language()]}</p><div class="row">${button("edit", "profile", "ghost")}${button("retake", "retake", "ghost")}</div><p class="help">${t("privacy")}</p></div>
 <form id="settings-form" class="card"><h2>AI</h2><label class="check"><input type="checkbox" id="engine" ${options.engine === "ai" ? "checked" : ""}><span>${t("ai")}</span></label><p class="help">${t("aiHint")}</p>${input("apiUrl", "api-url", options.apiBase, "url", 'placeholder="https://…"')}${input("code", "access-code", options.code, "password", 'autocomplete="off"')}<div class="row"><button type="submit" class="btn primary">${t("save")}</button>${button("testConnection", "health", "ghost")}</div></form>
 <form id="alarm-form" class="card"><h2>${t("alarm")}</h2>${input("alarmTime", "alarm-time", options.alarmTime || "07:00", "time", "required")}<p class="help">${t(native && cap.getPlatform() === "android" ? "alarmHint" : "alarmManual")}</p><button type="submit" class="btn primary">${t(native && cap.getPlatform() === "android" ? "alarmOpen" : "save")}</button><p id="alarm-status" class="status" role="status"></p></form>
 <div class="card"><h2>${t("backup")}</h2><p class="help">${t("localOnly")}</p>${button("export", "export", "ghost")}<label class="field" style="margin-top:20px"><span>${t("import")}</span><input type="file" id="import-file" accept="application/json,.json"></label><p class="help">${t("importHint")}</p></div>
 <div class="card"><h2>${t("account")}</h2><p class="help">${t(cloudOn ? "cloudReady" : "localOnly")}</p>${cloudOn ? (signed ? `<p>${esc(cloud.email())}</p><div class="row">${button("signOut", "signout", "ghost")}${button("sync", "sync", "ghost")}</div>` : `<form id="account-form">${input("email", "email", "", "email", 'required autocomplete="email"')}${input("password", "password", "", "password", 'minlength="6" autocomplete="current-password"')}<div class="row"><button type="submit" class="btn primary">${t("signIn")}</button>${button("signUp", "signup", "ghost")}${button("resetPassword", "reset-password", "small ghost")}</div></form>`) : ""}</div></div>`;
}
function capture() {
  if (page === "record" && $("#dream-text")) {
    draft = {
      ...draft,
      text: $("#dream-text").value,
      date: $("#dream-date").value,
      sleep: $("#include-sleep").checked
        ? {
            hours: $("#hours").value === "" ? "" : Number($("#hours").value),
            awakenings:
              $("#awakenings").value === ""
                ? ""
                : Number($("#awakenings").value),
            rested: $("#rested").value === "" ? "" : Number($("#rested").value),
            nightmare: $("#nightmare").checked,
          }
        : null,
    };
  } else if (page === "diary" && $("#diary-text"))
    draft = {
      ...draft,
      date: $("#diary-date").value,
      text: $("#diary-text").value,
    };
  else if (page === "onboard" && $("#nickname"))
    draft = {
      ...state.profile,
      nickname: $("#nickname").value,
      ageGroup: $("#ageGroup").value,
    };
}
function bindForms() {
  $("#app")
    .querySelectorAll("input,textarea,select")
    .forEach((el) =>
      el.addEventListener("input", () => {
        if (["record", "diary", "onboard", "settings"].includes(page))
          dirty = true;
        if (page === "record" && draft) draft.analysis = null;
      }),
    );
  if ($("#profile-form"))
    $("#profile-form").onsubmit = (e) =>
      run(async () => {
        e.preventDefault();
        capture();
        if (!draft.nickname.trim()) throw new Error(t("required"));
        await commit({
          ...state,
          profile: normalizeProfile({
            ...state.profile,
            ...draft,
            language: language(),
          }),
        });
        await saveQuizDraft();
        navigate(state.profile.typeAnswers ? "home" : "quiz", true);
      });
  if ($("#dream-form"))
    $("#dream-form").onsubmit = (e) => {
      e.preventDefault();
      run(saveDream);
    };
  if ($("#include-sleep")) {
    const toggle = () => {
      const enabled = $("#include-sleep").checked;
      $("#sleep-fields").hidden = !enabled;
      $("#sleep-fields")
        .querySelectorAll("input,select")
        .forEach((el) => (el.disabled = !enabled));
    };
    toggle();
    $("#include-sleep").onchange = () => {
      capture();
      toggle();
    };
  }
  if ($("#dream-date"))
    $("#dream-date").onchange = () => {
      capture();
      if (validDate(draft.date)) render();
    };
  if ($("#photo-file"))
    $("#photo-file").onchange = (e) =>
      run(async () => {
        capture();
        disableActionButtons();
        draft.photo = await loadPhoto(e.target.files[0]);
        draft.analysis = null;
        dirty = true;
        render();
      });
  if ($("#diary-form"))
    $("#diary-form").onsubmit = (e) => {
      e.preventDefault();
      run(saveDiary);
    };
  if ($("#diary-date"))
    $("#diary-date").onchange = () => {
      const date = $("#diary-date").value;
      if (!validDate(date)) return;
      const text = $("#diary-text").value;
      if (dirty && text && !confirm(t("unsaved"))) {
        $("#diary-date").value = draft.date;
        return;
      }
      draft = {
        kind: "diary",
        date,
        text:
          state.records.find((r) => r.kind === "diary" && r.date === date)
            ?.text || "",
      };
      dirty = false;
      render();
    };
  if ($("#settings-form"))
    $("#settings-form").onsubmit = (e) => {
      e.preventDefault();
      run(saveOptions);
    };
  if ($("#alarm-form"))
    $("#alarm-form").onsubmit = (e) => {
      e.preventDefault();
      run(setAlarm);
    };
  if ($("#import-file"))
    $("#import-file").onchange = (e) =>
      run(() => importFile(e.target.files[0]));
  if ($("#search"))
    for (const selector of ["#search", "#history-filter"])
      $(selector).oninput = () => {
        $("#entries").innerHTML = entries(
          $("#search").value,
          $("#history-filter").value,
        );
      };
  if ($("#account-form"))
    $("#account-form").onsubmit = (e) => {
      e.preventDefault();
      run(() => account("signin"));
    };
}
async function run(fn) {
  if (processing) return;
  processing = true;
  try {
    await fn();
  } catch (error) {
    toast(error.userMessage || error.message || t("storageError"));
  } finally {
    processing = false;
    document.querySelectorAll("[data-working]").forEach((el) => {
      el.disabled = false;
      delete el.dataset.working;
    });
  }
}
function disableActionButtons() {
  document
    .querySelectorAll(
      "#app button, #app input, #app textarea, #app select, #language, #nav button, #header button",
    )
    .forEach((el) => {
      if (!el.disabled) {
        el.disabled = true;
        el.dataset.working = "true";
      }
    });
}
function checkDraft() {
  if (!validDate(draft.date) || draft.date > localDate())
    throw new Error(t("invalidDate"));
  if (draft.sleep && !validateSleep(draft.sleep))
    throw new Error(t("invalidSleep"));
  if (!draft.text.trim() && !draft.typeTags.length && !draft.sleep)
    throw new Error(t("emptyDream"));
}
async function analyzeDraft() {
  capture();
  checkDraft();
  disableActionButtons();
  const result = reflect({
    ...draft,
    records: state.records,
    language: language(),
  });
  if (options.engine === "ai") {
    const { analysis } = await api("/api/reflect", {
      text: draft.text,
      typeTags: result.tags,
      date: draft.date,
      diary: result.diary
        ? { date: result.diary.date, text: result.diary.text }
        : null,
    });
    draft.analysis = {
      ...analysis,
      engine: "ai",
      language: language(),
      diaryDate: result.diary?.date || null,
    };
  } else draft.analysis = result.analysis;
  draft.typeTags = result.tags;
  render();
}
async function saveDream() {
  await analyzeDraft();
  const beforeType = currentType()?.id,
    before = growth(state.records, state.profile?.ageGroup).level;
  const saved = normalizeRecord({
    ...draft,
    updatedAt: new Date().toISOString(),
  });
  await commit({
    ...state,
    records: [saved, ...state.records.filter((r) => r.id !== saved.id)],
  });
  dirty = false;
  selectedId = saved.id;
  processing = false;
  navigate("detail", true);
  const after = growth(state.records, state.profile?.ageGroup).level;
  toast(
    t(
      before && after > before
        ? "levelUp"
        : beforeType !== currentType()?.id
          ? "typeChanged"
          : "saved",
    ),
  );
  await syncCloud();
}
async function saveDiary() {
  capture();
  if (!validDate(draft.date) || draft.date > localDate())
    throw new Error(t("invalidDate"));
  if (!draft.text.trim()) throw new Error(t("required"));
  const old = state.records.find(
      (r) => r.kind === "diary" && r.date === draft.date,
    ),
    now = new Date().toISOString();
  const saved = normalizeRecord({
    ...old,
    ...draft,
    id: old?.id || id(),
    createdAt: old?.createdAt || now,
    updatedAt: now,
  });
  await commit({
    ...state,
    records: [saved, ...state.records.filter((r) => r.id !== saved.id)],
  });
  dirty = false;
  selectedId = saved.id;
  processing = false;
  navigate("detail", true);
  toast(t("saved"));
  await syncCloud();
}
async function saveQuizDraft() {
  await write(`${storageKey}.quiz`, { answers: quizAnswers, index: quizIndex });
}
async function finishQuiz() {
  if (quizAnswers.some((v) => v === null)) return;
  await commit({
    ...state,
    profile: {
      ...state.profile,
      typeAnswers: [...quizAnswers],
      typeVersion: 1,
      language: language(),
    },
  });
  pendingResult = currentType();
  dirty = false;
  processing = false;
  navigate("result", true);
  await syncCloud();
}
async function saveOptions() {
  const url = $("#api-url").value.trim().replace(/\/$/, "");
  if (url) {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" &&
      !(
        parsed.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(parsed.hostname)
      )
    )
      throw new Error(t("networkError"));
  }
  options = {
    ...options,
    engine: $("#engine").checked ? "ai" : "local",
    apiBase: url,
    code: $("#access-code").value.trim(),
  };
  await write("yumetan.v4.options", options);
  dirty = false;
  toast(t("saved"));
}
async function api(path, body) {
  const base = (
    options.apiBase ||
    window.YUMETAN_CONFIG?.apiBase ||
    ""
  ).replace(/\/$/, "");
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(base + path, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Yumetan-User": await userId(),
        "X-Yumetan-Code": options.code,
      },
      body: body
        ? JSON.stringify({ ...body, language: language() })
        : undefined,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error();
    return await response.json();
  } catch {
    throw new Error(t("networkError"));
  } finally {
    clearTimeout(timer);
  }
}
async function userId() {
  let value = await read("yumetan.userId");
  if (!value) {
    value = id();
    await write("yumetan.userId", value);
  }
  return value;
}
async function loadPhoto(file) {
  if (
    !file ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 10 * 1024 * 1024
  )
    throw new Error(t("photoError"));
  const url = URL.createObjectURL(file),
    img = new Image();
  try {
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 1000 / Math.max(img.width, img.height)),
      canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", 0.72);
    if (data.length > 500000) throw new Error();
    return data;
  } catch {
    throw new Error(t("photoError"));
  } finally {
    URL.revokeObjectURL(url);
  }
}
async function recognize() {
  capture();
  if (options.engine !== "ai") throw new Error(t("aiRequired"));
  disableActionButtons();
  const data = await api("/api/handwriting", { image: draft.photo });
  draft.text = [draft.text, data.text].filter(Boolean).join("\n");
  draft.analysis = null;
  dirty = true;
  render();
  toast(t("ocrReview"));
}
async function setAlarm() {
  const time = $("#alarm-time").value;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error(t("required"));
  options.alarmTime = time;
  await write("yumetan.v4.options", options);
  dirty = false;
  if (native && cap.getPlatform() === "android") {
    try {
      const alarm = plugins.SystemAlarm || cap.registerPlugin("SystemAlarm");
      await alarm.setAlarm({
        hour: Number(time.slice(0, 2)),
        minute: Number(time.slice(3)),
        label: t("brand"),
      });
      $("#alarm-status").textContent = t("alarmLaunched");
    } catch {
      $("#alarm-status").textContent = t("alarmManual");
    }
  } else $("#alarm-status").textContent = `${t("alarmManual")} ${time}`;
}
async function exportData() {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          app: "yumetan",
          version: 4,
          exportedAt: new Date().toISOString(),
          records: state.records,
          profile: state.profile,
        },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = `yumetan-${localDate()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function importFile(file) {
  let parsed;
  try {
    if (!file || file.size > 30 * 1024 * 1024) throw new Error();
    parsed = parseBackup(JSON.parse(await file.text()));
  } catch {
    throw new Error(t("importError"));
  }
  const existing = new Set(state.records.map((r) => r.id)),
    records = [
      ...state.records,
      ...parsed.records.filter((r) => !existing.has(r.id)),
    ];
  await commit({ ...state, records, profile: state.profile || parsed.profile });
  toast(t("saved"));
  render();
  await syncCloud();
}
function syncCloud() {
  if (syncTask) return syncTask;
  syncTask = performSync().finally(() => {
    syncTask = null;
  });
  return syncTask;
}
async function performSync() {
  if (!cloud?.state.enabled) return;
  // Anonymous account records are also scoped by uid, preventing account-to-account leakage.
  const syncKey = storageKey,
    uid = cloud.uid();
  try {
    const [remote, remoteProfile] = await Promise.all([
      cloud.loadOnce(),
      cloud.loadProfile(),
    ]);
    if (syncKey !== storageKey || uid !== cloud.uid()) return;
    const merged = mergeRecords(state.records, remote, state.deleted);
    await commit({
      ...state,
      records: merged,
      profile: state.profile || normalizeProfile(remoteProfile),
    });
    for (const deleted of state.deleted) await cloud.deleteDream(deleted);
    for (const record of merged) {
      const { photo, ...payload } = record;
      await cloud.saveDream(payload);
    }
    if (state.profile) await cloud.saveProfile(state.profile);
    await commit({ ...state, deleted: [] });
  } catch {
    toast(t("syncError"));
  }
}
async function account(mode) {
  const email = $("#email")?.value.trim(),
    password = $("#password")?.value;
  try {
    disableActionButtons();
    if (syncTask) await syncTask;
    if (mode === "reset") {
      await cloud.resetPassword(email);
      toast(t("resetSent"));
      return;
    }
    if (mode === "signup") {
      if (
        !$("#account-form").reportValidity() ||
        !password ||
        password.length < 6
      )
        return;
      await cloud.signUp(email, password);
      await syncCloud();
    } else if (mode === "signin") {
      if (!email || !password) return;
      await cloud.signIn(email, password);
      await switchAccount();
    } else {
      await cloud.signOut();
      await switchAccount();
    }
    dirty = false;
    processing = false;
    navigate(
      state.profile?.typeAnswers
        ? "settings"
        : state.profile
          ? "quiz"
          : "onboard",
      true,
    );
  } catch {
    throw new Error(t("accountError"));
  }
}
async function switchAccount() {
  storageKey = `yumetan.v4.${cloud.uid()}`;
  await write("yumetan.v4.active", storageKey);
  const cached = await read(storageKey),
    remoteProfile = await cloud.loadProfile();
  state = cached || {
    version: 4,
    profile: normalizeProfile(remoteProfile),
    records: [],
    deleted: [],
  };
  if (remoteProfile) state.profile = normalizeProfile(remoteProfile);
  if (state.profile?.language) {
    options.language = state.profile.language;
    t = translator(language());
  }
  const progress = await read(`${storageKey}.quiz`);
  quizAnswers =
    progress?.answers?.length === 16 ? progress.answers : Array(16).fill(null);
  quizIndex = Math.max(0, Math.min(15, progress?.index || 0));
  draft = null;
  await syncCloud();
}
async function startVoice() {
  if (voice) {
    stopVoice();
    return;
  }
  const append = (text) => {
    const el = $("#dream-text");
    if (el) {
      el.value += (el.value ? " " : "") + text;
      dirty = true;
      draft.analysis = null;
    }
  };
  if (native && plugins.SpeechRecognition) {
    const sr = plugins.SpeechRecognition,
      perm = await sr.requestPermissions();
    if (perm.speechRecognition !== "granted") throw new Error(t("voiceError"));
    const listener = await sr.addListener("partialResults", (e) => {
      if (voice) voice.latest = e.matches?.[0] || "";
    });
    voice = {
      stop: async () => {
        const last = voice?.latest;
        voice = null;
        await sr.stop();
        await listener.remove();
        if (last) append(last);
      },
    };
    await sr.start({
      language: locales[language()],
      partialResults: true,
      popup: false,
    });
  } else {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) throw new Error(t("voiceError"));
    const sr = new SR();
    sr.lang = locales[language()];
    sr.continuous = true;
    sr.interimResults = false;
    sr.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++)
        if (e.results[i].isFinal) append(e.results[i][0].transcript);
    };
    sr.onerror = () => {
      toast(t("voiceError"));
      stopVoice();
    };
    sr.onend = () => {
      voice = null;
      const b = $("[data-action=voice]");
      if (b) b.textContent = t("voice");
    };
    voice = sr;
    sr.start();
  }
  $("[data-action=voice]").textContent = t("stop");
}
function stopVoice() {
  if (voice) {
    const ref = voice;
    ref.stop();
    voice = null;
  }
  const b = $("[data-action=voice]");
  if (b) b.textContent = t("voice");
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}
async function speak() {
  const record =
    page === "record" ? draft : state.records.find((r) => r.id === selectedId);
  const text =
    record?.analysis?.engine === "ai" && record.analysis.language === language()
      ? record.analysis.reply
      : t(record?.typeTags?.length ? "reflectionText" : "noTheme");
  if (native && plugins.TextToSpeech)
    await plugins.TextToSpeech.speak({ text, lang: locales[language()] });
  else if (window.speechSynthesis) {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = locales[language()];
    speechSynthesis.speak(utterance);
  }
}
const actions = {
  home: () => navigate("home"),
  record: () => navigate("record"),
  diary: () => navigate("diary"),
  history: () => navigate("history"),
  catalog: () => navigate("catalog"),
  profile: () => navigate("onboard"),
  begin: () => navigate("home", true),
  alarm: () => {
    navigate("settings");
    $("#alarm-form")?.scrollIntoView({ behavior: "smooth" });
  },
  retake: async () => {
    quizAnswers = Array(16).fill(null);
    quizIndex = 0;
    pendingResult = null;
    await saveQuizDraft();
    navigate("quiz", true);
  },
  "quiz-back": () => {
    if (quizIndex > 0) {
      quizIndex--;
      render();
    } else navigate(state.profile?.typeAnswers ? "catalog" : "onboard", true);
  },
  "quiz-next": async () => {
    if (quizAnswers[quizIndex] === null) return;
    if (quizIndex === 15) await finishQuiz();
    else {
      quizIndex++;
      await saveQuizDraft();
      render();
    }
  },
  analyze: analyzeDraft,
  recognize,
  "remove-photo": () => {
    capture();
    draft.photo = null;
    dirty = true;
    render();
  },
  voice: startVoice,
  speak,
  health: async () => {
    await saveOptions();
    const data = await api("/api/health");
    toast(t(data.aiConfigured ? "aiReady" : "aiMissing"));
  },
  export: exportData,
  sync: syncCloud,
  signup: () => account("signup"),
  signout: () => account("signout"),
  "reset-password": () => account("reset"),
  edit: () => {
    const r = state.records.find((r) => r.id === selectedId);
    processing = false;
    navigate(r.kind === "diary" ? "diary" : "record");
    draft = structuredClone(r);
    render();
  },
  delete: async () => {
    if (!confirm(t("deleteConfirm"))) return;
    await commit({
      ...state,
      records: state.records.filter((r) => r.id !== selectedId),
      deleted: [...state.deleted, selectedId],
    });
    processing = false;
    navigate("history", true);
    await syncCloud();
  },
};
document.addEventListener("click", (event) => {
  const el = event.target.closest("button");
  if (!el || el.disabled) return;
  if (el.dataset.go) {
    navigate(el.dataset.go);
    return;
  }
  if (el.dataset.entry) {
    selectedId = el.dataset.entry;
    navigate("detail");
    return;
  }
  if (el.dataset.tag) {
    capture();
    const value = el.dataset.tag;
    draft.typeTags = draft.typeTags.includes(value)
      ? draft.typeTags.filter((x) => x !== value)
      : [...draft.typeTags, value];
    draft.analysis = null;
    dirty = true;
    el.setAttribute("aria-pressed", String(draft.typeTags.includes(value)));
    return;
  }
  if (el.dataset.answer != null) {
    quizAnswers[quizIndex] = Number(el.dataset.answer);
    run(async () => {
      await saveQuizDraft();
      render();
    });
    return;
  }
  if (el.dataset.action) {
    const action = actions[el.dataset.action];
    if (action) {
      if (
        [
          "home",
          "record",
          "diary",
          "history",
          "catalog",
          "profile",
          "begin",
          "alarm",
          "edit",
          "quiz-back",
        ].includes(el.dataset.action)
      )
        action();
      else run(action);
    }
  }
});
window.addEventListener("beforeunload", (event) => {
  if (dirty) {
    event.preventDefault();
    event.returnValue = "";
  }
});
window.addEventListener("popstate", () => navigate("home"));
async function boot() {
  try {
    const old = await read("yumetan.settings", {}),
      savedOptions = await read("yumetan.v4.options");
    options = {
      ...options,
      ...(savedOptions || {
        apiBase: old.apiBase || "",
        code: old.code || "",
        language: old.profile?.language || "ja",
      }),
    };
    if (!LANGUAGES.includes(options.language)) options.language = "ja";
    t = translator(language());
    storageKey = await read("yumetan.v4.active", "yumetan.v4.local");
    state = await read(storageKey);
    if (!state) {
      const legacy = await read("yumetan.dreams", []);
      state = {
        version: 4,
        profile: normalizeProfile(old.profile),
        records: legacy.map(normalizeRecord),
        deleted: [],
      };
      await commit(state);
    }
    // Resolve account scope before exposing editable UI. If offline, keep the last
    // local account scope and do not attach a late cloud connection in the background.
    cloud = window.YumetanCloud;
    if (cloud) {
      let timer;
      const ready = await Promise.race([
        cloud.ready,
        new Promise((resolve) => {
          timer = setTimeout(() => resolve(null), 3000);
        }),
      ]);
      clearTimeout(timer);
      if (!ready?.enabled) cloud = null;
      else {
        const key = `yumetan.v4.${cloud.uid()}`;
        const existing = await read(key);
        const adopted = await read("yumetan.v4.cloud-adopted", false);
        state =
          existing ||
          (!adopted
            ? state
            : { version: 4, profile: null, records: [], deleted: [] });
        const oldProgress = await read(`${storageKey}.quiz`);
        storageKey = key;
        await commit(state);
        await write("yumetan.v4.active", key);
        if (!adopted && oldProgress) await write(`${key}.quiz`, oldProgress);
        await write("yumetan.v4.cloud-adopted", true);
      }
    }
    const progress = await read(`${storageKey}.quiz`);
    if (
      progress?.answers?.length === 16 &&
      progress.answers.every((v) => v === null || [0, 1, 2].includes(v))
    ) {
      quizAnswers = progress.answers;
      quizIndex = Math.max(0, Math.min(15, progress.index || 0));
    }
    page = state.profile
      ? state.profile.typeAnswers
        ? "home"
        : "quiz"
      : "onboard";
    render();
    if (cloud)
      syncCloud().then(() => {
        if (
          !dirty &&
          !processing &&
          ["home", "quiz", "onboard"].includes(page)
        ) {
          page = state.profile
            ? state.profile.typeAnswers
              ? "home"
              : "quiz"
            : "onboard";
          render();
        }
      });
  } catch {
    $("#app").textContent = t("storageError");
  }
}
await boot();
if ("serviceWorker" in navigator && !native)
  navigator.serviceWorker.register("sw.js").catch(() => {});
