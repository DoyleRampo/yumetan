// The in-app guide: how the app is used, what a plan costs, how to cancel it,
// what happens to the writing, and where to ask for help. Locale order matches
// the rest of the app: ja, ko, zh, en.
export const HELP_LINKS = {
  support: "https://yumetan-support.ni23al.chatgpt.site/support/",
};
// The Terms of Use and Privacy Policy are pages the API server serves from
// public/legal/, in the app's language (Korean and Chinese readers get English).
export function legalUrl(kind, base = "", language = "ja") {
  const origin = (base || globalThis.location?.origin || "").replace(/\/$/, "");
  return `${origin}/legal/${kind === "terms" ? "terms" : "privacy"}.html?lang=${language === "ja" ? "ja" : "en"}`;
}
export const HELP_SECTIONS = [
  {
    id: "start",
    title: ["はじめかた", "시작하기", "开始使用", "Getting started"],
    body: [
      [
        "最初の案内のあとアカウントを作り、呼び名を決めて質問に答えると、あなたの夢タイプとキャラクターが決まります。",
        "첫 안내 뒤 계정을 만들고 이름을 정한 다음 질문에 답하면 꿈 유형과 캐릭터가 정해져요.",
        "看完开场介绍后创建账号、设定昵称并回答问题，就会决定你的梦类型和角色。",
        "After the short tour you create an account, choose a name and answer the questions; that settles your dream type and character.",
      ],
      [
        "診断はいつでも、設定 →「もう一度 診断」からやり直せます。",
        "진단은 언제든 설정 →「다시 진단」에서 다시 할 수 있어요.",
        "随时可以在设置 →「重新测评」中再做一次。",
        "You can retake the questionnaire any time from Settings → Retake.",
      ],
    ],
  },
  {
    id: "dream",
    title: ["夢と日記を記録する", "꿈과 일기 기록", "记录梦与日记", "Writing"],
    body: [
      [
        "起きたら「夢を記録」に、覚えている場面をそのまま書きます。日付は記録ごとに選べます。",
        "일어나면 「꿈 기록」에 기억나는 장면을 그대로 적어요. 날짜는 기록마다 고를 수 있어요.",
        "醒来后在「记录梦」里写下记得的场景，日期可逐条选择。",
        "When you wake, write what you remember in Record. Each entry can carry its own date.",
      ],
      [
        "日記はその日の出来事を書く場所です。前日の日記は、夢の読み解きの手がかりとして一緒に使われます。",
        "일기는 그날의 일을 적는 곳이에요. 전날 일기는 꿈 해석의 단서로 함께 쓰여요.",
        "日记用来写当天的事。前一天的日记会作为解读梦境的线索一起使用。",
        "The diary is for the day itself. The previous day's page is used as context when a dream is read.",
      ],
    ],
  },
  {
    id: "reading",
    title: [
      "AIの読み解きとキャラクター",
      "AI 해석과 캐릭터",
      "AI 解读与角色",
      "Readings and your character",
    ],
    body: [
      [
        "「この夢を読み解く」を押すと読み解きページが開きます。保存すると、その読み解きが記録と一緒に残ります。",
        "「이 꿈 해석하기」를 누르면 해석 페이지가 열려요. 저장하면 기록과 함께 남아요.",
        "点击「解读这个梦」会打开解读页面，保存后会与记录一起留存。",
        "Tap “Read this dream” to open the reading page; saving keeps it with the entry.",
      ],
      [
        "読み解きは娯楽です。医学的な診断でも、未来の予知でもありません。1日に使える回数はプランごとに決まっています。",
        "해석은 오락이에요. 의학적 진단도 예언도 아니며, 하루 사용 횟수는 요금제마다 달라요.",
        "解读仅供娱乐，既非医学诊断也非预言。每日可用次数因套餐而异。",
        "Readings are for entertainment: not a diagnosis and not a prediction. The number per day depends on your plan.",
      ],
      [
        "記録を続けるとキャラクターのレベルが上がります。表示は人間版と動物版を設定で切り替えられます（人間版は有料プラン）。",
        "기록을 이어가면 캐릭터 레벨이 올라가요. 사람 버전과 동물 버전은 설정에서 바꿀 수 있어요(사람 버전은 유료 플랜).",
        "持续记录角色就会升级。可在设置中切换人类版与动物版（人类版需付费套餐）。",
        "Keeping a journal raises your character's level. Settings switch between the animal and human collections (human is a paid extra).",
      ],
    ],
  },
  {
    id: "community",
    title: ["みんなの夢", "모두의 꿈", "大家的梦", "The dream feed"],
    body: [
      [
        "夢の公開はフリープランでもできます。読み解きページの「みんなの夢に公開する」にチェックして保存すると公開され、チェックを外して保存すると非公開に戻ります。",
        "꿈 공개는 무료 플랜에서도 할 수 있어요. 해석 페이지의 「모두의 꿈에 공개」를 체크하고 저장하면 공개되고, 해제하고 저장하면 비공개로 돌아가요.",
        "免费套餐也能公开梦。在解读页面勾选「公开到大家的梦」并保存即可公开，取消勾选并保存即恢复私密。",
        "Sharing a dream is free. Tick “Share this dream” on the reading page and save to publish it; untick and save to withdraw it.",
      ],
      [
        "公開されるのは、夢の本文・タイトル・表示名・キャラクターだけです。日記・睡眠・写真・AIの読み解きは公開されません。",
        "공개되는 건 꿈 본문, 제목, 표시 이름, 캐릭터뿐이에요. 일기, 수면, 사진, AI 해석은 공개되지 않아요.",
        "公开的只有梦的正文、标题、显示名称和角色。日记、睡眠、照片和 AI 解读不会公开。",
        "Only the dream text, its title, your display name and your character are published. Diary, sleep, photos and AI readings stay private.",
      ],
      [
        "フリープランでは、その日の投稿からランダムに3つ、夢の本文は15文字まで表示されます。名前とタイトルはそのまま表示されます。",
        "무료 플랜에서는 그날의 게시물 중 무작위 3개, 꿈 본문은 15자까지 보여요. 이름과 제목은 그대로 표시돼요.",
        "免费套餐会从当天的帖子中随机显示3条，梦的正文最多15字，名字和标题完整显示。",
        "On Free you see a random three of the day's posts with 15 characters of each dream; names and titles are shown whole.",
      ],
      [
        "夢の下には、ついたスタンプの種類と数が表示されます。有料プランでは、ほかの人の投稿を長押しするか、スマイルの「＋」ボタンを押すと、12種類のスタンプから1つ選んで反応できます。もう一度押すと取り消せます。",
        "꿈 아래에는 받은 스탬프 종류와 개수가 표시돼요. 유료 플랜에서는 다른 사람의 게시물을 길게 누르거나 스마일 「＋」 버튼을 눌러 12가지 스탬프 중 하나로 반응할 수 있어요. 다시 누르면 취소돼요.",
        "梦的下方会显示收到的表情种类和数量。付费套餐可以长按他人的帖子或点笑脸「＋」按钮，从12种表情中选一个回应，再点一次即可取消。",
        "Under each dream you see which stamps it received and how many. On a paid plan, press and hold another member's post, or tap the smiley “+” button, to react with one of 12 stamps; tap it again to take it back.",
      ],
      [
        "フリープランでは反応の数を見ることができ、自分が公開した夢は全文で表示されます。スタンプで反応するのは有料プランです。",
        "무료 플랜에서는 반응 수를 볼 수 있고, 내가 공개한 꿈은 전문이 보여요. 스탬프로 반응하는 건 유료 플랜이에요.",
        "免费套餐可以查看回应数，自己公开的梦会全文显示。用表情回应需要付费套餐。",
        "On Free you can see the reactions, and your own posts appear in full. Reacting with stamps needs a paid plan.",
      ],
    ],
  },
  {
    id: "plans",
    title: ["プランと購入", "요금제와 구매", "套餐与购买", "Plans and billing"],
    body: [
      [
        "フリー、スターター（月490円 / 年4,900円）、スタンダード（月980円 / 年9,800円）の3つです。違いは設定 → プランで比べられます。",
        "무료, 스타터(월 490엔 / 연 4,900엔), 스탠더드(월 980엔 / 연 9,800엔) 세 가지예요. 차이는 설정 → 요금제에서 비교할 수 있어요.",
        "共有免费、入门（月490日元 / 年4,900日元）、标准（月980日元 / 年9,800日元）三种，可在设置 → 套餐中比较。",
        "Free, Starter (¥490 / month, ¥4,900 / year) and Standard (¥980 / month, ¥9,800 / year). Settings → Plans compares them.",
      ],
      [
        "購入はiOS / Androidアプリ内のストア決済だけです。請求はApple IDまたはGoogleアカウントに行われ、期間終了の24時間前までに解約しないと自動更新されます。",
        "구매는 iOS / Android 앱 내 스토어 결제로만 가능해요. 요금은 Apple ID 또는 Google 계정으로 청구되고, 기간 종료 24시간 전까지 해지하지 않으면 자동 갱신돼요.",
        "仅支持 iOS / Android 应用内商店付款。费用由 Apple ID 或 Google 账号扣取，若未在到期前24小时取消将自动续订。",
        "Purchases run through the iOS / Android stores only. Your Apple ID or Google account is charged, and the subscription renews unless it is cancelled at least 24 hours before the period ends.",
      ],
      [
        "Webでは購入できません。アプリで購入したプランは、同じアカウントでログインすればどの端末でも使えます。",
        "웹에서는 구매할 수 없어요. 앱에서 구매한 요금제는 같은 계정으로 로그인하면 어느 기기에서나 쓸 수 있어요.",
        "网页版无法购买。在应用内购买的套餐，使用同一账号登录后在任何设备都可使用。",
        "The web app cannot sell plans. A plan bought in the app works on every device you sign in to with the same account.",
      ],
    ],
  },
  {
    id: "cancel",
    title: [
      "解約してフリープランに戻す",
      "해지하고 무료 플랜으로",
      "取消并返回免费套餐",
      "Cancelling a plan",
    ],
    body: [
      [
        "iPhone / iPad: 設定アプリ →（自分の名前）→ サブスクリプション → ユメタン → 「サブスクリプションをキャンセル」。",
        "iPhone / iPad: 설정 앱 →(내 이름)→ 구독 → 유메탄 → 「구독 취소」.",
        "iPhone / iPad：设置 →（你的姓名）→ 订阅 → Yumetan →「取消订阅」。",
        "iPhone / iPad: Settings → your name → Subscriptions → Yumetan → Cancel Subscription.",
      ],
      [
        "Android: Google Play → プロフィールアイコン → お支払いと定期購入 → 定期購入 → ユメタン → 「定期購入を解約」。",
        "Android: Google Play → 프로필 아이콘 → 결제 및 정기 결제 → 정기 결제 → 유메탄 → 「정기 결제 해지」.",
        "Android：Google Play → 头像 → 付款和订阅 → 订阅 → Yumetan →「取消订阅」。",
        "Android: Google Play → profile icon → Payments and subscriptions → Subscriptions → Yumetan → Cancel subscription.",
      ],
      [
        "解約しても、支払い済みの期間が終わるまでは有料プランのまま使えます。期間が終わると自動的にフリープランに戻り、記録はそのまま残ります。",
        "해지해도 결제한 기간이 끝날 때까지는 유료 플랜으로 쓸 수 있어요. 기간이 끝나면 자동으로 무료 플랜이 되고 기록은 그대로 남아요.",
        "取消后在已付费期间内仍可使用付费套餐，期满后自动变为免费套餐，记录会保留。",
        "After cancelling you keep the paid plan until the paid period ends, then the account returns to Free. Your journals stay.",
      ],
      [
        "解約手続きはストア側でのみ行えます。アプリから代行することはできません。返金の可否もストアの判断になります。",
        "해지는 스토어에서만 할 수 있어요. 앱이 대신 처리할 수 없고, 환불 여부도 스토어가 결정해요.",
        "取消只能在商店端办理，应用无法代为操作，是否退款也由商店决定。",
        "Cancellation happens in the store, not in the app, and refunds are the store's decision.",
      ],
    ],
  },
  {
    id: "data",
    title: [
      "データとプライバシー",
      "데이터와 개인정보",
      "数据与隐私",
      "Your data",
    ],
    body: [
      [
        "記録は端末に保存され、ログインしているとあなたのアカウントにも同期されます。別の端末でも同じアカウントで続けられます。",
        "기록은 기기에 저장되고, 로그인 중이면 계정에도 동기화돼요. 다른 기기에서도 같은 계정으로 이어서 쓸 수 있어요.",
        "记录保存在设备上，登录后还会同步到账号，可在其他设备用同一账号继续使用。",
        "Entries are stored on the device and, while you are signed in, synced to your account so another device can continue.",
      ],
      [
        "AIに送られるのは、読み解きを押したときの夢の本文と前日の日記、手書き読み取りのときの写真だけです。自動では送られません。",
        "AI에 보내는 건 해석을 눌렀을 때의 꿈 본문과 전날 일기, 손글씨 인식 시의 사진뿐이에요. 자동으로 보내지 않아요.",
        "只有在点击解读时才会发送梦的正文与前一天的日记，手写识别时发送照片，不会自动发送。",
        "Only what you ask for is sent to the AI: the dream and the previous day's diary when you request a reading, and the photo for handwriting.",
      ],
      [
        "アカウントの削除は設定 →「アカウント削除」から。クラウドと端末の記録・プロフィール・診断結果・公開した投稿をすべて消します。元に戻せません。",
        "계정 삭제는 설정 →「계정 삭제」에서. 클라우드와 기기의 기록, 프로필, 진단 결과, 공개한 게시물을 모두 지워요. 되돌릴 수 없어요.",
        "在设置 →「删除账号」中删除账号，会清除云端与设备上的记录、资料、测评结果和已公开的帖子，无法恢复。",
        "Settings → Delete account removes the journals, profile, quiz result and published posts from the cloud and this device. It cannot be undone.",
      ],
    ],
  },
  {
    id: "support",
    title: ["困ったときは", "도움이 필요하면", "遇到问题时", "Support"],
    body: [
      [
        "うまく動かないときは、アプリを最新にして通信環境を確認し、いちどアプリを開き直してください。それでも直らないときは、下のサポートページからご連絡ください。",
        "문제가 생기면 앱을 최신으로 업데이트하고 네트워크를 확인한 뒤 앱을 다시 열어 보세요. 그래도 해결되지 않으면 아래 지원 페이지로 문의해 주세요.",
        "如果无法正常使用，请更新应用、检查网络后重新打开。若仍未解决，请通过下方支持页面联系我们。",
        "If something misbehaves, update the app, check your connection and reopen it. If that does not help, use the support page below.",
      ],
    ],
  },
];
