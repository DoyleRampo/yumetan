import { loadingMarkup, beginLoading } from "./core/loading.js";
import { PLANS, STAMPS } from "./core/plans.js";
import { planFromCustomerInfo } from "./core/purchases.js";
import { communityMessages } from "./core/community-i18n.js";
import { localized } from "./core/types.js";
export const communityText = (key, lang) =>
  localized(communityMessages[key] || communityMessages.error, lang);
// After a store purchase RevenueCat may need a moment before the server can
// see the subscription: the plan is re-checked this many times, this far apart.
export const SYNC_ATTEMPTS = 6;
export const SYNC_INTERVAL = 2500;
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
    commentDraft = "";
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
  // Free members: their own dreams in full, and the opening of a few of today's
  // other dreams — name and title whole. Every link there leads to the plans.
  const teaserCard = (p) =>
    p.mine
      ? postCard(p, true, true)
      : `<article class="card feed-card teaser-card">${author(p)}<div class="post-body"><strong class="post-name">${postName(p)}</strong><p class="post-title">${esc(p.title)}</p><p class="prose post-text teaser-text">${esc(p.excerpt)}<button type="button" class="link-button" data-social="plans">${t("readMore")}</button></p></div></article>`;
  const teaserView = () =>
    `<div class="teaser"><span class="eyebrow">MEMBERS' DREAMS</span><h2>${t("communityIntro")}</h2><p class="help">${t("teaserHint")}</p><div class="feed-list">${(teaser?.posts || []).map(teaserCard).join("") || (!busy ? `<p class="empty">${t("emptyTeaser")}</p>` : "")}</div><button type="button" class="btn primary full" data-social="plans">${t("seeMore")}</button><p class="help">${t("paidRequired")}</p></div>`;
  const postCard = (p, open = true, withTitle = false) =>
    `<article class="card feed-card${open ? " post-open" : ""}${p.mine ? " post-mine" : ""}" ${open ? `data-social="post" data-id="${esc(p.id)}" role="button" tabindex="0" aria-label="${esc(p.mine ? t("minePost") : p.alias)} · ${t("openPost")}"` : ""}>${author(p)}<div class="post-body"><strong class="post-name">${postName(p)}</strong>${withTitle ? `<p class="post-title">${esc(p.title)}</p>` : ""}<p class="prose post-text">${esc(p.text)}</p></div></article>`;
  const planFields = [
    ["dreamLimit", "dreams"],
    ["diaryLimit", "diary"],
    ["reflectionLimit", "reflections"],
    ["ocrLimit", "handwriting"],
    ["readLimit", "reads"],
    ["publishLimit", "publishes"],
    ["activeLimit", "activePosts"],
    ["commentLimit", "comments"],
    ["reactionLimit", "reactions"],
  ];
  const cyclePicker = () =>
    `<div class="row plan-cycle" role="group" aria-label="${t("plans")}">${b("monthly", "monthly", `aria-pressed="${cycle === "monthly"}"`)}${b("yearly", "yearly", `aria-pressed="${cycle === "yearly"}"`)}</div>`;
  const planPrice = (p) => `¥${p[cycle].toLocaleString(language())}`;
  const planName = (p) => localized(p.names, language());
  // The subscribe / switch call to action: every paid plan except the current
  // one (Free is never "subscribed to": cancelling returns there by itself).
  // Purchases run in the store apps; elsewhere the button stays visible but
  // disabled with the reason below.
  const cta = (p, short = false) => {
    if (p.id === "free" || p.id === plan()) return "";
    const switching = plan() !== "free";
    return `<button type="button" class="btn primary plan-cta${short ? " short" : ""}" data-social="checkout" data-plan="${p.id}" ${!canBuy() ? "disabled" : ""}>${short ? t(switching ? "switchPlan" : "subscribe") : t(switching ? "switchTo" : "subscribeTo").replace("{plan}", planName(p))}</button>`;
  };
  const ctaNote = () =>
    `<p class="help cta-note">${!signedIn() ? t("loginRequired") : !isNative() ? t("webBilling") : !canBuy() ? t("nativeBilling") : plan() !== "free" ? t("switchNote") : t("billingReturn")}</p>`;
  // A build wired to RevenueCat's Test Store buys without the store sheet and
  // without charging: say so, or a simulated subscription passes for a real one.
  const testStoreNote = () =>
    purchases?.testStore?.()
      ? `<p class="status test-store" role="status">${t("testStore")}</p>`
      : "";
  const recommendation = () =>
    plan() !== "free"
      ? ""
      : `<section class="card plan-recommend"><span class="eyebrow">${t("recommended")}</span><h2>${planName(PLANS.starter)} <span class="plan-price">${planPrice(PLANS.starter)}<small> / ${t(cycle)}</small></span></h2><p>${t("upgradeBanner")}</p>${cta(PLANS.starter)}${ctaNote()}</section>`;
  function plansView() {
    const plans = Object.values(PLANS);
    return `<section class="plans-overview"><div class="row between page-heading"><h1>${t("comparePlans")}</h1>${cyclePicker()}</div>${status()}${testStoreNote()}
    <table class="plan-comparison"><caption class="sr-only">${t("plans")} · ${t(cycle)}</caption><thead><tr><td></td>${plans.map((p) => `<th scope="col" class="${p.id === plan() ? "current" : ""}"><span class="plan-name">${localized(p.names, language())}</span><span class="plan-price">${planPrice(p)}</span><small>${t(cycle)}</small>${p.id === plan() ? `<span class="current-plan">${t("currentPlan")}</span>` : ""}</th>`).join("")}</tr></thead>
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
    <tr class="plan-cta-row"><th scope="row" class="sr-label">${t("subscribe")}</th>${plans.map((p) => `<td>${cta(p, true) || (p.id === plan() ? `<span class="current-plan">${t("currentPlan")}</span>` : "")}</td>`).join("")}</tr></tbody></table>
    ${recommendation()}<p class="help included-note">${t("includedShort")}</p><div class="plan-footer"><p class="help">${t("billingShort")}</p>${b("remaining", "plan-detail", `data-plan="${plan()}"`)}${b("cancelPlan", "help-cancel")}</div>
    <div class="row">${signedIn() && canBuy() ? b("restorePurchases", "restore") : ""}${signedIn() && account.managementUrl ? b("managePlan", "manage") : ""}</div></section>`;
  }
  function planDetailsView() {
    const p = PLANS[selectedPlan] || PLANS.starter;
    return `<div class="narrow plan-detail"><div class="row between page-heading"><h1>${localized(p.names, language())}</h1>${cyclePicker()}</div>${status()}${testStoreNote()}<section class="card plan-card"><p class="plan-price">${planPrice(p)}<small> / ${t(cycle)}</small></p><p>${t(p.id + "Summary")}</p>${p.id === plan() ? `<span class="tag-label">${t("currentPlan")}</span>` : ""}<dl>${planFields.map(([label, key]) => `<div><dt>${t(label)}</dt><dd>${p[key]}</dd></div>`).join("")}</dl><p class="help">${t("freeFeatures")}</p><p class="help">${t("renewalNote")}</p>${cta(p)}${cta(p) ? ctaNote() : ""}</section><div class="card"><h2>${t("remaining")}</h2><p>${t("reflectionLimit")}: ${account.usage?.day?.reflections || 0} / ${PLANS[plan()].reflections} · ${t("ocrLimit")}: ${account.usage?.month?.handwriting || 0} / ${PLANS[plan()].handwriting}</p><p>${t("readLimit")}: ${account.usage?.day?.reads || 0} / ${PLANS[plan()].reads}</p>${account.paidUntil ? `<p>${t("paidUntil")}: ${esc(new Date(account.paidUntil).toLocaleString(language()))}</p>` : ""}${b("refresh", "refresh")}${signedIn() && canBuy() ? b("restorePurchases", "restore") : ""}${signedIn() && account.managementUrl ? b("managePlan", "manage") : ""}<p>${!signedIn() ? t("loginRequired") : !isNative() ? t("webBilling") : !canBuy() ? t("nativeBilling") : t("billingReturn")}</p></div><div class="row">${b("cancelPlan", "help-cancel")}</div><p class="help">${t("planRules")}</p><p class="help">${t("costNote")}</p><p class="help">${t("readNote")}</p><p class="help">${t("renewalNote")}</p>${cta(p) ? `<section class="card plan-detail-bottom"><p class="plan-price">${planPrice(p)}<small> / ${t(cycle)}</small></p><p>${t(p.id + "Summary")}</p>${cta(p)}${ctaNote()}</section>` : ""}</div>`;
  }
  function shareView() {
    const d = shareDraft;
    if (error)
      return `<div class="narrow"><h1>${t("share")}</h1>${status()}${b("refresh", "refresh")}</div>`;
    return `<div class="narrow"><h1>${t("share")}</h1><p>${t("privacyNote")}</p>${status()}${!signedIn() ? `<p>${t("shareLogin")}</p>${paywall()}` : busy ? "" : `<div class="card"><strong>${t(sharing?.public ? "public" : "private")}</strong>${sharing?.public ? b("unpublish", "unpublish", `data-id="${sharing.id}"`) : ""}<p class="help">${t("shareSnapshot")}</p></div>${d ? `<form id="share-form" class="card"><label class="field"><span>${t("alias")}</span><input id="share-alias" required maxlength="30" value="${esc(d.alias)}"></label><label class="field"><span>${t("postTitle")}</span><input id="share-title" required maxlength="80" value="${esc(d.title)}"></label><label class="field"><span>${t("postText")}</span><textarea id="share-text" rows="9" required maxlength="4000">${esc(d.text)}</textarea></label><p class="help">${t("copyLimit")}</p><label class="check"><input id="share-consent" type="checkbox" required><span>${t("consent")}</span></label><button class="btn primary" type="submit">${t("publish")}</button></form>` : ""}`}</div>`;
  }
  function detailView() {
    if (!detail) return `<h1>${t("community")}</h1>${status()}`;
    const { post: p } = detail;
    // Free members reach this page through their own post: they read the
    // comments it received, and the plans open stamps and replies.
    const free = plan() === "free";
    return `<div class="narrow">${status()}${postCard(p, false, true)}<div class="card">${free ? "" : `<div class="row stamps">${STAMPS.map((s) => `<button class="btn ghost" data-social="stamp" data-stamp="${s}" aria-pressed="${detail.reaction === s}" ${p.mine ? "disabled" : ""}>${s} ${Number(p.reactions?.[s] || 0)}</button>`).join("")}</div>`}<h2>${t("comments")}</h2>${detail.comments.map((c) => `<article class="comment"><strong>${esc(c.alias)}</strong><p class="prose">${esc(c.text)}</p>${c.mine || p.mine ? b("removeComment", "delete-comment", `data-id="${c.id}"`) : b("commentReport", "report-comment", `data-id="${c.id}"`)}</article>`).join("") || `<p class="empty">${t("emptyComments")}</p>`}${detail.next ? b("nextPage", "comments-next") : ""}${free ? `<p class="help">${t("commentPaidNote")}</p><button type="button" class="btn primary full" data-social="plans">${t("seeMore")}</button>` : `<form id="comment-form"><label class="field"><span>${t("comments")}</span><textarea id="comment-text" rows="3" maxlength="500" required>${esc(commentDraft)}</textarea></label><p class="help">${t("copyLimit")}</p><button class="btn primary" type="submit">${t("sendComment")}</button></form>`}</div>${!p.mine ? `<div class="card"><label class="field"><span>${t("reportReason")}</span><select id="report-reason">${["privacy", "abuse", "spam", "other"].map((r) => `<option value="${r}">${t(r)}</option>`).join("")}</select></label>${b("report", "report")}</div>` : ""}</div>`;
  }
  function view(page) {
    if (page === "plans") return plansView();
    if (page === "plan-details") return planDetailsView();
    if (page === "share") return shareView();
    if (page === "community-post") return detailView();
    // The timeline: no toolbar, just the dreams. A failed load offers a retry.
    return `<h1>${t("community")}</h1><p class="help">${t("communityIntro")}</p>${status()}${error ? `<div class="row">${b("refresh", "refresh")}</div>` : ""}${plan() === "free" ? (signedIn() ? teaserView() : paywall()) : `<div class="feed-list timeline">${posts.map((p) => postCard(p)).join("") || (!busy ? `<p class="empty">${t("emptyFeed")}</p>` : "")}</div>${next ? b("nextPage", "next") : ""}`}`;
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
    if (page === "share") {
      shareRecord = record;
      sharing = null;
      shareDraft = null;
    }
    render();
    try {
      const result = signedIn() ? await api("/api/account") : { plan: "free" };
      if (token !== version) return;
      setAccount(result);
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
        setAccount({ plan: "free" }, false);
      }
    } finally {
      if (token === version) {
        busy = false;
        render();
      }
    }
  }
  async function loadPost(id, after = "") {
    const r = await api(
      "/api/community/posts/" +
        id +
        (after ? "?after=" + encodeURIComponent(after) : ""),
    );
    if (detail?.post.id !== id) commentDraft = "";
    detail = r;
    error = "";
  }
  // Ask the server to verify the store subscription until it shows up as a
  // paid plan (RevenueCat can lag a few seconds behind the store).
  async function syncUntilActive() {
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
      if (planOf(last) !== "free") break;
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
      setAccount(await syncUntilActive());
      toast(t(plan() === "free" ? "purchasePending" : "purchaseActivated"));
      render();
    } finally {
      stop();
    }
  }
  function capture() {
    if (document.querySelector("#comment-text"))
      commentDraft = document.querySelector("#comment-text").value;
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
          if (action === "post") {
            await loadPost(el.dataset.id);
            navigate("community-post");
            return;
          }
          if (action === "comments-next")
            await loadPost(detail.post.id, detail.next);
          if (action === "stamp") {
            await api("/api/community/posts/" + detail.post.id + "/reaction", {
              stamp:
                detail.reaction === el.dataset.stamp ? null : el.dataset.stamp,
            });
            await loadPost(detail.post.id);
          }
          if (action === "delete-comment") {
            await api(
              "/api/community/posts/" +
                detail.post.id +
                "/comments/" +
                el.dataset.id +
                "/delete",
              {},
            );
            await loadPost(detail.post.id);
          }
          if (action === "report" || action === "report-comment") {
            await api("/api/community/posts/" + detail.post.id + "/report", {
              reason:
                document.querySelector("#report-reason")?.value || "other",
              ...(action === "report-comment"
                ? { commentId: el.dataset.id }
                : {}),
            });
            toast(t("reportSent"));
            return;
          }
          if (action === "unpublish") {
            await api("/api/community/posts/" + el.dataset.id + "/private", {});
            toast(t("unpublished"));
            if (current === "share") sharing = null;
          }
          render();
        });
      el.onclick = activate;
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
    const comments = document.querySelector("#comment-form");
    if (comments)
      comments.onsubmit = (e) => {
        e.preventDefault();
        run(async () => {
          const text = document.querySelector("#comment-text").value;
          await api("/api/community/posts/" + detail.post.id + "/comments", {
            text,
            alias: nickname().slice(0, 30),
            requestId: crypto.randomUUID(),
          });
          await loadPost(detail.post.id);
          commentDraft = "";
          markSaved();
          render();
        });
      };
  }
  return {
    view,
    bind,
    enter,
    capture,
    plan,
    refreshAccount,
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
