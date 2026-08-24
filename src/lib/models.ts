// ---------------------------------------------------------------------------
// Model tiering per stage.
//
// Strategy runs on Claude with the server-side web_search tool, because the
// research quality is what everything downstream depends on — a weak brief
// produces a well-written article about nothing.
//
// Writer is deliberately mid-tier Claude, as specified. Given a good brief the
// writing task is constrained enough that the frontier tier buys little.
//
// Reviewer is a GPT model, deliberately a different family from the writer. A
// reviewer that shares the writer's blind spots is decoration. Cross-family
// review catches the failure modes one lineage is prone to.
// ---------------------------------------------------------------------------

export const MODELS = {
  strategy: process.env.STRATEGY_MODEL || "claude-sonnet-4-5",
  writer: process.env.WRITER_MODEL || "claude-sonnet-4-5",
  reviewer: process.env.REVIEWER_MODEL || "gpt-4.1",
} as const;

/** Rough USD per million tokens, for the cost readout in the dashboard. */
export const PRICING: Record<string, { in: number; out: number }> = {
  "claude-sonnet-4-5": { in: 3, out: 15 },
  "claude-opus-4-5": { in: 15, out: 75 },
  "claude-haiku-4-5": { in: 1, out: 5 },
  "gpt-4.1": { in: 2, out: 8 },
  "gpt-4.1-mini": { in: 0.4, out: 1.6 },
};

export function estimateCost(model: string, tin: number, tout: number): number {
  const p = PRICING[model];
  if (!p) return 0;
  return (tin / 1_000_000) * p.in + (tout / 1_000_000) * p.out;
}

/**
 * A key is only real if it is present AND not one of the placeholders that
 * `cp .env.example .env.local` leaves behind. Checking presence alone flips the
 * app to live mode on a file full of `sk-ant-...`, and the failure surfaces as a
 * 401 three minutes into the first run rather than as "you have no keys".
 */
function usableKey(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  if (!v) return false;
  if (v.includes("...")) return false;
  if (/^(your|replace|changeme|todo|xxx)/i.test(v)) return false;
  return v.length >= 20;
}

export function mockMode(): boolean {
  if (process.env.MOCK_AGENTS === "1") return true;
  return (
    !usableKey(process.env.ANTHROPIC_API_KEY) ||
    !usableKey(process.env.OPENAI_API_KEY)
  );
}

/** Which keys are actually usable — surfaced by /api/health so the dashboard can
 *  say which one is missing rather than only that it is in mock mode. */
export function keyStatus(): { anthropic: boolean; openai: boolean } {
  return {
    anthropic: usableKey(process.env.ANTHROPIC_API_KEY),
    openai: usableKey(process.env.OPENAI_API_KEY),
  };
}
