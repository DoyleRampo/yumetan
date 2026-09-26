import { createHash } from "node:crypto";
import { fault, memberPath } from "./access.js";
// Account deletion (App Store Review Guideline 5.1.1(v)). The signed-in user's
// journals (/users/{uid}), community posts with their reactions, the stamps the
// user left on other members' posts, membership, every usage counter and the
// RevenueCat subscriber are removed with admin privileges, then the Firebase
// Auth user itself. The client cannot do this alone: Firestore rules only cover
// /users/{uid} and deleting an auth user from the device needs a recent sign-in.
// Only a hash of the UID and a timestamp remain, so a retry after a partial
// failure is safe. Store subscriptions are NOT cancelled by this: the app tells
// the user to cancel in the App Store / Google Play settings.
const API_BASE = "https://api.revenuecat.com/v1";
export function createAccountService({
  store,
  purge,
  deleteUser,
  now = Date.now,
  env = process.env,
  fetch = globalThis.fetch,
  log = (...args) => console.warn(...args),
}) {
  const configured = Boolean(store && purge && deleteUser);
  async function forgetSubscriber(uid) {
    if (!env.REVENUECAT_SECRET_API_KEY) return "skipped";
    try {
      const response = await fetch(
        `${API_BASE}/subscribers/${encodeURIComponent(uid)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${env.REVENUECAT_SECRET_API_KEY}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(15000),
        },
      );
      // 404: RevenueCat never saw this user (no purchase attempt); nothing to remove.
      if (response.ok || response.status === 404) return "deleted";
      log("RevenueCat subscriber deletion failed", { status: response.status });
    } catch (e) {
      log("RevenueCat subscriber deletion failed", { name: e?.name });
    }
    return "failed";
  }
  // Removes one stamp and corrects the post's count. Returns whether it existed.
  async function removeReaction(postPath, reactionPath) {
    return store.transaction(async (tx) => {
      const p = await tx.get(postPath),
        existing = await tx.get(reactionPath);
      if (!existing) return false;
      tx.delete(reactionPath);
      if (p && existing.stamp)
        tx.set(postPath, {
          ...p,
          reactions: {
            ...p.reactions,
            [existing.stamp]: Math.max(
              0,
              (p.reactions?.[existing.stamp] || 0) - 1,
            ),
          },
        });
      return true;
    });
  }
  // Stamps this user gave on other members' posts. The collection-group query
  // needs the `reactions.owner` index from firestore.indexes.json; when it has
  // not been deployed, Firestore answers FAILED_PRECONDITION. A stamp's document
  // ID is the giver's UID, so the posts are walked instead and deletion goes on
  // rather than failing the whole account for a missing index.
  async function deleteReactions(uid) {
    let rows;
    try {
      rows = await store.listGroup("reactions", {
        where: [["owner", "==", uid]],
        limit: 500,
      });
    } catch (e) {
      if (e?.code !== 9 && !/FAILED_PRECONDITION|index/i.test(e?.message || ""))
        throw e;
      log("reactions index missing; walking posts instead", {
        message: e?.message,
      });
      return deleteReactionsByScan(uid);
    }
    let count = 0;
    for (const r of rows) {
      const postPath = r.path.replace(/\/reactions\/[^/]+$/, "");
      if (await removeReaction(postPath, r.path)) count++;
    }
    return count;
  }
  async function deleteReactionsByScan(uid) {
    let count = 0,
      after;
    for (;;) {
      const posts = await store.list("communityPosts", { limit: 500, after });
      for (const p of posts) {
        const postPath = `communityPosts/${p.id}`,
          reactionPath = `${postPath}/reactions/${uid}`;
        if (!(await store.get(reactionPath))) continue;
        if (await removeReaction(postPath, reactionPath)) count++;
      }
      if (posts.length < 500) return count;
      after = posts.at(-1).id;
    }
  }
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
      const reactions = await deleteReactions(uid);
      await purge(`users/${uid}`);
      await store.transaction(async (tx) => {
        tx.delete(memberPath(uid));
        tx.delete(`communityStats/${uid}`);
      });
      // Usage counters are keyed by uid and period; clear every period, not just today's.
      const ids = await store.listIds("usage", `${uid}_`, 500);
      if (ids.length)
        await store.transaction(async (tx) => {
          for (const id of ids) tx.delete(`usage/${id}`);
        });
      const billing = await forgetSubscriber(uid);
      await store.transaction(async (tx) =>
        tx.set(
          `accountDeletions/${createHash("sha256").update(uid).digest("hex")}`,
          { at: new Date(now()).toISOString() },
        ),
      );
      try {
        await deleteUser(uid);
      } catch (e) {
        // A retry after an earlier partial run: the data is gone, so is the user.
        if (e?.code !== "auth/user-not-found") {
          // Typically the service account lacks the Firebase Authentication
          // Admin role; the journals are already gone, so a retry is safe.
          log("Firebase Auth user deletion failed", {
            code: e?.code,
            message: e?.message,
          });
          throw e;
        }
      }
      return { deleted: true, posts: posts.length, reactions, billing };
    },
  };
}
