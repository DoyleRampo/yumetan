// Google Analytics 4 for the landing site (gtag.js). Loaded by every page.
// What is measured, besides GA4's own page_view / scroll / session signals:
//
//   app_store_click        a tap on any App Store link (location = where on the page)
//   support_contact_click  a mailto: link (the site's conversion for support)
//   section_view           a section of the top page scrolled into view
//   nav_click              the in-page navigation (ユメタンとは, できること, …)
//   feature_tab            the "できること" tabs
//   companion_browse       switching collection / group / companion
//   faq_open               a question opened
//   demo_sample / demo_submit / demo_reset   the on-page dream demo (never its text)
//   outbound_click         any other external link (link_domain only)
//   page_link_click        a link to another page of this site
//
// Nothing typed into the demo and no e-mail address is ever sent.
import { GA4_MEASUREMENT_ID, APP_STORE_URL } from "./release-config.mjs";
const ID = String(GA4_MEASUREMENT_ID || "").trim();
const enabled = /^G-[A-Z0-9]{4,20}$/.test(ID);
const page = location.pathname.replace(/index\.html$/, "") || "/";
const pageName =
  page === "/" ? "home" : page.replace(/^\/|\/$/g, "").replace(/\//g, "_");
window.dataLayer = window.dataLayer || [];
function gtag() {
  window.dataLayer.push(arguments);
}
window.gtag = window.gtag || gtag;
const track = (name, params = {}) => {
  if (!enabled) return;
  const clean = {};
  for (const [k, v] of Object.entries({ ...params, page_name: pageName }))
    if (v != null && v !== "")
      clean[k] = typeof v === "string" ? v.slice(0, 100) : v;
  window.gtag("event", name, clean);
};
if (enabled) {
  window.gtag("js", new Date());
  window.gtag("config", ID, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    ...(/[?&]ga_debug=1/.test(location.search) ? { debug_mode: true } : {}),
  });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ID)}`;
  document.head.appendChild(script);
}
// Where on the page a link sits: the nearest element that names a location,
// else the enclosing section's id, else the header / footer / dock.
function locationOf(el) {
  const named = el.closest("[data-ga-location]");
  if (named) return named.dataset.gaLocation;
  const section = el.closest("section[id]");
  if (section) return section.id;
  if (el.closest("header")) return "header";
  if (el.closest("footer")) return "footer";
  if (el.closest(".mobile-dock")) return "dock";
  return "page";
}
const textOf = (el) =>
  (el.getAttribute("aria-label") || el.textContent || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
document.addEventListener(
  "click",
  (event) => {
    const el = event.target.closest("a[href], button, summary");
    if (!el) return;
    if (el.matches("a[href]")) {
      const href = el.getAttribute("href") || "";
      const url = new URL(el.href, location.href);
      const location_ = locationOf(el);
      if (
        url.href.startsWith(APP_STORE_URL) ||
        /apps\.apple\.com/.test(url.host)
      )
        track("app_store_click", {
          location: location_,
          link_text: textOf(el),
        });
      else if (href.startsWith("mailto:"))
        track("support_contact_click", {
          location: location_,
          link_text: textOf(el),
        });
      else if (href.startsWith("#"))
        track("nav_click", {
          target: href.slice(1) || "top",
          location: location_,
        });
      else if (url.origin !== location.origin)
        track("outbound_click", {
          link_domain: url.hostname,
          location: location_,
        });
      else
        track("page_link_click", { target: url.pathname, location: location_ });
      return;
    }
    if (el.matches("summary")) {
      const details = el.closest("details");
      if (details && !details.open)
        track("faq_open", { question: textOf(el).replace(/＋$/, "").trim() });
      return;
    }
    if (el.dataset.feature)
      track("feature_tab", { feature: el.dataset.feature });
    else if (el.dataset.collection)
      track("companion_browse", {
        action: "collection",
        value: el.dataset.collection,
      });
    else if (el.dataset.group)
      track("companion_browse", { action: "group", value: el.dataset.group });
    else if (
      el.classList.contains("companion-choice") ||
      el.id === "previous-companion" ||
      el.id === "next-companion"
    )
      track("companion_browse", { action: el.id || "choose" });
    else if (el.dataset.sample != null) track("demo_sample", {});
    else if (el.id === "reset-demo") track("demo_reset", {});
  },
  true,
);
// The dream demo: only that it was used, and how long the text was.
document.querySelector("#dream-form")?.addEventListener("submit", (event) => {
  const form = event.currentTarget;
  const length = (form.querySelector("#dream-text")?.value || "").trim().length;
  track("demo_submit", {
    text_length:
      length === 0
        ? "0"
        : length <= 30
          ? "1-30"
          : length <= 100
            ? "31-100"
            : "101+",
    mood: form.querySelector("input[name=mood]:checked")?.value || "none",
  });
});
// Sections of the top page as they come into view, once each.
if (enabled && "IntersectionObserver" in window) {
  const seen = new Set();
  const observer = new IntersectionObserver(
    (entries) =>
      entries.forEach((entry) => {
        if (!entry.isIntersecting || seen.has(entry.target.id)) return;
        seen.add(entry.target.id);
        track("section_view", { section: entry.target.id });
      }),
    { threshold: 0.4 },
  );
  document
    .querySelectorAll("main section[id]")
    .forEach((s) => observer.observe(s));
}
