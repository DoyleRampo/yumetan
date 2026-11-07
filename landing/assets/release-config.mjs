// Public settings of the landing site. Every page and script reads them here,
// so moving the site to its own domain or another GA4 stream is one edit.
//
// SITE_URL: the canonical origin, no trailing slash. Firebase Hosting serves
// the site at https://yumetan-a31f0.web.app; once a custom domain is connected
// (Firebase console → Hosting → Add custom domain), put it here and run
// `npm run landing:build` again so canonical links and the sitemap follow.
export const SITE_URL = "https://yumetan-a31f0.web.app";
// Official App Store URL supplied by the owner after release.
export const APP_STORE_URL = "https://apps.apple.com/jp/app/id6813241714";
export const APP_STORE_ID = "6813241714";
// GA4 measurement ID of the landing site's web data stream (G-…). Empty: the
// site sends nothing to Google Analytics. `npm run ga4:setup -- --write`
// fills it in (docs/analytics/GA4_SETUP.md).
export const GA4_MEASUREMENT_ID = "";
export const SUPPORT_EMAIL = "doyle.rampo.dev@gmail.com";
