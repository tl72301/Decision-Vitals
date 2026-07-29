// One shared flow for switching to Live Mode: ask for the passphrase, verify
// it with the server, and flip the mode. Used by the header toggle and by
// screens that need Live Mode to work (like recording a new decision).

import { setMode } from "./mode.js";
import { verifyLivePassphrase } from "./api.js";

/** @returns {Promise<boolean>} true if the switch succeeded */
export async function requestLiveMode() {
  const passphrase = window.prompt(
    "Live Mode runs real AI reviews (and spends real credits).\nEnter the Live Mode passphrase:"
  );
  if (passphrase === null) return false; // cancelled
  const result = await verifyLivePassphrase(passphrase);
  if (result.ok) {
    setMode("live", passphrase);
    return true;
  }
  window.alert(result.error || "Incorrect passphrase.");
  return false;
}
