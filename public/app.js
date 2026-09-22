import { loadingMarkup, beginLoading } from "./core/loading.js";
import {
  confirmDiscard,
  pickDate,
  bindSlideNavigation,
  shiftDay,
} from "./core/interface.js";
import { wrapJapaneseLabels } from "./core/ui-text.js";
import { TYPE_FEATURES } from "./core/type-features.js";
import { authText, authError } from "./core/auth-i18n.js";
import { importGuest } from "./core/account-sync.js";
import {
  startNativeAuth,
  finishNativeAuth,
  cancelNativeAuth,
  lineNativeAvailable,
  lineNativeLogin,
  appleNativeAvailable,
  appleNativeLogin,
  googleNativeAvailable,
  googleNativeLogin,
} from "./core/native-auth.js";
import { createCommunity, communityText } from "./community.js";
import { createPurchases } from "./core/purchases.js";
import { canSaveRecord, PLANS } from "./core/plans.js";
import {
  DEFAULT_CHARACTER_SET,
  CHARACTER_SETS,
  normalizeCharacterSet,
  allowedCharacterSet,
  characterSetById,
  characterById as getCharacter,
} from "./core/characters.js";
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
  validateSleep,
  previousDate,
} from "./core/sleep.js";
import { dreamLevel } from "./core/level.js";
import {
  read,
  migrateLegacy,
  legacyAnswers,
  write,
  normalizeRecord,
  normalizeProfile,
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
const APP_VERSION = "4.8.0";
const cap = window.Capacitor,
  native = cap?.isNativePlatform?.(),
  plugins = cap?.Plugins || {};
let state = { version: 4, profile: null, records: [], deleted: [] },
  options = {
    language: "ja",
    apiBase: "",
    code: "",
    characterSet: DEFAULT_CHARACTER_SET,
    planCache: null,
  };
let storageKey = "yumetan.v4.local",
  page = "home",
  journalDate = localDate(),
  selectedId = null,
  catalogGroup = "all",
  selectedType = null,
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
let pendingGuestKey = null;
let authChanging = false,
  stopCloudWatch = null,
  syncStatus = "pending",
  syncAgain = false;
const displayLanguage = () =>
  ["intro", "welcome-login"].includes(page) ? "ja" : language();
const at = (key) => authText(key, displayLanguage());
const language = () => options.language;
const ct = (key) => communityText(key, language());
const signedIn = () => Boolean(cloud?.state.enabled && !cloud.isAnonymous());
// The plan used for display-only perks (character collections, AI buttons).
// Quotas still follow the server-verified plan; the cache only bridges offline
// moments for a user the server already confirmed as paid on this account.
function displayPlan() {
  const live = social.plan();
  if (live !== "free") return live;
  const cached = options.planCache;
  return signedIn() &&
    cached &&
    cached.uid === cloud.uid() &&
    ["starter", "standard"].includes(cached.plan) &&
    Number(cached.paidUntil) > Date.now()
    ? cached.plan
    : "free";
}
const effectiveSet = () =>
  allowedCharacterSet(options.characterSet, displayPlan());
const characterById = (id) => getCharacter(id, effectiveSet());
const purchases = createPurchases({
  cap,
  plugins,
  config: window.YUMETAN_CONFIG,
});
const social = createCommunity({
  api,
  purchases,
  uid: () => cloud?.uid() || null,
  language,
  esc,
  navigate: (next) => {
    processing = false;
    navigate(next);
  },
  render,
  toast,
  run: (fn) =>
    run(async () => {
      disableActionButtons();
      await fn();
    }),
  markSaved: () => {
    dirty = false;
  },
  signedIn: () => Boolean(cloud?.state.enabled && !cloud.isAnonymous()),
  nickname: () => state.profile?.nickname || "Dreamer",
  character: (type, set) =>
    type ? getCharacter(type, set) : { setId: effectiveSet() },
  currentType: () => currentType()?.id || "observer",
  isNative: () => Boolean(native),
});
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
  `<label class="field"><span>${esc(t(label))}</span><textarea id="${key}" name="${key}" rows="3" maxlength="20000" placeholder="${esc(placeholder)}">${esc(value)}</textarea></label>`;
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("#toast").classList.remove("visible"), 6500);
}
async function commit(next, fromCloud = false) {
  if (
    !fromCloud &&
    next.profile &&
    JSON.stringify(next.profile) !== JSON.stringify(state.profile)
  )
    next = {
      ...next,
      profile: { ...next.profile, updatedAt: new Date().toISOString() },
    };
  if (!fromCloud) syncStatus = "pending";
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
function avatar(type, level = null, mini = false, setId = effectiveSet()) {
  const item = typeById(type?.id) || TYPES[0],
    character = getCharacter(item.id, setId);
  const measured = Number.isInteger(level) && level >= 1 && level <= 5;
  return `<figure class="avatar level-${measured ? level : 0} ${mini ? "mini-avatar" : ""}" style="--accent:${group(item).color}" data-character="${item.id}" data-character-set="${normalizeCharacterSet(setId)}">
    <img class="character-art" src="${character.image}" width="768" height="768" alt="${esc(name(character))} · ${esc(name(item))}" decoding="async">
    <span class="character-fallback" hidden role="img" aria-label="${esc(name(character))}">${item.symbol}</span>
    ${measured ? `<figcaption class="character-stars" aria-label="${esc(t("level"))} ★${level} / 5">${Array.from({ length: 5 }, (_, i) => `<span aria-hidden="true" class="${i < level ? "lit" : ""}">✦</span>`).join("")}</figcaption>` : ""}
  </figure>`;
}
function characterStory(type) {
  const character = characterById(type.id);
  return `<p class="character-title">${esc(localized(character.titles, language()))}</p><p class="character-story">${esc(localized(character.stories, language()))}</p><blockquote class="character-quote">${esc(localized(character.quotes, language()))}</blockquote>`;
}
// A failed asset must not leave a broken-image icon or hide the character's identity.
$("#app").addEventListener(
  "error",
  (event) => {
    if (!event.target.matches?.(".character-art")) return;
    event.target.hidden = true;
    event.target.nextElementSibling.hidden = false;
  },
  true,
);

// Line icons for the floating tab bar and the header. Stroke inherits currentColor.
const icon = (paths) =>
  `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICONS = {
  home: icon('<path d="M3.5 11.2 12 4l8.5 7.2"/><path d="M5.5 10v10h13V10"/>'),
  record: icon(
    '<path d="M19.5 14.2A7.5 7.5 0 0 1 9.8 4.5a7.5 7.5 0 1 0 9.7 9.7z"/><path d="M17.5 3.5v3M16 5h3"/>',
  ),
  diary: icon(
    '<path d="M6 3.5h8.5L19 8v12.5H6z"/><path d="M14.5 3.5V8H19"/><path d="M9 12.5h6M9 16h6"/>',
  ),
  community: icon(
    '<circle cx="9" cy="8.5" r="3.3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9.5" r="2.4"/><path d="M15.5 14.6a4.6 4.6 0 0 1 5.5 4.6"/>',
  ),
  settings: icon(
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  ),
};
// Tab order also defines the swipe order on the floating bar.
const NAV = ["home", "record", "diary", "community"];
const navLabel = (p) => (p === "community" ? ct("community") : t(p));
function header() {
  document.documentElement.lang = displayLanguage();
  document.title = `${t("brand")} / Yumetan`;
  const ready = Boolean(state.profile?.typeAnswers);
  $("#header").innerHTML =
    `<button class="brand" data-go="home">☾ ${esc(t("brand"))}</button>` +
    (ready
      ? `<button type="button" class="icon-btn" data-go="settings" aria-label="${esc(t("settings"))}" ${page === "settings" ? 'aria-current="page"' : ""}>${ICONS.settings}</button>`
      : "");
  const nav = $("#nav");
  nav.hidden =
    !ready ||
    ["quiz", "result", "onboard", "intro", "welcome-login"].includes(page);
  nav.setAttribute("aria-label", t("brand"));
  const activePage =
    { "dream-days": "record", "diary-days": "diary" }[page] || page;
  const active = NAV.indexOf(activePage);
  nav.dataset.active = active;
  nav.style.setProperty("--nav-index", Math.max(0, active));
  nav.style.setProperty("--nav-count", NAV.length);
  nav.innerHTML = `<div class="nav-track"><span class="nav-indicator" aria-hidden="true"></span>${NAV.map(
    (p) =>
      `<button type="button" data-go="${p}" aria-label="${esc(navLabel(p))}" title="${esc(navLabel(p))}" ${activePage === p ? 'aria-current="page"' : ""}>${ICONS[p]}</button>`,
  ).join("")}</div>`;
}
bindSlideNavigation($("#nav"), navigate);
// Swiping in from the left edge turns the page back: the current view follows
// the finger like a page being lifted, flips away, and the previous page slides
// in. A quick edge flick without movement events still goes back.
function bindEdgeSwipe() {
  const app = $("#app");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let start = null,
    dragging = false,
    animating = false;
  const begin = (x, y, target) => {
    if (animating) return;
    start =
      x <= 32 && !target.closest?.("nav, input, textarea, select")
        ? { x, y }
        : null;
    dragging = false;
  };
  const move = (x, y) => {
    if (!start) return;
    const dx = x - start.x,
      dy = Math.abs(y - start.y);
    if (!dragging) {
      if (dy > 40 && dx < 24) {
        start = null;
        return;
      }
      if (dx < 12 || !hasBack() || processing) return;
      dragging = true;
      app.classList.add("page-dragging");
    }
    const shift = Math.max(0, dx),
      progress = Math.min(1, shift / Math.max(320, innerWidth));
    app.style.setProperty("--turn-x", `${shift}px`);
    app.style.setProperty("--turn-deg", `${(-progress * 16).toFixed(2)}deg`);
    if (!reduced)
      app.style.transform = `perspective(1200px) translateX(${shift}px) rotateY(${-progress * 16}deg)`;
  };
  const end = (x, y) => {
    if (!start) return;
    const dx = x - start.x,
      dy = Math.abs(y - start.y);
    start = null;
    const back = dx > 70 && dy < 80 && hasBack() && !processing;
    if (!dragging) {
      if (back) goBack();
      return;
    }
    dragging = false;
    app.classList.remove("page-dragging");
    if (!back || reduced) {
      app.classList.add("page-settling");
      app.style.transform = "";
      setTimeout(() => app.classList.remove("page-settling"), 220);
      if (back) goBack();
      return;
    }
    animating = true;
    app.style.transform = "";
    app.classList.add("page-turn-out");
    setTimeout(async () => {
      app.classList.remove("page-turn-out");
      await goBack();
      app.classList.add("page-turn-in");
      setTimeout(() => {
        app.classList.remove("page-turn-in");
        animating = false;
      }, 320);
    }, 230);
  };
  const cancel = () => {
    if (dragging) {
      dragging = false;
      app.classList.remove("page-dragging");
      app.style.transform = "";
    }
    start = null;
  };
  document.addEventListener(
    "touchstart",
    (e) => begin(e.touches[0].clientX, e.touches[0].clientY, e.target),
    { passive: true },
  );
  document.addEventListener(
    "touchmove",
    (e) => move(e.touches[0].clientX, e.touches[0].clientY),
    { passive: true },
  );
  document.addEventListener(
    "touchend",
    (e) => end(e.changedTouches[0].clientX, e.changedTouches[0].clientY),
    { passive: true },
  );
  document.addEventListener("touchcancel", cancel, { passive: true });
  document.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") begin(e.clientX, e.clientY, e.target);
  });
  document.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse") move(e.clientX, e.clientY);
  });
  document.addEventListener("pointerup", (e) => {
    if (e.pointerType === "mouse") end(e.clientX, e.clientY);
  });
}
bindEdgeSwipe();
let fitFrame;
function updateHomeFit() {
  cancelAnimationFrame(fitFrame);
  fitFrame = requestAnimationFrame(() => {
    document.body.classList.remove("home-dense", "home-reflow");
    if (page !== "home") return;
    const fits = () =>
      [
        ...document.querySelectorAll(
          ".home-dashboard > *, .home-dashboard .btn, .home-dashboard .score, .home-dashboard .character-art, .home-dashboard .character-link, .home-dashboard .character-stars",
        ),
      ].every((el) => {
        const r = el.getBoundingClientRect(),
          main = $("#app").getBoundingClientRect();
        return (
          r.top >= main.top - 1 &&
          r.bottom <= main.bottom + 1 &&
          r.right <= innerWidth + 1 &&
          r.left >= -1 &&
          (!el.closest(".character-row") ||
            el === el.closest(".character-row") ||
            (r.top >=
              el.closest(".character-row").getBoundingClientRect().top &&
              r.bottom <=
                el.closest(".character-row").getBoundingClientRect().bottom))
        );
      }) && $("#app").scrollHeight <= $("#app").clientHeight + 1;
    if (!fits()) document.body.classList.add("home-dense");
    if (!fits()) document.body.classList.add("home-reflow");
  });
}
window.addEventListener("resize", updateHomeFit);
$("#app").addEventListener(
  "load",
  (event) => {
    if (page === "home" && event.target.matches(".character-art"))
      updateHomeFit();
  },
  true,
);
function render() {
  t = translator(displayLanguage());
  header();
  document.body.dataset.screen = page;
  const views = {
    home: homeView,
    onboard: profileView,
    intro: introductionView,
    "welcome-login": introductionLoginView,
    quiz: quizView,
    result: resultView,
    catalog: catalogView,
    "type-detail": typeDetailView,
    record: recordView,
    diary: diaryView,
    "dream-days": () => journalView("dream"),
    "diary-days": () => journalView("diary"),
    detail: detailView,
    settings: settingsView,
    community: () => social.view("community"),
    plans: () => social.view("plans"),
    "plan-details": () => social.view("plan-details"),
    share: () => social.view("share"),
    "community-post": () => social.view("community-post"),
  };
  $("#app").dataset.page = page;
  $("#app").innerHTML =
    (hasBack()
      ? `<button type="button" class="back-link" data-action="back">← ${esc(pageTitle(backTarget()) || t("back"))}</button>`
      : "") + (views[page] || homeView)();
  wrapJapaneseLabels($("#app"), displayLanguage());
  updateHomeFit();
  bindForms();
  bindLanguage();
  social.bind();
  document.querySelectorAll("[data-catalog-group]").forEach(
    (el) =>
      (el.onclick = () => {
        catalogGroup = el.dataset.catalogGroup;
        render();
        document
          .querySelector(`[data-catalog-group="${catalogGroup}"]`)
          ?.focus({ preventScroll: true });
      }),
  );
  document.querySelectorAll("[data-type-detail]").forEach(
    (el) =>
      (el.onclick = () => {
        selectedType = el.dataset.typeDetail;
        navigate("type-detail");
      }),
  );
}

// Root pages sit on the tab bar (plus Settings). Every other page shows a
// "← previous page" link; the stack remembers where the user came from and
// PARENTS covers a page opened directly (reload, deep link).
const ROOTS = [...NAV, "settings"];
const PARENTS = {
  "dream-days": "record",
  "diary-days": "diary",
  catalog: "home",
  "type-detail": "catalog",
  detail: "record",
  plans: "settings",
  "plan-details": "plans",
  share: "detail",
  "community-post": "community",
  onboard: "settings",
};
let navStack = [];
function pageTitle(p) {
  return {
    "dream-days": t("dreamDays"),
    "diary-days": t("diaryDays"),
    home: t("home"),
    record: t("recordTitle"),
    diary: t("diaryTitle"),
    community: ct("community"),
    settings: t("settings"),
    catalog: t("catalog"),
    "type-detail": t("catalog"),
    detail: t("detail"),
    plans: ct("plans"),
    "plan-details": ct("plans"),
    share: ct("share"),
    "community-post": ct("community"),
    onboard: t("profile"),
  }[p];
}
const hasBack = () =>
  !ROOTS.includes(page) &&
  !["quiz", "result", "intro", "welcome-login"].includes(page) &&
  !(page === "onboard" && !state.profile?.typeAnswers);
function backTarget() {
  const prev = navStack.at(-1);
  if (prev && prev !== page) return prev;
  if (page === "detail") {
    const r = state.records.find((r) => r.id === selectedId);
    return r?.kind === "diary" ? "diary" : "record";
  }
  return PARENTS[page] || "home";
}
async function goBack() {
  if (!hasBack()) return;
  const target = backTarget(),
    record =
      page === "detail" ? state.records.find((r) => r.id === selectedId) : null;
  processing = false;
  if (!(await navigate(target, false, true))) return;
  navStack.pop();
  // Returning to a journal from an entry reopens that entry's date.
  if (record && page === target && ["record", "diary"].includes(target)) {
    draft =
      record.kind === "diary"
        ? diaryDraft(record.date)
        : dreamDraft(record.date, record.id);
    render();
  }
}
async function navigate(next, force = false, back = false) {
  if (next === page && !force) return true;
  if (processing && !force) return false;
  if (!force && dirty && !(await confirmDiscard(t))) return false;
  stopVoice();
  social.leave();
  dirty = false;
  draft = null;
  if (quotaDraft && quotaDraft.page === next) {
    draft = quotaDraft.draft;
    dirty = true;
    quotaDraft = null;
  } else if (quotaDraft && !["plans", "plan-details"].includes(next))
    quotaDraft = null;
  const first = firstRunPage();
  if (first !== "home") {
    // Introduction, login and registration steps cannot be skipped.
    const allowed = first === "quiz" ? ["quiz", "result", "onboard"] : [first];
    if (!allowed.includes(next)) next = first;
  }
  if (ROOTS.includes(next)) navStack = [];
  else if (!back && next !== page && !["quiz", "result"].includes(page))
    navStack.push(page);
  if (navStack.length > 20) navStack = navStack.slice(-20);
  page = next;
  // Forward moves add a history entry so the browser/Android back button works.
  if (back || ROOTS.includes(page)) history.replaceState(null, "", `#${page}`);
  else history.pushState(null, "", `#${page}`);
  render();
  window.scrollTo(0, 0);
  $("#app").focus({ preventScroll: true });
  if (["community", "plans", "plan-details", "share"].includes(page))
    social.enter(
      page,
      state.records.find((r) => r.id === selectedId),
    );
  return true;
}

