// ユメタン クラウド保存（Firebase Auth 匿名ログイン + Firestore、オフライン対応）
// 使い方: window.YumetanCloud.ready を待つ → enabled なら subscribe / saveDream / deleteDream を使う
const state = { enabled: false, user: null, error: null, db: null, fns: null };
window.YumetanCloud = {
  state,
  ready: (async () => {
    const cfg = window.FIREBASE_CONFIG;
    if (!cfg || !cfg.apiKey || !cfg.projectId) return state; // 未設定 → 端末内保存のみ
    try {
      const V = "10.14.1";
      const [{ initializeApp }, auth, fs] = await Promise.all([
        import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
        import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
        import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`),
      ]);
      const app = initializeApp(cfg);
      const db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
      const a = auth.getAuth(app);
      await auth.setPersistence(a, auth.indexedDBLocalPersistence).catch(() => {});
      const user = await new Promise((resolve, reject) => {
        const off = auth.onAuthStateChanged(a, async (u) => {
          if (u) { off(); resolve(u); return; }
          try { const cred = await auth.signInAnonymously(a); off(); resolve(cred.user); } catch (e) { off(); reject(e); }
        }, reject);
      });
      state.db = db; state.user = user; state.fns = { ...fs }; state.enabled = true;
    } catch (e) {
      state.error = e?.message || String(e);
      console.warn("Firebase を使えないため端末内保存で動きます:", state.error);
    }
    return state;
  })(),

  col() { const { collection, doc } = state.fns; return collection(doc(state.db, "users", state.user.uid), "dreams"); },
  // 記録の変化を購読（オフラインキャッシュ含む）。cb(dreams 新しい順)
  subscribe(cb) {
    const { onSnapshot, query, orderBy } = state.fns;
    return onSnapshot(query(this.col(), orderBy("createdAt", "desc")), (snap) => cb(snap.docs.map((d) => d.data())), (e) => console.warn("sync error", e));
  },
  async saveDream(dream) { const { doc, setDoc } = state.fns; await setDoc(doc(this.col(), dream.id), dream); },
  async deleteDream(id) { const { doc, deleteDoc } = state.fns; await deleteDoc(doc(this.col(), id)); },
  async loadOnce() { const { getDocs, query, orderBy } = state.fns; const snap = await getDocs(query(this.col(), orderBy("createdAt", "desc"))); return snap.docs.map((d) => d.data()); },
  uid() { return state.user?.uid || ""; },
};
