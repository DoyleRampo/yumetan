import { mergeRecords, normalizeProfile } from "./storage.js";
export function newerProfile(local, remote) {
  if (!remote) return normalizeProfile(local);
  if (!local) return normalizeProfile(remote);
  return normalizeProfile(
    Date.parse(local.updatedAt || 0) > Date.parse(remote.updatedAt || 0)
      ? local
      : remote,
  );
}
export function mergeAccount(local, remote) {
  const deleted = [
    ...new Set([...(local.deleted || []), ...(remote.deleted || [])]),
  ];
  return {
    version: 4,
    profile: newerProfile(local.profile, remote.profile),
    records: mergeRecords(local.records || [], remote.records || [], deleted),
    deleted,
  };
}
export function importGuest(account, guest) {
  // Existing account profile and same-day diary win. Retrying is idempotent by ID.
  const diaryDates = new Set(
    account.records.filter((r) => r.kind === "diary").map((r) => r.date),
  );
  const records = guest.records.filter(
    (r) =>
      !account.records.some((a) => a.id === r.id) &&
      (r.kind !== "diary" || !diaryDates.has(r.date)),
  );
  return {
    ...account,
    profile: account.profile || guest.profile,
    records: mergeRecords(account.records, records, account.deleted),
  };
}
