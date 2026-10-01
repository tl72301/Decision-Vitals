// api/_auth.js
//
// The one Live Mode gate, shared by every route that spends API credit, reads
// or writes the owner's decisions, or touches their agents or mailbox.
//
// It fails closed. With LIVE_MODE_PASSPHRASE unset, live operations are
// refused with 503 rather than left open: a fresh deployment that has an API
// key but no passphrase would otherwise run paid agent sessions for anyone who
// found its URL. Demo Mode never reaches these routes, so it is unaffected.

import { createHash, timingSafeEqual } from "node:crypto";

const digest = (s) => createHash("sha256").update(String(s)).digest();

/**
 * Check a supplied passphrase.
 * @param {unknown} supplied  the value the caller presented (header, ?key=, bearer)
 * @param {string} [unauthorized]  message for a wrong or missing passphrase
 * @returns {null | {status: 401 | 503, error: string}}  null when allowed
 */
export function denyLive(supplied, unauthorized = "Passphrase required.") {
  const required = process.env.LIVE_MODE_PASSPHRASE;
  if (!required) {
    return {
      status: 503,
      error:
        "Live operations are disabled: LIVE_MODE_PASSPHRASE is not set on this deployment. Set it in Vercel and redeploy.",
    };
  }
  // Compare fixed-length digests so the check takes the same time whatever
  // the supplied value is.
  if (typeof supplied !== "string" || !timingSafeEqual(digest(supplied), digest(required))) {
    return { status: 401, error: unauthorized };
  }
  return null;
}
