// src/lib/useStore.js
import { useEffect, useState } from "react";
import { subscribe } from "./store.js";

// Re-render the calling component whenever the store is written. Components read
// store selectors directly during render and stay in sync by calling this hook.
// A version counter avoids the reference-stability pitfalls of returning arrays
// from useSyncExternalStore for a store whose reads allocate fresh objects.
export function useStoreSync() {
  const [, setVersion] = useState(0);
  useEffect(() => subscribe(() => setVersion((v) => v + 1)), []);
}