// Records never live only on the device: whenever Firebase is configured, an
// account is required before registration. Order for a new user:
// introduction → login → registration → 16-type quiz → home.
const cloudConfigured = () =>
  Boolean(window.FIREBASE_CONFIG?.apiKey) || Boolean(cloud);
function firstRunPage() {
  const phase = options.introduction?.phase;
  // An account that finished setup goes straight in (also while offline).
  if (state.profile?.typeAnswers && (signedIn() || !cloud)) return "home";
  if (!state.profile && phase !== "login" && phase !== "done") return "intro";
  if (cloudConfigured() && !signedIn()) return "welcome-login";
  if (!state.profile) return "onboard";
  return "quiz";
}
async function saveIntroduction(introduction) {
  const next = { ...options, introduction };
  await write("yumetan.v4.options", next);
  options = next;
}
function introductionView() {
  const step = Math.max(0, Math.min(3, options.introduction?.step || 0));
  const arts = [
    `<div class="intro-moon">☾</div><div class="intro-paper"><i></i><i></i><i></i><span>✦</span></div>`,
    `<div class="intro-journal"><span>♡</span><i></i><i></i><i></i></div><span class="intro-spark">✦</span>`,
    `<img class="intro-character" src="${getCharacter("challenge", "animal").image}" width="768" height="768" alt=""><span class="intro-badge">16 TYPES</span>`,
    `<div class="intro-growth"><span>Lv.1</span><b>✦</b><span>Lv.2</span><div class="intro-meter"><i></i></div></div>`,
  ];
  return `<section class="introduction narrow" lang="ja" data-intro-step="${step}"><div class="intro-toolbar"><button type="button" class="intro-back" data-action="intro-back" aria-label="戻る" ${step === 0 ? 'disabled aria-hidden="true"' : ""}><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="m14 6-6 6 6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="intro-progress" role="group" aria-label="${esc(t("introProgress"))}">${Array.from({ length: 4 }, (_, i) => `<span class="intro-dot ${i === step ? "current" : ""}" aria-label="${i + 1} / 4" ${i === step ? 'aria-current="step"' : ""}></span>`).join("")}</div><button type="button" class="intro-skip" data-action="intro-skip">${t("introSkip")}</button></div><div class="intro-slide"><div class="intro-art intro-art-${step}" aria-hidden="true">${arts[step]}</div><div class="intro-copy" aria-live="polite"><p class="eyebrow">${step + 1} / 4</p><h1 tabindex="-1">${t(`intro${step + 1}Title`)}</h1><p>${t(`intro${step + 1}Text`)}</p></div></div><div class="intro-actions"><button type="button" class="btn primary" data-action="intro-next">${t(step === 3 ? (cloudConfigured() ? "introLogin" : "introStart") : "next")}<span aria-hidden="true"> →</span></button></div></section>`;
}
function introductionLoginView() {
  return `<section class="narrow intro-login"><h1>${t("signIn")}</h1><p class="muted">${t("introLoginHint")}</p>${signedIn() ? `<div class="card"><p>${t("introSignedIn")}</p><button class="btn primary full" data-action="intro-continue">${t(state.profile ? "startQuiz" : "introRegister")}</button></div>` : accountView(true)}</section>`;
}
async function moveIntroduction(offset) {
  if (page !== "intro") return;
  const step = Math.max(0, Math.min(3, options.introduction?.step || 0));
  if (step === 3 && offset > 0) {
    await saveIntroduction({ phase: "login", step: 3 });
    await navigate(firstRunPage(), true);
  } else {
    await saveIntroduction({
      phase: "tour",
      step: Math.max(0, Math.min(3, step + offset)),
    });
    render();
    $(".intro-copy h1")?.focus({ preventScroll: true });
  }
}
async function skipIntroduction() {
  if (page !== "intro") return;
  await saveIntroduction({ phase: "login", step: 3 });
  await navigate(firstRunPage(), true);
}
async function continueIntroduction() {
  await saveIntroduction({ phase: "done", step: 3 });
  await navigate(firstRunPage(), true);
}
// Carry the just-entered registration profile to a new account. Existing guest
// journals still use the established explicit import consent.
async function completeIntroductionLogin(sourceKey, guest) {
  if (options.introduction?.phase !== "login") {
    await offerGuestImport(sourceKey, guest);
    return;
  }
  if (!state.profile && guest?.profile && !guest.records.length) {
    await commit({ ...state, profile: guest.profile });
    await syncCloud();
  } else await offerGuestImport(sourceKey, guest);
  await saveIntroduction({ phase: "done", step: 3 });
}

