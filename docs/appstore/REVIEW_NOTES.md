# App Review reply / App Review Information → Notes

Paste everything between the two `---` lines (under 4,000 characters, the Notes field limit) into the reply to App Review and into App Store Connect → App Review Information → Notes. Fill in `[iPhone model]` and `[iOS version]` after recording.

Sign-in information (App Store Connect → App Review Information → Sign-in required):

- User name: `yumetan-review@gmail.com`
- Password: `Yu!6Z8ltlE7PEFSbn5I7Em`

Before submitting, give this account the Standard plan in Firestore (`memberships/<UID>`: `plan: "standard"`, `status: "active"`, `paidUntil: 4102444800000`, `cycle: "yearly"`, `source: "manual"`) and publish at least one dream from it on the day of review, as described in OWNER_TASKS.md.

---

Thank you for reviewing Yumetan. Answers to each item:

1. Screen recording
Attached: one recording on an iPhone [iPhone model], iOS [iOS version], starting from the Home screen: onboarding and the 24-question quiz, recording a dream with the AI reading, signing in, the subscription screen (plan name, length, price, Terms of Use and Privacy Policy links, then a sandbox purchase), the dream feed with stamps, sharing/withdrawing a dream, and account deletion (Settings > Account > Delete account).

2. Purpose and audience
Yumetan is a dream and sleep journal. A 24-question quiz assigns one of 16 playful "dream type" characters; users then record dreams (typed, dictated, or photographed from a handwritten note) and daily sleep check-ins. A "dream level" rises with the number of entries. Members can have GPT read a dream with recent diary notes (a reflection on their mood plus a light-hearted "fortune of the day", labelled as entertainment), read other members' dreams shared that day and react with stamps. Audience: people aged 13+. It is entertainment and self-reflection, not a medical or psychological diagnosis, and the app says so.

3. Setup and access
Sign in with the demo account ("Sign in with email" on the first screen or in Settings > Account):
Email: yumetan-review@gmail.com
Password: Yu!6Z8ltlE7PEFSbn5I7Em
It already has the Standard plan, so the full feed, stamps, AI readings and handwriting recognition work without purchasing. To exercise the purchase flow: Settings > See plans > Starter > Details > "Subscribe to Starter" opens the App Store sandbox sheet (as a plan switch). The Dream feed (4th tab) lists dreams shared today; if empty, share one of your own (Dream > write > "Read this dream" > tick "Share this dream in the dream feed" > save) and it appears at once. User content is limited to short dream texts; we can hide posts and suspend accounts server-side, and users can report a post via the support site linked from Help & support. Account deletion: Settings > Account > Delete account. No sample files are needed.

4. External services
- Firebase Authentication (Google, Apple, LINE, email/password, guests) and Cloud Firestore for storage and sync.
- Apple In-App Purchase with RevenueCat for subscription verification.
- OpenAI API for AI dream readings and handwriting transcription, sent only when the user taps Read this dream / Recognize text.
- iOS speech recognition for voice input.
- Our API server on Render: https://yumetan.onrender.com
Terms of Use: https://yumetan.onrender.com/legal/terms.html?lang=en
Privacy Policy: https://yumetan.onrender.com/legal/privacy.html?lang=en

5. Regional differences
None. The app works identically everywhere, in Japanese, English, Korean and Simplified Chinese (user-selectable). Prices follow the App Store tiers per storefront.

6. Regulated industry / third-party material
Not a medical device or health service; it does not diagnose sleep quality, illness or sleep stages, and the "fortune" is labelled entertainment. All 16 characters and illustrations are original works made for this app; no third-party licensed material is used. No documentation is required.

7. In-App Purchases
Four auto-renewable subscriptions:
- Starter Monthly (com.doyle.yumetan.starter.monthly), 1 month, ¥490
- Starter Yearly (com.doyle.yumetan.starter.yearly), 1 year, ¥4,900
- Standard Monthly (com.doyle.yumetan.standard.monthly), 1 month, ¥980
- Standard Yearly (com.doyle.yumetan.standard.yearly), 1 year, ¥9,800
They raise daily dream entries and AI readings, add handwriting transcription, unlock the human character set, and open the full dream feed with stamps. Free keeps one dream and one diary page per day. Path: Settings > See plans > Details > "Subscribe to ...". The purchase screen shows the plan name, length, price and the Terms of Use / Privacy Policy links. Subscriptions are managed and cancelled in the App Store settings, as stated in the app.

Contact: Yumetan Team, +81 80-8978-7788, yumetan-review@gmail.com

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
