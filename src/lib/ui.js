// Shared control styles for the night-ledger system. Every screen draws from
// this one set so buttons, inputs, and panels stay identical app-wide.

export const btnPrimary =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded bg-brass px-4 py-2 text-sm font-semibold text-ink-950 transition-colors hover:bg-brass-2 disabled:cursor-not-allowed disabled:opacity-40";

export const btnSecondary =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded border border-line-2 bg-transparent px-4 py-2 text-sm font-medium text-fg-1 transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-40";

export const btnQuiet =
  "text-sm font-medium text-fg-2 transition-colors hover:text-fg-1 disabled:opacity-40";

export const inputCls =
  "w-full rounded border border-line bg-ink-900 px-3 py-2 text-sm text-fg-1 outline-none transition-colors placeholder:text-fg-3 focus:border-brass";

export const fieldLabel = "text-sm font-medium text-fg-2";

export const panel = "rounded-md border border-line bg-ink-800";