function profileView() {
  const p = draft || state.profile || {};
  return `<div class="narrow"><p class="eyebrow">WELCOME TO YOUR DREAM WORLD</p><h1>${t("welcome")}</h1><p class="muted">${t("profileHint")}</p><form id="profile-form" class="card">
 ${input("nickname", "nickname", p.nickname, "text", 'required maxlength="20" autocomplete="nickname"')}
 <label class="field"><span>${t("age")}</span><select id="ageGroup" class="input">${["10", "20", "30", "40", "50", "60"].map((a) => `<option value="${a === "60" ? "60代以上" : a + "代"}" ${p.ageGroup === (a === "60" ? "60代以上" : a + "代") ? "selected" : ""}>${t("age" + a)}</option>`).join("")}</select></label>
 ${languageField()}<button class="btn primary full" type="submit">${t(state.profile?.typeAnswers ? "save" : "startQuiz")}</button></form></div>`;
}
function quizView() {
  const q = TYPES[quizIndex];
  return `<div class="narrow"><p class="eyebrow">FIND YOUR DREAM TYPE</p><h1>${t("quiz")}</h1><p class="muted">${t("quizHint")}</p><div class="row between"><span>${quizIndex + 1} / 16</span><span>${Math.round(((quizIndex + 1) / 16) * 100)}%</span></div><progress class="progress" max="16" value="${quizIndex + 1}" aria-label="${t("quiz")}"></progress>
 <div class="card quiz-card"><h2>${localized(q.questions, language())}</h2><div class="quiz-answers">${[2, 1, 0].map((v, i) => `<button class="btn ${quizAnswers[quizIndex] === v ? "selected" : ""}" data-answer="${v}" aria-pressed="${quizAnswers[quizIndex] === v}">${t(["often", "sometimes", "rarely"][i])}</button>`).join("")}</div></div>
 <div class="row between">${button("back", "quiz-back", "ghost")}<button class="btn primary" data-action="quiz-next" ${quizAnswers[quizIndex] === null ? "disabled" : ""}>${t(quizIndex === 15 ? "result" : "next")}</button></div></div>`;
}
function resultView() {
  const result = pendingResult || currentType(),
    type = typeById(result.id);
  return `<div class="narrow center"><p class="eyebrow">YOUR DREAM, YOUR CHARACTER</p><h1>${t("yourType")}</h1><div class="card accent" style="--accent:${group(type).color}">${avatar(type)}<span class="tag-label">${name(group(type))}</span><h2 class="character-name">${name(characterById(type.id))}</h2><p class="help">${name(type)}</p>${characterStory(type)}${result.tied ? `<p class="help">${t("tie")}</p>` : ""}</div><p>${t("characterHint")}</p>${button("begin", "begin", "primary full")}<details class="type-note"><summary>${t("typeAbout")}</summary><p class="help">${t("typeNote")}</p></details></div>`;
}
function homeView() {
  const result = currentType(),
    type = typeById(result?.id) || TYPES[0],
    value = dreamLevel(state.records);
  return `<section class="home-dashboard"><section class="hero"><div><p class="eyebrow">${esc(dateText(localDate()))} · ${esc(state.profile?.nickname)}</p><h1>${t("hero").replace(/\n/g, ["ja", "zh"].includes(language()) ? "" : " ")}</h1><div class="row">${button("record", "record", "primary")}${button("diary", "diary", "ghost")}</div></div></section>
 <div class="card accent character-row" style="--accent:${group(type).color}"><button type="button" class="character-link" data-type-detail="${type.id}" aria-label="${esc(name(characterById(type.id)))} · ${esc(t("more"))}">${avatar(type, value.stars, true)}</button><div><span class="tag-label">${name(group(type))}</span><button type="button" class="character-link" data-type-detail="${type.id}"><h2 class="character-name">${name(characterById(type.id))}</h2></button><p class="help">${name(type)} · ${localized(TYPE_FEATURES[type.id], language())}</p>${button("catalog", "catalog", "small ghost")}</div></div>
 <div class="home-insights"><div class="card level-card"><div class="row between"><h2>${t("level")}</h2><div class="score">Lv.<b>${value.level}</b></div></div><div class="level-gauge" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value.progress}" aria-label="${esc(t("level"))}"><i style="width:${value.progress}%"></i></div><p class="help level-next">${esc(
   t("nextLevel")
     .replace("{n}", value.remaining)
     .replace("{l}", value.level + 1),
 )}<span class="dream-count">${t("dreamsLogged")}: ${value.count}</span></p></div></div></section>`;
}

