/** Pure client/server-safe autonomy constants. */
export const AUTONOMY = {
  MEMORY_ONLY: 0,
  REMIND: 1,
  DRAFT: 2,
  APPROVAL: 3,
  AUTONOMOUS_LOW_RISK: 4,
} as const;

export const AUTONOMY_LABELS: Record<number, string> = {
  0: "Memory only",
  1: "Remind me",
  2: "Draft for me",
  3: "Send after my approval",
  4: "Send low-risk automatically",
};
