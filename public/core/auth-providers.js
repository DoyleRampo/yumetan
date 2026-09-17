export const AUTH_PROVIDERS = {
  google: "google.com",
  apple: "apple.com",
  line: "oidc.line",
};
export function authProvider(A, name, language = "ja") {
  if (!AUTH_PROVIDERS[name]) throw new Error("auth/invalid-provider-id");
  const provider =
    name === "google"
      ? new A.GoogleAuthProvider()
      : new A.OAuthProvider(AUTH_PROVIDERS[name]);
  if (name === "apple") {
    provider.addScope("email");
    provider.addScope("name");
    provider.setCustomParameters({ locale: language });
  }
  if (name === "line") provider.addScope("profile");
  if (name === "google")
    provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}
// An existing identity is never silently linked to a different signed-in account.
export async function providerLogin(
  A,
  auth,
  name,
  { link = false, upgrade = false, language = "ja" } = {},
) {
  const provider = authProvider(A, name, language);
  if (!link && !upgrade) return A.signInWithPopup(auth, provider);
  try {
    return await A.linkWithPopup(auth.currentUser, provider);
  } catch (error) {
    if (
      link ||
      !["auth/credential-already-in-use", "auth/email-already-in-use"].includes(
        error.code,
      )
    )
      throw error;
    const credential = (
      name === "google" ? A.GoogleAuthProvider : A.OAuthProvider
    ).credentialFromError(error);
    return credential
      ? A.signInWithCredential(auth, credential)
      : A.signInWithPopup(auth, provider);
  }
}
