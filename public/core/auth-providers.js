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

// Native sign-in (Sign in with Apple on iOS): the OS hands us an ID token and
// the raw nonce, and Firebase verifies them without any browser round trip.
export async function credentialLogin(
  A,
  auth,
  name,
  { idToken, rawNonce, link = false, upgrade = false } = {},
) {
  if (!AUTH_PROVIDERS[name]) throw new Error("auth/invalid-provider-id");
  if (!idToken)
    throw Object.assign(new Error("authFailed"), { code: "authFailed" });
  const credential = new A.OAuthProvider(AUTH_PROVIDERS[name]).credential({
    idToken,
    rawNonce,
  });
  if (!link && !upgrade) return A.signInWithCredential(auth, credential);
  try {
    return await A.linkWithCredential(auth.currentUser, credential);
  } catch (error) {
    if (
      link ||
      !["auth/credential-already-in-use", "auth/email-already-in-use"].includes(
        error.code,
      )
    )
      throw error;
    return A.signInWithCredential(
      auth,
      A.OAuthProvider.credentialFromError(error) || credential,
    );
  }
}
