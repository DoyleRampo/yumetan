import { loadingMarkup, beginLoading } from "./core/loading.js";
import { PLANS, STAMPS, stampCounts } from "./core/plans.js";
import { planFromCustomerInfo, productId } from "./core/purchases.js";
import { communityMessages } from "./core/community-i18n.js";
import { HELP_LINKS } from "./core/help-content.js";
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
  onAccount = () => {},
  onPurchased = () => {},
  // The plan the rest of the app shows (the server's, or a better one the
  // store confirmed that the server has yet to hear of), and a fresh check of
  // store and server together.
  shownPlan = null,
  recheck = null,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
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
  const paywall = () =>
    `<div class="card paywall"><span class="eyebrow">MEMBERS' DREAMS</span><h2>${t("communityIntro")}</h2><p>${t("paidRequired")}</p>${b("plans", "plans")}${!signedIn() ? `<p>${t("loginRequired")}</p>${b("accountSettings", "settings")}` : ""}</div>`;
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
    `<div class="teaser"><span class="eyebrow">MEMBERS' DREAMS</span><h2>${t("communityIntro")}</h2><p class="help">${t("teaserHint")}</p><div class="feed-list">${(teaser?.posts || []).map(teaserCard).join("") || (!busy ? `<p class="empty">${t("emptyTeaser")}</p>` : "")}</div><button type="button" class="btn primary full" data-social="plans">${t("seeMore")}</button><p class="help">${t("paidRequired")}</p></div>`;
  const postCard = (p, open = true, withTitle = false) =>
    `<article class="card feed-card${open ? " post-open" : ""}${p.mine ? " post-mine" : ""}" data-post-id="${esc(p.id)}" ${open ? `data-social="post" data-id="${esc(p.id)}" role="button" tabindex="0" aria-label="${esc(p.mine ? t("minePost") : p.alias)} · ${t("openPost")}"` : ""}>${author(p)}<div class="post-body"><strong class="post-name">${postName(p)}</strong>${withTitle ? `<p class="post-title">${esc(p.title)}</p>` : ""}<p class="prose post-text">${esc(p.text)}</p>${stampBar(p)}</div></article>`;
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
    `<div class="purchase-summary"><strong>${localized(p.names, language())} · ${t(cycle)}</strong><span>${t(cycle === "yearly" ? "periodYearly" : "periodMonthly")} · ${planPrice(p)}</span><p class="help">${t("storePrice")}</p></div>`;
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
    `<p class="help legal-note">${t("autoRenewNote")}</p><div class="row legal-links"><button type="button" class="btn small ghost" data-link="${HELP_LINKS.terms}">${t("termsOfUse")} ↗</button><button type="button" class="btn small ghost" data-link="${HELP_LINKS.privacy}">${t("privacyPolicy")} ↗</button></div>`;
  const ctaNote = () =>
    `<p class="help cta-note">${!signedIn() ? t("loginRequired") : !isNative() ? t("webBilling") : !canBuy() ? t("nativeBilling") : planShown() !== "free" ? t("switchNote") : t("billingReturn")}</p>`;
  // A build wired to RevenueCat's Test Store buys without the store sheet and
  // without charging: say so, or a simulated subscription passes for a real one.
  const testStoreNote = () =>
    purchases?.testStore?.()
      ? `<p class="status test-store" role="status">${t("testStore")}</p>`
      : "";
  const recommendation = () =>
    planShown() !== "free"
      ? ""
      : `<section class="card plan-recommend"><span class="eyebrow">${t("recommended")}</span><h2>${planName(PLANS.starter)} <span class="plan-price">${planPrice(PLANS.starter)}<small> / ${t(cycle)}</small></span></h2><p>${t("upgradeBanner")}</p>${cta(PLANS.starter)}${ctaNote()}</section>`;
  function plansView() {
    const plans = Object.values(PLANS);
    return `<section class="plans-overview"><div class="row between page-heading"><h1>${t("comparePlans")}</h1>${cyclePicker()}</div>${status()}${testStoreNote()}${planState()}
    <table class="plan-comparison"><caption class="sr-only">${t("plans")} · ${t(cycle)}</caption><thead><tr><td></td>${plans.map((p) => `<th scope="col" class="${p.id === planShown() ? "current" : ""}"><span class="plan-name">${localized(p.names, language())}</span><span class="plan-price">${planPrice(p)}</span><small>${t(cycle)}</small>${p.id === planShown() ? `<span class="current-plan">${t("currentPlan")}</span>` : ""}</th>`).join("")}</tr></thead>
    <tbody><tr class="plan-summaries"><th scope="row" class="sr-label">${t("plans")}</th>${plans.map((p) => `<td>${t(p.id + "Summary")}</td>`).join("")}</tr>${[
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
    <tr class="plan-cta-row"><th scope="row" class="sr-label">${t("subscribe")}</th>${plans.map((p) => `<td>${cta(p, true) || (p.id === planShown() ? `<span class="current-plan">${t("currentPlan")}</span>` : "")}</td>`).join("")}</tr></tbody></table>
    ${recommendation()}<p class="help included-note">${t("includedShort")}</p><div class="plan-footer"><p class="help">${t("billingShort")}</p>${b("remaining", "plan-detail", `data-plan="${planShown()}"`)}${b("cancelPlan", "help-cancel")}</div>${legal()}
    <div class="row">${signedIn() && canBuy() ? b("restorePurchases", "restore") : ""}${signedIn() && account.managementUrl ? b("managePlan", "manage") : ""}</div></section>`;
  }
  function planDetailsView() {
    const p = PLANS[selectedPlan] || PLANS.starter;
    return `<div class="narrow plan-detail"><div class="row between page-heading"><h1>${localized(p.names, language())}</h1>${cyclePicker()}</div>${status()}${testStoreNote()}${planState()}<section class="card plan-card"><p class="plan-price">${planPrice(p)}<small> / ${t(cycle)}</small></p><p>${t(p.id + "Summary")}</p>${p.id === planShown() ? `<span class="tag-label">${t("currentPlan")}</span>` : ""}<dl>${planFields.map(([label, key]) => `<div><dt>${t(label)}</dt><dd>${p[key]}</dd></div>`).join("")}</dl><p class="help">${t("freeFeatures")}</p><p class="help">${t("renewalNote")}</p>${cta(p) ? `${purchaseSummary(p)}${cta(p)}${ctaNote()}` : ""}</section><div class="card"><h2>${t("remaining")}</h2><p>${t("reflectionLimit")}: ${account.usage?.day?.reflections || 0} / ${PLANS[plan()].reflections} · ${t("ocrLimit")}: ${account.usage?.month?.handwriting || 0} / ${PLANS[plan()].handwriting}</p><p>${t("readLimit")}: ${account.usage?.day?.reads || 0} / ${PLANS[plan()].reads}</p>${account.paidUntil ? `<p>${t("paidUntil")}: ${esc(new Date(account.paidUntil).toLocaleString(language()))}</p>` : ""}${b("refresh", "refresh")}${signedIn() && canBuy() ? b("restorePurchases", "restore") : ""}${signedIn() && account.managementUrl ? b("managePlan", "manage") : ""}<p>${!signedIn() ? t("loginRequired") : !isNative() ? t("webBilling") : !canBuy() ? t("nativeBilling") : t("billingReturn")}</p></div><div class="row">${b("cancelPlan", "help-cancel")}</div>${legal()}<p class="help">${t("planRules")}</p><p class="help">${t("costNote")}</p><p class="help">${t("readNote")}</p><p class="help">${t("renewalNote")}</p>${cta(p) ? `<section class="card plan-detail-bottom"><p class="plan-price">${planPrice(p)}<small> / ${t(cycle)}</small></p><p>${t(p.id + "Summary")}</p>${purchaseSummary(p)}${cta(p)}${ctaNote()}</section>` : ""}</div>`;
  }
  function shareView() {
    const d = shareDraft;
    if (error)
      return `<div class="narrow"><h1>${t("share")}</h1>${status()}${b("refresh", "refresh")}</div>`;
    return `<div class="narrow"><h1>${t("share")}</h1><p>${t("privacyNote")}</p>${status()}${!signedIn() ? `<p>${t("shareLogin")}</p>${paywall()}` : busy ? "" : `<div class="card"><strong>${t(sharing?.public ? "public" : "private")}</strong>${sharing?.public ? b("unpublish", "unpublish", `data-id="${sharing.id}"`) : ""}<p class="help">${t("shareSnapshot")}</p></div>${d ? `<form id="share-form" class="card"><label class="field"><span>${t("alias")}</span><input id="share-alias" required maxlength="30" value="${esc(d.alias)}"></label><label class="field"><span>${t("postTitle")}</span><input id="share-title" required maxlength="80" value="${esc(d.title)}"></label><label class="field"><span>${t("postText")}</span><textarea id="share-text" rows="9" required maxlength="4000">${esc(d.text)}</textarea></label><p class="help">${t("copyLimit")}</p><label class="check"><input id="share-consent" type="checkbox" required><span>${t("consent")}</span></label><button class="btn primary" type="submit">${t("publish")}</button></form>` : ""}`}</div>`;
  }
  function detailView() {
    if (!detail) return `<h1>${t("community")}</h1>${status()}`;
    return `<div class="narrow">${status()}${postCard(detail.post, false, true)}</div>${pickerView()}`;
  }
  function view(page) {
    if (page === "plans") return plansView();
    if (page === "plan-details") return planDetailsView();
    if (page === "share") return shareView();
    if (page === "community-post") return detailView();
    // The timeline: no toolbar, just the dreams. A failed load offers a retry.
    return `<h1>${t("community")}</h1><p class="help">${t("communityIntro")}</p>${status()}${error ? `<div class="row">${b("refresh", "refresh")}</div>` : ""}${plan() === "free" ? (signedIn() ? teaserView() : paywall()) : `<div class="feed-list timeline">${posts.map((p) => postCard(p)).join("") || (!busy ? `<p class="empty">${t("emptyFeed")}</p>` : "")}</div>${next ? b("nextPage", "next") : ""}`}${pickerView()}`;
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
    if (page === "share") {
      shareRecord = record;
      sharing = null;
      shareDraft = null;
    }
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
            : (record.text || "").slice(0, 4000),
        };
      }
      if (token !== version) return;
      if (["plans", "plan-details"].includes(page) && canBuy() && signedIn()) {
        // Display only: a missing price list never blocks the page or the purchase.
        try {
          const prices = await purchases.prices(uid());
          if (token !== version) return;
          storePrices = prices || {};
        } catch {}
      }
      if (page === "community" && plan() !== "free") {
        const r = await api("/api/community/feed");
        if (token !== version) return;
        posts = r.posts;
        next = r.next;
      } else if (page === "community" && signedIn()) {
        const d = new Date(),
          day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const r = await api(
          `/api/community/teaser?day=${day}&tz=${d.getTimezoneOffset()}`,
        );
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
    try {
      let done;
      try {
        done =
          action === "checkout"
            ? await purchases.buy(uid(), planId, cycle)
            : await purchases.restore(uid());
      } catch (e) {
        throw new Error(t(e?.code || "purchaseFailed"));
      }
      if (!done) {
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
      toast(
        t(reached(account, target) ? "purchaseActivated" : "purchasePending"),
      );
      render();
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
            navigate("plan-details");
            return;
          }
          if (action === "monthly" || action === "yearly") {
            cycle = action;
            render();
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
            if (/^https:\/\//.test(account.managementUrl || ""))
              window.open(account.managementUrl, "_blank", "noopener");
            return;
          }
          if (action === "next") {
            const r = await api(
              "/api/community/feed?after=" + encodeURIComponent(next),
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
            navigate("community-post");
            return;
          }
          if (action === "stamp") await react(el.dataset.id, el.dataset.stamp);
          if (action === "unpublish") {
            await api("/api/community/posts/" + el.dataset.id + "/private", {});
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
        text: record.text.trim().slice(0, 4000),
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
