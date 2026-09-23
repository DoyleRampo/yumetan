// Account deletion. A deleted account leaves nothing behind that could restore the
// previous profile, character or records, so the next login starts as a new user.
import { fault, memberPath } from "./access.js";
export function createAccountRemoval({ access, deleteUser }) {
  const { store } = access;
  return {
    async remove(uid) {
      if (!store || !deleteUser) throw fault(503, "serviceUnavailable");
      // Shared copies first: community posts are the only records other members can see.
      for (let page = 0; page < 50; page++) {
        const posts = await store.list("communityPosts", {
          where: [["owner", "==", uid]],
          limit: 50,
        });
        if (!posts.length) break;
        for (const post of posts)
          await store.removeTree(`communityPosts/${post.id}`);
      }
      for (const path of [`users/${uid}`, `communityBlocks/${uid}`])
        await store.removeTree(path);
      for (const path of [memberPath(uid), `communityStats/${uid}`])
        await store.remove(path);
      // The sign-in identity goes last: while it exists the owner can retry a failed delete.
      await deleteUser(uid);
      return { deleted: true };
    },
  };
}
