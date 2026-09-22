import { fault, memberPath } from "./access.js";
// Account deletion. The signed-in user's journals (/users/{uid}), community
// posts with their comments and reactions, membership and usage counters are
// removed with admin privileges, then the Firebase Auth user itself. The
// client cannot do this alone: Firestore rules only cover /users/{uid} and
// deleting an auth user from the device needs a recent sign-in.
export function createAccountService({
  store,
  purge,
  deleteUser,
  now = Date.now,
}) {
  const configured = Boolean(store && purge && deleteUser);
  return {
    configured,
    async remove(uid) {
      if (!configured) throw fault(503, "serviceUnavailable");
      if (typeof uid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(uid))
        throw fault(400, "invalidInput");
      const posts = await store.list("communityPosts", {
        where: [["owner", "==", uid]],
        limit: 500,
      });
      for (const p of posts) await purge(`communityPosts/${p.id}`);
      await purge(`users/${uid}`);
      await store.transaction(async (tx) => {
        tx.delete(memberPath(uid));
        tx.delete(`communityStats/${uid}`);
      });
      // Usage counters are keyed by uid and period; clear the current ones.
      const day = new Date(now()).toISOString().slice(0, 10);
      await store.transaction(async (tx) => {
        tx.delete(`usage/${uid}_d_${day}`);
        tx.delete(`usage/${uid}_m_${day.slice(0, 7)}`);
      });
      await deleteUser(uid);
      return { deleted: true, posts: posts.length };
    },
  };
}
