import { loadingMarkup, beginLoading } from "./core/loading.js";
import { PLANS, STAMPS, stampCounts } from "./core/plans.js";
import { planFromCustomerInfo, productId } from "./core/purchases.js";
import { communityMessages } from "./core/community-i18n.js";
import { localized } from "./core/types.js";
export const communityText = (key, lang) =>
  localized(communityMessages[key] || communityMessages.error, lang);
// After a store purchase RevenueCat may need a moment before the server can
// see the subscription: the plan is re-checked this many times, this far apart.
export const SYNC_ATTEMPTS = 6;
export const SYNC_INTERVAL = 2500;
// How long a post is held before its stamps open.
export const LONG_PRESS_MS = 450;
export function createCommunity({
  api,
  language,
  esc,
  navigate,
  render,
  toast,
  run,
  markSaved,
  signedIn,
  nickname,
  character,
  currentType,
  isNative,
  purchases,
  uid = () => null,
  legalUrl = () => "",
  onAccount = () => {},
  onPurchased = () => {},
  // The whole purchase finished (store, then server): the plan offer uses it
  // to move a new member on to the home page.
  onCheckoutDone = () => {},
  // "Start for free" on the plan offer: the app ends its first run.
  finishOffer = async () => {},
  // GA4 events (core/analytics.js); a no-op without a measurement ID.
  track = () => {},
  // The plan the rest of the app shows (the server's, or a better one the
  // store confirmed that the server has yet to hear of), and a fresh check of
  // store and server together.
  shownPlan = null,
  recheck = null,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  // Timeline cards open with this many characters of the dream; "read more"
  // shows the rest in place. Cleared whenever the timeline is loaded again.
  const FEED_CHARS = 30,
    expanded = new Set();
  let account = { plan: "free" },
    current = "",
    version = 0,
    error = "",
    busy = false,
    posts = [],
    next = null,
    detail = null,
    shareRecord = null,
    sharing = null,
    shareDraft = null,
    teaser = null,
    cycle = "monthly",
    selectedPlan = "starter",
    // The plan offer's step: the overview, or the Starter / Standard choice.
    offerStep = "intro",
    // The post whose stamp picker is open, and whether a long press just
    // opened it (so the tap that ends the press does not also open the post).
    picker = null,
    pressed = false;
  const t = (key) => communityText(key, language());
  const b = (label, action, attrs = "") =>
    `<button type="button" class="btn ghost" data-social="${action}" ${attrs}>${t(label)}</button>`;
  const planOf = (a) =>
    a?.paidUntil && a.paidUntil <= Date.now() ? "free" : a?.plan || "free";
  const plan = () => planOf(account);
  // `verified` marks a plan the server itself reported (not a reset or a
  // failed request), which is the only kind worth remembering offline.
  const setAccount = (next, verified = true) => {
    account = next || { plan: "free" };
    onAccount(account, verified);
    return account;
  };
  // Purchases run only inside the store apps, and only once the server can verify them.
  const canBuy = () =>
    Boolean(isNative() && purchases?.available() && account.billingConfigured);
  const info = (text, label = "") =>
    `<button type="button" class="info-btn" data-tip="${esc(text)}" aria-label="${esc(label || t("details"))}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 11v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="7.8" r="1.2" fill="currentColor"/></svg></button>`;
  const paywall = () =>
    `<div class="paywall"><span class="paywall-moon" aria-hidden="true">☾</span><p>${t("paidRequired")}</p><div class="row">${b("plans", "plans")}${!signedIn() ? b("accountSettings", "settings") : ""}</div>${!signedIn() ? `<p class="sr-only">${t("loginRequired")}</p>` : ""}</div>`;
  const status = () =>
    error
      ? `<p role="alert" class="status">${esc(error)}</p>`
      : busy
        ? loadingMarkup(language(), "load")
        : "";
  // Timeline cards show only who dreamed (the 16-type character and the
  // nickname) and the dream itself, like a social post.
  const author = (p) =>
    `<img class="post-avatar" src="${character(p.typeId, p.characterSet).image}" width="48" height="48" alt="" decoding="async">`;
  // Who wrote it: another member's nickname, or the coloured "you" mark on a
  // post of one's own.
  const postName = (p) =>
    p.mine ? `<span class="post-badge">${t("minePost")}</span>` : esc(p.alias);
  // Paid members react to other members' posts; everyone sees the counts.
  const canReact = (p) => signedIn() && plan() !== "free" && !p.mine;
  const stampName = (s) => localized(s.names, language());
  // Under every post: each stamp given and how many times, and for a paid
  // reader the button that opens all the stamps. Tapping a count gives (or
  // takes back) that stamp.
  const stampBar = (p) => {
    const react = canReact(p);
    const chips = stampCounts(p.reactions)
      .map(([s, n]) => {
        const chosen = p.stamp === s.id;
        const label = `${esc(stampName(s))} ${n}`;
        return react
          ? `<button type="button" class="stamp-chip${chosen ? " chosen" : ""}" data-social="stamp" data-id="${esc(p.id)}" data-stamp="${s.id}" aria-pressed="${chosen}" aria-label="${label}"><span aria-hidden="true">${s.emoji}</span><span class="stamp-count">${n}</span></button>`
          : `<span class="stamp-chip" role="img" aria-label="${label}"><span aria-hidden="true">${s.emoji}</span><span class="stamp-count">${n}</span></span>`;
      })
      .join("");
    const add = react
      ? `<button type="button" class="stamp-add" data-social="stamp-open" data-id="${esc(p.id)}" aria-haspopup="dialog" aria-label="${t("stampReact")}"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="10.5" cy="12" r="7.5"/><path d="M7.8 13.6c.8 1.1 1.7 1.6 2.7 1.6s1.9-.5 2.7-1.6"/><path d="M8.2 9.6h.01M12.8 9.6h.01" stroke-width="2.4"/><path d="M20 3.5v5M17.5 6h5"/></svg></button>`
      : "";
    return chips || add ? `<div class="stamp-bar">${chips}${add}</div>` : "";
  };
  // Free members: their own dreams in full, and the opening of a few of today's
  // other dreams — name and title whole, with how others reacted.
  const teaserCard = (p) =>
    p.mine
      ? postCard(p, true, true)
      : `<article class="card feed-card teaser-card" data-post-id="${esc(p.id)}">${author(p)}<div class="post-body"><strong class="post-name">${postName(p)}</strong><p class="post-title">${esc(p.title)}</p><p class="prose post-text teaser-text">${esc(p.excerpt)}<button type="button" class="link-button" data-social="plans">${t("readMore")}</button></p>${stampBar(p)}</div></article>`;
  const teaserView = () =>
    `<div class="teaser"><div class="feed-list carousel">${(teaser?.posts || []).map(teaserCard).join("") || (!busy ? `<p class="empty">${t("emptyTeaser")}</p>` : "")}</div><div class="page-actions"><button type="button" class="btn primary full" data-social="plans">${t("seeMore")}</button></div></div>`;
  const postText = (p, excerpt) => {
    const chars = Array.from(p.text || "");
    const short = excerpt && !expanded.has(p.id) && chars.length > FEED_CHARS;
    return short
      ? `<p class="prose post-text post-excerpt">${esc(chars.slice(0, FEED_CHARS).join(""))}<button type="button" class="link-button" data-social="expand" data-id="${esc(p.id)}">${t("readMore")}</button></p>`
      : `<div class="post-text"><p class="prose">${esc(p.text)}</p></div>`;
  };
  const postCard = (p, open = true, withTitle = false, excerpt = false) =>
    `<article class="card feed-card${open ? " post-open" : ""}${p.mine ? " post-mine" : ""}" data-post-id="${esc(p.id)}" ${open ? `data-social="post" data-id="${esc(p.id)}" role="button" tabindex="0" aria-label="${esc(p.mine ? t("minePost") : p.alias)} · ${t("openPost")}"` : ""}>${author(p)}<div class="post-body"><strong class="post-name">${postName(p)}</strong>${withTitle ? `<p class="post-title">${esc(p.title)}</p>` : ""}${postText(p, excerpt)}${stampBar(p)}</div></article>`;
  // Every stamp, opened by the reaction button or a long press on a post.
  const pickerView = () => {
    const p = picker && findPost(picker);
    if (!p || !canReact(p)) return "";
    return `<div class="stamp-backdrop" data-social="stamp-close"></div><div class="stamp-sheet" role="dialog" aria-modal="true" aria-labelledby="stamp-sheet-title"><p id="stamp-sheet-title" class="stamp-sheet-title">${t("stampReact")}</p><div class="stamp-grid">${STAMPS.map((s) => `<button type="button" class="stamp-option${p.stamp === s.id ? " chosen" : ""}" data-social="stamp" data-id="${esc(p.id)}" data-stamp="${s.id}" aria-pressed="${p.stamp === s.id}"><span class="stamp-emoji" aria-hidden="true">${s.emoji}</span><span class="stamp-name">${esc(stampName(s))}</span></button>`).join("")}</div><div class="row stamp-sheet-actions">${p.stamp ? `<button type="button" class="btn ghost small" data-social="stamp" data-id="${esc(p.id)}" data-stamp="${p.stamp}">${t("stampRemove")}</button>` : ""}<button type="button" class="btn ghost small" data-social="stamp-close">${t("close")}</button></div></div>`;
  };
  // Every copy of a post on screen (the timeline, the teaser, its own page).
  const copies = (id) =>
    [...posts, ...(teaser?.posts || []), detail?.post].filter(
      (p) => p?.id === id,
    );
  const findPost = (id) => copies(id)[0] || null;
  // Give a stamp, or take it back when it is the one already given.
  async function react(id, stampId) {
    const p = findPost(id);
    if (!p || !canReact(p)) return;
    const stamp = stampId && p.stamp !== stampId ? stampId : null;
    const r = await api(
      "/api/community/posts/" + encodeURIComponent(id) + "/reaction",
      { stamp },
    );
    track("community_react", { stamp: stamp || "none", removed: !stamp });
    for (const copy of copies(id)) {
      copy.reactions = r.reactions;
      copy.stamp = r.stamp;
    }
    picker = null;
  }
  // A long press on another member's post opens the stamps; a free member is
  // told they come with the paid plans.
  function longPress(id) {
    const p = findPost(id);
    if (!p || p.mine) return;
    pressed = true;
    if (!canReact(p)) {
      toast(t("stampPaid"));
      return;
    }
    picker = id;
    render();
  }
  const planFields = [
    ["dreamLimit", "dreams"],
    ["diaryLimit", "diary"],
    ["reflectionLimit", "reflections"],
    ["ocrLimit", "handwriting"],
    ["readLimit", "reads"],
    ["publishLimit", "publishes"],
    ["activeLimit", "activePosts"],
    ["reactionLimit", "reactions"],
  ];
  const cyclePicker = () =>
    `<div class="row plan-cycle" role="group" aria-label="${t("plans")}">${b("monthly", "monthly", `aria-pressed="${cycle === "monthly"}"`)}${b("yearly", "yearly", `aria-pressed="${cycle === "yearly"}"`)}</div>`;
  // The store's localized price wins over the catalog price whenever it is known.
  let storePrices = {};
  const planPrice = (p) =>
    storePrices[productId(p.id, cycle)] ||
    `¥${p[cycle].toLocaleString(language())}`;
  // Guideline 3.1.2: the plan's name, length and price sit right above its purchase button.
  const purchaseSummary = (p) =>
    `<div class="purchase-summary"><strong>${localized(p.names, language())} · ${t(cycle)}</strong><span>${t(cycle === "yearly" ? "periodYearly" : "periodMonthly")} · ${planPrice(p)}</span><small>${t("storePrice")}</small></div>`;
  const planName = (p) => localized(p.names, language());
  // The subscribe / switch call to action: every paid plan except the current
  // one (Free is never "subscribed to": cancelling returns there by itself).
  // Purchases run in the store apps; elsewhere the button stays visible but
  // disabled with the reason below.
  const planShown = () => shownPlan?.() || plan();
  // The plan's state in words: a purchase the server has yet to confirm (with
  // a button to check again), or a cancellation that ends the paid plan at the
  // end of its period.
  const planState = () => {
    const shown = planShown();
    if (shown !== plan())
      return `<div class="status plan-state" role="status"><p>${t("planPending").replace("{plan}", planName(PLANS[shown]))}</p>${b("recheckPlan", "resync")}</div>`;
    if (shown !== "free" && account.cancelAtPeriodEnd && account.paidUntil)
      return `<p class="status plan-state" role="status">${t("cancelScheduled")
        .replace("{plan}", planName(PLANS[shown]))
        .replace(
          "{date}",
          esc(new Date(account.paidUntil).toLocaleDateString(language())),
        )}</p>`;
    return "";
  };
  const cta = (p, short = false) => {
    if (p.id === "free" || p.id === planShown()) return "";
    const switching = planShown() !== "free";
    return `<button type="button" class="btn primary plan-cta${short ? " short" : ""}" data-social="checkout" data-plan="${p.id}" ${!canBuy() ? "disabled" : ""}>${short ? t(switching ? "switchPlan" : "subscribe") : t(switching ? "switchTo" : "subscribeTo").replace("{plan}", planName(p))}</button>`;
  };
  // Required wherever a subscription is offered: what renews, and working links
  // to the terms and the privacy policy.
  const legal = () =>
    `<div class="legal"><p class="legal-note">${t("autoRenewNote")}</p><div class="row legal-links"><button type="button" class="btn small ghost" data-link="${esc(legalUrl("terms"))}">${t("termsOfUse")} ↗</button><button type="button" class="btn small ghost" data-link="${esc(legalUrl("privacy"))}">${t("privacyPolicy")} ↗</button></div></div>`;
  const ctaNoteText = () =>
    !signedIn()
      ? t("loginRequired")
      : !isNative()
        ? t("webBilling")
        : !canBuy()
          ? t("nativeBilling")
          : planShown() !== "free"
            ? t("switchNote")
            : t("billingReturn");
  const ctaNote = () => `<p class="cta-note">${ctaNoteText()}</p>`;
  // A build wired to RevenueCat's Test Store buys without the store sheet and
  // without charging: say so, or a simulated subscription passes for a real one.
  const testStoreNote = () =>
    purchases?.testStore?.()
      ? `<p class="status test-store" role="status">${t("testStore")}</p>`
      : "";
  function plansView() {
    const plans = Object.values(PLANS);
    return `<section class="plans-overview"><div class="plans-top"><h1>${t("comparePlans")}</h1>${cyclePicker()}</div>${status()}${testStoreNote()}${planState()}
    <table class="plan-comparison"><caption class="sr-only">${t("plans")} · ${t(cycle)}</caption><thead><tr><td></td>${plans.map((p) => `<th scope="col" class="${p.id === planShown() ? "current" : ""}"><span class="plan-name">${localized(p.names, language())}</span><span class="plan-price">${planPrice(p)}</span><small>${t(cycle)}</small>${p.id === planShown() ? `<span class="current-plan">${t("currentPlan")}</span>` : ""}</th>`).join("")}</tr></thead>
    <tbody>${[
      ["dreamShort", "dreams"],
      ["aiShort", "reflections"],
      ["ocrShort", "handwriting"],
      ["readShort", "reads"],
    ]
      .map(
        ([label, key]) =>
          `<tr><th scope="row">${t(label)}</th>${plans.map((p) => `<td>${p[key] || "—"}</td>`).join("")}</tr>`,
      )
      .join("")}
    <tr class="plan-links"><th scope="row">${t("planDetails")}</th>${plans.map((p) => `<td>${b("details", "plan-detail", `data-plan="${p.id}" aria-label="${localized(p.names, language())} · ${t("details")}"`)}</td>`).join("")}</tr>
    <tr class="plan-cta-row"><th scope="row" class="sr-label">${info(ctaNoteText(), t("subscribe"))}</th>${plans.map((p) => `<td>${cta(p, true) || (p.id === planShown() ? `<span class="current-plan">${t("currentPlan")}</span>` : "")}</td>`).join("")}</tr></tbody></table>
    <div class="chip-row">${b("remaining", "plan-detail", `data-plan="${planShown()}"`)}${b("cancelPlan", "help-cancel")}${signedIn() && canBuy() ? b("restorePurchases", "restore") : ""}${signedIn() && account.managementUrl ? b("managePlan", "manage") : ""}</div>${legal()}</section>`;
  }
  function planDetailsView() {
    const p = PLANS[selectedPlan] || PLANS.starter;
    const notes = [
      t("freeFeatures"),
      t("renewalNote"),
      t("planRules"),
      t("costNote"),
      t("readNote"),
    ].join("\n");
    return `<section class="plan-detail"><div class="plans-top"><h1>${localized(p.names, language())}</h1>${cyclePicker()}</div>${status()}${testStoreNote()}${planState()}<section class="plan-card"><div class="plan-card-head"><p class="plan-price">${planPrice(p)}<small> / ${t(cycle)}</small></p>${p.id === planShown() ? `<span class="tag-label">${t("currentPlan")}</span>` : ""}${info(notes, t("planDetails"))}</div><p class="plan-summary">${t(p.id + "Summary")}</p><dl>${planFields.map(([label, key]) => `<div><dt>${t(label)}</dt><dd>${p[key]}</dd></div>`).join("")}</dl></section>${cta(p) ? `<div class="purchase-bar">${purchaseSummary(p)}${cta(p)}${ctaNote()}</div>` : ""}<div class="usage-strip"><h2>${t("remaining")}</h2><p>${t("reflectionLimit")} ${account.usage?.day?.reflections || 0}/${PLANS[plan()].reflections} · ${t("ocrLimit")} ${account.usage?.month?.handwriting || 0}/${PLANS[plan()].handwriting} · ${t("readLimit")} ${account.usage?.day?.reads || 0}/${PLANS[plan()].reads}</p>${account.paidUntil ? `<p>${t("paidUntil")}: ${esc(new Date(account.paidUntil).toLocaleString(language()))}</p>` : ""}</div><div class="chip-row">${b("refresh", "refresh")}${signedIn() && canBuy() ? b("restorePurchases", "restore") : ""}${signedIn() && account.managementUrl ? b("managePlan", "manage") : ""}${b("cancelPlan", "help-cancel")}</div>${legal()}</section>`;
  }
  function shareView() {
    const d = shareDraft;
    if (error)
      return `<section class="share-page"><h1 class="sr-only">${t("share")}</h1>${status()}${b("refresh", "refresh")}</section>`;
    return `<section class="share-page"><h1 class="sr-only">${t("share")}</h1>${status()}${!signedIn() ? `<p class="status">${t("shareLogin")}</p>${paywall()}` : busy ? "" : `<div class="share-state"><span class="state-dot${sharing?.public ? " on" : ""}" aria-hidden="true"></span><strong>${t(sharing?.public ? "public" : "private")}</strong>${info(t("shareSnapshot"), t("share"))}${sharing?.public ? b("unpublish", "unpublish", `data-id="${sharing.id}"`) : ""}</div>${d ? `<form id="share-form" class="compose-form"><div class="field-row"><label class="field"><span>${t("alias")}</span><input id="share-alias" class="input" required maxlength="30" value="${esc(d.alias)}"></label><label class="field"><span>${t("postTitle")}</span><input id="share-title" class="input" required maxlength="80" value="${esc(d.title)}"></label></div><label class="paper"><span class="paper-label">${t("postText")}</span><textarea id="share-text" required maxlength="20000">${esc(d.text)}</textarea></label><label class="check"><input id="share-consent" type="checkbox" required><span>${t("consent")}</span></label><div class="page-actions"><button class="btn primary full" type="submit">${t("publish")}</button></div></form>` : ""}`}</section>`;
  }
  function detailView() {
    if (!detail) return `<h1 class="sr-only">${t("community")}</h1>${status()}`;
    return `<section class="post-page">${status()}${postCard(detail.post, false, true)}</section>${pickerView()}`;
  }
  // Shown once, right after a new account's first quiz result: what the paid
  // plans add, then (on "subscribe") Starter and Standard side by side with
  // their purchase buttons. "Start for free" sits under the main button on
  // both steps, and the choice step can go back to the overview.
  const fill = (key, values) =>
    t(key).replace(/\{(\w+)\}/g, (m, k) =>
      k in values ? esc(String(values[k])) : m,
    );
  const priceOf = (p, c) =>
    storePrices[productId(p.id, c)] || `¥${p[c].toLocaleString(language())}`;
  function planOfferView() {
    const { free, starter, standard } = PLANS,
      paid = [starter, standard];
    const freeLink = `<div class="offer-free-row"><button type="button" class="link-button offer-free" data-social="offer-free">${t("offerFree")}</button>${info(t("offerFreeNote"), t("offerFree"))}</div>`;
    if (offerStep === "choose")
      return `<section class="plan-offer" data-offer-step="choose"><button type="button" class="back-link inline-back" data-social="offer-back">‹ ${t("offerBack")}</button><div class="plans-top"><h1>${t("offerChooseTitle")}</h1>${cyclePicker()}</div>${testStoreNote()}${planState()}<div class="offer-plans">${paid
        .map(
          (p) =>
            `<section class="plan-card offer-plan${p.id === "starter" ? " recommended" : ""}" data-offer-plan="${p.id}">${p.id === "starter" ? `<span class="ribbon">${t("recommended")}</span>` : ""}<h2>${planName(p)}</h2><p class="plan-price">${planPrice(p)}<small> / ${t(cycle)}</small></p><dl>${planFields
              .filter(([, key]) =>
                [
                  "dreams",
                  "diary",
                  "reflections",
                  "handwriting",
                  "reads",
                ].includes(key),
              )
              .map(
                ([label, key]) =>
                  `<div><dt>${t(label)}</dt><dd>${p[key]}</dd></div>`,
              )
              .join("")}</dl>${purchaseSummary(p)}${cta(p)}</section>`,
        )
        .join("")}</div>${ctaNote()}${freeLink}${legal()}</section>`;
    const features = [
      [
        "✎",
        "offerDreamsTitle",
        "offerDreamsText",
        {
          free: free.dreams,
          starter: starter.dreams,
          standard: standard.dreams,
        },
      ],
      [
        "☾",
        "offerDiaryTitle",
        "offerDiaryText",
        { free: free.diary, starter: starter.diary, standard: standard.diary },
      ],
      [
        "▣",
        "offerOcrTitle",
        "offerOcrText",
        { starter: starter.handwriting, standard: standard.handwriting },
      ],
      [
        "♡",
        "offerCommunityTitle",
        "offerCommunityText",
        {
          starter: starter.reads,
          standard: standard.reads,
          starterReactions: starter.reactions,
          standardReactions: standard.reactions,
        },
      ],
      ["✦", "offerCharactersTitle", "offerCharactersText", {}],
    ];
    return `<section class="plan-offer" data-offer-step="intro"><p class="eyebrow">YOUR DREAM, YOUR PLAN</p><h1>${t("offerTitle")}</h1>${testStoreNote()}<div class="offer-prices">${paid
      .map(
        (p) =>
          `<div class="offer-price${p.id === "starter" ? " recommended" : ""}" data-offer-plan="${p.id}"><span class="plan-name">${planName(p)}</span><span class="plan-price">${priceOf(p, "monthly")}<small> / ${t("monthly")}</small></span><small>${priceOf(p, "yearly")} / ${t("yearly")}</small></div>`,
      )
      .join("")}</div><ul class="offer-features">${features
      .map(
        ([icon, title, text, values]) =>
          `<li><button type="button" class="offer-feature" data-tip="${esc(fill(text, values))}"><span class="tile-icon" aria-hidden="true">${icon}</span><strong>${t(title)}</strong></button></li>`,
      )
      .join("")}</ul><p class="sr-only">${fill("offerPricing", {
      starterMonthly: priceOf(starter, "monthly"),
      starterYearly: priceOf(starter, "yearly"),
      standardMonthly: priceOf(standard, "monthly"),
      standardYearly: priceOf(standard, "yearly"),
    })}</p><div class="offer-actions"><button type="button" class="btn primary plan-cta full" data-social="offer-choose">${t("offerSubscribe")}</button>${freeLink}</div>${legal()}</section>`;
  }
  function view(page) {
    if (page === "plans") return plansView();
    if (page === "plan-details") return planDetailsView();
    if (page === "plan-offer") return planOfferView();
    if (page === "share") return shareView();
    if (page === "community-post") return detailView();
    // The timeline: today's dreams as cards side by side; swipe through them.
    return `<section class="community-page"><h1 class="sr-only">${t("community")}</h1>${status()}${error ? `<div class="row">${b("refresh", "refresh")}</div>` : ""}${plan() === "free" ? (signedIn() ? teaserView() : paywall()) : `<div class="feed-list timeline carousel">${posts.map((p) => postCard(p, true, false, true)).join("") || (!busy ? `<p class="empty">${t("emptyFeed")}</p>` : "")}</div>${next ? `<div class="page-actions">${b("nextPage", "next")}</div>` : ""}`}</section>${pickerView()}`;
  }
  async function refreshAccount() {
    return setAccount(
      signedIn() ? await api("/api/account") : { plan: "free" },
    );
  }
  async function enter(page, record) {
    current = page;
    const token = ++version;
    error = "";
    busy = true;
    posts = [];
    next = null;
    detail = null;
    picker = null;
    expanded.clear();
    if (page === "share") {
      shareRecord = record;
      sharing = null;
      shareDraft = null;
    }
    if (page === "plan-offer") offerStep = "intro";
    render();
    let verified = false;
    try {
      const result = signedIn() ? await api("/api/account") : { plan: "free" };
      if (token !== version) return;
      setAccount(result);
      verified = true;
      if (page === "share" && signedIn() && record) {
        const r = await api(
          "/api/community/record/" + encodeURIComponent(record.id),
        );
        if (token !== version) return;
        sharing = r.post;
        shareDraft = {
          alias: sharing?.public ? sharing.alias : nickname(),
          title: sharing?.public
            ? sharing.title
            : (record.text || "").slice(0, 60),
          text: sharing?.public
            ? sharing.text
            : (record.text || "").slice(0, 20000),
        };
      }
      if (token !== version) return;
      if (
        ["plans", "plan-details", "plan-offer"].includes(page) &&
        canBuy() &&
        signedIn()
      ) {
        // Display only: a missing price list never blocks the page or the purchase.
        try {
          const prices = await purchases.prices(uid());
          if (token !== version) return;
          storePrices = prices || {};
        } catch {}
      }
      if (page === "community" && plan() !== "free") {
        const r = await api(`/api/community/feed?${dayQuery()}`);
        if (token !== version) return;
        posts = r.posts;
        next = r.next;
      } else if (page === "community" && signedIn()) {
        const r = await api(`/api/community/teaser?${dayQuery()}`);
        if (token !== version) return;
        teaser = r;
      }
    } catch (e) {
      if (token === version) {
        error = e.message;
        // Only an account request that itself failed leaves the plan unknown.
        // A failed timeline must not demote a member the server just confirmed,
        // or a passing error hides the very dreams they pay to read.
        if (!verified) setAccount({ plan: "free" }, false);
      }
    } finally {
      if (token === version) {
        busy = false;
        render();
      }
    }
  }
  async function loadPost(id) {
    const r = await api("/api/community/posts/" + encodeURIComponent(id));
    detail = { post: { ...r.post, stamp: r.reaction || null } };
    error = "";
  }
  // Ask the server to verify the store subscription until it shows the plan
  // just bought (RevenueCat can lag a few seconds behind the store). Waiting
  // only for "not free" ended a Starter → Standard switch on the very first
  // answer, which still said Starter, so the upgrade looked like it never took.
  const reached = (account, target) =>
    target ? planOf(account) === target : planOf(account) !== "free";
  async function syncUntilActive(target = null) {
    let last = null,
      failure = null;
    for (let i = 0; i < SYNC_ATTEMPTS; i++) {
      if (i) await wait(SYNC_INTERVAL);
      try {
        last = await api("/api/billing/sync", {});
        failure = null;
      } catch (e) {
        failure = e;
        continue;
      }
      if (reached(last, target)) break;
    }
    if (!last) throw failure;
    return last;
  }
  async function checkout(action, planId) {
    if (!canBuy() || !signedIn()) throw new Error(t("billingUnavailable"));
    // The whole screen shows what is happening from the first tap until the
    // plan is active: first the store, then the server verification.
    const stop = beginLoading(language(), "store", null, { overlay: true });
    const purchase = { plan: planId || plan(), cycle };
    track(
      action === "checkout" ? "begin_checkout" : "restore_purchases",
      purchase,
    );
    try {
      let done;
      try {
        done =
          action === "checkout"
            ? await purchases.buy(uid(), planId, cycle)
            : await purchases.restore(uid());
      } catch (e) {
        track("purchase_failed", {
          ...purchase,
          error_code: e?.code || "purchaseFailed",
        });
        throw new Error(t(e?.code || "purchaseFailed"));
      }
      if (!done) {
        track("purchase_cancelled", purchase);
        toast(t("purchaseCancelled"));
        return;
      }
      stop.update("plan");
      // What the store confirmed shows immediately (display perks only); the
      // server-verified plan below is what grants quotas and the feed.
      const confirmed = planFromCustomerInfo(done);
      if (confirmed) onPurchased(confirmed);
      const target = action === "checkout" ? planId : null;
      setAccount(await syncUntilActive(target));
      // The store's own confirmation; the server-verified `purchase` with
      // the amount paid comes from the RevenueCat webhook (server/analytics.js).
      track(
        action === "checkout" ? "purchase_confirmed" : "restore_confirmed",
        {
          ...purchase,
          store_confirmed: Boolean(confirmed),
          server_verified: reached(account, target),
          plan_after: planOf(account),
        },
      );
      toast(
        t(reached(account, target) ? "purchaseActivated" : "purchasePending"),
      );
      render();
      onCheckoutDone(account);
    } finally {
      stop();
    }
  }
  function capture() {
    if (document.querySelector("#share-form"))
      shareDraft = {
        alias: document.querySelector("#share-alias").value,
        title: document.querySelector("#share-title").value,
        text: document.querySelector("#share-text").value,
      };
  }
  function bind() {
    document.querySelectorAll("[data-social]").forEach((el) => {
      const activate = () =>
        run(async () => {
          capture();
          const action = el.dataset.social;
          if (
            ["plans", "settings", "feed", "help", "help-cancel"].includes(
              action,
            )
          ) {
            navigate(action === "feed" ? "community" : action);
            return;
          }
          if (action === "plan-detail") {
            selectedPlan = PLANS[el.dataset.plan] ? el.dataset.plan : "starter";
            track("select_plan", { plan: selectedPlan, cycle });
            navigate("plan-details");
            return;
          }
          if (action === "monthly" || action === "yearly") {
            cycle = action;
            render();
            return;
          }
          if (action === "offer-choose" || action === "offer-back") {
            offerStep = action === "offer-choose" ? "choose" : "intro";
            if (action === "offer-choose")
              track("plan_offer_choose", { cycle });
            render();
            globalThis.scrollTo?.(0, 0);
            return;
          }
          if (action === "offer-free") {
            track("plan_offer_skip", { step: offerStep });
            await finishOffer();
            return;
          }
          if (action === "refresh") {
            await enter(current, shareRecord);
            return;
          }
          if (action === "resync") {
            if (recheck) await recheck();
            else setAccount(await api("/api/billing/sync", {}));
            render();
            return;
          }
          if (action === "checkout" || action === "restore") {
            await checkout(action, el.dataset.plan);
            return;
          }
          if (action === "manage") {
            track("manage_subscription", { plan: plan() });
            if (/^https:\/\//.test(account.managementUrl || ""))
              window.open(account.managementUrl, "_blank", "noopener");
            return;
          }
          if (action === "next") {
            const r = await api(
              `/api/community/feed?after=${encodeURIComponent(next)}&${dayQuery()}`,
            );
            posts = r.posts;
            next = r.next;
          }
          if (action === "stamp-open") {
            picker = el.dataset.id;
            render();
            return;
          }
          if (action === "stamp-close") {
            picker = null;
            render();
            return;
          }
          if (action === "post") {
            await loadPost(el.dataset.id);
            track("community_post_open", { plan: plan() });
            navigate("community-post");
            return;
          }
          // "Read more" on a timeline card: the rest of the dream appears in
          // place, without opening the post or moving the page.
          if (action === "expand") {
            expanded.add(el.dataset.id);
            const post = findPost(el.dataset.id),
              text = el.closest(".post-text");
            if (post && text) {
              text.textContent = post.text;
              text.classList.remove("post-excerpt");
            }
            return;
          }
          if (action === "stamp") await react(el.dataset.id, el.dataset.stamp);
          if (action === "unpublish") {
            await api("/api/community/posts/" + el.dataset.id + "/private", {});
            track("dream_unshare", { source: current || "community" });
            toast(t("unpublished"));
            if (current === "share") sharing = null;
          }
          render();
        });
      el.onclick = (e) => {
        // A button inside a post card acts alone; it never opens the post.
        if (el.tagName === "BUTTON") e.stopPropagation();
        // The tap that ends a long press only opened the stamps.
        if (pressed && el.dataset.social === "post") {
          pressed = false;
          return;
        }
        return activate();
      };
      // Whole-card posts are not buttons; keyboard users open them the same way.
      if (el.tagName !== "BUTTON")
        el.onkeydown = (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            activate();
          }
        };
    });
    const form = document.querySelector("#share-form");
    if (form)
      form.onsubmit = (e) => {
        e.preventDefault();
        run(async () => {
          capture();
          if (!confirm(t("publishConfirm"))) return;
          await api("/api/community/publish", {
            ...shareDraft,
            recordId: shareRecord.id,
            typeId: currentType(),
            characterSet: character(null).setId,
            consent: true,
          });
          track("dream_share", { source: "share-page" });
          toast(t("published"));
          markSaved();
          await enter("share", shareRecord);
        });
      };
    bindLongPress();
    const sheet = document.querySelector(".stamp-sheet");
    if (sheet) {
      sheet.querySelector(".stamp-option")?.focus({ preventScroll: true });
      sheet.onkeydown = (e) => {
        if (e.key !== "Escape") return;
        picker = null;
        render();
      };
    }
  }
  // Holding a post (not a button in it) for LONG_PRESS_MS opens the stamps.
  // Moving the finger, like a scroll, cancels it.
  function bindLongPress() {
    document.querySelectorAll("[data-post-id]").forEach((card) => {
      let timer = null,
        x = 0,
        y = 0;
      const cancel = () => {
        clearTimeout(timer);
        timer = null;
      };
      card.onpointerdown = (e) => {
        pressed = false;
        if (e.button > 0 || e.target.closest?.("button, a")) return;
        x = e.clientX;
        y = e.clientY;
        cancel();
        timer = setTimeout(() => {
          timer = null;
          longPress(card.dataset.postId);
        }, LONG_PRESS_MS);
      };
      card.onpointermove = (e) => {
        if (timer && Math.hypot(e.clientX - x, e.clientY - y) > 10) cancel();
      };
      card.onpointerup = cancel;
      card.onpointercancel = cancel;
      card.onpointerleave = cancel;
      // No text selection or system menu under a long press.
      card.oncontextmenu = (e) => e.preventDefault();
    });
  }
  return {
    view,
    bind,
    enter,
    capture,
    plan,
    refreshAccount,
    // Whether the paid plan ends at the close of its period.
    cancelling: () => Boolean(account.cancelAtPeriodEnd),
    // Asks the server to read the store subscription again now (after a
    // purchase whose own sync never finished).
    async syncAccount() {
      return setAccount(await api("/api/billing/sync", {}));
    },
    // Publish a saved dream as-is (its own "share" box). The server still
    // requires a paid plan and applies the daily publishing allowance.
    async publishRecord(record) {
      if (!signedIn() || !record?.text?.trim()) return false;
      await api("/api/community/publish", {
        recordId: record.id,
        alias: nickname().slice(0, 30),
        title: record.text.trim().slice(0, 60),
        text: record.text.trim().slice(0, 20000),
        typeId: currentType(),
        characterSet: character(null).setId,
        consent: true,
      });
      return true;
    },
    reset() {
      version++;
      setAccount({ plan: "free" }, false);
      posts = [];
      detail = null;
      shareDraft = null;
    },
    leave() {
      version++;
      picker = null;
      current = "";
    },
    async makeRecordPrivate(id) {
      if (!signedIn()) return;
      const { post } = await api(
        "/api/community/record/" + encodeURIComponent(id),
      );
      if (post?.public)
        await api("/api/community/posts/" + post.id + "/private", {});
    },
  };
}
// Today for the member, as the community routes expect it: the local calendar
// day and the minutes from local midnight to UTC (Date#getTimezoneOffset).
function dayQuery(d = new Date()) {
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `day=${day}&tz=${d.getTimezoneOffset()}`;
}
