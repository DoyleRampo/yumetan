import { PLANS, STAMPS } from "./core/plans.js";
import { productId } from "./core/purchases.js";
import { communityMessages } from "./core/community-i18n.js";
import { localized } from "./core/types.js";
export const communityText = (key, lang) =>
  localized(communityMessages[key] || communityMessages.error, lang);
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
}) {
  let account = { plan: "free" },
    current = "",
    version = 0,
    error = "",
    busy = false,
    posts = [],
    next = null,
    detail = null,
    mine = [],
    blocks = [],
    shareRecord = null,
    sharing = null,
    shareDraft = null,
    cycle = "monthly",
    selectedPlan = "starter",
    commentDraft = "",
    storePrices = {};
  const t = (key) => communityText(key, language());
  const b = (label, action, attrs = "") =>
    `<button type="button" class="btn ghost" data-social="${action}" ${attrs}>${t(label)}</button>`;
  const plan = () =>
    account.paidUntil && account.paidUntil <= Date.now()
      ? "free"
      : account.plan || "free";
  // Purchases run only inside the store apps, and only once the server can verify them.
  const canBuy = () =>
    Boolean(isNative() && purchases?.available() && account.billingConfigured);
  const paywall = () =>
    `<div class="card paywall"><span class="eyebrow">MEMBERS' DREAMS</span><h2>${t("communityIntro")}</h2><p>${t("paidRequired")}</p>${b("plans", "plans")}${!signedIn() ? `<p>${t("loginRequired")}</p>${b("accountSettings", "settings")}` : ""}</div>`;
  const status = () =>
    error
      ? `<p role="alert" class="status">${esc(error)}</p>`
      : busy
        ? `<p role="status">${t("loading")}</p>`
        : "";
  const postCard = (p) =>
    `<article class="card feed-card"><div class="post-author"><img src="${character(p.typeId, p.characterSet).image}" width="48" height="48" alt=""><div><strong>${esc(p.alias)}</strong><small>${esc(new Date(p.publishedAt).toLocaleDateString(language()))}</small></div></div><h2>${esc(p.title)}</h2><p class="prose">${esc(p.text)}</p><div class="row">${STAMPS.map((s) => `<span>${s} ${Number(p.reactions[s] || 0)}</span>`).join("")}</div><p class="help">${t("comments")}: ${p.commentCount}</p>${b("comments", "post", `data-id="${esc(p.id)}"`)}</article>`;
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
  // The store's localized price wins over the catalog price whenever it is known.
  const planPrice = (p) =>
    storePrices[productId(p.id, cycle)] ||
    `¥${p[cycle].toLocaleString(language())}`;
  const legalLink = (kind) =>
    `<a href="${esc(legalUrl(kind))}" target="_blank" rel="noopener noreferrer">${t(kind === "terms" ? "termsOfUse" : "privacyPolicy")}</a>`;
  const legalLinks = () =>
    `<p class="help legal-links">${legalLink("terms")}${legalLink("privacy")}</p>`;
  // Guideline 3.1.2: name, length, price and the legal links sit with the purchase button.
  const purchaseSummary = (p) =>
    `<div class="purchase-summary"><strong>${localized(p.names, language())} · ${t(cycle)}</strong><span>${t(cycle === "yearly" ? "periodYearly" : "periodMonthly")} · ${planPrice(p)}</span><p class="help">${t("legalHint")}</p>${legalLinks()}</div>`;
  function plansView() {
    const plans = Object.values(PLANS);
    return `<section class="plans-overview"><div class="row between page-heading"><h1>${t("comparePlans")}</h1>${cyclePicker()}</div>${status()}
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
    <tr class="plan-links"><th scope="row">${t("planDetails")}</th>${plans.map((p) => `<td>${b("details", "plan-detail", `data-plan="${p.id}" aria-label="${localized(p.names, language())} · ${t("details")}"`)}</td>`).join("")}</tr></tbody></table>
    <p class="help included-note">${t("includedShort")}</p><div class="plan-footer"><p class="help">${t("billingShort")}</p>${b("remaining", "plan-detail", `data-plan="${plan()}"`)}</div>${legalLinks()}
    <div class="row">${signedIn() && canBuy() ? b("restorePurchases", "restore") : ""}${signedIn() && account.managementUrl ? b("managePlan", "manage") : ""}</div></section>`;
  }
  function planDetailsView() {
    const p = PLANS[selectedPlan] || PLANS.starter;
    return `<div class="narrow plan-detail">${b("comparePlans", "plans")}<div class="row between page-heading"><h1>${localized(p.names, language())}</h1>${cyclePicker()}</div>${status()}<section class="card plan-card"><p class="plan-price">${planPrice(p)}<small> / ${t(cycle)}</small></p><p>${t(p.id + "Summary")}</p>${p.id === plan() ? `<span class="tag-label">${t("currentPlan")}</span>` : ""}<dl>${planFields.map(([label, key]) => `<div><dt>${t(label)}</dt><dd>${p[key]}</dd></div>`).join("")}</dl><p class="help">${t("freeFeatures")}</p><p class="help">${t("renewalNote")}</p>${p.id !== "free" && p.id !== plan() && plan() === "free" && isNative() ? `${purchaseSummary(p)}${b("choosePlan", "checkout", `data-plan="${p.id}" ${!canBuy() ? "disabled" : ""}`)}` : p.id !== "free" ? legalLinks() : ""}</section><div class="card"><h2>${t("remaining")}</h2><p>${t("reflectionLimit")}: ${account.usage?.month?.reflections || 0} / ${PLANS[plan()].reflections} · ${t("ocrLimit")}: ${account.usage?.month?.handwriting || 0} / ${PLANS[plan()].handwriting}</p><p>${t("readLimit")}: ${account.usage?.day?.reads || 0} / ${PLANS[plan()].reads}</p>${account.paidUntil ? `<p>${t("paidUntil")}: ${esc(new Date(account.paidUntil).toLocaleString(language()))}</p>` : ""}${b("refresh", "refresh")}${signedIn() && canBuy() ? b("restorePurchases", "restore") : ""}${signedIn() && account.managementUrl ? b("managePlan", "manage") : ""}<p>${!signedIn() ? t("loginRequired") : !isNative() ? t("webBilling") : !canBuy() ? t("nativeBilling") : t("billingReturn")}</p></div><p class="help">${t("planRules")}</p><p class="help">${t("costNote")}</p><p class="help">${t("readNote")}</p><p class="help">${t("renewalNote")}</p><p class="help">${t("storePrice")}</p>${legalLinks()}</div>`;
  }
  function shareView() {
    const d = shareDraft;
    if (error)
      return `<div class="narrow"><h1>${t("share")}</h1>${status()}${b("refresh", "refresh")}</div>`;
    return `<div class="narrow"><h1>${t("share")}</h1><p>${t("privacyNote")}</p>${status()}${!signedIn() ? `<p>${t("shareLogin")}</p>${paywall()}` : busy ? "" : `<div class="card"><strong>${t(sharing?.public ? "public" : "private")}</strong>${sharing?.public ? b("unpublish", "unpublish", `data-id="${sharing.id}"`) : ""}<p class="help">${t("shareSnapshot")}</p></div>${plan() === "free" ? paywall() : d ? `<form id="share-form" class="card"><label class="field"><span>${t("alias")}</span><input id="share-alias" required maxlength="30" value="${esc(d.alias)}"></label><label class="field"><span>${t("postTitle")}</span><input id="share-title" required maxlength="80" value="${esc(d.title)}"></label><label class="field"><span>${t("postText")}</span><textarea id="share-text" rows="9" required maxlength="4000">${esc(d.text)}</textarea></label><p class="help">${t("copyLimit")}</p><label class="check"><input id="share-consent" type="checkbox" required><span>${t("consent")}</span></label><button class="btn primary" type="submit">${t("publish")}</button></form>` : ""}`}</div>`;
  }
  function detailView() {
    if (!detail) return `<h1>${t("community")}</h1>${status()}`;
    const { post: p } = detail;
    return `<div class="narrow">${b("community", "feed")}${status()}${postCard(p)}<div class="card"><div class="row stamps">${STAMPS.map((s) => `<button class="btn ghost" data-social="stamp" data-stamp="${s}" aria-pressed="${detail.reaction === s}" ${p.mine ? "disabled" : ""}>${s}</button>`).join("")}</div><h2>${t("comments")}</h2>${detail.comments.map((c) => `<article class="comment"><strong>${esc(c.alias)}</strong><p class="prose">${esc(c.text)}</p>${c.mine || p.mine ? b("removeComment", "delete-comment", `data-id="${c.id}"`) : b("commentReport", "report-comment", `data-id="${c.id}"`)}</article>`).join("")}${detail.next ? b("nextPage", "comments-next") : ""}<form id="comment-form"><label class="field"><span>${t("comments")}</span><textarea id="comment-text" rows="3" maxlength="500" required>${esc(commentDraft)}</textarea></label><p class="help">${t("copyLimit")}</p><button class="btn primary" type="submit">${t("sendComment")}</button></form></div>${!p.mine ? `<div class="card"><label class="field"><span>${t("reportReason")}</span><select id="report-reason">${["privacy", "abuse", "spam", "other"].map((r) => `<option value="${r}">${t(r)}</option>`).join("")}</select></label>${b("report", "report")}${b("block", "block")}</div>` : ""}</div>`;
  }
  function view(page) {
    if (page === "plans") return plansView();
    if (page === "plan-details") return planDetailsView();
    if (page === "share") return shareView();
    if (page === "community-post") return detailView();
    return `<h1>${t("community")}</h1><p>${t("communityIntro")}</p><div class="row">${b("refresh", "refresh")}${b("plans", "plans")}${signedIn() ? `${b("mine", "mine")}${b("blocks", "blocks")}` : ""}</div>${status()}${plan() === "free" ? paywall() : `<p class="help">${t("readNote")}</p><div class="feed-list">${posts.map(postCard).join("") || (!busy ? `<p class="empty">${t("emptyFeed")}</p>` : "")}</div>${next ? b("nextPage", "next") : ""}`}<details class="card"><summary>${t("communityRules")}</summary><p>${t("copyLimit")}</p>${account.supportUrl && /^https:\/\//.test(account.supportUrl) ? `<a href="${esc(account.supportUrl)}" target="_blank" rel="noopener noreferrer">${t("support")}</a>` : ""}</details><section id="social-extra">${mine.length ? `<h2>${t("mine")}</h2>${mine.map((p) => `<div class="card"><h3>${esc(p.title)}</h3>${b("unpublish", "unpublish", `data-id="${p.id}"`)}</div>`).join("")}` : ""}${blocks.length ? `<h2>${t("blocks")}</h2>${blocks.map((x) => `<div class="card">${esc(x.alias)} ${b("unblock", "unblock", `data-id="${esc(x.id)}"`)}</div>`).join("")}` : ""}</section>`;
  }
  async function refreshAccount() {
    account = signedIn() ? await api("/api/account") : { plan: "free" };
    return account;
  }
  async function enter(page, record) {
    current = page;
    const token = ++version;
    error = "";
    busy = true;
    posts = [];
    next = null;
    detail = null;
    mine = [];
    blocks = [];
    if (page === "share") {
      shareRecord = record;
      sharing = null;
      shareDraft = null;
    }
    render();
    try {
      const result = signedIn() ? await api("/api/account") : { plan: "free" };
      if (token !== version) return;
      account = result;
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
      }
    } catch (e) {
      if (token === version) {
        error = e.message;
        account = { plan: "free" };
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
    document.querySelectorAll("[data-social]").forEach(
      (el) =>
        (el.onclick = () =>
          run(async () => {
            capture();
            const action = el.dataset.social;
            if (["plans", "settings", "feed"].includes(action)) {
              navigate(action === "feed" ? "community" : action);
              return;
            }
            if (action === "plan-detail") {
              selectedPlan = PLANS[el.dataset.plan]
                ? el.dataset.plan
                : "starter";
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
              if (!canBuy() || !signedIn())
                throw new Error(t("billingUnavailable"));
              let done;
              try {
                done =
                  action === "checkout"
                    ? await purchases.buy(uid(), el.dataset.plan, cycle)
                    : await purchases.restore(uid());
              } catch (e) {
                throw new Error(t(e?.code || "purchaseFailed"));
              }
              if (!done) {
                toast(t("purchaseCancelled"));
                return;
              }
              // The store receipt never grants access by itself; the server verifies it.
              account = await api("/api/billing/sync", {});
              toast(t(plan() === "free" ? "purchasePending" : "purchaseDone"));
              render();
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
              await api(
                "/api/community/posts/" + detail.post.id + "/reaction",
                {
                  stamp:
                    detail.reaction === el.dataset.stamp
                      ? null
                      : el.dataset.stamp,
                },
              );
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
            if (action === "block") {
              if (!confirm(t("blockConfirm"))) return;
              await api(
                "/api/community/posts/" + detail.post.id + "/block",
                {},
              );
              toast(t("blocked"));
              navigate("community");
              return;
            }
            if (action === "mine") {
              mine = (await api("/api/community/mine")).posts;
              blocks = [];
            }
            if (action === "blocks") {
              blocks = (await api("/api/community/blocks")).blocks;
              mine = [];
            }
            if (action === "unblock") {
              await api(
                "/api/community/blocks/" +
                  encodeURIComponent(el.dataset.id) +
                  "/remove",
                {},
              );
              blocks = blocks.filter((x) => x.id !== el.dataset.id);
            }
            if (action === "unpublish") {
              await api(
                "/api/community/posts/" + el.dataset.id + "/private",
                {},
              );
              toast(t("unpublished"));
              if (current === "share") {
                sharing = null;
              } else mine = mine.filter((p) => p.id !== el.dataset.id);
            }
            render();
          })),
    );
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
    reset() {
      version++;
      account = { plan: "free" };
      posts = [];
      detail = null;
      mine = [];
      blocks = [];
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