function catalogView() {
  const active = currentType()?.id;
  return `<div class="row between page-heading"><div><p class="eyebrow">${localized(characterSetById(effectiveSet()).names, language())}</p><h1>${t("catalog")}</h1></div></div><p class="help">${t("catalogHint")}</p>
  <div class="catalog-filters" role="group" aria-label="${t("catalog")}">${[{ id: "all", names: [t("catalogAll"), t("catalogAll"), t("catalogAll"), t("catalogAll")] }, ...GROUPS].map((g) => `<button class="btn small ghost" data-catalog-group="${g.id}" aria-pressed="${catalogGroup === g.id}">${language() === "ja" ? name(g).replace("タイプ", "") : name(g)}</button>`).join("")}</div>
  <div class="catalog-table">${GROUPS.filter(
    (g) => catalogGroup === "all" || catalogGroup === g.id,
  )
    .map(
      (g) =>
        `<section class="catalog-group"><h2 class="group-heading" style="--accent:${g.color}">${name(g)}</h2><table><caption class="sr-only">${name(g)} · ${t("typeFeature")}</caption><tbody>${TYPES.filter(
          (type) => type.group === g.id,
        )
          .map(
            (type) =>
              `<tr class="${type.id === active ? "active" : ""}" style="--accent:${g.color}"><th scope="row"><button type="button" class="catalog-character" data-type-detail="${type.id}">${avatar(type)}<span><strong class="character-name">${name(characterById(type.id))}</strong><small>${name(type)}</small></span></button></th><td>${localized(TYPE_FEATURES[type.id], language())}</td></tr>`,
          )
          .join("")}</tbody></table></section>`,
    )
    .join("")}</div>
  <div class="row">${button("retake", "retake", "ghost")}</div>`;
}
function typeDetailView() {
  const type =
    typeById(selectedType) || typeById(currentType()?.id) || TYPES[0];
  return `<div class="narrow"><div class="card type-detail" style="--accent:${group(type).color}">${avatar(type)}<div><span class="tag-label">${name(group(type))}</span><h1 class="character-name">${name(characterById(type.id))}</h1><p>${name(type)} · ${localized(TYPE_FEATURES[type.id], language())}</p>${characterStory(type)}</div></div></div>`;
}
function freshDream(date = localDate()) {
  return {
    id: id(),
    kind: "dream",
    date,
    text: "",
    typeTags: [],
    sleep: null,
    photo: null,
    analysis: null,
    createdAt: new Date().toISOString(),
  };
}
const dreamsOn = (date) =>
  state.records
    .filter((r) => r.kind === "dream" && r.date === date)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
