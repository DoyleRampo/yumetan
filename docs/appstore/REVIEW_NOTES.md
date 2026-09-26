# App Review reply / App Review Information → Notes

Paste everything between the two `---` lines into the reply to App Review and into App Store Connect → App Review Information → Notes. Fill in `[iPhone model]` and `[iOS version]` after recording.

Sign-in information (App Store Connect → App Review Information → Sign-in required):

- User name: `yumetan-review@gmail.com`
- Password: `Yu!6Z8ltlE7PEFSbn5I7Em`

Before submitting, give this account the Standard plan in Firestore (`memberships/<UID>`: `plan: "standard"`, `status: "active"`, `paidUntil: 4102444800000`, `cycle: "yearly"`, `source: "manual"`) and publish at least one dream from it on the day of review, as described in OWNER_TASKS.md.

---

Thank you for reviewing Yumetan. Answers to each item:

**1. Screen recording**
Attached: a single recording captured on an iPhone [iPhone model] running iOS [iOS version], starting from the Home screen. It shows onboarding and the 24-question quiz, recording a dream with the AI reading, signing in, the subscription screen (plan name, length, price, and the Terms of Use and Privacy Policy links, followed by a sandbox purchase), the members' dream feed with stamps, sharing and withdrawing a dream, and in-app account deletion (Settings → Account → Delete account).

**2. Purpose and audience**
Yumetan is a dream and sleep journal. Users answer a 24-question quiz to get one of 16 playful "dream type" characters, then record dreams (typed, dictated, or photographed from a handwritten note) and daily sleep check-ins. A "dream level" rises with the number of entries. Members can have GPT read a dream together with recent diary notes (a reflection on their current mood plus a light-hearted "fortune of the day", clearly labelled as entertainment), read other members' dreams shared that day in full and react with stamps. Target audience: people aged 13+ who want to remember their dreams and reflect on them. It is entertainment and self-reflection, not a medical or psychological diagnosis, and the app says so.

**3. Setup and access**
No setup is required beyond signing in. Demo account (email/password; tap "Sign in with email" on the first screen or in Settings → Account):
- Email: yumetan-review@gmail.com
- Password: Yu!6Z8ltlE7PEFSbn5I7Em
This account already has the Standard plan, so the full dream feed, stamps, AI readings and handwriting recognition are available without purchasing. The purchase flow can still be exercised: Settings → See plans → Starter → Details → "Subscribe to Starter" opens the App Store sandbox purchase sheet (shown as a plan switch). The dream feed (fourth tab, "Dream feed") lists dreams shared on the current day; if it is empty when you open it, share one of your own dreams (Dream → write → "Read this dream" → tick "Share this dream in the dream feed" → save) and it appears immediately. User-generated content is limited to short dream texts published by members: our team can hide posts and suspend accounts from the server, and users can report a post through the support site linked from Help & support. Account deletion: Settings → Account → Delete account. The handwriting feature accepts any photo of text; no sample files are needed.

**4. External services**
- Firebase Authentication (Google, Sign in with Apple, LINE Login, email/password, anonymous guests) and Cloud Firestore for storage and sync.
- Apple In-App Purchase (auto-renewable subscriptions) with RevenueCat for subscription status verification and webhooks.
- OpenAI API for AI dream readings and handwriting transcription. Data is sent only when the user explicitly taps Read this dream / Recognize text.
- iOS speech recognition for voice input.
- Our own Node.js API server hosted on Render at https://yumetan.onrender.com.
Terms of Use: https://yumetan.onrender.com/legal/terms.html?lang=en
Privacy Policy: https://yumetan.onrender.com/legal/privacy.html?lang=en

**5. Regional differences**
None. The app works identically in every region. The interface is available in Japanese, English, Korean and Simplified Chinese (user-selectable). Subscription prices follow the App Store price tiers per storefront.

**6. Regulated industry / third-party material**
Yumetan is not a medical device or health service and does not diagnose sleep quality, illness or sleep stages; the "fortune of the day" is labelled as entertainment. All 16 characters and illustrations are original works created for this app; no third-party licensed characters, music or trademarks are used. No documentation or credentials are therefore required.

**7. In-App Purchases**
Four auto-renewable subscriptions:
- Starter Monthly — com.doyle.yumetan.starter.monthly — 1 month — ¥490
- Starter Yearly — com.doyle.yumetan.starter.yearly — 1 year — ¥4,900
- Standard Monthly — com.doyle.yumetan.standard.monthly — 1 month — ¥980
- Standard Yearly — com.doyle.yumetan.standard.yearly — 1 year — ¥9,800
They raise the number of dream entries and AI readings per day, add handwriting transcription, unlock the human character set, and let members read other members' dreams in full and react with stamps. The Free plan keeps one dream and one diary page per day with all past entries viewable. Path: Settings → See plans → Details → "Subscribe to …". The purchase screen shows the plan name, length, price and links to the Terms of Use and Privacy Policy. Subscriptions are managed and cancelled in the App Store subscription settings, as stated in the app and in Help & support.

Contact for this review: Yumetan Team, +81 80-8978-7788, yumetan-review@gmail.com.

---

## Screen recording (order to follow)

1. Tap the app icon on the Home screen.
2. Introduction → "Sign in with email" → sign in as yumetan-review@gmail.com → Home.
3. Dream tab → write a dream → "Read this dream" → result → tick "Share this dream in the dream feed" → save.
4. Settings → See plans → Starter → Details → tap "Terms of Use ↗" and "Privacy Policy ↗" (each opens in the browser; return to the app) → "Subscribe to Starter" → sandbox purchase sheet → Subscribe → the plan shows as current.
5. Dream feed tab → open a post → add a stamp.
6. Open the dream from step 3 → untick "Share this dream in the dream feed" → save.
7. Settings → Account → Delete account → confirm → the app returns to the first screen.

After recording, re-create the demo account with the same email and password (Settings → Account → "Create account"), grant it the Standard plan again in Firestore, and share one dream from it on the day you submit.
