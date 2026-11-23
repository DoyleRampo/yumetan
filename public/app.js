import { createHaptics } from "./core/haptics.js";
import { loadingMarkup, beginLoading } from "./core/loading.js";
import {
  confirmDiscard,
  pickDate,
  bindSlideNavigation,
  shiftDay,
} from "./core/interface.js";
import { wrapJapaneseLabels } from "./core/ui-text.js";
import { TYPE_FEATURES } from "./core/type-features.js";
import { TYPE_LORE } from "./core/type-lore.js";
import {
  QUESTIONS,
  AXES,
  GROUP_AXES,
  TYPE_POLES,
  FREQUENCY_OPTIONS,
  SCALE_STRENGTH,
  QUIZ_VERSION,
  answerValues,
  validAnswer,
  axisById,
  classify,
} from "./core/diagnosis.js";
import { authText, authError, emailAuthError } from "./core/auth-i18n.js";
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
import { errorMessageKey } from "./core/api-errors.js";
import { createPurchases, planFromCustomerInfo } from "./core/purchases.js";
import { canSaveRecord, PLANS } from "./core/plans.js";
import {
  DEFAULT_CHARACTER_SET,
  CHARACTER_SETS,
  normalizeCharacterSet,
  allowedCharacterSet,
  characterSetById,
  characterById as getCharacter,
} from "./core/characters.js";
import { TYPES, GROUPS, LANGUAGES, localized, typeById } from "./core/types.js";
import { translator, locales, languageNames } from "./core/i18n.js";
import { HELP_SECTIONS, HELP_LINKS, legalUrl } from "./core/help-content.js";
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
  purgeAccounts,
  write,
  normalizeRecord,
  normalizeProfile,
  mergeRecords,
} from "./core/storage.js";
import { reflect } from "./core/reflection.js";
import { createAnalytics, lengthBucket } from "./core/analytics.js";
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
const WELCOME_MS = 1000;
const cap = window.Capacitor,
  native = cap?.isNativePlatform?.(),
  plugins = cap?.Plugins || {};
const haptics = createHaptics(cap);
const navigationSession = id();
let routeIndex = 0;
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
  quizAnswers = Array(QUESTIONS.length).fill(null),
  quizIndex = 0,
  pendingResult = null,
  cloud = null,
  syncTask = null,
  voice = null;
let pendingGuestKey = null;
// Email panel: null = closed, "choose" | "signin" | "signup" = open, "registered" = done.
// What was typed survives re-renders (a sync, a plan refresh, returning to the app).
let emailMode = null,
  emailDraft = { email: "", password: "" };
let authChanging = false,
  stopCloudWatch = null,
  syncStatus = "pending",
  syncAgain = false;
// The tour comes before the language is chosen at registration, so it is
// always Japanese; every later screen, the login wall included, follows the choice.
const displayLanguage = () => (page === "intro" ? "ja" : language());
const at = (key) => authText(key, displayLanguage());
const language = () => options.language;
const ct = (key) => communityText(key, language());
const signedIn = () => Boolean(cloud?.state.enabled && !cloud.isAnonymous());
const PLAN_RANK = { free: 0, starter: 1, standard: 2 };
// The remembered plan for the signed-in account, while it has not expired.
function cachedPlan() {
  const cached = options.planCache;
  return signedIn() &&
    cached &&
    cached.uid === cloud.uid() &&
    ["starter", "standard"].includes(cached.plan) &&
    Number(cached.paidUntil) > Date.now()
    ? cached
    : null;
}
// The plan the app behaves by: the live server-verified plan, or (offline, or
// while the server still catches up with a purchase the store already
// confirmed) the plan remembered for this account. Server-side allowances
// (AI readings, the feed) always follow the server's own verification.
// Whichever is better wins: a Starter member who just bought Standard is
// Standard from the moment the store says so, not once the server catches up.
function displayPlan() {
  const live = social.plan(),
    cached = cachedPlan()?.plan || "free";
  return PLAN_RANK[cached] > PLAN_RANK[live] ? cached : live;
}
// The store confirmed a better plan than the server reports: the sync after
// that purchase never finished, so the server has yet to hear of it.
function storeAhead() {
  const cached = cachedPlan();
  return Boolean(
    cached?.storeConfirmed && PLAN_RANK[cached.plan] > PLAN_RANK[social.plan()],
  );
}
// Remember the plan for this account. A store confirmation (`storeConfirmed`)
// is kept until it expires even if the server has not caught up yet, and a
// lower server answer (the old plan, right after a switch) never replaces it.
function rememberPlan(plan, paidUntil, storeConfirmed = false) {
  if (!signedIn()) return;
  const cached = options.planCache,
    active =
      ["starter", "standard"].includes(plan) && Number(paidUntil) > Date.now();
  if (
    !storeConfirmed &&
    cachedPlan()?.storeConfirmed &&
    PLAN_RANK[cached.plan] > PLAN_RANK[active ? plan : "free"]
  )
    return;
  const next = {
    uid: cloud.uid(),
    plan: active ? plan : "free",
    paidUntil: active ? Number(paidUntil) : 0,
    storeConfirmed: Boolean(active && storeConfirmed),
  };
  if (JSON.stringify(next) === JSON.stringify(cached)) return;
  options = { ...options, planCache: next };
  write("yumetan.v4.options", options).catch(() => {});
  trackUser();
}
const effectiveSet = () =>
  allowedCharacterSet(options.characterSet, displayPlan());
