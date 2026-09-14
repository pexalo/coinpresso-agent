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

import { priceFor, pricingTable, STAGE_MODELS, type Price } from "./model-registry";
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
export const PRICING: Record<string, Price> = pricingTable();

/**
 * Priced AT CALL TIME, not at module load.
 *
 * The register can carry announced price changes, and a deployment that boots
 * before one and runs past it must not keep charging the old rate. `PRICING` above stays for
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
  at: Date = new Date(),
  /**
   * How much of `tin` went through the prompt cache. `tin` is the TOTAL input
   * (fresh + written + read) as every stage records it; the cached portions are
   * priced at their own rates and the remainder at the base rate. Omitted means
   * nothing was cached, which prices the whole input at base — the old
   * behaviour, and still correct for a call that did not cache.
   */
  cache?: { write?: number; read?: number }
): number {
  const p = priceFor(model, at);
  if (!p) return 0;
  const write = Math.max(0, cache?.write ?? 0);
  const read = Math.max(0, cache?.read ?? 0);
  const fresh = Math.max(0, tin - write - read);
  return (
    (fresh / 1_000_000) * p.in +
    (write / 1_000_000) * p.cacheWrite +
    (read / 1_000_000) * p.cacheRead +
    (tout / 1_000_000) * p.out
  );
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