// The dream page shows whatever is already saved for a date; a new draft only
// starts when that date is empty or the user asks for another dream.
function dreamDraft(date, recordId = null) {
  const saved = dreamsOn(date),
    existing = recordId ? saved.find((r) => r.id === recordId) : saved[0];
  return existing ? structuredClone(existing) : freshDream(date);
}
function diaryDraft(date) {
  const existing = state.records.find(
    (r) => r.kind === "diary" && r.date === date,
  );
  return { kind: "diary", date, id: existing?.id, text: existing?.text || "" };
}
const shiftDate = (date, days) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDate(d);
};
function dateField(label, id, value) {
  return `<div class="field"><span id="${id}-label">${t(label)}</span><input type="hidden" id="${id}" value="${esc(value)}"><button type="button" class="date-trigger input" data-date-field="${id}" aria-labelledby="${id}-label ${id}-value" aria-haspopup="dialog"><span id="${id}-value">${esc(dateText(value))}</span><span aria-hidden="true">▦</span></button></div>`;
}
function dateRow(label, key, date) {
  return `<div class="date-row"><button type="button" class="icon-btn small" data-shift="-1" aria-label="${esc(t("previousDay"))}">◀︎</button>${dateField(label, key, date)}<button type="button" class="icon-btn small" data-shift="1" aria-label="${esc(t("nextDay"))}" ${date >= localDate() ? "disabled" : ""}>▶︎</button></div>`;
}
function languageField() {
  return `<label class="field"><span>${t("language")}</span><select id="language" class="input">${LANGUAGES.map((l) => `<option value="${l}" ${l === language() ? "selected" : ""}>${languageNames[l]}</option>`).join("")}</select></label>`;
}
function recentLink(kind) {
  return `<button type="button" class="recent-link" data-open-days="${kind}"><span>${t(kind === "dream" ? "recentDreams" : "recentDiaries")}</span><span aria-hidden="true">›</span></button>`;
}
function journalView(kind) {
  const records = state.records
    .filter((r) => r.kind === kind && r.date === journalDate)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return `<section class="narrow day-journal"><div class="row between page-heading"><h1>${t(kind === "dream" ? "dreamDays" : "diaryDays")}</h1></div><div class="day-navigation"><button type="button" class="btn ghost icon-button" data-day-step="-1" aria-label="${t("previousDay")}">◀︎</button><button type="button" class="date-trigger" data-journal-calendar aria-haspopup="dialog">${esc(dateText(journalDate))}<span aria-hidden="true">▦</span></button><button type="button" class="btn ghost icon-button" data-day-step="1" aria-label="${t("nextDay")}" ${journalDate >= localDate() ? "disabled" : ""}>▶︎</button></div><div class="day-records" aria-live="polite">${records.length ? records.map((r) => `<article class="card day-record"><p class="prose">${esc(r.text || t("sleep"))}</p>${r.photo ? `<img class="photo" src="${esc(r.photo)}" alt="${t("photoAlt")}">` : ""}${r.sleep ? `<p class="help">${t("hours")}: ${r.sleep.hours}</p>` : ""}<button class="btn ghost" data-entry="${esc(r.id)}">${t("more")}</button></article>`).join("") : `<p class="empty">${t("emptyDay")}</p>`}</div></section>`;
}
async function openJournal(kind) {
  if (dirty && !(await confirmDiscard(t))) return;
  journalDate =
    state.records
      .filter((r) => r.kind === kind && r.date <= localDate())
      .map((r) => r.date)
      .sort()
      .at(-1) || localDate();
  await navigate(kind === "dream" ? "dream-days" : "diary-days", true);
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
    previous = previousDiary(state.records, d.date),
    saved = dreamsOn(d.date),
    isSaved = saved.some((r) => r.id === d.id),
    plan = displayPlan(),
    canAdd = canSaveRecord(
      state.records,
      { kind: "dream", date: d.date, id: "new" },
      social.plan(),
    );
  const chips = saved.length
    ? `<div class="day-entries" role="group" aria-label="${esc(t("dayEntries"))}">${saved
        .map(
          (r, i) =>
            `<button type="button" class="tag" data-open-entry="${esc(r.id)}" aria-pressed="${r.id === d.id}">${i + 1}. ${esc((r.text || r.analysis?.title || t("sleep")).slice(0, 14))}</button>`,
        )
        .join(
          "",
        )}${canAdd ? `<button type="button" class="tag" data-action="new-dream" aria-pressed="${!isSaved}">＋ ${t("newDream")}</button>` : `<button type="button" class="tag tag-cta" data-go="plans">＋ ${ct("moreDreamsCta")}</button>`}</div>`
    : "";
  return `<div class="narrow"><p class="eyebrow">DREAM JOURNAL</p><h1>${t("recordTitle")}</h1><p class="help record-meta">${t("dreamJournalHint")} ${ct("dreamLimit")}: ${saved.length} / ${PLANS[social.plan()].dreams}</p><form id="dream-form">
 <div class="card">${dateRow("date", "dream-date", d.date)}${chips}${isSaved ? `<p class="help saved-note">${t("savedEntry")} · ${esc(dateText(d.date))}</p>` : ""}${area("dreamText", "dream-text", d.text, t("dreamPlaceholder"))}<div class="record-tools">${button("voice", "voice", "small ghost")}<details ${d.photo ? "open" : ""}><summary>${t("photo")}</summary><p class="help">${t("photoHint")}</p><label class="field"><span>${t("photo")}</span><input type="file" id="photo-file" accept="image/jpeg,image/png,image/webp"></label>${d.photo ? `<img class="photo" src="${esc(d.photo)}" alt="${t("photoAlt")}"><div class="row">${button("recognize", "recognize", "small")}${button("removePhoto", "remove-photo", "small ghost")}</div>` : ""}</details></div></div>
 <details class="card theme-picker" ${d.typeTags.length ? "open" : ""}><summary>${t("tags")}</summary><p class="help">${t("tagHint")}</p>${themes(d.typeTags)}</details>
 <div class="card"><h2>${t("sleep")}</h2><label class="check"><input type="checkbox" id="include-sleep" ${d.sleep ? "checked" : ""}><span>${t("sleepOptional")}</span></label><div id="sleep-fields" ${d.sleep ? "" : "hidden"}><div class="grid">${input("hours", "hours", d.sleep?.hours ?? "", "number", 'min="0" max="24" step="0.25"')}${input("awakenings", "awakenings", d.sleep?.awakenings ?? "", "number", 'min="0" max="30" step="1"')}</div><label class="field"><span>${t("rested")}</span><select class="input" id="rested"><option value="">—</option>${[1, 2, 3, 4, 5].map((v) => `<option value="${v}" ${d.sleep?.rested === v ? "selected" : ""}>${v}</option>`).join("")}</select></label><label class="check"><input type="checkbox" id="nightmare" ${d.sleep?.nightmare ? "checked" : ""}><span>${t("nightmare")}</span></label></div><p class="help">${t("sleepNote")}</p></div>
 <div class="row">${button(signedIn() ? "analyzeAI" : "analyze", "analyze", "ghost")}<button type="submit" class="btn primary">${t("save")}</button>${isSaved ? button("delete", "delete-entry", "danger ghost small") : ""}</div>
 <details class="previous-diary"><summary>${t("previousDiary")}</summary><p class="help">${previous ? esc(previous.text.slice(0, 500)) : t("noDiary")}</p></details>
 ${d.analysis ? analysisCard(d) : ""}</form>${recentLink("dream")}</div>`;
}
const WEATHER = {
  sunny: ["☀️", "weatherSunny"],
  partly_cloudy: ["⛅", "weatherPartlyCloudy"],
  cloudy: ["☁️", "weatherCloudy"],
  rainy: ["🌧️", "weatherRainy"],
  stormy: ["⛈️", "weatherStormy"],
};
function analysisCard(d) {
  const prev = previousDiary(state.records, d.date),
    tags = d.typeTags || [],
    a = d.analysis || {},
    ai = a.engine === "ai" && a.language === language(),
    rich = ai && a.mental_state,
    weather = WEATHER[a.mood_weather] || null;
  const common = reflect({
    ...d,
    records: state.records,
    language: language(),
  }).sharedThemes;
  const upsell =
    !ai && !signedIn()
      ? `<div class="reading-upsell"><p class="help">${t(signedIn() ? "readingUpsell" : "readingLogin")}</p><button type="button" class="btn small ghost" data-go="${signedIn() ? "plans" : "settings"}">${t(signedIn() ? "viewPlans" : "signIn")}</button></div>`
      : "";
  const body = rich
    ? `<section class="reading-section"><h3>${t("mentalState")}</h3><p class="mood-line">${weather ? `<span class="mood-icon" aria-hidden="true">${weather[0]}</span>` : ""}<strong>${esc(a.mood_label)}</strong>${weather ? `<small>${t(weather[1])}</small>` : ""}</p><p class="prose">${esc(a.mental_state)}</p></section>
    <section class="reading-section fortune"><h3>${t("fortune")}</h3><p class="prose">${esc(a.fortune_overview)}</p><dl class="fortune-list"><div><dt>${t("fortuneMood")}</dt><dd>${esc(a.fortune_mood)}</dd></div><div><dt>${t("luckyHint")}</dt><dd>${esc(a.lucky_hint)}</dd></div><div><dt>${t("adviceToday")}</dt><dd>${esc(a.advice)}</dd></div></dl></section>
    <p class="prose">${esc(a.reply)}</p>`
    : `<p class="prose">${ai ? esc(a.reply || a.summary) : t(tags.length ? "reflectionText" : "noTheme")}</p>${upsell}`;
  return `<div class="card reading-card"><h2>${t(ai ? "reading" : "reflection")}</h2><div class="tags">${tags
    .map(typeById)
    .filter(Boolean)
    .map((type) => `<span class="tag-label">${name(type)}</span>`)
    .join(
      "",
    )}</div>${body}${prev ? `<h3>${t("previousDiary")} · ${esc(dateText(prev.date))}</h3><p class="prose">${esc(prev.text)}</p><p class="help">${t("diaryContext")}</p>${common.length ? `<p>${t("sharedThemes")}: ${common.map(typeById).map(name).join(" · ")}</p>` : ""}` : `<p class="help">${t("noDiary")}</p>`}${ai ? `<p class="help">${t("readingNote")}</p>` : ""}${button("speak", "speak", "small ghost")}</div>`;
}
function diaryView() {
  draft ||= diaryDraft(localDate());
  const isSaved = Boolean(draft.id);
  return `<div class="narrow"><p class="eyebrow">A PAGE OF THE DAY</p><h1>${t("diaryTitle")}</h1><p class="muted">${t("diaryHint")}</p><form id="diary-form" class="card">${dateRow("diaryDate", "diary-date", draft.date)}${isSaved ? `<p class="help saved-note">${t("savedEntry")} · ${esc(dateText(draft.date))}</p>` : ""}${area("diaryText", "diary-text", draft.text)}<div class="row"><button type="submit" class="btn primary">${t("save")}</button>${isSaved ? button("delete", "delete-entry", "danger ghost small") : ""}</div></form>${recentLink("diary")}</div>`;
}
function detailView() {
  const r = state.records.find((r) => r.id === selectedId);
  if (!r) return `<p>${t("empty")}</p>`;
  return `<div class="narrow"><p class="eyebrow">${esc(dateText(r.date))}</p><h1>${t("detail")}</h1><div class="card"><p class="prose">${esc(r.text)}</p>${r.photo ? `<img class="photo" src="${esc(r.photo)}" alt="${t("photoAlt")}">` : ""}${r.sleep ? `<p class="help">${t("hours")}: ${r.sleep.hours} · ${t("awakenings")}: ${r.sleep.awakenings} · ${t("rested")}: ${r.sleep.rested}</p>` : ""}</div>${r.kind === "dream" && r.analysis ? analysisCard(r) : ""}${r.kind === "dream" ? `<div class="card"><h2>${ct("share")}</h2><p class="help">${ct("privacyNote")}</p><button class="btn ghost" data-go="share">${ct("share")}</button></div>` : ""}<div class="row">${button("edit", "edit", "primary")}${button("delete", "delete", "danger ghost")}</div></div>`;
}
// Settings follow the usual mobile order: who you are, what you pay for, how
// the app looks, reminders, account, and finally the small print.
function settingsView() {
  const type = typeById(currentType()?.id) || TYPES[0],
    plan = displayPlan(),
    planName = localized(PLANS[plan].names, language());
  return `<div class="narrow settings-page"><h1>${t("settings")}</h1>
 <section class="card profile-card">${avatar(type, null, true)}<div><h2 class="character-name">${esc(state.profile?.nickname)}</h2><p class="help">${esc(state.profile?.ageGroup || "")} · ${esc(name(characterById(type.id)))} · ${esc(name(type))}</p><span class="tag-label">${esc(planName)}</span><div class="row">${button("edit", "profile", "small ghost")}${button("retake", "retake", "small ghost")}</div></div></section>
 <section class="card"><h2>${ct("plans")}</h2><p>${t("currentPlanLabel")}: <strong>${esc(planName)}</strong> · <span class="help">${ct(plan + "Summary")}</span></p><button class="btn primary" data-go="plans">${t("viewPlans")}</button></section>
 <section class="card"><h2>${t("appearance")}</h2>${languageField()}<p class="help">${t("privacy")}</p></section>
 <form id="character-form" class="card"><fieldset class="character-set-field"><legend>${t("characterSet")}</legend><p class="help">${t("characterSetHint")}</p><div class="character-set-options">${CHARACTER_SETS.map(
   (set) => {
     const locked = set.paid && plan === "free";
     return `<label class="character-set-option ${locked ? "locked" : ""}"><input type="radio" name="character-set" value="${set.id}" ${effectiveSet() === set.id ? "checked" : ""} ${locked ? "disabled" : ""}><span class="character-set-label">${localized(set.label, language())}</span>${avatar(type, null, false, set.id)}<span>${localized(set.names, language())}</span>${locked ? `<span class="lock-note">🔒 ${t("paidOnly")}</span>` : ""}</label>`;
   },
 ).join(
   "",
 )}</div></fieldset><button type="submit" class="btn primary">${t("save")}</button></form>
 ${accountView()}
 <section class="card about-card"><h2>${t("about")}</h2><p class="help">${t("typeNote")}</p><p class="help">${ct("planAIHint")}</p><p class="help">${t("version")} ${APP_VERSION}</p></section></div>`;
}
function accountView(onboard = false) {
  const enabled = cloud?.state.enabled,
    signed = enabled && !cloud.isAnonymous();
  const providers = cloud?.providers?.() || [];
  return `<section class="card account-card"><h2>${t("account")}</h2><p class="help">${at(signed ? "loginHint" : onboard ? "loginRequired" : "guestHint")}</p><div class="status" id="account-sync-status">${enabled ? syncMarkup(syncStatus) : offlineStatus()}</div>
  ${signed ? `<p>${esc(cloud.email() || cloud.displayName?.() || state.profile?.nickname || "Yumetan")}</p><div class="row">${button("signOut", "signout", "ghost")}${button("sync", "sync", "ghost")}</div><h3>${at("link")}</h3><p class="help">${at("linkHint")}</p>` : `<p class="help">${at("loginHint")}</p>`}
  <div class="auth-buttons">${["google", "apple", "line"]
    .map((provider) => {
      const linked = providers.includes(
        { google: "google.com", apple: "apple.com", line: "oidc.line" }[
          provider
        ],
      );
      return `<button type="button" class="btn auth-${provider}" data-auth-provider="${provider}" ${!enabled || linked ? "disabled" : ""}>${at(provider)}${linked ? ` · ${at("linked")}` : ""}</button>`;
    })
    .join("")}</div>
  ${signed && pendingGuestKey ? `<button type="button" class="btn ghost" data-action="import-guest">${at("importLater")}</button>` : ""}
  ${!enabled ? `<button type="button" class="btn ghost" data-action="auth-retry">${at("reconnect")}</button>` : ""}
  ${!signed && enabled ? `<details><summary>${at("email")}</summary><form id="account-form">${input("email", "email", "", "email", 'required autocomplete="email"')}${input("password", "password", "", "password", 'minlength="6" autocomplete="current-password"')}<div class="row"><button type="submit" class="btn primary">${t("signIn")}</button>${button("signUp", "signup", "ghost")}${button("resetPassword", "reset-password", "small ghost")}</div></form></details>` : ""}
</section>`;
}
// Distinguish "still connecting" from a real failure (with Firebase's error code).
let cloudPending = false;
function offlineStatus() {
  const error = window.YumetanCloud?.state?.error;
  if (cloudPending && !error) {
    return loadingMarkup(displayLanguage(), "connect", true);
  }
  return `<span role="status">${at("offline")}${error ? ` (${esc(error)})` : ""}</span>`;
}
function syncMarkup(value) {
  return value === "syncing"
    ? loadingMarkup(displayLanguage(), "sync", true)
    : `<span role="status">${at(value)}</span>`;
}
function showSyncStatus(value) {
  syncStatus = value;
  const el = $("#account-sync-status");
  if (el) el.innerHTML = syncMarkup(value);
}
function applyAccountPreferences() {
  if (state.profile?.language) {
    options.language = state.profile.language;
    t = translator(language());
  }
  options.characterSet = normalizeCharacterSet(
    state.profile?.characterSet || DEFAULT_CHARACTER_SET,
  );
}
// Refresh the server-verified plan and remember it for this account so a paid
// member keeps their character collection while offline.
async function refreshPlan() {
  if (!signedIn()) return;
  try {
    const account = await social.refreshAccount();
    options = {
      ...options,
      planCache: {
        uid: cloud.uid(),
        plan: account?.plan || "free",
        paidUntil: Number(account?.paidUntil) || 0,
      },
    };
    await write("yumetan.v4.options", options);
  } catch {}
}
// The plan only affects the character collection, so it is refreshed in the
// background: a sleeping API instance must never delay login or app start.
let planRefresh = null;
function refreshPlanInBackground() {
  if (planRefresh) return planRefresh;
  const before = options.planCache?.plan;
  planRefresh = refreshPlan()
    .then(() => {
      if (options.planCache?.plan !== before && !dirty && !processing) render();
    })
    .catch(() => {})
    .finally(() => {
      planRefresh = null;
    });
  return planRefresh;
}
// The language select lives on the first screen and in Settings; both apply at once.
function bindLanguage() {
  const select = $("#language");
  if (!select) return;
  select.onchange = async (e) => {
    if (
      ["settings", "share", "community-post"].includes(page) &&
      dirty &&
      !(await confirmDiscard(t))
    ) {
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
      await syncCloud();
    } catch {
      toast(t("storageError"));
    }
  };
}
// Switch the dream page to a date (or a specific saved dream on that date).
async function openDream(date, recordId = null) {
  if (dirty && !(await confirmDiscard(t))) return false;
  if (recordId) draft = dreamDraft(date, recordId);
  else draft = freshDream(date);
  dirty = false;
  render();
  return true;
}
async function openDiary(date) {
  if (dirty && !(await confirmDiscard(t))) return false;
  draft = diaryDraft(date);
  dirty = false;
  render();
  return true;
}
function watchAccount() {
  stopCloudWatch?.();
  stopCloudWatch = null;
  if (cloud?.uid() && cloud.watch)
    stopCloudWatch = cloud.watch(
      () => {
        if (authChanging) return;
        syncCloud().then(() => {
          if (!dirty && !processing) render();
        });
      },
      () => showSyncStatus("pending"),
    );
}
function capture() {
  social.capture();
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
        // Switching language or date opens another view; it is not unsaved text.
        if (["language", "dream-date", "diary-date"].includes(el.id)) return;
        if (
          [
            "record",
            "diary",
            "onboard",
            "settings",
            "share",
            "community-post",
          ].includes(page)
        )
          dirty = true;
        if (page === "settings" && el.closest("form"))
          el.closest("form").dataset.dirty = "true";
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
        await syncCloud();
        navigate(firstRunPage(), true);
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
  document.querySelectorAll("[data-date-field]").forEach((el) => {
    el.onclick = async () => {
      const date = await pickDate({
        value: draft.date,
        trigger: el,
        max: localDate(),
        locale: locales[language()],
        t,
        marked: state.records
          .filter((r) => r.kind === (page === "record" ? "dream" : "diary"))
          .map((r) => r.date),
      });
      if (date && date !== draft.date) {
        if (page === "record") {
          capture();
          draft.date = date;
          draft.analysis = null;
          dirty = true;
          render();
        } else await openDiary(date);
      }
    };
  });
  document
    .querySelectorAll("[data-open-days]")
    .forEach((el) => (el.onclick = () => openJournal(el.dataset.openDays)));
  document.querySelectorAll("[data-day-step]").forEach(
    (el) =>
      (el.onclick = () => {
        const date = shiftDay(journalDate, Number(el.dataset.dayStep));
        if (date <= localDate()) {
          journalDate = date;
          render();
        }
      }),
  );
  if ($("[data-journal-calendar]"))
    $("[data-journal-calendar]").onclick = async () => {
      const date = await pickDate({
        value: journalDate,
        trigger: $("[data-journal-calendar]"),
        max: localDate(),
        locale: locales[language()],
        t,
        marked: state.records
          .filter((r) => r.kind === (page === "dream-days" ? "dream" : "diary"))
          .map((r) => r.date),
      });
      if (date) {
        journalDate = date;
        render();
      }
    };
  document.querySelectorAll("[data-shift]").forEach((el) => {
    el.onclick = () => {
      const date = shiftDate(draft.date, Number(el.dataset.shift));
      if (date > localDate()) return;
      if (page === "record") {
        capture();
        draft.date = date;
        draft.analysis = null;
        dirty = true;
        render();
      } else openDiary(date);
    };
  });
  document.querySelectorAll("[data-open-entry]").forEach((el) => {
    el.onclick = () => {
      const r = state.records.find((r) => r.id === el.dataset.openEntry);
      if (!r) return;
      if (page === "record") {
        openDream(r.date, r.id);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (page === "diary") {
        openDiary(r.date);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    };
  });
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
  if ($("#character-form"))
    $("#character-form").onsubmit = (e) => {
      e.preventDefault();
      run(async () => {
        const next = {
          ...options,
          characterSet: allowedCharacterSet(
            normalizeCharacterSet($("#character-form input:checked").value),
            displayPlan(),
          ),
        };
        await write("yumetan.v4.options", next);
        options = next;
        if (state.profile)
          await commit({
            ...state,
            profile: { ...state.profile, characterSet: next.characterSet },
          });
        await syncCloud();
        settingsFormSaved("#character-form");
        toast(t("saved"));
      });
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
      "#app button, #app input, #app textarea, #app select, #nav button, #header button",
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
  // Every plan gets an AI reading with each dream; the server counts one per
  // dream date. Only a local-only build (no account) falls back to the on-device reflection.
  if (signedIn()) {
    const { analysis } = await api("/api/reflect", {
      text: draft.text,
      typeTags: result.tags,
      date: draft.date,
      diary: result.diary
        ? { date: result.diary.date, text: result.diary.text }
        : null,
      recentDiaries: recentDiaries(draft.date),
      sleep: validateSleep(draft.sleep) ? draft.sleep : null,
      dreamType: currentType()?.id || null,
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
// Up to seven diary pages before the wake-up date, newest first, trimmed so the
// whole request stays inside the server's input budget.
function recentDiaries(date) {
  return state.records
    .filter((r) => r.kind === "diary" && r.date < date && r.text.trim())
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 7)
    .map((r) => ({ date: r.date, text: r.text.slice(0, 1500) }));
}
// Free-plan limits lead to the plans page instead of an error; the unsaved
// text comes back when the user returns to the journal.
let quotaDraft = null;
async function sendToPlans(messageKey) {
  quotaDraft = { page, draft };
  dirty = false;
  await navigate("plans", true);
  toast(ct(messageKey));
}
async function saveDream() {
  capture();
  checkDraft();
  if (!canSaveRecord(state.records, draft, social.plan())) {
    await sendToPlans("freeQuota");
    return;
  }
  // Saving is always local. Paid AI runs only on the explicit analyze action.
  if (!draft.analysis) {
    const result = reflect({
      ...draft,
      records: state.records,
      language: language(),
    });
    draft.analysis = result.analysis;
    draft.typeTags = result.tags;
  }
  const beforeType = currentType()?.id,
    before = dreamLevel(state.records).level;
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
  await navigate("record", true);
  const after = dreamLevel(state.records).level;
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
  // The diary is one page per date; each save of that page counts against the
  // plan's daily diary allowance (free: 3 saves per date).
  const savesKey = `${storageKey}.diary-saves`,
    saves = (await read(savesKey)) || {};
  if ((saves[draft.date] || 0) >= PLANS[social.plan()].diary) {
    await sendToPlans("diaryQuota");
    return;
  }
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
  const kept = Object.fromEntries(
    Object.entries(saves).filter(([date]) => date >= previousDate(localDate())),
  );
  await write(savesKey, {
    ...kept,
    [saved.date]: (saves[saved.date] || 0) + 1,
  });
  draft = diaryDraft(saved.date);
  render();
  toast(t("saved"));
  await syncCloud();
}
// Delete the saved dream or diary currently open on its page, then stay on that date.
async function deleteOpenEntry() {
  const record = state.records.find(
    (r) => r.id === draft?.id && r.kind === draft.kind,
  );
  if (!record || !confirm(t("deleteConfirm"))) return;
  await removeRecord(record);
  draft =
    record.kind === "diary" ? diaryDraft(record.date) : dreamDraft(record.date);
  dirty = false;
  render();
  await syncCloud();
}
async function removeRecord(record) {
  if (record.kind === "dream") await social.makeRecordPrivate(record.id);
  await commit({
    ...state,
    records: state.records.filter((r) => r.id !== record.id),
    deleted: [...state.deleted, record.id],
  });
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
function settingsFormSaved(selector) {
  const form = $(selector);
  if (form) form.dataset.dirty = "false";
  dirty = Boolean($('#app form[data-dirty="true"]'));
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
    const token =
      cloud?.state.enabled && !cloud.isAnonymous()
        ? await cloud.idToken?.()
        : null;
    const response = await fetch(base + path, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Yumetan-User": await userId(),
        "X-Yumetan-Code": options.code,
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: body
        ? JSON.stringify({ ...body, language: language() })
        : undefined,
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok)
      throw Object.assign(
        new Error(data.code ? ct(data.code) : t("networkError")),
        { userMessage: data.code ? ct(data.code) : t("networkError") },
      );
    return data;
  } catch (e) {
    if (e.userMessage) throw e;
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
  if (displayPlan() === "free") throw new Error(t("aiRequired"));
  disableActionButtons();
  const data = await api("/api/handwriting", { image: draft.photo });
  draft.text = [draft.text, data.text].filter(Boolean).join("\n");
  draft.analysis = null;
  dirty = true;
  render();
  toast(t("ocrReview"));
}
function syncCloud() {
  if (syncTask) {
    syncAgain = true;
    return syncTask;
  }
  syncTask = performSync().finally(() => {
    syncTask = null;
    if (syncAgain && !authChanging) {
      syncAgain = false;
      syncCloud();
    }
  });
  return syncTask;
}
async function performSync() {
  if (!cloud?.state.enabled || !cloud.uid()) return;
  if (cloud.syncSnapshot) {
    const key = storageKey,
      uid = cloud.uid(),
      snapshot = structuredClone(state);
    showSyncStatus("syncing");
    try {
      const merged = await cloud.syncSnapshot(snapshot);
      if (key !== storageKey || uid !== cloud.uid()) return;
      if (JSON.stringify(state) !== JSON.stringify(snapshot)) {
        syncAgain = true;
        return;
      }
      await commit(merged, true);
      applyAccountPreferences();
      showSyncStatus("cloudSaved");
    } catch {
      showSyncStatus("pending");
    }
    return;
  }
  // Anonymous account records are also scoped by uid, preventing account-to-account leakage.
  const syncKey = storageKey,
    uid = cloud.uid();
  try {
    const [remoteDreams, remoteProfile, remoteDiary, remoteType] =
      await Promise.all([
        cloud.loadOnce(),
        cloud.loadProfile(),
        cloud.loadDiaryOnce?.() || [],
        cloud.loadTypeState?.() || null,
      ]);
    const remote = [
      ...remoteDreams,
      ...remoteDiary.map((d) => ({ ...d, kind: "diary" })),
    ];
    if (syncKey !== storageKey || uid !== cloud.uid()) return;
    const merged = mergeRecords(state.records, remote, state.deleted);
    await commit({
      ...state,
      records: merged,
      profile: state.profile?.typeAnswers
        ? state.profile
        : normalizeProfile({
            ...remoteProfile,
            ...state.profile,
            typeAnswers:
              state.profile?.typeAnswers ||
              remoteProfile?.typeAnswers ||
              legacyAnswers(remoteType),
          }),
    });
    for (const deleted of state.deleted) {
      await cloud.deleteDream(deleted);
      if (cloud.deleteDiary) await cloud.deleteDiary(deleted);
    }
    for (const record of merged) {
      const { photo, ...payload } = record;
      const remoteRecord = remote.find((r) => r.id === record.id);
      if (remoteRecord) {
        const { photo: remotePhoto, ...normalizedRemote } =
          normalizeRecord(remoteRecord);
        if (JSON.stringify(payload) === JSON.stringify(normalizedRemote))
          continue;
      }
      if (record.kind === "diary" && cloud.saveDiary)
        await cloud.saveDiary(payload);
      else await cloud.saveDream(payload);
    }
    if (state.profile) await cloud.saveProfile(state.profile);
    await commit({ ...state, deleted: [] }, true);
    showSyncStatus("cloudSaved");
  } catch {
    toast(t("syncError"));
  }
}
async function account(mode, provider = null) {
  const email = $("#email")?.value.trim(),
    password = $("#password")?.value;
  if (
    mode === "signout" &&
    syncStatus === "pending" &&
    !confirm(at("signoutConfirm"))
  )
    return;
  // Start popup OAuth directly in the click event, before awaiting storage/network.
  const fromIntroduction = page === "welcome-login";
  const sourceKey = storageKey,
    guest = !cloud || cloud.isAnonymous() ? structuredClone(state) : null;
  const link = mode === "provider" && !cloud.isAnonymous();
  if (link && !confirm(at("linkHint"))) return;
  authChanging = true;
  const stopLoading = beginLoading(
    displayLanguage(),
    "connect",
    $("#account-sync-status"),
  );
  stopCloudWatch?.();
  try {
    disableActionButtons();
    let login;
    if (mode === "provider" && !native)
      login = cloud.signInProvider(provider, {
        link,
        upgrade: cloud.isAnonymous() && !!cloud.uid(),
        language: language(),
      });
    // Apple uses the system sign-in sheet; LINE opens the LINE app directly.
    if (
      mode === "provider" &&
      native &&
      provider === "apple" &&
      appleNativeAvailable()
    )
      login = appleNativeLogin({
        cloud,
        link,
        upgrade: cloud.isAnonymous() && !!cloud.uid(),
      });
    else if (
      mode === "provider" &&
      native &&
      provider === "google" &&
      googleNativeAvailable()
    )
      // Google Sign-In SDK sheet inside the app; no Safari round trip.
      login = googleNativeLogin({
        cloud,
        link,
        upgrade: cloud.isAnonymous() && !!cloud.uid(),
        config: window.YUMETAN_CONFIG,
      });
    else if (
      mode === "provider" &&
      native &&
      provider === "line" &&
      lineNativeAvailable()
    )
      login = lineNativeLogin({
        cloud,
        link,
        base: window.YUMETAN_CONFIG?.apiBase || options.apiBase,
        config: window.YUMETAN_CONFIG,
      });
    else if (mode === "provider" && native) {
      // The free API instance may need up to a minute to wake up.
      await startNativeAuth({
        cloud,
        provider,
        link,
        language: language(),
        base: window.YUMETAN_CONFIG?.apiBase || options.apiBase,
        sourceKey,
      });
      toast(at("waiting"));
      return;
    }
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
      login = cloud.signUp(email, password);
    } else if (mode === "signin") {
      if (!email || !password) return;
      login = cloud.signIn(email, password);
    } else if (mode === "signout") {
      await cancelNativeAuth();
      login = cloud.signOut();
    }
    await login;
    if (syncTask) await syncTask;
    await switchAccount();
    await completeIntroductionLogin(sourceKey, guest);
    dirty = false;
    processing = false;
    navigate(
      state.profile?.typeAnswers
        ? fromIntroduction
          ? "home"
          : "settings"
        : state.profile
          ? "quiz"
          : "onboard",
      true,
    );
  } catch (error) {
    // Auth may succeed before a persistence/sync error. Never keep the old account visible.
    if (
      cloud &&
      storageKey !==
        (cloud.uid() ? `yumetan.v4.${cloud.uid()}` : "yumetan.v4.local")
    )
      await switchAccount();
    throw new Error(authError(error.code, displayLanguage()));
  } finally {
    stopLoading();
    authChanging = false;
    watchAccount();
  }
}
async function offerGuestImport(sourceKey, guest) {
  if (
    !guest ||
    sourceKey === storageKey ||
    !(guest.records.length || guest.profile)
  )
    return;
  pendingGuestKey = sourceKey;
  await write(`${storageKey}.guest-import`, sourceKey);
  if (!confirm(at("importGuest"))) return;
  await commit(importGuest(state, guest));
  await write(`${storageKey}.guest-import`, null);
  pendingGuestKey = null;
  await syncCloud();
}
async function switchAccount() {
  social.reset();
  stopCloudWatch?.();
  storageKey = cloud.uid() ? `yumetan.v4.${cloud.uid()}` : "yumetan.v4.local";
  state = { version: 4, profile: null, records: [], deleted: [] };
  draft = null;
  dirty = false;
  await write("yumetan.v4.active", storageKey);
  state = (await read(storageKey)) || state;
  pendingGuestKey = await read(`${storageKey}.guest-import`);
  applyAccountPreferences();
  const progress = await read(`${storageKey}.quiz`);
  quizAnswers =
    progress?.answers?.length === 16 ? progress.answers : Array(16).fill(null);
  quizIndex = Math.max(0, Math.min(15, progress?.index || 0));
  refreshPlanInBackground();
  await syncCloud();
}
async function resumeNativeLogin() {
  if (!native || !cloud || authChanging || processing) return;
  authChanging = true;
  const stopLoading = beginLoading(
    displayLanguage(),
    "connect",
    $("#account-sync-status"),
  );
  try {
    const pending = await finishNativeAuth(cloud);
    if (!pending) return;
    if (syncTask) await syncTask;
    const guest = pending.guest ? await read(pending.sourceKey) : null;
    await switchAccount();
    await completeIntroductionLogin(pending.sourceKey, guest);
    navigate(
      state.profile?.typeAnswers ? "home" : state.profile ? "quiz" : "onboard",
      true,
    );
  } catch (error) {
    if (
      cloud &&
      storageKey !==
        (cloud.uid() ? `yumetan.v4.${cloud.uid()}` : "yumetan.v4.local")
    ) {
      await switchAccount();
      navigate(state.profile?.typeAnswers ? "home" : "onboard", true);
    }
    toast(authError(error.code, displayLanguage()));
  } finally {
    stopLoading();
    authChanging = false;
    watchAccount();
  }
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
  const a = record?.analysis;
  const text =
    a?.engine === "ai" && a.language === language()
      ? [a.mental_state, a.fortune_overview, a.reply].filter(Boolean).join(" ")
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
  "intro-next": () => moveIntroduction(1),
  "intro-back": () => moveIntroduction(-1),
  "intro-continue": continueIntroduction,
  "intro-skip": skipIntroduction,
  home: () => navigate("home"),
  record: () => navigate("record"),
  diary: () => navigate("diary"),
  catalog: () => navigate("catalog"),
  "new-dream": async () => {
    if (!(await openDream(draft.date, "__new__"))) return;
    $("#dream-text")?.focus();
  },
  "delete-entry": deleteOpenEntry,
  profile: () => navigate("onboard"),
  begin: () => navigate("home", true),
  back: goBack,
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
  sync: syncCloud,
  "auth-retry": async () => {
    if (!dirty || (await confirmDiscard(t))) location.reload();
  },
  "import-guest": async () => {
    if (pendingGuestKey)
      await offerGuestImport(pendingGuestKey, await read(pendingGuestKey));
    render();
  },
  signup: () => account("signup"),
  signout: () => account("signout"),
  "reset-password": () => account("reset"),
  edit: async () => {
    const r = state.records.find((r) => r.id === selectedId);
    processing = false;
    if (!(await navigate(r.kind === "diary" ? "diary" : "record"))) return;
    draft = structuredClone(r);
    render();
  },
  delete: async () => {
    const record = state.records.find((r) => r.id === selectedId);
    if (!record || !confirm(t("deleteConfirm"))) return;
    await removeRecord(record);
    processing = false;
    navigate(record.kind === "diary" ? "diary" : "record", true);
    draft =
      record.kind === "diary"
        ? diaryDraft(record.date)
        : dreamDraft(record.date);
    render();
    await syncCloud();
  },
};
document.addEventListener("click", (event) => {
  const el = event.target.closest("button");
  if (el?.dataset.authProvider) {
    run(() => account("provider", el.dataset.authProvider));
    return;
  }
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
          "catalog",
          "profile",
          "begin",
          "back",
          "edit",
          "quiz-back",
          "new-dream",
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
window.addEventListener("popstate", () => {
  if (hasBack()) goBack();
  else if (page !== "home") navigate("home");
});
// Move the local scope to the signed-in account's scope (first time only) or
// switch to the account's saved state.
async function adoptCloud() {
  const key = cloud.uid() ? `yumetan.v4.${cloud.uid()}` : "yumetan.v4.local";
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
async function loadScope() {
  if (state.profile?.characterSet)
    options.characterSet = normalizeCharacterSet(state.profile.characterSet);
  pendingGuestKey = await read(`${storageKey}.guest-import`);
  const progress = await read(`${storageKey}.quiz`);
  if (
    progress?.answers?.length === 16 &&
    progress.answers.every((v) => v === null || [0, 1, 2].includes(v))
  ) {
    quizAnswers = progress.answers;
    quizIndex = Math.max(0, Math.min(15, progress.index || 0));
  }
}
function bindCloud() {
  cloud.onUser?.(() => {
    // Cross-tab auth changes must invalidate every old draft and in-flight view.
    if (!authChanging) location.reload();
  });
  watchAccount();
}
// The cloud connection was not ready when the UI first rendered. Wait for it in
// the background and enable login/sync without a reload once it arrives.
async function attachLateCloud(pending) {
  cloudPending = true;
  let timer;
  const ready = await Promise.race([
    pending.ready,
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), 90000);
    }),
  ]);
  clearTimeout(timer);
  cloudPending = false;
  if (!ready?.enabled || cloud || dirty || processing || authChanging) {
    if (!cloud) {
      if (ready && !pending.state.error)
        pending.state.error = "auth/unavailable";
      const el = $("#account-sync-status");
      if (el) el.innerHTML = offlineStatus();
    }
    return;
  }
  cloud = pending;
  await adoptCloud();
  await loadScope();
  bindCloud();
  if (!cloud.isAnonymous()) refreshPlanInBackground();
  if (["home", "quiz", "onboard", "intro", "welcome-login"].includes(page))
    page = firstRunPage();
  render();
  syncCloud();
}
async function boot() {
  try {
    const old = await read("yumetan.settings", {}),
      savedOptions = await read("yumetan.v4.options");
    options = {
      ...options,
      ...(savedOptions || {
        apiBase: old.apiBase || "",
        code: old.code || "",
        language: old.lang || old.profile?.language || "ja",
      }),
    };
    options.characterSet = normalizeCharacterSet(options.characterSet);
    if (!LANGUAGES.includes(options.language)) options.language = "ja";
    t = translator(language());
    storageKey = await read("yumetan.v4.active", "yumetan.v4.local");
    state = await read(storageKey);
    if (!state) {
      const legacy = await read("yumetan.dreams", []);
      state = migrateLegacy(old, legacy, await read("yumetan.diary", []));
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
      if (ready?.enabled) await adoptCloud();
      else {
        // A phone on a slow network often needs longer than the wait above to
        // download the SDK and sign in. Keep the local scope for now and adopt
        // the connection once it is ready, unless the user has started editing.
        const pending = cloud;
        cloud = null;
        if (!ready) attachLateCloud(pending);
      }
    }
    await loadScope();
    page = firstRunPage();
    if (cloud) bindCloud();
    if (cloud && !cloud.isAnonymous()) refreshPlanInBackground();
    if (state.profile?.typeAnswers && location.hash === "#plans")
      page = "plans";
    render();
    if (page === "plans") social.enter("plans");
    if (cloud)
      syncCloud().then(() => {
        if (
          !dirty &&
          !processing &&
          ["home", "quiz", "onboard"].includes(page)
        ) {
          page = firstRunPage();
          render();
        }
      });
  } catch {
    $("#app").textContent = t("storageError");
  }
}
window.addEventListener("online", () => syncCloud());
window.addEventListener("focus", () => {
  resumeNativeLogin();
  if (!authChanging) syncCloud();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    resumeNativeLogin();
    if (!authChanging) syncCloud();
  }
});
await boot();
if (native) {
  plugins.App?.addListener("appStateChange", ({ isActive }) => {
    if (isActive) resumeNativeLogin();
  });
  plugins.App?.addListener("backButton", () => {
    if (hasBack()) goBack();
    else if (page !== "home") navigate("home");
    else plugins.App.exitApp?.();
  });
  await resumeNativeLogin();
}
if ("serviceWorker" in navigator && !native)
  navigator.serviceWorker.register("sw.js").catch(() => {});
