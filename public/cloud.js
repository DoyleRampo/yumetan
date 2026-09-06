// ユメタン クラウド保存 + アカウント（Firebase Auth + Firestore、オフライン対応）
// 使い方: window.YumetanCloud.ready を待つ → enabled なら subscribe / saveDream / deleteDream / signIn 等を使う
const state = { enabled: false, user: null, error: null, db: null, fns: null, auth: null, A: null };
const userListeners = [];
window.YumetanCloud = {
  state,
  ready: (async () => {
    const cfg = window.FIREBASE_CONFIG;
    if (!cfg || !cfg.apiKey || !cfg.projectId) return state; // 未設定 → 端末内保存のみ
    try {
      const V = "10.14.1";
      const [{ initializeApp }, A, fs] = await Promise.all([
        import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
        import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
        import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`),
      ]);
      const app = initializeApp(cfg);
      const db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
      const auth = A.getAuth(app);
      await A.setPersistence(auth, A.indexedDBLocalPersistence).catch(() => {});
      const user = await new Promise((resolve, reject) => {
        const off = A.onAuthStateChanged(auth, async (u) => {
          if (u) { off(); resolve(u); return; }
          try { const cred = await A.signInAnonymously(auth); off(); resolve(cred.user); } catch (e) { off(); reject(e); }
        }, reject);
      });
      state.db = db; state.user = user; state.fns = { ...fs }; state.auth = auth; state.A = A; state.enabled = true;
      // 以後のログイン・ログアウトを通知
      A.onAuthStateChanged(auth, (u) => { if (u && u.uid !== state.user?.uid) { state.user = u; userListeners.forEach((cb) => cb(u)); } else if (u) state.user = u; });
    } catch (e) {
      state.error = e?.message || String(e);
      console.warn("Firebase を使えないため端末内保存で動きます:", state.error);
    }
    return state;
  })(),

  // ---------- 記録 ----------
  col() { const { collection, doc } = state.fns; return collection(doc(state.db, "users", state.user.uid), "dreams"); },
  subscribe(cb) {
    const { onSnapshot, query, orderBy } = state.fns;
    return onSnapshot(query(this.col(), orderBy("createdAt", "desc")), (snap) => cb(snap.docs.map((d) => d.data())), (e) => console.warn("sync error", e));
  },
  async saveDream(dream) { const { doc, setDoc } = state.fns; await setDoc(doc(this.col(), dream.id), dream); },
  async deleteDream(id) { const { doc, deleteDoc } = state.fns; await deleteDoc(doc(this.col(), id)); },
  async loadOnce() { const { getDocs, query, orderBy } = state.fns; const snap = await getDocs(query(this.col(), orderBy("createdAt", "desc"))); return snap.docs.map((d) => d.data()); },
  async deleteAllDreams() { const { getDocs, deleteDoc } = state.fns; const snap = await getDocs(this.col()); for (const d of snap.docs) await deleteDoc(d.ref); return snap.size; },
  uid() { return state.user?.uid || ""; },
  async saveProfile(profile) { const { doc, setDoc } = state.fns; await setDoc(doc(state.db, "users", state.user.uid), { profile, updatedAt: new Date().toISOString() }, { merge: true }); },
  async loadProfile() { const { doc, getDoc } = state.fns; const snap = await getDoc(doc(state.db, "users", state.user.uid)); return snap.exists() ? snap.data().profile || null : null; },

  // ---------- アカウント ----------
  isAnonymous() { return Boolean(state.user?.isAnonymous); },
  email() { return state.user?.email || ""; },
  onUser(cb) { userListeners.push(cb); },
  // 新規登録: 匿名アカウントにメール/パスワードを結びつける（記録はそのまま引き継がれる）
  async signUp(email, password) {
    const { A, auth } = state;
    if (state.user?.isAnonymous) {
      const cred = A.EmailAuthProvider.credential(email, password);
      const res = await A.linkWithCredential(state.user, cred);
      state.user = res.user; return res.user;
    }
    const res = await A.createUserWithEmailAndPassword(auth, email, password);
    state.user = res.user; return res.user;
  },
  async signIn(email, password) { const res = await state.A.signInWithEmailAndPassword(state.auth, email, password); state.user = res.user; return res.user; },
  async resetPassword(email) { await state.A.sendPasswordResetEmail(state.auth, email); },
  // ログアウト: サインアウト後、新しい匿名アカウントで続ける（記録は元のアカウントに残る）
  async signOut() { await state.A.signOut(state.auth); const cred = await state.A.signInAnonymously(state.auth); state.user = cred.user; return cred.user; },
  // アカウント削除: 記録を全部消してからユーザーを削除。直近ログインが必要なら password で再認証
  async deleteAccount(password) {
    const { A } = state; const user = state.user;
    if (password && user.email) { const cred = A.EmailAuthProvider.credential(user.email, password); await A.reauthenticateWithCredential(user, cred); }
    await this.deleteAllDreams();
    await A.deleteUser(user);
    const cred = await A.signInAnonymously(state.auth); state.user = cred.user; return cred.user;
  },
};
