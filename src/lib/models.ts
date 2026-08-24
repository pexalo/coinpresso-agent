// ---------------------------------------------------------------------------
// Model resolution and key checking.
//
// The reasoning behind the tiering — which model runs which stage and why —
// lives in `model-registry.ts`, along with the prices and the date they were
// verified. This file only resolves that register against the environment and
// answers whether the keys are real.
//
// Anything that used to be a second copy of the register is now derived from
// it. The price table is the cautionary tale: it drifted from the real prices
// and quietly overstated one tier by 3x.
// ---------------------------------------------------------------------------

import { pricingTable, STAGE_MODELS } from "./model-registry";

function assigned(stage: string): string {
  return (
    STAGE_MODELS.find((s) => s.stage === stage)?.modelId ?? "claude-sonnet-4-5"
  );
}

export const MODELS = {
  strategy: process.env.STRATEGY_MODEL || assigned("strategy"),
  writer: process.env.WRITER_MODEL || assigned("writer"),
  reviewer: process.env.REVIEWER_MODEL || assigned("reviewer"),
} as const;

/**
 * USD per million tokens, DERIVED from the register.
 *
 * It used to be a second hand-maintained copy, and it drifted — Opus was listed
 * at three times its real price for long enough to make the cost forecast lie.
 * One table, one date on it, one place to correct.
 */
export const PRICING: Record<string, { in: number; out: number }> =
  pricingTable();

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
