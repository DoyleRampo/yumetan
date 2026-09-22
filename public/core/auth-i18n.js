const strings = {
  importLater: [
    "ゲストの記録を取り込む",
    "Import guest records",
    "게스트 기록 가져오기",
    "导入访客记录",
  ],
  reconnect: ["接続を再確認", "Reconnect", "다시 연결", "重新连接"],
  google: [
    "Googleで続ける",
    "Continue with Google",
    "Google로 계속",
    "使用 Google 继续",
  ],
  apple: [
    "Appleで続ける",
    "Continue with Apple",
    "Apple로 계속",
    "使用 Apple 继续",
  ],
  line: [
    "LINEで続ける",
    "Continue with LINE",
    "LINE으로 계속",
    "使用 LINE 继续",
  ],
  guest: [
    "ゲストで使う",
    "Continue as guest",
    "게스트로 이용",
    "以访客身份使用",
  ],
  loginHint: [
    "同じアカウントでログインすると、別の端末でも夢・日記・写真・キャラクターを引き継げます。",
    "Sign in to restore your dreams, diary, photos and character on another device.",
    "로그인하면 다른 기기에서도 꿈·일기·사진·캐릭터를 이어서 사용할 수 있어요.",
    "登录同一账号，可在其他设备恢复梦境、日记、照片和角色。",
  ],
  guestHint: [
    "ゲストでも記録できます。機種変更や再インストールに備えて、あとからアカウントに連携してください。",
    "Guests can keep records. Link an account before changing devices or reinstalling.",
    "게스트도 기록할 수 있어요. 기기 변경이나 재설치 전에 계정을 연결하세요.",
    "访客也可记录。更换设备或重新安装前，请关联账号。",
  ],
  linkHint: [
    "ログイン方法を追加すると、同じ記録をどの方法でも開けます。Appleの匿名メールと他のアカウントを連携する場合も、選んだアカウントが同じユメタンアカウントに結びつきます。",
    "Link another sign-in method to access the same records. This also associates an Apple private-relay identity with the account you select.",
    "로그인 방법을 추가하면 같은 기록에 접근할 수 있어요. Apple 비공개 이메일도 선택한 계정과 연결됩니다.",
    "关联其他登录方式，即可访问相同记录。Apple 隐藏邮箱身份也将与所选账号关联。",
  ],
  link: [
    "ログイン方法を連携",
    "Link sign-in methods",
    "로그인 방법 연결",
    "关联登录方式",
  ],
  linked: ["連携済み", "Linked", "연결됨", "已关联"],
  importGuest: [
    "このゲストの記録を、ログインしたアカウントに取り込みますか？既存のプロフィール・同日の同一日記は上書きしません。キャンセルしてもゲストの記録はこの端末に残ります。",
    "Import this guest’s records into the signed-in account? Its profile and same-day diary are kept. Cancel keeps the guest copy on this device.",
    "게스트 기록을 로그인한 계정으로 가져올까요? 기존 프로필과 같은 날짜의 일기는 유지해요. 취소해도 게스트 기록은 이 기기에 남아요.",
    "将访客记录导入登录账号？保留已有个人资料和同日日记。取消后访客记录仍保存在本设备。",
  ],
  cloudSaved: [
    "アカウントに同期済み",
    "Synced to your account",
    "계정에 동기화됨",
    "已同步至账号",
  ],
  syncing: [
    "アカウントに同期中…",
    "Syncing your account…",
    "계정 동기화 중…",
    "正在同步账号…",
  ],
  pending: [
    "端末に保存済み・クラウド同期待ち",
    "Saved on this device · cloud sync pending",
    "기기에 저장됨 · 클라우드 동기화 대기",
    "已保存至设备 · 等待云端同步",
  ],
  connecting: [
    "サーバーに接続しています…",
    "Connecting to the server…",
    "서버에 연결하는 중…",
    "正在连接服务器…",
  ],
  waiting: [
    "ブラウザでログインし、完了後にアプリへ戻ってください。",
    "Sign in in your browser, then return to the app.",
    "브라우저에서 로그인한 후 앱으로 돌아오세요.",
    "在浏览器完成登录后，请返回应用。",
  ],
  returnApp: [
    "ログインが完了しました。ユメタンのアプリに戻ってください。",
    "Signed in. Return to the Yumetan app.",
    "로그인했어요. 유메탄 앱으로 돌아오세요.",
    "登录完成。请返回 Yumetan 应用。",
  ],
  retry: [
    "アプリからもう一度ログインしてください。",
    "Start sign-in again from the app.",
    "앱에서 다시 로그인하세요.",
    "请从应用重新登录。",
  ],
  cancelled: [
    "ログインをキャンセルしました。記録は保持されています。",
    "Sign-in cancelled. Your records are safe.",
    "로그인을 취소했어요. 기록은 유지돼요.",
    "已取消登录，记录已保留。",
  ],
  popup: [
    "ポップアップを許可して、もう一度ログインしてください。",
    "Allow pop-ups and try signing in again.",
    "팝업을 허용하고 다시 로그인하세요.",
    "请允许弹出窗口后重试。",
  ],
  config: [
    "このログイン方法は接続設定が必要です。設定完了まではゲストまたは他の方法をご利用ください。",
    "This sign-in method needs service configuration. Use guest mode or another method for now.",
    "이 로그인 방법은 서비스 설정이 필요해요. 게스트 또는 다른 방법을 이용하세요.",
    "此登录方式需要服务配置，请先使用访客或其他方式。",
  ],
  conflict: [
    "この認証情報は別のアカウントに使われています。元のログイン方法でログインし、設定から連携してください。",
    "This identity belongs to another account. Use its original sign-in method, then link from Settings.",
    "이 인증 정보는 다른 계정에서 사용 중이에요. 기존 방식으로 로그인한 뒤 설정에서 연결하세요.",
    "此身份已属于其他账号，请用原方式登录后在设置中关联。",
  ],
  failed: [
    "ログインできませんでした。接続を確認して再試行してください。",
    "Could not sign in. Check your connection and retry.",
    "로그인하지 못했어요. 연결을 확인하고 다시 시도하세요.",
    "登录失败，请检查网络后重试。",
  ],
  offline: [
    "現在クラウドに接続できません。ゲストの記録は端末に保存されます。",
    "Cloud is unavailable. Guest records are saved on this device.",
    "클라우드에 연결할 수 없어요. 게스트 기록은 기기에 저장돼요.",
    "暂时无法连接云端，访客记录将保存在本设备。",
  ],
  email: [
    "メールでログイン",
    "Sign in with email",
    "이메일로 로그인",
    "使用邮箱登录",
  ],
  signoutConfirm: [
    "ログアウトしますか？未同期の記録はこの端末の元のアカウント用キャッシュに残ります。再ログインして同期できます。",
    "Sign out? Unsynced records remain in this account’s cache on this device. Sign back in to sync.",
    "로그아웃할까요? 미동기화 기록은 이 기기의 계정 캐시에 남아요. 다시 로그인하면 동기화할 수 있어요.",
    "确定退出？未同步记录会留在此设备的原账号缓存中，重新登录后可同步。",
  ],
};
export function authText(key, language = "ja") {
  return strings[key]?.[{ ja: 0, en: 1, ko: 2, zh: 3 }[language] ?? 0] || key;
}
export function authError(code, language) {
  const key = [
    "auth/popup-closed-by-user",
    "auth/cancelled-popup-request",
  ].includes(code)
    ? "cancelled"
    : code === "auth/popup-blocked"
      ? "popup"
      : [
            "auth/operation-not-allowed",
            "auth/unauthorized-domain",
            "auth/invalid-provider-id",
            "authNotConfigured",
          ].includes(code)
        ? "config"
        : [
              "auth/account-exists-with-different-credential",
              "auth/credential-already-in-use",
              "auth/email-already-in-use",
            ].includes(code)
          ? "conflict"
          : code === "authExpired"
            ? "retry"
            : "failed";
  return authText(key, language);
}
