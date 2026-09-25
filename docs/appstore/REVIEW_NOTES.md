# App Review reply / App Review Information → Notes

Paste everything below into the reply to App Review and into App Store Connect → App Review Information → Notes. Replace the bracketed values first.

---

Thank you for reviewing Yumetan. Answers to each item:

**1. Screen recording**
Attached: a single recording captured on an iPhone [model] running iOS [version], starting from the Home screen. It shows onboarding and the 16-question quiz, recording a dream with a sleep check-in, signing in, the subscription screen (plan name, length, price, and the Terms of Use and Privacy Policy links, followed by a sandbox purchase), the members-only feed with reporting and blocking, publishing/unpublishing a dream, and in-app account deletion (Settings → Account → Delete my account).

**2. Purpose and audience**
Yumetan is a dream and sleep journal. Users answer a 16-question quiz to get one of 16 playful "dream type" characters, then record dreams (typed, dictated, or photographed from a handwritten note) and daily sleep check-ins. The app recomputes the dream type from recent entries and shows a sleep level (1–5) from hours slept, awakenings and how rested the user felt. Paid members can optionally publish an anonymised copy of a dream to a members-only feed, react and comment, and use AI-generated reflections. Target audience: people aged [13]+ who want to remember their dreams and build better sleep habits. It is entertainment and self-reflection, not a medical or psychological diagnosis, and the app says so.

**3. Setup and access**
No setup is required; "Continue as guest" works without an account. Demo accounts (email/password; Settings → Account → "Sign in with email"):
- Standard plan (community, reporting/blocking, AI reflection already unlocked): `review-standard@[domain]` / `[password]`
- Free plan (to test the purchase flow in the App Store sandbox): `review-free@[domain]` / `[password]`
Navigation: Settings → Plans → choose Monthly/Annual → Details → "Choose plan". "Restore purchases" and "Manage / cancel" are on the same screen. Members' Dreams is the fourth tab; open any post to react, comment, report (choose a reason) or block the author; Blocks are listed under "Blocks". Account deletion: Settings → Account → Delete my account. No sample files are needed; the handwriting feature accepts any photo of text.

**4. External services**
- Firebase Authentication (Google, Sign in with Apple, LINE via OpenID Connect, email/password, anonymous guests) and Cloud Firestore for storage and sync.
- Apple In-App Purchase (auto-renewable subscriptions) with RevenueCat for subscription status verification and webhooks.
- OpenAI API for AI reflections, handwriting transcription and safety checks of text before it is published. Data is sent only when the user explicitly taps Analyze / Recognize / Publish.
- iOS speech recognition for voice input; local notifications for the wake-up reminder.
- Our own Node.js API server hosted on [Fly.io / Render] at `https://[server]`.
Terms of Use: `https://[server]/legal/terms.html` · Privacy Policy: `https://[server]/legal/privacy.html`

**5. Regional differences**
None. The app works identically in every region. The interface is available in Japanese, English, Korean and Simplified Chinese (user-selectable). Subscription prices follow the App Store price tiers per storefront.

**6. Regulated industry / third-party material**
Yumetan is not a medical device or health service and does not diagnose sleep quality, illness or sleep stages; it only links to public NHLBI/NINDS sleep-habit references. All 16 characters and illustrations are original works created for this app; no third-party licensed characters, music or trademarks are used. No documentation or credentials are therefore required.

**7. In-App Purchases**
Four auto-renewable subscriptions:
- Starter Monthly — `com.doyle.yumetan.starter.monthly` — 1 month — ¥490
- Starter Yearly — `com.doyle.yumetan.starter.yearly` — 1 year — ¥4,900
- Standard Monthly — `com.doyle.yumetan.standard.monthly` — 1 month — ¥980
- Standard Yearly — `com.doyle.yumetan.standard.yearly` — 1 year — ¥9,800
They raise the number of dream entries per day, add AI reflections and handwriting transcription, and unlock the members-only feed (read, publish, react, comment). The Free plan keeps one dream and one diary page per day with all past entries viewable. Path: Settings → Plans → Details → Choose plan. The purchase screen shows the plan name, length, price and links to the Terms of Use and Privacy Policy. Subscriptions are managed/cancelled in the App Store subscription settings, as stated in the app.

---

## Screen recording (order to follow)

1. Tap the app icon on the Home screen.
2. Enter nickname and age group → answer the 16 questions → character result.
3. Record a dream (text, theme, sleep check-in) → save → open the detail.
4. Settings → Sign in with email (`review-free`).
5. Settings → Plans → Starter → Details → tap "Terms of Use" and "Privacy Policy" → back → "Choose plan" → sandbox purchase sheet → confirm → plan shows as current.
6. Sign out → sign in as `review-standard` → Members' Dreams → open a post → stamp → comment → Report (choose reason, send) → Block → post disappears → Blocks list → unblock.
7. Open one of your own dreams → Share → publish → make private again.
8. Settings → Account → Delete my account → confirm → app returns to the welcome screen.