const characterById = (id) => getCharacter(id, effectiveSet());
const purchases = createPurchases({
  cap,
  plugins,
  config: window.YUMETAN_CONFIG,
});
// GA4 (docs/analytics/GA4_SETUP.md): the measurement ID comes from config.js
// on the web and from the mobile build (GA4_MEASUREMENT_ID). Without one,
// every call below is a no-op.
const analytics = createAnalytics({
  measurementId: window.YUMETAN_CONFIG?.ga4MeasurementId || "",
  platform: native ? cap.getPlatform() : "web",
  appVersion: APP_VERSION,
  read,
  write,
  debug:
    Boolean(window.YUMETAN_CONFIG?.ga4Debug) ||
    /[?&]ga_debug=1/.test(location.search),
});
const track = (name, params) => analytics.event(name, params);
// What GA4 knows about the person: the Firebase UID as user_id while signed
// in, and coarse properties. Never the nickname, the e-mail or any text.
function trackUser() {
  const type = state.profile?.typeAnswers ? currentType() : null;
  analytics.setUser(signedIn() ? cloud.uid() : null, {
    plan: displayPlan(),
    dream_type: type?.id || "none",
    dream_level: dreamLevel(state.records).level,
    language: language(),
    character_set: effectiveSet(),
    login_provider: signedIn()
      ? (cloud.providers?.()[0] || "unknown").replace(/\.com$/, "")
      : "guest",
  });
}
const social = createCommunity({
  api,
  track,
  legalUrl: (kind) => legalLink(kind),
  purchases,
  uid: () => cloud?.uid() || null,
  language,
  esc,
  navigate: (next) => {
    processing = false;
    // The plans page links straight to the cancellation steps in Help.
    helpSection = next === "help-cancel" ? "cancel" : null;
    navigate(helpSection ? "help" : next);
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
  onAccount: (account, verified) => {
    if (verified) rememberPlan(account?.plan, account?.paidUntil);
  },
  onPurchased: ({ plan, paidUntil }) => rememberPlan(plan, paidUntil, true),
  // A purchase from the plan offer ends the first run; "start for free" too.
  onCheckoutDone: () => {
    if (page === "plan-offer" && displayPlan() !== "free") finishPlanOffer();
  },
  finishOffer: finishPlanOffer,
  // The plans pages mark the same plan as the rest of the app, and their
  // "check again" reads the store and the server together.
  shownPlan: () => displayPlan(),
  recheck: () => refreshPlan(),
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
const CLOSE_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
// Messages float above the tab bar, close with × or on their own; the thin
// line along the bottom shows how long they stay.
function toast(message) {
  // One popup at a time at the top: a message replaces a tip.
  hideTip();
  const el = $("#toast");
  el.innerHTML = `<span class="toast-text">${esc(message)}</span><button type="button" class="popup-close" data-toast-close aria-label="${esc(t("close"))}">${CLOSE_ICON}</button><span class="popup-timer" aria-hidden="true"></span>`;
  el.classList.remove("visible");
  void el.offsetWidth;
  el.classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("visible"), 5000);
}
// Explanations no longer sit on the screens. Each screen opens a short tip
// once per device; the ⓘ / ? buttons bring a tip back. A tip closes with ×,
// on a tap elsewhere, or after a few seconds.
function showTip(text, { title = "", anchor = null } = {}) {
  const el = $("#tip");
  if (!el || !text) return;
  // The two share the top of the screen: the newest one stays.
  clearTimeout(toast.timer);
  $("#toast")?.classList.remove("visible");
  // Long enough to read: about ten characters a second, 5–16 seconds.
  const TIP_MS = Math.min(16000, Math.max(5000, String(text).length * 90));
  el.innerHTML = `<span class="tip-icon" aria-hidden="true">✦</span><span class="tip-body">${title ? `<strong>${esc(title)}</strong>` : ""}<span>${esc(text)}</span></span><button type="button" class="popup-close" data-tip-close aria-label="${esc(t("close"))}">${CLOSE_ICON}</button><span class="popup-timer" aria-hidden="true"></span>`;
  el.style.setProperty("--tip-ms", `${TIP_MS}ms`);
  el.classList.remove("visible");
  void el.offsetWidth;
  el.classList.add("visible");
  el.dataset.anchor = anchor ? "inline" : "top";
  clearTimeout(showTip.timer);
  showTip.timer = setTimeout(hideTip, TIP_MS);
}
function hideTip() {
  clearTimeout(showTip.timer);
  $("#tip")?.classList.remove("visible");
}
// The tip each screen opens with: [message key, translator].
function pageTip(p = page) {
  const free = displayPlan() === "free";
  const tips = {
    home: ["levelHint"],
    record: ["dreamJournalHint"],
    diary: ["diaryHint"],
    reading: ["readingNote"],
    catalog: ["catalogHint"],
    "type-detail": ["typeNote"],
    result: [
      pendingResult?.tied || currentType()?.tied
        ? "tie"
        : pendingResult?.provisional || currentType()?.provisional
          ? "provisional"
          : "typeNote",
    ],
    settings: ["privacy"],
    help: ["helpHint"],
    onboard: ["profileHint"],
    "welcome-login": ["introLoginHint"],
    community: [free ? "teaserHint" : "todayOnly", "community"],
    plans: ["includedShort", "community"],
    share: ["privacyNote", "community"],
  };
  const tip = tips[p];
  if (!tip) return null;
  return tip[1] === "community" ? ct(tip[0]) : t(tip[0]);
}
function openPageTip(force = false) {
  const text = pageTip();
  if (!text) return;
  const seen = options.tipsSeen || [];
  if (!force && seen.includes(page)) return;
  // A screen's own tip waits for a message that is still showing.
  if (!force && $("#toast").classList.contains("visible")) {
    const shown = page;
    setTimeout(() => page === shown && openPageTip(), 5200);
    return;
  }
  showTip(text, { title: pageTitle(page) || t("brand") });
  if (!seen.includes(page)) {
    options = { ...options, tipsSeen: [...seen, page] };
    write("yumetan.v4.options", options).catch(() => {});
  }
}
// Bottom sheets hold what used to be expandable sections: they open over the
// screen, keep their form fields in the page (so drafts survive), and close
// with ×, the backdrop or Escape.
let openSheetId = null;
function sheet(id, title, content, { cls = "" } = {}) {
  const open = openSheetId === id;
  return `<div class="sheet ${cls}" data-sheet="${id}" ${open ? "" : "hidden"}><div class="sheet-backdrop" data-sheet-close></div><section class="sheet-panel" role="dialog" aria-modal="true" aria-labelledby="sheet-${id}-title"><header class="sheet-head"><h2 id="sheet-${id}-title">${title}</h2><button type="button" class="popup-close" data-sheet-close aria-label="${esc(t("close"))}">${CLOSE_ICON}</button></header><div class="sheet-body">${content}</div></section></div>`;
}
function setSheet(id) {
  openSheetId = id;
  document.querySelectorAll("[data-sheet]").forEach((el) => {
    el.hidden = el.dataset.sheet !== id;
  });
  document
    .querySelectorAll("[data-sheet-open]")
    .forEach((el) =>
      el.setAttribute("aria-expanded", String(el.dataset.sheetOpen === id)),
    );
  if (id) {
    hideTip();
    const panel = document.querySelector(`[data-sheet="${id}"] .sheet-panel`);
    (
      panel?.querySelector("input:not([type=hidden]),select,textarea,button:not([data-sheet-close])") ||
      panel?.querySelector("[data-sheet-close]")
    )?.focus({ preventScroll: true });
  }
}
// The small ⓘ beside a control explains it in a tip.
const infoButton = (text, label = "") =>
  `<button type="button" class="info-btn" data-tip="${esc(text)}" aria-label="${esc(label || t("help"))}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 11v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="7.8" r="1.2" fill="currentColor"/></svg></button>`;
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
function avatar(
  type,
  level = null,
  { inline = false, mini = false, setId = effectiveSet() } = {},
) {
  const item = typeById(type?.id) || TYPES[0],
    character = getCharacter(item.id, setId);
  const measured = Number.isInteger(level) && level >= 1 && level <= 5;
  const wrapper = inline ? "span" : "figure";
  const caption = inline ? "span" : "figcaption";
  return `<${wrapper} class="avatar level-${measured ? level : 0} ${mini ? "mini-avatar" : ""}" style="--accent:${group(item).color}" data-character="${item.id}" data-character-set="${normalizeCharacterSet(setId)}">
    <img class="character-art" src="${character.image}" width="768" height="768" alt="${esc(name(character))} · ${esc(name(item))}" decoding="async">
    <span class="character-fallback" hidden role="img" aria-label="${esc(name(character))}">${item.symbol}</span>
    ${measured ? `<${caption} class="character-stars" aria-label="${esc(t("level"))} ★${level} / 5">${Array.from({ length: 5 }, (_, i) => `<span aria-hidden="true" class="${i < level ? "lit" : ""}">✦</span>`).join("")}</${caption}>` : ""}
  </${wrapper}>`;
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
  back: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="m14.5 5.5-6.5 6.5 6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  history: icon('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4.5v3.8h3.8"/><path d="M12 8v4.4l3 1.8"/>'),
  tip: icon('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.6"/><path d="M12 17h.01" stroke-width="2.6"/>'),
  mic: icon('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21"/>'),
  camera: icon('<path d="M4 8h3l1.6-2.5h6.8L17 8h3v11H4z"/><circle cx="12" cy="13.2" r="3.4"/>'),
  tag: icon('<path d="M3.5 12.5V4h8.5l8.5 8.5-8 8z"/><circle cx="8" cy="8.5" r="1.3"/>'),
  sleep: icon('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/><path d="M15 4h4l-4 4.5h4"/>'),
  book: icon('<path d="M4 5.5c3-1 5.5-.8 8 1 2.5-1.8 5-2 8-1V19c-3-1-5.5-.8-8 1-2.5-1.8-5-2-8-1z"/><path d="M12 6.5V20"/>'),
  trash: icon('<path d="M4.5 7h15"/><path d="M9.5 7V4.5h5V7"/><path d="M6.5 7l1 13h9l1-13"/>'),
  edit: icon('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  share: icon('<path d="M12 15V3.5"/><path d="M7.5 8 12 3.5 16.5 8"/><path d="M5 12.5V20h14v-7.5"/>'),
  grid: icon('<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>'),
  retake: icon('<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4v4.5H15"/>'),
  globe: icon('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.4 2.3 3.6 5.2 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.2-3.6-8.5s1.2-6.2 3.6-8.5z"/>'),
  star: icon('<path d="m12 3.5 2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6L3.4 9.8l6-.7z"/>'),
  user: icon('<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>'),
  link: icon('<path d="M14 4.5h5.5V10"/><path d="M19.5 4.5 11 13"/><path d="M17 14v5.5H4.5V7H10"/>'),
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
  // Settings and the tab bar appear once the first run is over: a guest who
  // has answered the quiz but not signed in yet has neither.
  const ready = firstRunPage() === "home";
  // The top bar: back (with where it leads) or the moon, the screen's name,
  // then the screen's own shortcut, its tip and Settings.
  const bare = ["intro", "quiz"].includes(page);
  const left = hasBack()
    ? `<button type="button" class="back-link" data-action="back">${ICONS.back}<span>${esc(pageTitle(backTarget()) || t("back"))}</span></button>`
    : `<button type="button" class="brand" data-go="home" aria-label="${esc(t("brand"))}"><span class="brand-moon" aria-hidden="true">☾</span>${page === "home" || !pageTitle(page) ? `<span class="brand-name">${esc(t("brand"))}</span>` : ""}</button>`;
  const title =
    page === "home" || hasBack() ? "" : esc(pageTitle(page) || "");
  const shortcut =
    page === "record"
      ? `<button type="button" class="icon-btn" data-open-days="dream" aria-label="${esc(t("recentDreams"))}" title="${esc(t("recentDreams"))}">${ICONS.history}</button>`
      : page === "diary"
        ? `<button type="button" class="icon-btn" data-open-days="diary" aria-label="${esc(t("recentDiaries"))}" title="${esc(t("recentDiaries"))}">${ICONS.history}</button>`
        : "";
  $("#header").innerHTML = bare
    ? ""
    : `<div class="topbar">${left}${title ? `<span class="topbar-title">${title}</span>` : `<span class="topbar-title"></span>`}<div class="topbar-actions">${shortcut}${pageTip() ? `<button type="button" class="icon-btn" data-page-tip aria-label="${esc(t("help"))}" title="${esc(t("help"))}">${ICONS.tip}</button>` : ""}${ready ? `<button type="button" class="icon-btn" data-go="settings" aria-label="${esc(t("settings"))}" ${page === "settings" ? 'aria-current="page"' : ""}>${ICONS.settings}</button>` : ""}</div></div>`;
  $("#header").hidden = bare;
  const nav = $("#nav");
  nav.hidden =
    !ready ||
    [
      "quiz",
      "result",
      "onboard",
      "intro",
      "welcome-login",
      "plan-offer",
    ].includes(page);
  nav.setAttribute("aria-label", t("brand"));
  const activePage =
    { "dream-days": "record", "diary-days": "diary" }[page] || page;
  const active = NAV.indexOf(activePage);
  nav.dataset.active = active;
  nav.style.setProperty("--nav-index", Math.max(0, active));
  nav.style.setProperty("--nav-count", NAV.length);
  nav.innerHTML = `<div class="nav-track"><span class="nav-indicator" aria-hidden="true"></span>${NAV.map(
    (p) =>
      `<button type="button" data-go="${p}" aria-label="${esc(navLabel(p))}" title="${esc(navLabel(p))}" ${activePage === p ? 'aria-current="page"' : ""}>${ICONS[p]}<span class="nav-label" aria-hidden="true">${esc(navLabel(p))}</span></button>`,
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
      pageTurning = true;
      try {
        await goBack();
      } finally {
        pageTurning = false;
      }
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
// Every screen is laid out to fit between the top bar and the tab bar. When a
// very small window (or enlarged text) cannot hold it, the screen first
// tightens its spacing, then lets its content scroll as a last resort.
let fitFrame;
function updateFit() {
  cancelAnimationFrame(fitFrame);
  fitFrame = requestAnimationFrame(() => {
    const body = document.body,
      app = $("#app");
    body.classList.remove("fit-dense", "fit-reflow");
    const fits = () => {
      const box = app.getBoundingClientRect();
      return (
        app.scrollHeight <= app.clientHeight + 1 &&
        [...app.querySelectorAll(".page-actions, .home-actions, .level-card, .companion-action")]
          .filter((el) => el.getClientRects().length)
          .every((el) => {
            const r = el.getBoundingClientRect();
            return r.bottom <= box.bottom + 1 && r.top >= box.top - 1;
          })
      );
    };
    if (!fits()) body.classList.add("fit-dense");
    if (!fits()) body.classList.add("fit-reflow");
  });
}
window.addEventListener("resize", updateFit);
$("#app").addEventListener(
  "load",
  (event) => {
    if (event.target.matches(".character-art")) updateFit();
  },
  true,
);
// Nothing paints before startup has chosen the first screen: a background
// plan check or sync that finishes during the welcome screen would otherwise
// show a page early, and startup's own first paint would then wipe whatever
// had been typed into it.
let booted = false;
function render() {
  if (!booted) return;
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
    reading: readingView,
    settings: settingsView,
    help: helpView,
    community: () => social.view("community"),
    plans: () => social.view("plans"),
    "plan-details": () => social.view("plan-details"),
    "plan-offer": () => social.view("plan-offer"),
    share: () => social.view("share"),
    "community-post": () => social.view("community-post"),
  };
  const keepFocus = ["email", "password"].includes(document.activeElement?.id)
    ? document.activeElement.id
    : null;
  $("#app").dataset.page = page;
  $("#app").innerHTML = (views[page] || homeView)();
  if (openSheetId && !document.querySelector(`[data-sheet="${openSheetId}"]`))
    openSheetId = null;
  document.body.classList.toggle("sheet-open", Boolean(openSheetId));
  wrapJapaneseLabels($("#app"), displayLanguage());
  updateFit();
  bindForms();
  if (keepFocus) {
    const el = $(`#${keepFocus}`);
    el?.focus({ preventScroll: true });
    el?.setSelectionRange?.(el.value.length, el.value.length);
  }
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
  reading: "record",
  plans: "settings",
  "plan-details": "plans",
  help: "settings",
  share: "detail",
  "community-post": "community",
  onboard: "settings",
};
let navStack = [];
// Why the plans page opened (a quota message, or the page it came from).
let plansSource = null;
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
    reading: t("readingTitle"),
    plans: ct("plans"),
    "plan-details": ct("plans"),
    "plan-offer": ct("plans"),
    help: t("help"),
    share: ct("share"),
    "community-post": ct("community"),
    onboard: t("profile"),
  }[p];
}
const hasBack = () =>
  !ROOTS.includes(page) &&
  !["quiz", "result", "intro", "welcome-login", "plan-offer"].includes(page) &&
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
  setRoute();
  restoreJournal(record, target);
}
function restoreJournal(record, target) {
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
  // Text that is waiting on the target page is not lost by moving there.
  const restoring = Boolean(quotaDraft && quotaDraft.page === next);
  if (!force && !restoring && dirty && !(await confirmDiscard(t))) return false;
  stopVoice();
  social.leave();
  // The reading page works on the journal page's draft.
  const carried = next === "reading" ? { draft, dirty } : null;
  dirty = false;
  draft = null;
  if (restoring) {
    draft = quotaDraft.draft;
    dirty = quotaDraft.dirty ?? true;
    quotaDraft = null;
  } else if (quotaDraft && !["plans", "plan-details", "reading"].includes(next))
    quotaDraft = null;
  if (carried) {
    draft = carried.draft;
    dirty = carried.dirty;
  }
  const first = firstRunPage();
  if (first !== "home") {
    // Introduction, login and registration steps cannot be skipped; the plan
    // offer follows the first quiz result until it is answered.
    const allowed =
      first === "quiz"
        ? ["quiz", "result", "onboard"]
        : ["welcome-login", "plan-offer"].includes(first)
          ? ["result", first]
          : [first];
    if (!allowed.includes(next)) next = first;
  }
  if (ROOTS.includes(next)) navStack = [];
  else if (!back && next !== page && !["quiz", "result"].includes(page))
    navStack.push(page);
  if (navStack.length > 20) navStack = navStack.slice(-20);
  const from = page;
  if (next !== from) haptics.transition(next === "result" ? "result" : "step");
  const push = next !== from && !back && !force;
  if (push) routeIndex++;
  page = next;
  if (next !== from) {
    openSheetId = null;
    hideTip();
  }
  setRoute(push);
  render();
  animatePage(from);
  if (next !== from) setTimeout(() => page === next && openPageTip(), 450);
  analytics.page(page);
  if (page === "quiz" && from !== "quiz")
    track("quiz_start", { retake: Boolean(state.profile?.typeAnswers) });
  if (page === "plans") {
    track("view_plans", { source: plansSource || from });
    plansSource = null;
  }
  if (page === "plan-offer" && from !== "plan-offer")
    track("view_plans", { source: "onboarding" });
  window.scrollTo(0, 0);
  $("#app").focus({ preventScroll: true });
  if (page === "help" && helpSection) {
    setSheet(`help-${helpSection}`);
    document.body.classList.add("sheet-open");
    helpSection = null;
  }
  // The plans pages check store and server again on every visit.
  if (["plans", "plan-details", "plan-offer"].includes(page))
    refreshPlanInBackground();
  if (
    ["community", "plans", "plan-details", "plan-offer", "share"].includes(page)
  )
    social.enter(
      page,
      state.records.find((r) => r.id === selectedId),
    );
  return true;
}

