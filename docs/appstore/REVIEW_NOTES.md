# App Review reply / App Review Information → Notes

Paste everything between the two `---` lines (under 4,000 characters, the Notes field limit) into the reply to App Review and into App Store Connect → App Review Information → Notes. Fill in `[iPhone model]` and `[iOS version]` after recording.

Sign-in information (App Store Connect → App Review Information → Sign-in required):

- User name: `yumetan-review@gmail.com`
- Password: `Yu!6Z8ltlE7PEFSbn5I7Em`

Before submitting, give this account the Standard plan in Firestore (`memberships/<UID>`: `plan: "standard"`, `status: "active"`, `paidUntil: 4102444800000`, `cycle: "yearly"`, `source: "manual"`) and publish at least one dream from it on the day of review, as described in OWNER_TASKS.md.

---

Thank you for reviewing Yumetan. Answers to each item:

1. Screen recording
Attached: one recording on an iPhone [iPhone model], iOS [iOS version], from launch: onboarding and quiz, recording a dream with the AI reading, sign-in, the subscription screen (name, length, price, Terms and Privacy links, then a sandbox purchase), the dream feed, sharing a dream, and account deletion.

2. Purpose and audience
A dream and sleep journal. A 24-question quiz assigns one of 16 playful "dream type" characters; users record dreams and sleep check-ins. Members can have GPT read a dream (a mood reflection plus a "fortune of the day", labelled as entertainment), read other members' dreams shared that day and react with stamps. Audience: 13+. Entertainment and self-reflection, not a medical diagnosis, and the app says so.

3. Setup and access
Sign in with the demo account ("Sign in with email" on the first screen or in Settings > Account):
Email: yumetan-review@gmail.com
Password: Yu!6Z8ltlE7PEFSbn5I7Em
It has the Standard plan, so all paid features work without purchasing; the purchase flow is Settings > See plans > Starter > Details > "Subscribe to Starter" (sandbox). The Dream feed (4th tab) lists dreams shared today; if empty, share one of your own (Dream > "Read this dream" > tick "Share this dream in the dream feed" > save). User content is short dream texts only; we can hide posts and suspend accounts, and users can report posts via the support site in Help & support. Account deletion: Settings > Account > Delete account.

4. External services
Firebase Authentication (Google, Apple, LINE, email) and Cloud Firestore; Apple In-App Purchase with RevenueCat; OpenAI API for AI readings and handwriting transcription (only when the user taps the button); iOS speech recognition; our API server on Render (https://yumetan.onrender.com).
Terms of Use: https://yumetan.onrender.com/legal/terms.html?lang=en
Privacy Policy: https://yumetan.onrender.com/legal/privacy.html?lang=en

5. Regional differences
None. Identical everywhere; UI in Japanese, English, Korean and Simplified Chinese.

6. Regulated industry / third-party material
Not a medical device. All characters and illustrations are original works; no third-party licensed material.

7. In-App Purchases
Four auto-renewable subscriptions: Starter Monthly (com.doyle.yumetan.starter.monthly, 1 month, ¥490), Starter Yearly (…starter.yearly, 1 year, ¥4,900), Standard Monthly (…standard.monthly, 1 month, ¥980), Standard Yearly (…standard.yearly, 1 year, ¥9,800). They raise daily dream entries and AI readings, add handwriting transcription and open the full dream feed. Path: Settings > See plans > Details > "Subscribe to …". The screen shows name, length, price and the Terms / Privacy links; cancellation is in the App Store settings, as stated in the app.

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
