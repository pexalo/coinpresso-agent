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

import { priceFor, pricingTable, STAGE_MODELS } from "./model-registry";
import { canCallModels, routingMode, routingWarning } from "./providers/routing";

function assigned(stage: string): string {
  return (
    STAGE_MODELS.find((s) => s.stage === stage)?.modelId ?? "claude-sonnet-5"
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

/**
 * Priced AT CALL TIME, not at module load.
 *
 * The register carries announced price changes (Sonnet 5 steps from $2/$10 to
 * $3/$15 on 1 Sep), and a deployment that boots in August and runs into
 * September must not keep charging August prices. `PRICING` above stays for
 * existence checks and display; the money goes through here.
 *
 * An UNKNOWN model returns 0 — there is no honest number to invent — but the
 * caller records the tokens regardless, and the cost report surfaces "tokens
 * burned on an unpriced model" as its own warning. Silently costing an
 * unregistered override at $0 was exactly the hole this note exists to close:
 * set WRITER_MODEL to anything the register has not heard of and every article
 * looked free.
 */
export function estimateCost(
  model: string,
  tin: number,
  tout: number,
  at: Date = new Date()
): number {
  const p = priceFor(model, at);
  if (!p) return 0;
  return (tin / 1_000_000) * p.in + (tout / 1_000_000) * p.out;
}

/** Env-override models the register cannot price. Surfaced by /api/health. */
export function unpricedModels(): string[] {
  return [...new Set(Object.values(MODELS))].filter((m) => !priceFor(m));
}

/**
 * Mock mode when this app cannot actually reach a model.
 *
 * The check defers to the routing layer, because "do we have provider keys" is
 * the wrong question in gateway mode — HQ holds the keys there, and demanding
 * them locally would put a correctly configured deployment into mock.
 */
export function mockMode(): boolean {
  if (process.env.MOCK_AGENTS === "1") return true;
  const can = canCallModels();
  return !can.anthropic || !can.openai;
}

/** Surfaced by /api/health so the dashboard can say what is actually missing. */
export function keyStatus(): {
  anthropic: boolean;
  openai: boolean;
  mode: ReturnType<typeof routingMode>;
  warning: string | null;
} {
  return { ...canCallModels(), mode: routingMode(), warning: routingWarning() };
}
