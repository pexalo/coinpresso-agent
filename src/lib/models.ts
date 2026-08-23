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

export function mockMode(): boolean {
  if (process.env.MOCK_AGENTS === "1") return true;
  return !process.env.ANTHROPIC_API_KEY || !process.env.OPENAI_API_KEY;
}