// A short fade-and-settle whenever the view changes. The page-turn gesture
// brings its own animation and skips this one.
let pageTurning = false;
function animatePage(from) {
  const app = $("#app");
  if (
    pageTurning ||
    from === page ||
    matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    return;
  app.classList.remove("page-enter");
  void app.offsetWidth;
  app.classList.add("page-enter");
  clearTimeout(animatePage.timer);
  animatePage.timer = setTimeout(() => app.classList.remove("page-enter"), 320);
}
// Order for a new user: introduction → registration (nickname, age, language)
// → 16-type quiz → login (or sign-up) → paid-plan offer → home. Registration
// and the quiz run as a guest; a new account takes them over at login. Records
// never live only on the device: whenever Firebase is configured, an account
// is required before the home page. An existing account that signs in on a
// new device has its quiz answers already and goes straight home, without the
// plan offer. `introduction.phase` remembers the device's progress: "tour",
// "login" (tour finished, registration or login under way), "plan" (a new
// account has yet to answer the plan offer) and "done".
const cloudConfigured = () =>
  Boolean(window.FIREBASE_CONFIG?.apiKey) || Boolean(cloud);
function firstRunPage() {
  const phase = options.introduction?.phase,
    ready = Boolean(state.profile?.typeAnswers),
    // Signed in, or (without a connection: offline, or the SDK still loading)
    // on the scope of the account this device last signed in to.
    member =
      signedIn() ||
      (!cloud && (!cloudConfigured() || options.memberScope === storageKey));
  if (ready && member)
    return phase === "plan" && signedIn() && displayPlan() === "free"
      ? "plan-offer"
      : "home";
  // Signed out, or the account deleted: back to the sign-in screen, not the tour.
  if (phase === "done" && cloudConfigured() && !signedIn())
    return "welcome-login";
  if (!state.profile && phase !== "login" && phase !== "done") return "intro";
  if (!state.profile) return "onboard";
  if (!ready) return "quiz";
  return "welcome-login";
}
// The scope of the account this device is signed in to (none for a guest), so
// that it opens as usual when the app starts without a connection.
async function rememberMemberScope() {
  const memberScope = signedIn() ? storageKey : null;
  if ((options.memberScope || null) === memberScope) return;
  options = { ...options, memberScope };
  await write("yumetan.v4.options", options);
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
  return `<section class="introduction narrow" lang="ja" data-intro-step="${step}"><div class="intro-toolbar"><button type="button" class="intro-back" data-action="intro-back" aria-label="戻る" ${step === 0 ? 'disabled aria-hidden="true"' : ""}><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="m14 6-6 6 6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="intro-progress" role="group" aria-label="${esc(t("introProgress"))}">${Array.from({ length: 4 }, (_, i) => `<span class="intro-dot ${i === step ? "current" : ""}" aria-label="${i + 1} / 4" ${i === step ? 'aria-current="step"' : ""}></span>`).join("")}</div><button type="button" class="intro-skip" data-action="intro-skip">${t("introSkip")}</button></div><div class="intro-slide"><div class="intro-art intro-art-${step}" aria-hidden="true">${arts[step]}</div><div class="intro-copy" aria-live="polite"><p class="eyebrow">${step + 1} / 4</p><h1 tabindex="-1">${t(`intro${step + 1}Title`)}</h1><p>${t(`intro${step + 1}Text`)}</p></div></div><div class="intro-actions"><button type="button" class="btn primary" data-action="intro-next">${t(step === 3 ? "introStart" : "next")}<span aria-hidden="true"> →</span></button></div></section>`;
}
function introductionLoginView() {
  const type = typeById(currentType()?.id) || TYPES[0];
  return `<section class="intro-login" style="--accent:${group(type).color}"><div class="login-hero"><span class="login-hero-art">${avatar(type, null, { inline: true })}</span><h1>${t("signIn")}</h1></div>${signedIn() ? `<div class="account-panel"><p>${t("introSignedIn")}</p><button class="btn primary full" data-action="intro-continue">${t(state.profile ? "startQuiz" : "introRegister")}</button></div>` : accountView(true)}</section>`;
}
async function moveIntroduction(offset) {
  if (page !== "intro") return;
  const step = Math.max(0, Math.min(3, options.introduction?.step || 0));
  if (step === 0 && offset > 0) track("tutorial_begin");
  if (step === 3 && offset > 0) {
    track("tutorial_complete");
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
  track("tutorial_skip", { step: options.introduction?.step || 0 });
  await saveIntroduction({ phase: "login", step: 3 });
  await navigate(firstRunPage(), true);
}
async function continueIntroduction() {
  await saveIntroduction({ phase: "done", step: 3 });
  await navigate(firstRunPage(), true);
}
// The plan offer is answered: by "start for free", or by a purchase. Either
// way the first run is over and the home page opens.
async function finishPlanOffer() {
  if (options.introduction?.phase === "plan")
    await saveIntroduction({ phase: "done", step: 3 });
  dirty = false;
  processing = false;
  await navigate("home", true);
}
// The first login of this device: a new account takes over the profile and the
// quiz answers entered as a guest, and sees the paid plans next. An existing
// account keeps its own profile (the guest's is dropped) and only guest
// journals, if any, go through the usual import consent.
async function completeIntroductionLogin(sourceKey, guest) {
  if (options.introduction?.phase !== "login") {
    await offerGuestImport(sourceKey, guest);
    return;
  }
  const carried = !state.profile && guest?.profile && !guest.records.length;
  if (carried) {
    await commit({ ...state, profile: guest.profile });
    await syncCloud();
  } else if (guest?.records.length) await offerGuestImport(sourceKey, guest);
  await saveIntroduction({
    phase: carried && state.profile?.typeAnswers ? "plan" : "done",
    step: 3,
  });
}

function setRoute(push = false) {
  const route = {
    session: navigationSession,
    index: routeIndex,
    page,
    recordId: selectedId,
    typeId: selectedType,
    stack: navStack,
  };
  history[push ? "pushState" : "replaceState"](route, "", `#${page}`);
}
function profileView() {
  const p = draft || state.profile || {},
    first = !state.profile?.typeAnswers;
  const ages = ["10", "20", "30", "40", "50", "60"];
  return `<section class="profile-page"><div class="profile-hero" aria-hidden="true"><img class="intro-character" src="${getCharacter("observer", "animal").image}" width="768" height="768" alt=""></div><h1>${t(first ? "welcome" : "profile")}</h1><form id="profile-form" class="form-stack">
 ${input("nickname", "nickname", p.nickname, "text", 'required maxlength="20" autocomplete="nickname"')}
 <div class="field-row"><label class="field"><span>${t("age")}</span><select id="ageGroup" class="input">${ages.map((a) => `<option value="${a === "60" ? "60代以上" : a + "代"}" ${p.ageGroup === (a === "60" ? "60代以上" : a + "代") ? "selected" : ""}>${t("age" + a)}</option>`).join("")}</select></label>
 ${languageField()}</div><button class="btn primary full" type="submit">${t(first ? "startQuiz" : "save")}<span aria-hidden="true"> →</span></button></form></section>`;
}
function quizView() {
  const q = QUESTIONS[quizIndex],
    lang = language(),
    total = QUESTIONS.length,
    answer = quizAnswers[quizIndex],
    values = answerValues(q);
  const option = (v, label, symbol = "", extra = "") =>
    `<button type="button" class="quiz-answer" data-answer="${v}" aria-pressed="${answer === v}"${extra}>${symbol ? `<span class="quiz-symbol" aria-hidden="true">${symbol}</span>` : ""}<span class="quiz-label">${label}</span></button>`;
  const illustration = q.group && TYPES.find((type) => type.group === q.group);
  let answers;
  if (q.kind === "frequency") {
    const symbols = ["○", "✦", "✦✦", "✦✦✦", "✦✦✦✦"];
    answers = values
      .map((v) =>
        option(v, esc(localized(FREQUENCY_OPTIONS[v], lang)), symbols[v]),
      )
      .join("");
  } else if (q.kind === "scene") {
    answers = q.options
      .map((o, i) =>
        option(i, esc(localized(o.text, lang)), typeById(o.type).symbol),
      )
      .join("");
  } else {
    const left = esc(localized(q.left, lang)),
      right = esc(localized(q.right, lang));
    answers = `<div class="quiz-poles"><span>${left}</span><span>${right}</span></div><div class="quiz-scale">${values
      .map((v, i) => {
        const strength = esc(localized(SCALE_STRENGTH[i], lang));
        const label = v === 0 ? strength : `${v < 0 ? left : right} · ${strength}`;
        return option(v, strength, ["«", "‹", "·", "›", "»"][i], ` aria-label="${label}"`);
      })
      .join("")}</div>`;
  }
  // Tapping an answer moves on by itself; the arrows step back and forth.
  return `<section class="quiz-flow" data-kind="${q.kind}"${illustration ? ` style="--accent:${group(illustration).color}"` : ""}><div class="quiz-header"><button type="button" class="icon-action" data-action="quiz-back" aria-label="${t("back")}">${ICONS.back}</button><div class="quiz-meter"><h1>${t("quiz")}</h1><progress class="progress" max="${total}" value="${quizIndex + 1}" aria-label="${t("quiz")}"></progress></div><span class="quiz-count">${quizIndex + 1}<small>/${total}</small></span><button type="button" class="icon-action quiz-next" data-action="quiz-next" aria-label="${t(quizIndex === total - 1 ? "result" : "next")}" ${answer === null ? "disabled" : ""}><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="m9.5 5.5 6.5 6.5-6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
  <div class="quiz-card">
    ${illustration ? `<div class="quiz-art" aria-hidden="true">${avatar(illustration)}</div>` : ""}
    <h2 id="quiz-scene" tabindex="-1">${esc(localized(q.text, lang))}</h2>
    ${q.kind === "frequency" ? `<p class="quiz-prompt" id="quiz-prompt">${t("quizHint")}</p>` : ""}
  </div>
  <div class="quiz-answers quiz-${q.kind}" role="group" aria-labelledby="quiz-scene${q.kind === "frequency" ? " quiz-prompt" : ""}">${answers}</div></section>`;
}
// A saved questionnaire draft is only restored when every answer fits the current questions.
function quizDraft(progress) {
  const answers = progress?.answers;
  if (
    !Array.isArray(answers) ||
    answers.length !== QUESTIONS.length ||
    !answers.every((v, i) => v === null || validAnswer(QUESTIONS[i], v))
  )
    return null;
  return {
    answers,
    index: Math.max(0, Math.min(QUESTIONS.length - 1, progress.index || 0)),
  };
}
const fmt = (text, ...args) =>
  String(text).replace(/\{(\d+)\}/g, (_, i) => String(args[i] ?? ""));
const groupShort = (g) =>
  language() === "ja" ? name(g).replace("タイプ", "") : name(g);
// "Nightmare × Act × The world": the group and the two style poles that define a type.
function typeSignature(type) {
  const lang = language();
  return [
    groupShort(group(type)),
    ...GROUP_AXES[type.group].map((axisId, i) =>
      localized(
        axisById(axisId).poles[TYPE_POLES[type.id][i] < 0 ? 0 : 1],
        lang,
      ),
    ),
  ]
    .map(esc)
    .join(" × ");
}
function loreCard(type) {
  return `<section class="lore"><h3>${t("storyTitle")}</h3><p>${esc(localized(TYPE_LORE[type.id].story, language()))}</p></section>`;
}
// The evidence behind a result: group profile, the two style axes, the scene pick, recent dreams.
function rationaleCard(result, type) {
  const lang = language(),
    ev = result.evidence;
  const groups = result.groups
    .map((g) => {
      const grp = GROUPS.find((x) => x.id === g.id);
      return `<li class="${g.id === type.group ? "active" : ""}" style="--accent:${grp.color}"><span class="meter-label">${esc(groupShort(grp))}<small>${g.percent}%</small></span><span class="meter" role="img" aria-label="${esc(groupShort(grp))} ${g.percent}%"><span class="meter-fill" style="width:${g.percent}%"></span></span></li>`;
    })
    .join("");
  const axes = ev.axes
    .map((a) => {
      const axis = axisById(a.axis),
        left = localized(axis.poles[0], lang),
        right = localized(axis.poles[1], lang),
        chosen = localized(axis.poles[a.pole], lang),
        note = a.match
          ? fmt(t("axisMatch"), chosen)
          : a.value === 0
            ? t("axisNeutral")
            : fmt(t("axisOpposite"), chosen);
      return `<li><span class="meter-label">${esc(localized(axis.names, lang))}<small>${esc(note)}</small></span><span class="axis-track" role="img" aria-label="${esc(left)} – ${esc(right)}"><span class="axis-pole">${esc(left)}</span><span class="axis-line"><span class="axis-dot" style="left:${Math.round(((a.value + 1) / 2) * 100)}%"></span></span><span class="axis-pole">${esc(right)}</span></span></li>`;
    })
    .join("");
  const sceneType = ev.scene && typeById(ev.scene.type),
    runner = typeById(result.runnerUp.id);
  const facts = [
    fmt(
      t(ev.group.rank === 1 ? "groupTop" : "groupRank"),
      groupShort(group(type)),
      ev.group.percent,
      ev.group.rank,
    ),
    sceneType
      ? fmt(t(ev.scene.match ? "sceneMatch" : "sceneOther"), name(sceneType))
      : "",
    ev.dreams ? fmt(t("dreamVotes"), ev.dreams) : t("dreamVotesNone"),
    fmt(t("runnerUp"), `${name(characterById(runner.id))} · ${name(runner)}`),
  ].filter(Boolean);
  return `<section class="rationale"><p class="prose">${esc(localized(TYPE_LORE[type.id].basis, lang))}</p><h3>${t("groupProfile")}</h3><ul class="meters">${groups}</ul>${axes ? `<h3>${t("styleProfile")}</h3><ul class="meters">${axes}</ul>` : ""}<ul class="facts">${facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>${result.version === 1 ? `<p class="help">${t("legacyQuizHint")}</p>${button("newQuiz", "retake", "small ghost")}` : ""}</section>`;
}
function resultView() {
  const result = pendingResult || currentType(),
    type = typeById(result.id),
    character = characterById(type.id);
  return `<section class="result-page" style="--accent:${group(type).color}"><p class="eyebrow">${t("yourType")}</p><div class="result-stage"><span class="result-rays" aria-hidden="true"></span>${avatar(type)}</div><div class="result-copy"><span class="tag-label">${name(group(type))}</span><h1 class="character-name">${name(character)}</h1><p class="type-name">${name(type)}</p><p class="type-signature">${typeSignature(type)}</p><blockquote class="character-quote">${esc(localized(character.quotes, language()))}</blockquote></div><div class="page-actions stacked"><button type="button" class="btn ghost" data-sheet-open="why" aria-haspopup="dialog">${ICONS.star}<span>${t("whyTitle")}</span></button>${button(firstRunPage() === "welcome-login" ? "beginLogin" : "begin", "begin", "primary full")}</div>${sheet("why", t("whyTitle"), rationaleCard(result, type) + loreCard(type), { cls: "tall" })}</section>`;
}
function homeView() {
  const result = currentType(),
    type = typeById(result?.id) || TYPES[0],
    value = dreamLevel(state.records),
    today = dreamsOn(localDate()).length;
  // The character fills the screen; tapping it starts today's dream.
  return `<section class="home-dashboard" style="--accent:${group(type).color}">
 <div class="character-row home-companion">
   <p class="home-greeting">${esc(state.profile?.nickname)}</p>
   <button type="button" class="companion-action" data-action="record" aria-label="${t("dreamPrompt")} ${t("record")}">
     <span class="companion-halo" aria-hidden="true"></span>
     ${avatar(type, value.stars, { inline: true })}
     <span class="companion-prompt" aria-hidden="true">${today ? "✓ " : ""}${t("dreamPrompt")} <span>✎</span></span>
   </button>
   <div class="companion-details"><button type="button" class="character-link" data-type-detail="${type.id}"><strong class="character-name">${name(characterById(type.id))}</strong><small>${name(type)}</small></button></div>
 </div>
 <div class="home-insights"><div class="level-card"><div class="level-head"><h2>${t("level")}</h2><div class="score">Lv.<b>${value.level}</b></div></div><div class="level-gauge" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value.progress}" aria-label="${esc(t("level"))}"><i style="width:${value.progress}%"></i></div><p class="level-next"><span>${esc(
   t("nextLevel")
     .replace("{n}", value.remaining)
     .replace("{l}", value.level + 1),
 )}</span><span class="dream-count">${t("dreamsLogged")}: ${value.count}</span></p></div>
 <div class="home-actions"><button type="button" class="btn ghost" data-action="catalog">${ICONS.grid}<span>${esc(t("catalog"))}</span></button><button type="button" class="btn ghost" data-go="diary">${ICONS.diary}<span>${esc(t("diary"))}</span></button></div></div></section>`;
}

function catalogView() {
  const active = currentType()?.id,
    shown = TYPES.filter(
      (type) => catalogGroup === "all" || type.group === catalogGroup,
    );
  return `<section class="catalog-page" data-group="${catalogGroup}"><h1 class="sr-only">${t("catalog")}</h1>
  <div class="catalog-filters segmented" role="group" aria-label="${t("catalog")}">${[{ id: "all", names: [t("catalogAll"), t("catalogAll"), t("catalogAll"), t("catalogAll")] }, ...GROUPS].map((g) => `<button type="button" data-catalog-group="${g.id}" aria-pressed="${catalogGroup === g.id}" ${g.color ? `style="--accent:${g.color}"` : ""}>${esc(groupShort(g))}</button>`).join("")}</div>
  <ul class="catalog-grid${catalogGroup === "all" ? "" : " catalog-focus"}">${shown
    .map((type) => {
      const g = group(type);
      return `<li class="${type.id === active ? "active" : ""}" style="--accent:${g.color}"><button type="button" class="catalog-character" data-type-detail="${type.id}"><span class="catalog-art">${avatar(type, null, { inline: true })}</span><span class="catalog-names"><strong class="character-name">${name(characterById(type.id))}</strong><small>${name(type)}</small>${catalogGroup === "all" ? "" : `<em>${localized(TYPE_FEATURES[type.id], language())}</em>`}</span>${type.id === active ? `<span class="catalog-you" aria-hidden="true">★</span>` : ""}</button></li>`;
    })
    .join("")}</ul>
  <div class="page-actions"><span class="catalog-set">${localized(characterSetById(effectiveSet()).names, language())}</span><button type="button" class="btn ghost small" data-action="retake">${ICONS.retake}<span>${esc(t("retake"))}</span></button></div></section>`;
}
// Tabs switch in place (no re-render), so long text never pushes the page.
function tabs(id, items) {
  const list = items.filter(Boolean);
  return `<div class="tabs" data-tabs="${id}"><div class="tab-list" role="tablist">${list
    .map(
      ([key, label], i) =>
        `<button type="button" role="tab" id="tab-${id}-${key}" data-tab="${key}" aria-controls="panel-${id}-${key}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${label}</button>`,
    )
    .join("")}</div>${list
    .map(
      ([key, , body], i) =>
        `<div class="tab-panel" role="tabpanel" id="panel-${id}-${key}" aria-labelledby="tab-${id}-${key}" data-panel="${key}" ${i === 0 ? "" : "hidden"}>${body}</div>`,
    )
    .join("")}</div>`;
}
function typeDetailView() {
  const type =
    typeById(selectedType) || typeById(currentType()?.id) || TYPES[0];
  const character = characterById(type.id);
  return `<section class="type-detail" style="--accent:${group(type).color}"><div class="type-hero">${avatar(type)}<div class="type-heading"><span class="tag-label">${name(group(type))}</span><h1 class="character-name">${name(character)}</h1><p class="type-name">${name(type)}</p><p class="type-signature">${typeSignature(type)}</p></div></div>
  ${tabs("type", [
    [
      "story",
      t("typeFeature"),
      `<p class="type-feature">${localized(TYPE_FEATURES[type.id], language())}</p>${characterStory(type)}`,
    ],
    [
      "lore",
      t("storyTitle"),
      `<p class="prose">${esc(localized(TYPE_LORE[type.id].story, language()))}</p>`,
    ],
    [
      "why",
      t("whyTitle"),
      `<p class="prose">${esc(localized(TYPE_LORE[type.id].basis, language()))}</p>`,
    ],
  ])}</section>`;
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
    shared: null,
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
  return existing
    ? { ...structuredClone(existing), shared: existing.shared === true }
    : freshDream(date);
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
  return `<div class="field date-field"><span id="${id}-label" class="sr-only">${t(label)}</span><input type="hidden" id="${id}" value="${esc(value)}"><button type="button" class="date-trigger" data-date-field="${id}" aria-labelledby="${id}-label ${id}-value" aria-haspopup="dialog"><span id="${id}-value">${esc(dateText(value))}</span><span class="date-icon" aria-hidden="true">▦</span></button></div>`;
}
function dateRow(label, key, date, extra = "") {
  return `<div class="date-row"><button type="button" class="icon-btn small" data-shift="-1" aria-label="${esc(t("previousDay"))}">${ICONS.back}</button>${dateField(label, key, date)}<button type="button" class="icon-btn small flip" data-shift="1" aria-label="${esc(t("nextDay"))}" ${date >= localDate() ? "disabled" : ""}>${ICONS.back}</button>${extra}</div>`;
}
function languageField() {
  return `<label class="field"><span>${t("language")}</span><select id="language" class="input">${LANGUAGES.map((l) => `<option value="${l}" ${l === language() ? "selected" : ""}>${languageNames[l]}</option>`).join("")}</select></label>`;
}
function journalView(kind) {
  const records = state.records
    .filter((r) => r.kind === kind && r.date === journalDate)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return `<section class="day-journal"><h1 class="sr-only">${t(kind === "dream" ? "dreamDays" : "diaryDays")}</h1><div class="day-navigation date-row"><button type="button" class="icon-btn small" data-day-step="-1" aria-label="${t("previousDay")}">${ICONS.back}</button><button type="button" class="date-trigger" data-journal-calendar aria-haspopup="dialog"><span>${esc(dateText(journalDate))}</span><span class="date-icon" aria-hidden="true">▦</span></button><button type="button" class="icon-btn small flip" data-day-step="1" aria-label="${t("nextDay")}" ${journalDate >= localDate() ? "disabled" : ""}>${ICONS.back}</button></div><div class="day-records" aria-live="polite">${records.length ? records.map((r) => `<button type="button" class="day-record" data-entry="${esc(r.id)}"><span class="prose">${esc(r.text || r.analysis?.title || t("sleep"))}</span><span class="day-record-meta">${r.photo ? `<span>${ICONS.camera}</span>` : ""}${r.sleep ? `<span>${ICONS.sleep} ${esc(r.sleep.hours)}h</span>` : ""}<span class="day-record-more">${t("more")} ›</span></span></button>`).join("") : `<div class="empty"><span class="empty-moon" aria-hidden="true">☾</span><p>${t("emptyDay")}</p></div>`}</div></section>`;
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
      `<div class="theme-group" style="--accent:${g.color}"><h3 class="group-heading">${name(g)}</h3><div class="tags">${TYPES.filter(
        (type) => type.group === g.id,
      )
        .map(
          (type) =>
            `<button type="button" class="tag" data-tag="${type.id}" aria-pressed="${selected.includes(type.id)}">${name(type)}</button>`,
        )
        .join("")}</div></div>`,
  ).join("");
}
// A tool on the writing card: an icon that opens its sheet, lit when it holds something.
const tool = (sheetId, iconName, label, short, on = false, attrs = "") =>
  `<button type="button" class="tool${on ? " on" : ""}" ${sheetId ? `data-sheet-open="${sheetId}" aria-haspopup="dialog" aria-expanded="${openSheetId === sheetId}"` : ""} ${attrs} aria-label="${esc(label)}" title="${esc(label)}">${ICONS[iconName]}<span class="tool-label" aria-hidden="true">${esc(short)}</span></button>`;
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
      plan,
    );
  const chips = saved.length
    ? `<div class="day-entries" role="group" aria-label="${esc(t("dayEntries"))}">${saved
        .map(
          (r, i) =>
            `<button type="button" class="tag" data-open-entry="${esc(r.id)}" aria-pressed="${r.id === d.id}">${i + 1}. ${esc((r.text || r.analysis?.title || t("sleep")).slice(0, 10))}</button>`,
        )
        .join(
          "",
        )}${canAdd ? `<button type="button" class="tag" data-action="new-dream" aria-pressed="${!isSaved}">＋ ${t("newDream")}</button>` : `<button type="button" class="tag tag-cta" data-go="plans">＋ ${ct("moreDreamsCta")}</button>`}</div>`
    : "";
  const count = `<span class="quota" title="${esc(ct("dreamLimit"))}" aria-label="${esc(ct("dreamLimit"))}: ${saved.length} / ${PLANS[plan].dreams}">${saved.length}/${PLANS[plan].dreams}</span>`;
  const photoSheet = `<label class="file-drop"><input type="file" id="photo-file" accept="image/jpeg,image/png,image/webp"><span>${ICONS.camera}</span><strong>${t("photo")}</strong></label>${d.photo ? `<img class="photo" src="${esc(d.photo)}" alt="${t("photoAlt")}"><div class="sheet-actions">${button("recognize", "recognize", "primary")}${button("removePhoto", "remove-photo", "ghost")}</div>` : ""}`;
  const sleepSheet = `<label class="switch-row"><input type="checkbox" id="include-sleep" ${d.sleep ? "checked" : ""}><span class="switch" aria-hidden="true"></span><span>${t("sleepOptional")}</span></label><div id="sleep-fields" ${d.sleep ? "" : "hidden"}><div class="grid">${input("hours", "hours", d.sleep?.hours ?? "", "number", 'min="0" max="24" step="0.25" inputmode="decimal"')}${input("awakenings", "awakenings", d.sleep?.awakenings ?? "", "number", 'min="0" max="30" step="1" inputmode="numeric"')}</div><label class="field"><span>${t("rested")}</span><select class="input" id="rested"><option value="">—</option>${[1, 2, 3, 4, 5].map((v) => `<option value="${v}" ${d.sleep?.rested === v ? "selected" : ""}>${v}</option>`).join("")}</select></label><label class="check"><input type="checkbox" id="nightmare" ${d.sleep?.nightmare ? "checked" : ""}><span>${t("nightmare")}</span></label></div><div class="sheet-actions"><button type="button" class="btn primary full" data-sheet-close>${t("close")}</button></div>`;
  const previousSheet = previous
    ? `<p class="eyebrow">${esc(dateText(previous.date))}</p><p class="prose">${esc(previous.text.slice(0, 500))}</p>`
    : `<p class="empty">${t("noDiary")}</p>`;
  return `<section class="compose"><h1 class="sr-only">${t("recordTitle")}</h1><form id="dream-form" class="compose-form">
 ${dateRow("date", "dream-date", d.date, count)}${chips}
 <div class="paper${isSaved ? " saved" : ""}"><label class="paper-label" for="dream-text">${isSaved ? `<span class="saved-note">✓ ${t("savedEntry")}</span>` : `<span>${t("dreamText")}</span>`}</label><textarea id="dream-text" name="dream-text" maxlength="20000" placeholder="${esc(t("dreamPlaceholder"))}">${esc(d.text)}</textarea>
 <div class="record-tools">${tool("", "mic", t("voice"), t("toolVoice"), false, 'data-action="voice" aria-pressed="false"')}${tool("photo", "camera", t("photo"), t("toolPhoto"), Boolean(d.photo))}${tool("tags", "tag", t("tags"), t("toolTags"), d.typeTags.length > 0)}${tool("sleep", "sleep", t("sleep"), t("toolSleep"), Boolean(d.sleep))}${tool("previous", "book", t("previousDiary"), t("toolDiary"), Boolean(previous))}</div></div>
 <div class="page-actions">${isSaved ? `<button type="button" class="btn ghost icon-only danger" data-action="delete-entry" aria-label="${esc(t("delete"))}">${ICONS.trash}</button>` : ""}<button type="button" class="btn primary full" data-action="diagnose">${t("diagnose")}</button></div>
 ${sheet("photo", t("photo"), photoSheet)}${sheet("tags", t("tags"), `<div class="theme-picker">${themes(d.typeTags)}</div><div class="sheet-actions"><button type="button" class="btn primary full" data-sheet-close>${t("close")}</button></div>`, { cls: "tall" })}${sheet("sleep", t("sleep"), sleepSheet)}${sheet("previous", t("previousDiary"), previousSheet)}
 </form></section>`;
}
// The reading page: the diagnosis of the dream on the journal page, the
// dream's own share box (on by default when sharing is possible) and Save.
function readingView() {
  const d = draft;
  if (!d) return `<p class="empty">${t("empty")}</p>`;
  return `<section class="reading-page"><h1 class="sr-only">${t("readingTitle")}</h1><div class="reading-head"><p class="eyebrow">${esc(dateText(d.date))}</p><p class="reading-excerpt">${esc((d.text || t("sleep")).slice(0, 60))}${d.text && d.text.length > 60 ? "…" : ""}</p></div>${analysisCard(d)}<div class="page-actions stacked">${shareField(d)}${button("save", "save-reading", "primary full")}</div></section>`;
}
// Each dream decides for itself whether it appears in the feed. Sharing is part
// of every plan and needs only an account; reading other members' dreams is
// what a paid plan opens.
function shareField(d) {
  if (!cloudConfigured()) return "";
  // Paid members keep the box ticked by default; for free members sharing is a
  // new possibility, so their first dream is only published if they ask for it.
  const allowed = signedIn(),
    on = d.shared == null ? allowed && displayPlan() !== "free" : d.shared;
  return `<div class="share-card"><label class="switch-row share-check"><input type="checkbox" id="share-public" ${on ? "checked" : ""} ${allowed ? "" : "disabled"}><span class="switch" aria-hidden="true"></span><span>${t("shareDream")}</span></label>${infoButton(allowed ? t("shareDreamHint") : at("loginHint"), t("shareDream"))}</div>`;
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
  // Why there is no AI reading: sign in, or the server's reason with a retry.
  const failure = d === draft && d.aiError && d.aiError !== "loginRequired";
  const upsell =
    !ai && !signedIn()
      ? `<div class="reading-upsell"><p>${t("readingLogin")}</p><button type="button" class="btn small ghost" data-go="settings">${t("signIn")}</button></div>`
      : !ai && failure
        ? `<div class="reading-upsell reading-failure"><p><strong>${t("readingFailed")}</strong> ${esc(d.aiError === "networkError" ? t("networkError") : ct(errorMessageKey(d.aiError, "reading")))}</p>${["quotaReached", "aiBudgetReached", "paidRequired"].includes(d.aiError) ? `<button type="button" class="btn small ghost" data-go="plans">${t("viewPlans")}</button>` : d.aiError === "aiTextTooLong" ? "" : button("retryReading", "retry-reading", "small ghost")}</div>`
        : "";
  const tagLine = tags.length
    ? `<div class="tags">${tags
        .map(typeById)
        .filter(Boolean)
        .map((type) => `<span class="tag-label">${name(type)}</span>`)
        .join("")}</div>`
    : "";
  const diaryPanel = prev
    ? `<p class="eyebrow">${t("previousDiary")} · ${esc(dateText(prev.date))}</p><p class="prose">${esc(prev.text)}</p>${common.length ? `<p class="shared-themes">${t("sharedThemes")}: ${common.map(typeById).map(name).join(" · ")}</p>` : ""}<p class="sr-only">${t("diaryContext")}</p>`
    : `<p class="empty">${t("noDiary")}</p>`;
  const note = ai ? `<p class="sr-only">${t("readingNote")}</p>` : "";
  const panels = rich
    ? [
        [
          "mind",
          t("mentalState"),
          `<div class="reading-section"><p class="mood-line">${weather ? `<span class="mood-icon" aria-hidden="true">${weather[0]}</span>` : ""}<span><strong>${esc(a.mood_label)}</strong>${weather ? `<small>${t(weather[1])}</small>` : ""}</span></p>${tagLine}<p class="prose">${esc(a.mental_state)}</p></div>`,
        ],
        [
          "fortune",
          t("fortune"),
          `<div class="reading-section fortune"><p class="prose">${esc(a.fortune_overview)}</p><dl class="fortune-list"><div><dt>${t("fortuneMood")}</dt><dd>${esc(a.fortune_mood)}</dd></div><div><dt>${t("luckyHint")}</dt><dd>${esc(a.lucky_hint)}</dd></div><div><dt>${t("adviceToday")}</dt><dd>${esc(a.advice)}</dd></div></dl></div>`,
        ],
        ["message", "✉", `<p class="prose reading-reply">${esc(a.reply)}</p>`],
        ["diary", t("previousDiary"), diaryPanel],
      ]
    : [
        [
          "mind",
          t(ai ? "reading" : "reflection"),
          `${tagLine}<p class="prose">${ai ? esc(a.reply || a.summary) : t(tags.length ? "reflectionText" : "noTheme")}</p>${upsell}`,
        ],
        ["diary", t("previousDiary"), diaryPanel],
      ];
  return `<div class="reading-card"><h2 class="sr-only">${t(ai ? "reading" : "reflection")}</h2>${tabs("reading", panels)}${note}</div>`;
}
function diaryView() {
  draft ||= diaryDraft(localDate());
  const isSaved = Boolean(draft.id);
  return `<section class="compose"><h1 class="sr-only">${t("diaryTitle")}</h1><form id="diary-form" class="compose-form">${dateRow("diaryDate", "diary-date", draft.date)}<div class="paper diary-paper${isSaved ? " saved" : ""}"><label class="paper-label" for="diary-text">${isSaved ? `<span class="saved-note">✓ ${t("savedEntry")}</span>` : `<span>${t("diaryText")}</span>`}</label><textarea id="diary-text" name="diary-text" maxlength="20000">${esc(draft.text)}</textarea></div><div class="page-actions">${isSaved ? `<button type="button" class="btn ghost icon-only danger" data-action="delete-entry" aria-label="${esc(t("delete"))}">${ICONS.trash}</button>` : ""}<button type="submit" class="btn primary full">${t("save")}</button></div></form></section>`;
}
function detailView() {
  const r = state.records.find((r) => r.id === selectedId);
  if (!r) return `<p class="empty">${t("empty")}</p>`;
  const dream = r.kind === "dream";
  return `<section class="detail-page"><h1 class="sr-only">${t("detail")}</h1><div class="detail-head"><p class="eyebrow">${esc(dateText(r.date))}</p>${r.sleep ? `<span class="detail-sleep">${ICONS.sleep} ${esc(r.sleep.hours)}h · ${t("awakenings")} ${esc(r.sleep.awakenings)} · ${esc(r.sleep.rested)}/5</span>` : ""}</div><div class="paper detail-text"><p class="prose">${esc(r.text)}</p>${r.photo ? `<img class="photo" src="${esc(r.photo)}" alt="${t("photoAlt")}">` : ""}</div>${dream && r.analysis ? analysisCard(r) : ""}<div class="page-actions">${dream ? `<button type="button" class="btn ghost icon-only" data-go="share" aria-label="${esc(ct("share"))}" title="${esc(ct("share"))}">${ICONS.share}</button>` : ""}<button type="button" class="btn ghost icon-only danger" data-action="delete" aria-label="${esc(t("delete"))}">${ICONS.trash}</button><button type="button" class="btn primary full" data-action="edit">${ICONS.edit}<span>${t("edit")}</span></button></div></section>`;
}
// How the app is used, what a plan costs and how to stop paying for it, what
// happens to the writing, and where to ask for help. Opened from Settings, and
// from the plans page straight at the cancellation steps.
let helpSection = null;
const HELP_ICONS = {
  start: "☾",
  dream: "✎",
  reading: "✦",
  community: "♡",
  plans: "◇",
  cancel: "↺",
  data: "🔒",
  support: "?",
};
// Topics as tiles; each opens its answer in a sheet.
function helpView() {
  return `<section class="help-page"><h1 class="sr-only">${t("help")}</h1><ul class="tile-grid help-grid">${HELP_SECTIONS.map(
    (section) =>
      `<li><button type="button" class="tile" data-sheet-open="help-${section.id}" aria-haspopup="dialog"><span class="tile-icon" aria-hidden="true">${HELP_ICONS[section.id] || "✦"}</span><span class="tile-title">${esc(localized(section.title, language()))}</span></button></li>`,
  ).join("")}</ul>
 <div class="link-row" id="help-links"><h2 class="sr-only">${t("helpLinks")}</h2>${[
   ["supportSite", HELP_LINKS.support],
   ["privacyPolicy", legalLink("privacy")],
   ["termsOfUse", legalLink("terms")],
 ]
   .map(
     ([label, url]) =>
       `<button type="button" class="btn ghost small" data-link="${esc(url)}">${t(label)} ↗</button>`,
   )
   .join("")}</div><p class="version-note">${t("version")} ${APP_VERSION}</p>
 ${HELP_SECTIONS.map((section) =>
   sheet(
     `help-${section.id}`,
     esc(localized(section.title, language())),
     `<div class="help-section" id="help-${section.id}">${section.body
       .map((line) => `<p>${esc(localized(line, language()))}</p>`)
       .join("")}</div>`,
   ),
 ).join("")}</section>`;
}
// External pages (support, privacy) open outside the app, never in its WebView.
const legalLink = (kind) =>
  legalUrl(
    kind,
    options.apiBase || window.YUMETAN_CONFIG?.apiBase || "",
    language(),
  );
function openExternal(url) {
  // Only https pages, or this app's own pages (the legal documents), ever open.
  if (/^https:\/\//.test(url) || url.startsWith(location.origin + "/")) {
    track("external_link", {
      link_kind: /\/legal\/terms/.test(url)
        ? "terms"
        : /\/legal\/privacy/.test(url)
          ? "privacy"
          : url === HELP_LINKS.support
            ? "support"
            : "other",
      screen: page,
    });
    window.open(url, "_blank", "noopener");
  }
}
// Settings on one screen: who you are, then tiles for the plan, language,
// characters and help; the account sits at the bottom.
function settingsView() {
  const type = typeById(currentType()?.id) || TYPES[0],
    plan = displayPlan(),
    planName = localized(PLANS[plan].names, language()),
    set = characterSetById(effectiveSet());
  const characterForm = `<form id="character-form"><fieldset class="character-set-field"><legend class="sr-only">${t("characterSet")}</legend><div class="character-set-options">${CHARACTER_SETS.map(
    (option) => {
      const locked = option.paid && plan === "free";
      return `<label class="character-set-option ${locked ? "locked" : ""}"><input type="radio" name="character-set" value="${option.id}" ${effectiveSet() === option.id ? "checked" : ""} ${locked ? "disabled" : ""}>${avatar(type, null, { setId: option.id })}<span class="character-set-label">${localized(option.label, language())}</span><small>${localized(option.names, language())}</small>${locked ? `<span class="lock-note">🔒 ${t("paidOnly")}</span>` : ""}</label>`;
    },
  ).join(
    "",
  )}</div></fieldset><div class="sheet-actions">${infoButton(t("characterSetHint"), t("characterSet"))}<button type="submit" class="btn primary full">${t("save")}</button></div></form>`;
  return `<section class="settings-page"><h1 class="sr-only">${t("settings")}</h1>
 <div class="profile-card" style="--accent:${group(type).color}">${avatar(type, null, { mini: true })}<div class="profile-text"><h2 class="character-name">${esc(state.profile?.nickname)}</h2><p>${esc(name(characterById(type.id)))} · ${esc(name(type))}</p><span class="tag-label">${esc(planName)}</span></div><div class="profile-actions"><button type="button" class="icon-btn" data-action="profile" aria-label="${esc(t("edit"))}" title="${esc(t("edit"))}">${ICONS.edit}</button><button type="button" class="icon-btn" data-action="retake" aria-label="${esc(t("retake"))}" title="${esc(t("retake"))}">${ICONS.retake}</button></div></div>
 <ul class="tile-grid settings-grid">
  <li><button type="button" class="tile" data-go="plans"><span class="tile-icon" aria-hidden="true">${ICONS.star}</span><span class="tile-title">${ct("plans")}</span><span class="tile-value">${esc(planName)}</span></button></li>
  <li><label class="tile tile-select"><span class="tile-icon" aria-hidden="true">${ICONS.globe}</span><span class="tile-title">${t("language")}</span><select id="language" class="tile-value">${LANGUAGES.map((l) => `<option value="${l}" ${l === language() ? "selected" : ""}>${languageNames[l]}</option>`).join("")}</select></label></li>
  <li><button type="button" class="tile" data-sheet-open="characters" aria-haspopup="dialog"><span class="tile-icon" aria-hidden="true">${ICONS.user}</span><span class="tile-title">${t("characterSet")}</span><span class="tile-value">${esc(localized(set.label, language()))}</span></button></li>
  <li><button type="button" class="tile" data-go="help"><span class="tile-icon" aria-hidden="true">${ICONS.tip}</span><span class="tile-title">${t("help")}</span><span class="tile-value">${t("openHelp")}</span></button></li>
 </ul>
 ${accountCard()}
 <div class="link-row"><button type="button" class="btn ghost small" data-link="${esc(HELP_LINKS.support)}">${t("supportSite")} ↗</button><span class="version-note">${t("version")} ${APP_VERSION}</span></div>
 ${sheet("characters", t("characterSet"), characterForm)}</section>`;
}
// Settings only offer to leave: sign out, or delete the account for good.
function accountCard() {
  if (!cloud) return "";
  if (!signedIn())
    return `<button type="button" class="tile wide" data-sheet-open="account" aria-haspopup="dialog"><span class="tile-icon" aria-hidden="true">${ICONS.user}</span><span class="tile-title">${t("signIn")}</span></button>${sheet("account", t("account"), accountView(true), { cls: "tall" })}`;
  return `<section class="account-card"><span class="tile-icon" aria-hidden="true">${ICONS.user}</span><div class="account-text"><h2>${t("account")}</h2><p>${esc(cloud.email() || cloud.displayName?.() || state.profile?.nickname || "Yumetan")}</p></div><div class="account-actions">${button("signOut", "signout", "ghost small")}${button("deleteAccount", "delete-account", "danger ghost small")}${pendingGuestKey ? `<button type="button" class="btn ghost small" data-action="import-guest">${at("importLater")}</button>` : ""}</div></section>`;
}
function accountView(onboard = false) {
  const enabled = cloud?.state.enabled,
    signed = enabled && !cloud.isAnonymous();
  const providers = cloud?.providers?.() || [];
  return `<section class="account-panel"><div class="status" id="account-sync-status">${enabled ? syncMarkup(syncStatus) : offlineStatus()}</div>
  ${signed ? `<p>${esc(cloud.email() || cloud.displayName?.() || state.profile?.nickname || "Yumetan")}</p><div class="row">${button("signOut", "signout", "ghost")}${button("sync", "sync", "ghost")}</div>` : ""}
  <div class="auth-buttons">${["google", "apple", "line"]
    .map((provider) => {
      const linked = providers.includes(
        { google: "google.com", apple: "apple.com", line: "oidc.line" }[
          provider
        ],
      );
      return `<button type="button" class="btn auth-${provider}" data-auth-provider="${provider}" ${!enabled || linked ? "disabled" : ""}><span class="auth-mark" aria-hidden="true">${AUTH_MARKS[provider]}</span><span>${at(provider)}${linked ? ` · ${at("linked")}` : ""}</span></button>`;
    })
    .join("")}</div>
  ${signed && pendingGuestKey ? `<button type="button" class="btn ghost" data-action="import-guest">${at("importLater")}</button>` : ""}
  ${!enabled ? `<button type="button" class="btn ghost" data-action="auth-retry">${at("reconnect")}</button>` : ""}
  ${!signed && enabled ? emailAuthView() : ""}
</section>`;
}
const AUTH_MARKS = {
  apple: '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9s-1.9-.9-3.2-.8c-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8s1.9.8 3.2.8 2.1-1.2 2.9-2.4c.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.4-.9-2.4-3.9zM14 5.5c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.1-.6 2.8-1.4z"/></svg>',
  google: '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1A10 10 0 0 0 2 12c0 1.6.4 3.1 1.1 4.6z"/><path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.4 3-4.1 5.6-4.1z"/></svg>',
  line: '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 3C6.5 3 2 6.6 2 11c0 4 3.5 7.3 8.3 7.9.3.1.8.2.9.5.1.3.1.7 0 1l-.1.9c0 .3-.2 1 .9.5 1.1-.4 5.9-3.5 8-6C21.4 14.3 22 12.7 22 11c0-4.4-4.5-8-10-8z"/></svg>',
};
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
function emailAuthView() {
  let body;
  if (emailMode === "registered")
    body = `<p class="status">${t("signUpDone")}</p>${button("backToSignIn", "email-signin", "primary")}`;
  else if (emailMode === "signin" || emailMode === "signup") {
    const signup = emailMode === "signup";
    body = `<form id="account-form">${input("email", "email", emailDraft.email, "email", 'required autocomplete="email"')}${input("password", "password", emailDraft.password, "password", `required minlength="6" autocomplete="${signup ? "new" : "current"}-password"`)}<div class="row"><button type="submit" class="btn primary">${t(signup ? "signUp" : "signIn")}</button>${signup ? button("backToSignIn", "email-signin", "ghost") : button("back", "email-choose", "ghost")}</div></form>`;
  } else
    body = `<div class="row">${button("signUp", "email-signup", "primary")}${button("signIn", "email-signin", "ghost")}</div>`;
  return `<details id="email-auth" ${emailMode ? "open" : ""}><summary>${at("email")}</summary>${body}</details>`;
}
function setEmailMode(mode) {
  emailMode = mode;
  render();
  $("#email")?.focus();
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
//
// In the store apps the subscription on this device is read too. What the
// store confirmed at purchase used to be all the app knew, so a cancellation,
// an expiry or a switch made in the store's settings went unnoticed, and a
// member who cancelled stayed on the paid plan in the app. The store's
// current answer now replaces it, and when store and server disagree the
// server is asked to read RevenueCat again at once.
async function refreshPlan() {
  if (!signedIn()) return;
  try {
    await social.refreshAccount();
    const store = await storePlan();
    if (store !== undefined) {
      rememberPlan(store?.plan || "free", store?.paidUntil || 0, true);
      if ((store?.plan || "free") !== social.plan()) await social.syncAccount();
    }
    // A purchase the server never recorded (the app closed, or the API was
    // asleep, while it verified): ask it to read the store again now rather
    // than leave the member on the old plan until a webhook happens to land.
    else if (storeAhead()) await social.syncAccount();
  } catch {}
}
// The paid plan the store reports on this device now: a plan, null for none,
// or undefined when it cannot say (the web, no store key, a failed read).
async function storePlan() {
  if (!native || !purchases.available()) return undefined;
  try {
    const info = await purchases.customerInfo(cloud.uid());
    return info ? planFromCustomerInfo(info) : undefined;
  } catch {
    return undefined;
  }
}
// The plan only affects the character collection, so it is refreshed in the
// background: a sleeping API instance must never delay login or app start.
let planRefresh = null,
  planRefreshedAt = 0;
// Coming back to the app re-reads the plan too (at most once a minute), so a
// renewal or a purchase the server confirmed meanwhile shows without a restart.
function refreshPlanOnReturn() {
  if (!cloud || cloud.isAnonymous() || authChanging) return;
  if (Date.now() - planRefreshedAt < 60000) return;
  refreshPlanInBackground();
}
function refreshPlanInBackground() {
  if (planRefresh) return planRefresh;
  planRefreshedAt = Date.now();
  // Whatever changed (the server's plan, the remembered one, a cancellation),
  // the page shows it.
  const state = () =>
    `${displayPlan()}|${social.plan()}|${social.cancelling()}`;
  const before = state();
  planRefresh = refreshPlan()
    .then(() => {
      if (state() !== before && !dirty && !processing) render();
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
      track("language_change", { language: language() });
      trackUser();
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
        // A (re)subscription delivers the current snapshot too. Redraw only when
        // the sync changed something, so typed-in forms are not wiped for nothing.
        const before = JSON.stringify(state);
        syncCloud().then(() => {
          if (!dirty && !processing && JSON.stringify(state) !== before)
            render();
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
  } else if (page === "reading" && $("#share-public"))
    draft = { ...draft, shared: $("#share-public").checked };
  else if (page === "diary" && $("#diary-text"))
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
        if (page === "record" && draft && el.id !== "share-public")
          draft.analysis = null;
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
      run(diagnose);
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
      $("[data-sheet-open=sleep]")?.classList.toggle(
        "on",
        $("#include-sleep").checked,
      );
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
        setSheet(null);
        document.body.classList.remove("sheet-open");
        // The tile and the profile picture follow the new collection.
        if (!dirty) render();
        toast(t("saved"));
        track("character_set_change", { character_set: next.characterSet });
        trackUser();
      });
    };
  if ($("#account-form")) {
    $("#account-form").onsubmit = (e) => {
      e.preventDefault();
      run(() => account(emailMode === "signup" ? "signup" : "signin"));
    };
    for (const key of ["email", "password"])
      $(`#${key}`).oninput = (e) => (emailDraft[key] = e.target.value);
  }
  // Keep the email panel open across re-renders while the user is in the email
  // flow; closing it ends the flow.
  $("#email-auth")?.addEventListener("toggle", (e) => {
    emailMode = e.target.open ? emailMode || "choose" : null;
  });
}
async function run(fn) {
  if (processing) return;
  processing = true;
  try {
    await fn();
  } catch (error) {
    toast(error.userMessage || error.message || t("storageError"));
    // Only coded failures (API answers, auth codes); never the message text.
    if (error?.code)
      track("app_error", { error_code: String(error.code), screen: page });
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
// "Read this dream": one step from the journal page to the reading page. A
// dream whose reading is still valid (nothing edited since) opens it without
// another AI call. Every plan gets an AI reading with each dream; the server
// counts one per dream date. Without an account, or when the AI refuses or
// fails, the on-device reflection stands in so the dream can still be saved.
async function diagnose() {
  capture();
  checkDraft();
  const wasDirty = dirty;
  if (!draft.analysis) {
    disableActionButtons();
    const result = reflect({
      ...draft,
      records: state.records,
      language: language(),
    });
    draft.typeTags = result.tags;
    draft.analysis = result.analysis;
    draft.aiError = signedIn() ? null : "loginRequired";
    if (signedIn()) {
      // The AI reading takes a while: say so on screen, with the moon, until
      // the reading page opens or the failure is shown.
      const stopLoading = beginLoading(displayLanguage(), "reading", null, {
        overlay: true,
      });
      try {
        const { analysis } = await api("/api/reflect", {
          text: draft.text,
          typeTags: result.tags,
          date: draft.date,
          diary: result.diary
            ? { date: result.diary.date, text: result.diary.text }
            : null,
          recentDiaries: recentDiaries(draft.date),
          recentDreams: recentDreams(draft),
          sleep: validateSleep(draft.sleep) ? draft.sleep : null,
          dreamType: currentType()?.id || null,
        });
        draft.analysis = {
          ...analysis,
          engine: "ai",
          language: language(),
          diaryDate: result.diary?.date || null,
        };
      } catch (error) {
        // The reason stays on the reading page (with a retry) instead of only in a toast.
        draft.aiError = error.code || "networkError";
        toast(error.userMessage || error.message);
      } finally {
        stopLoading();
      }
    }
    track("dream_read", {
      engine: draft.analysis?.engine || "local",
      error_code: draft.aiError || "",
      text_length: lengthBucket(draft.text),
      themes: draft.typeTags?.length || 0,
    });
  }
  // Going back returns the same text to the journal page.
  quotaDraft = { page: "record", draft, dirty: wasDirty };
  processing = false;
  await navigate("reading", true);
}
// Up to seven earlier dreams, newest first, as short summaries: the themes, the
// title and the mood weather of their readings let the AI see patterns across days.
function recentDreams(current) {
  return state.records
    .filter(
      (r) =>
        r.kind === "dream" && r.id !== current.id && r.date <= current.date,
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        Date.parse(b.createdAt) - Date.parse(a.createdAt),
    )
    .slice(0, 7)
    .map((r) => ({
      date: r.date,
      typeTags: r.typeTags || [],
      title: String(r.analysis?.title || "").slice(0, 80),
      mood_weather:
        r.analysis?.engine === "ai" ? r.analysis.mood_weather || "" : "",
    }));
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
  plansSource = messageKey;
  quotaDraft = { page, draft };
  dirty = false;
  await navigate("plans", true);
  toast(ct(messageKey));
}
async function saveDream() {
  capture();
  checkDraft();
  if (!canSaveRecord(state.records, draft, displayPlan())) {
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
    before = dreamLevel(state.records).level,
    existing = state.records.find((r) => r.id === draft.id),
    wasShared = Boolean(existing?.shared);
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
  quotaDraft = null;
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
  track("dream_save", {
    engine: saved.analysis?.engine || "local",
    text_length: lengthBucket(saved.text),
    has_sleep: Boolean(saved.sleep),
    has_photo: Boolean(saved.photo),
    themes: saved.typeTags?.length || 0,
    shared: Boolean(saved.shared),
    is_new: !existing,
    level_up: after > before,
    type_changed: beforeType !== currentType()?.id,
    dreams_total: state.records.filter((r) => r.kind === "dream").length,
  });
  if (after > before)
    track("level_up", { level: after, character: currentType()?.id });
  trackUser();
  await syncCloud();
  await shareSaved(saved, wasShared);
}
// The dream's own "share" box: checked → the dream text goes to the feed (the
// server applies the plan's publishing allowance); unchecked after having been
// shared → the post is withdrawn. A refused publish keeps the save and
// unticks the box so it never claims to be public.
async function shareSaved(record, wasShared) {
  if (!signedIn()) return;
  try {
    if (record.shared) await social.publishRecord(record);
    else if (wasShared) await social.makeRecordPrivate(record.id);
    if (record.shared || wasShared)
      track(record.shared ? "dream_share" : "dream_unshare", {
        source: "record",
      });
  } catch (error) {
    track("dream_share_failed", { error_code: error?.code || "unknown" });
    if (record.shared) {
      await commit({
        ...state,
        records: state.records.map((r) =>
          r.id === record.id ? { ...r, shared: false } : r,
        ),
      });
      if (page === "record" && draft?.id === record.id) {
        draft.shared = false;
        render();
      }
      toast(error.userMessage || error.message);
      await syncCloud();
    }
  }
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
  if ((saves[draft.date] || 0) >= PLANS[displayPlan()].diary) {
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
  track("diary_save", { text_length: lengthBucket(saved.text), is_new: !old });
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
  if (record.kind === "dream") {
    await social.makeRecordPrivate(record.id);
  }
  track("record_delete", { kind: record.kind });
  await commit({
    ...state,
    records: state.records.filter((r) => r.id !== record.id),
    deleted: [...state.deleted, record.id],
  });
}
async function saveQuizDraft() {
  await write(`${storageKey}.quiz`, { answers: quizAnswers, index: quizIndex });
}
let quizAdvance = null;
async function moveQuiz(index) {
  clearTimeout(quizAdvance);
  await write(`${storageKey}.quiz`, { answers: quizAnswers, index });
  quizIndex = index;
  haptics.transition("step");
  render();
  $("#quiz-scene")?.focus({ preventScroll: true });
}
async function finishQuiz() {
  if (quizAnswers.some((v) => v === null)) return;
  const firstQuiz = !state.profile?.typeAnswers;
  await commit({
    ...state,
    profile: {
      ...state.profile,
      typeAnswers: [...quizAnswers],
      typeVersion: QUIZ_VERSION,
      language: language(),
    },
  });
  pendingResult = currentType();
  dirty = false;
  processing = false;
  track("quiz_complete", { dream_type: pendingResult?.id || "none" });
  trackUser();
  // A new member sees the paid plans once, after this result. A retake, a
  // local-only build or a member who already pays goes straight home.
  if (firstQuiz && signedIn() && displayPlan() === "free")
    await saveIntroduction({ phase: "plan", step: 3 });
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
    // The GA4 client id lets the server's own analytics events (renewals,
    // cancellations) count as the same person as the app's.
    const client = analytics.header();
    const response = await fetch(base + path, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Yumetan-User": await userId(),
        "X-Yumetan-Code": options.code,
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(client
          ? {
              "X-Yumetan-Analytics": client,
              "X-Yumetan-Platform": native ? cap.getPlatform() : "web",
            }
          : {}),
      },
      body: body
        ? JSON.stringify({ ...body, language: language() })
        : undefined,
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) {
      // Said in the terms of the feature that failed (core/api-errors.js).
      const message = data.code
        ? ct(errorMessageKey(data.code, path))
        : t("networkError");
      throw Object.assign(new Error(message), {
        userMessage: message,
        code: data.code || "networkError",
      });
    }
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
  if (displayPlan() === "free") throw new Error(ct("handwritingPaidRequired"));
  disableActionButtons();
  const data = await api("/api/handwriting", { image: draft.photo });
  draft.text = [draft.text, data.text].filter(Boolean).join("\n");
  draft.analysis = null;
  dirty = true;
  // Back to the writing card, where the recognised text is to be checked.
  openSheetId = null;
  render();
  toast(t("ocrReview"));
  track("photo_ocr", { text_length: lengthBucket(data.text) });
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
  if (mode === "signup") {
    if (!$("#account-form")?.reportValidity()) return;
    try {
      await cloud.signUp(email, password);
    } catch (error) {
      console.error("Sign-up failed", { code: error?.code });
      throw new Error(emailAuthError(error?.code, displayLanguage()));
    }
    // Registration never signs in: the user returns to the sign-in screen and
    // logs in, which starts onboarding and the 16-type quiz like other methods.
    emailDraft = { email, password: "" };
    emailMode = "registered";
    render();
    toast(t("signUpDone"));
    track("sign_up", { method: "password" });
    return;
  }
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
      // A guest signs in to the Apple account directly instead of linking the
      // anonymous user: a link attempt on an Apple ID that already has an account
      // fails with credential-already-in-use, and the nonce-bound token cannot be
      // reliably reused afterwards (auth/missing-or-invalid-nonce). Guest records
      // are carried over by the import prompt, as with LINE.
      login = appleNativeLogin({ cloud, link, upgrade: false });
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
    if (mode === "signin") {
      if (!$("#account-form")?.reportValidity()) return;
      login = cloud.signIn(email, password);
    } else if (mode === "signout") {
      await cancelNativeAuth();
      login = cloud.signOut();
    }
    await login;
    emailMode = null;
    emailDraft = { email: "", password: "" };
    if (syncTask) await syncTask;
    if (mode === "signout") {
      track("logout");
      analytics.setUser(null);
    }
    await switchAccount();
    if (mode !== "signout")
      trackLogin(mode === "signin" ? "password" : provider);
    if (mode === "signout") {
      // Back to the first sign-in screen; the tour is not shown again.
      await saveIntroduction({ phase: "done", step: 3 });
      dirty = false;
      processing = false;
      navigate(firstRunPage(), true);
      toast(t("signedOut"));
      return;
    }
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
    console.error("Sign-in failed", {
      mode,
      provider,
      code: error?.code,
      message: error?.message,
    });
    throw new Error(
      (mode === "signin" ? emailAuthError : authError)(
        error.code,
        displayLanguage(),
      ),
    );
  } finally {
    stopLoading();
    authChanging = false;
    watchAccount();
  }
}
// A completed sign-in. Landing on registration (no profile in the account
// yet) is what the app can tell apart as a sign-up.
function trackLogin(method) {
  track(state.profile ? "login" : "sign_up", { method: method || "unknown" });
  trackUser();
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
// Delete the account for good: the server removes journals, posts, membership
// and the auth user; the device forgets the account's cache and returns to the
// first sign-in screen (as a fresh guest, ready to sign in again).
async function deleteAccount() {
  if (!signedIn()) return;
  if (!confirm(t("deleteAccountConfirm"))) return;
  authChanging = true;
  let serverError = null;
  const stop = beginLoading(displayLanguage(), "account", null, {
    overlay: true,
  });
  stopCloudWatch?.();
  try {
    disableActionButtons();
    await cancelNativeAuth();
    try {
      await api("/api/account/delete", {});
    } catch (error) {
      // The device stands in only when the server cannot delete at all: offline,
      // an older deployment without the route, or no Firebase admin access
      // (every 5xx is reported as serviceUnavailable). Any other answer, such as
      // a rejected token or throttling, is shown as it is instead of being
      // hidden behind a "sign in again" that would not help.
      if (!["networkError", "serviceUnavailable"].includes(error?.code))
        throw error;
      serverError = error;
      console.warn("Server account deletion failed; deleting from the device", {
        code: error?.code,
      });
      await deleteAccountOnDevice();
    }
    if (syncTask) await syncTask.catch(() => {});
    // Forget every account on this device, not just the deleted one. A cache left
    // by an earlier account or guest would be offered to the next login and bring
    // back its profile and character, skipping registration and the quiz.
    await purgeAccounts();
    if (options.planCache) {
      options = { ...options, planCache: null };
      await write("yumetan.v4.options", options);
    }
    pendingGuestKey = null;
    selectedId = null;
    await cloud.signOut();
    await switchAccount();
    await saveIntroduction({ phase: "done", step: 3 });
    dirty = false;
    processing = false;
    navigate(firstRunPage(), true);
    toast(t("deleteAccountDone"));
    track("account_delete", { deleted_by: serverError ? "device" : "server" });
    analytics.setUser(null);
  } catch (error) {
    console.error("Account deletion failed", {
      code: error?.code,
      server: serverError?.code,
    });
    // Why the server could not do it is kept in the message for a bug report.
    const detail = serverError?.code ? ` (${serverError.code})` : "";
    throw new Error(
      error?.code === "auth/requires-recent-login"
        ? t("deleteAccountRecent") + detail
        : error?.userMessage
          ? `${t("deleteAccountFailed")} ${error.userMessage}`
          : emailAuthError(error?.code, displayLanguage()) + detail,
    );
  } finally {
    stop();
    authChanging = false;
    watchAccount();
  }
}
// Firebase deletes a user from the device only after a recent sign-in. An
// email/password account confirms its password here instead of signing out
// and back in; other providers get the "sign in again" message.
async function deleteAccountOnDevice() {
  try {
    await cloud.deleteAccount();
  } catch (error) {
    if (
      error?.code !== "auth/requires-recent-login" ||
      !cloud.reauthenticate ||
      !(cloud.providers?.() || []).includes("password")
    )
      throw error;
    const password = prompt(t("deleteAccountPassword"));
    if (!password) throw error;
    await cloud.reauthenticate(password);
    await cloud.deleteAccount({ recent: true });
  }
}
async function switchAccount() {
  social.reset();
  stopCloudWatch?.();
  storageKey = cloud.uid() ? `yumetan.v4.${cloud.uid()}` : "yumetan.v4.local";
  state = { version: 4, profile: null, records: [], deleted: [] };
  draft = null;
  dirty = false;
  await write("yumetan.v4.active", storageKey);
  await rememberMemberScope();
  state = (await read(storageKey)) || state;
  pendingGuestKey = await read(`${storageKey}.guest-import`);
  applyAccountPreferences();
  // `draft` is the module-level journal draft; the questionnaire draft gets its own name.
  const savedQuiz = quizDraft(await read(`${storageKey}.quiz`));
  quizAnswers = savedQuiz
    ? savedQuiz.answers
    : Array(QUESTIONS.length).fill(null);
  quizIndex = savedQuiz ? savedQuiz.index : 0;
  refreshPlanInBackground();
  await syncCloud();
}
async function resumeNativeLogin() {
  if (!native || !cloud || authChanging || processing) return;
  authChanging = true;
  let switched = false;
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
    switched = true;
    await switchAccount();
    trackLogin(pending.provider || cloud.providers?.()[0]);
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
      switched = true;
      await switchAccount();
      navigate(state.profile?.typeAnswers ? "home" : "onboard", true);
    }
    toast(authError(error.code, displayLanguage()));
  } finally {
    stopLoading();
    authChanging = false;
    // Returning to the app with no pending login must not resubscribe the cloud
    // watch: the fresh subscription fires at once and would redraw the screen.
    if (switched || !stopCloudWatch) watchAccount();
  }
}
async function startVoice() {
  if (voice) {
    stopVoice();
    return;
  }
  track("voice_input", { screen: page });
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
      voiceButton(false);
    };
    voice = sr;
    sr.start();
  }
  voiceButton(true);
}
// The microphone tool glows and reads "stop" while it listens.
function voiceButton(on) {
  const b = $("[data-action=voice]");
  if (!b) return;
  b.classList.toggle("listening", on);
  b.setAttribute("aria-pressed", String(on));
  b.setAttribute("aria-label", t(on ? "stop" : "voice"));
  const label = b.querySelector(".tool-label");
  if (label) label.textContent = t(on ? "stop" : "toolVoice");
}
function stopVoice() {
  if (voice) {
    const ref = voice;
    ref.stop();
    voice = null;
  }
  voiceButton(false);
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
  begin: () =>
    navigate(firstRunPage() === "plan-offer" ? "plan-offer" : "home", true),
  back: goBack,
  retake: async () => {
    quizAnswers = Array(QUESTIONS.length).fill(null);
    quizIndex = 0;
    pendingResult = null;
    await saveQuizDraft();
    navigate("quiz", true);
  },
  "quiz-back": async () => {
    if (quizIndex === 0) {
      await navigate(state.profile?.typeAnswers ? "catalog" : "onboard", true);
      return;
    }
    await moveQuiz(quizIndex - 1);
  },
  "quiz-next": async () => {
    if (quizAnswers[quizIndex] === null) return;
    if (quizIndex === QUESTIONS.length - 1) await finishQuiz();
    else await moveQuiz(quizIndex + 1);
  },
  diagnose,
  "retry-reading": async () => {
    if (!draft) return;
    draft.analysis = null;
    draft.aiError = null;
    await diagnose();
  },
  "save-reading": saveDream,
  recognize,
  "remove-photo": () => {
    capture();
    draft.photo = null;
    dirty = true;
    render();
  },
  voice: startVoice,
  sync: syncCloud,
  "auth-retry": async () => {
    if (!dirty || (await confirmDiscard(t))) location.reload();
  },
  "import-guest": async () => {
    if (pendingGuestKey)
      await offerGuestImport(pendingGuestKey, await read(pendingGuestKey));
    render();
  },
  signout: () => account("signout"),
  "email-choose": () => setEmailMode("choose"),
  "email-signin": () => setEmailMode("signin"),
  "email-signup": () => setEmailMode("signup"),
  "delete-account": deleteAccount,
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
  // A tap anywhere outside a tip puts it away.
  if (!event.target.closest("#tip, [data-tip], [data-page-tip]")) hideTip();
  const closer = event.target.closest(
    "[data-sheet-close], [data-tip-close], [data-toast-close]",
  );
  if (closer) {
    if (closer.matches("[data-sheet-close]")) {
      setSheet(null);
      document.body.classList.remove("sheet-open");
    } else if (closer.matches("[data-tip-close]")) hideTip();
    else {
      clearTimeout(toast.timer);
      $("#toast").classList.remove("visible");
    }
    return;
  }
  const el = event.target.closest("button");
  if (el?.dataset.sheetOpen && !el.disabled) {
    setSheet(el.dataset.sheetOpen);
    document.body.classList.add("sheet-open");
    return;
  }
  if (el?.matches("[data-page-tip]")) {
    if ($("#tip").classList.contains("visible")) hideTip();
    else openPageTip(true);
    return;
  }
  if (el?.dataset.tip) {
    showTip(el.dataset.tip, { anchor: el });
    return;
  }
  if (el?.dataset.tab) {
    const box = el.closest("[data-tabs]");
    box.querySelectorAll("[data-tab]").forEach((tab) => {
      const on = tab === el;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
    });
    box.querySelectorAll("[data-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.panel !== el.dataset.tab;
    });
    return;
  }
  if (el?.dataset.authProvider) {
    run(() => account("provider", el.dataset.authProvider));
    return;
  }
  if (!el || el.disabled) return;
  if (el.dataset.go) {
    navigate(el.dataset.go);
    return;
  }
  if (el.dataset.link) {
    openExternal(el.dataset.link);
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
    $("[data-sheet-open=tags]")?.classList.toggle("on", draft.typeTags.length > 0);
    return;
  }
  if (el.dataset.answer != null) {
    run(async () => {
      const answers = [...quizAnswers];
      answers[quizIndex] = Number(el.dataset.answer);
      await write(`${storageKey}.quiz`, { answers, index: quizIndex });
      quizAnswers = answers;
      document.querySelectorAll("[data-answer]").forEach((choice) => {
        choice.setAttribute("aria-pressed", String(choice === el));
      });
      $("[data-action=quiz-next]").disabled = false;
      // The chosen answer lights up for a moment, then the next question opens.
      const at = quizIndex;
      clearTimeout(quizAdvance);
      quizAdvance = setTimeout(() => {
        if (page !== "quiz" || quizIndex !== at || processing) return;
        run(actions["quiz-next"]);
      }, 280);
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
          "new-dream",
        ].includes(el.dataset.action)
      )
        action();
      else run(action);
    }
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || document.querySelector("dialog[open]")) return;
  if (openSheetId) {
    setSheet(null);
    document.body.classList.remove("sheet-open");
  } else hideTip();
});
window.addEventListener("beforeunload", (event) => {
  if (dirty) {
    event.preventDefault();
    event.returnValue = "";
  }
});
window.addEventListener("popstate", async ({ state: route }) => {
  if (route?.session !== navigationSession) {
    if (hasBack()) await goBack();
    else if (page !== "home") await navigate("home", false, true);
    return;
  }
  if (route.index === routeIndex) return;
  if (processing || (dirty && !(await confirmDiscard(t)))) {
    history.go(routeIndex - route.index);
    return;
  }
  // An in-app Back can replace the active entry with its parent page.
  if (!dirty && route.index > 0 && route.index < routeIndex && route.page === page) {
    history.back();
    return;
  }
  const record = page === "detail" ? state.records.find((r) => r.id === selectedId) : null;
  routeIndex = route.index;
  selectedId = route.recordId;
  selectedType = route.typeId;
  navStack = route.stack;
  await navigate(route.page, true, true);
  restoreJournal(record, route.page);
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
  await rememberMemberScope();
}
async function loadScope() {
  if (state.profile?.characterSet)
    options.characterSet = normalizeCharacterSet(state.profile.characterSet);
  pendingGuestKey = await read(`${storageKey}.guest-import`);
  const savedQuiz = quizDraft(await read(`${storageKey}.quiz`));
  if (savedQuiz) {
    quizAnswers = savedQuiz.answers;
    quizIndex = savedQuiz.index;
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
  if (page === "plan-offer") social.enter(page);
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
    // The welcome screen stays for one second from launch, then the app appears.
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, WELCOME_MS - performance.now())),
    );
    setRoute();
    booted = true;
    render();
    setTimeout(() => openPageTip(), 900);
    // Analytics starts once the first screen is on; events queue until then.
    analytics.init();
    analytics.page(page);
    trackUser();
    track("app_open", {
      first_run: !state.profile,
      signed_in: signedIn(),
      screen: page,
    });
    if (["plans", "plan-offer"].includes(page)) social.enter(page);
    if (cloud)
      syncCloud().then(() => {
        if (
          !dirty &&
          !processing &&
          ["home", "quiz", "onboard"].includes(page)
        ) {
          page = firstRunPage();
          render();
          if (page === "plan-offer") social.enter(page);
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
  refreshPlanOnReturn();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    resumeNativeLogin();
    if (!authChanging) syncCloud();
    refreshPlanOnReturn();
  }
});
await boot();
if (native) {
  plugins.App?.addListener("appStateChange", ({ isActive }) => {
    if (!isActive) return;
    track("app_foreground", { screen: page });
    resumeNativeLogin();
    refreshPlanOnReturn();
  });
  plugins.App?.addListener("backButton", () => {
    if (processing) return;
    // An open sheet closes first, like a dialog.
    if (openSheetId) {
      setSheet(null);
      document.body.classList.remove("sheet-open");
      return;
    }
    if (page === "quiz") run(actions["quiz-back"]);
    else if (hasBack()) goBack();
    else if (page !== "home") navigate("home");
    else plugins.App.exitApp?.();
  });
  await resumeNativeLogin();
}
if ("serviceWorker" in navigator && !native)
  navigator.serviceWorker.register("sw.js").catch(() => {});
