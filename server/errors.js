// What a failed request answers. Only the server's own codes (`fault()`: an
// HTTP status and a word the app has a message for) reach the app. Anything
// else — a Firestore/gRPC error carries a numeric `code` such as 9
// (FAILED_PRECONDITION, a missing index) or 7 (PERMISSION_DENIED) — used to be
// passed through as is, and the app, having no message for `9`, could only say
// "Unable to complete". Those now answer `serviceUnavailable`, and the log
// keeps the original code and message for whoever runs the server.
export function errorResponse(err) {
  const own =
    Number.isInteger(err?.status) &&
    err.status >= 400 &&
    err.status < 600 &&
    typeof err.code === "string" &&
    /^[a-zA-Z]+$/.test(err.code);
  const status =
    Number.isInteger(err?.status) && err.status >= 400 && err.status < 600
      ? err.status
      : 500;
  const code = own
    ? err.code
    : status === 400
      ? "invalidInput"
      : status >= 500
        ? "serviceUnavailable"
        : "invalidInput";
  return { status, code };
}
