// A server error code means different things depending on the feature that
// hit it: `paidRequired` from handwriting is not the community paywall, and a
// `quotaReached` should say which allowance ran out. Each feature names its own
// message for the codes it can meet; the shared message for a code is the
// fallback. Keys refer to core/community-i18n.js.
const FEATURES = [
  [/^\/api\/handwriting$/, "handwriting"],
  [/^\/api\/reflect$/, "reading"],
  [/^\/api\/community\/publish$/, "publish"],
  [/^\/api\/community\/posts\/[^/]+\/reaction$/, "reaction"],
  [/^\/api\/community\/posts\/[^/]+\/comments$/, "comment"],
  [/^\/api\/community\/(feed|teaser|posts\/[^/]+)$/, "read"],
];
const MESSAGES = {
  handwriting: {
    paidRequired: "handwritingPaidRequired",
    quotaReached: "handwritingQuotaReached",
    aiBudgetReached: "handwritingBudgetReached",
    aiFailed: "handwritingFailed",
    aiUnavailable: "handwritingUnavailable",
    invalidInput: "handwritingInvalidImage",
    accountSuspended: "aiSuspended",
  },
  reading: {
    quotaReached: "readingQuotaReached",
    accountSuspended: "aiSuspended",
  },
  publish: { quotaReached: "publishQuotaReached" },
  reaction: { quotaReached: "reactionQuotaReached" },
  comment: { quotaReached: "commentQuotaReached" },
  read: { quotaReached: "readQuotaReached" },
};
export const featureOf = (path) =>
  FEATURES.find(([pattern]) =>
    pattern.test(String(path || "").split("?")[0]),
  )?.[1] || null;
// The message key for `code` met while using `feature` (a name above, or a
// request path).
export function errorMessageKey(code, feature) {
  const name = feature?.startsWith?.("/") ? featureOf(feature) : feature;
  return MESSAGES[name]?.[code] || code;
}
export const FEATURE_MESSAGES = MESSAGES;
