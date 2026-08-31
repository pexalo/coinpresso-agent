import Link from "next/link";
import { notFound } from "next/navigation";
import { getClient } from "@/lib/clients";
import { MODELS } from "@/lib/models";
import {
  cheaperThan,
  familySplit,
  MODEL_LIST,
  PRICED_ON,
  PRICING_SOURCES,
  registered,
  STAGE_MODELS,
} from "@/lib/model-registry";
import { modelledUnitCost, usd } from "@/lib/costs";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  current: "text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10",
  superseded: "text-[var(--warning)] border-[var(--warning)]/30 bg-[var(--warning)]/10",
  retired: "text-[var(--ink-4)] border-[var(--line)] bg-[var(--bg)]",
};

export default async function ModelRegisterPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const client = getClient(ref);
  if (!client) notFound();

  const split = familySplit();
  const inUse = new Set(Object.values(MODELS));

  // Savings available without changing tier — surfaced, never taken.
  const savings = [...inUse]
    .map((id) => ({ current: registered(id), options: cheaperThan(id) }))
    .filter((x) => x.current && x.options.length > 0);

  return (
    <div className="space-y-5 pt-2">
      <div>
        <Link
          href={`/client/${ref}/resources`}
          className="text-[11px] text-[var(--ink-3)] hover:text-[var(--accent)]"
        >
          ← Resources
        </Link>
        <h1 className="text-2xl font-extrabold tracking-tight mt-1.5">
          LLM and model register
        </h1>
        <p className="text-[var(--ink-3)] text-sm mt-1 max-w-3xl">
          Every model this system can call, which stage each one runs, and what
          it costs. This page is the source of truth — the pipeline resolves its
          tiering from it and the cost forecast prices from it, so the register
          and the code cannot disagree.
        </p>
      </div>

      {/* --- Assignments ------------------------------------------------- */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--line)]">
          <h2 className="font-bold text-sm">Stage assignments</h2>
          <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
            Each row is overridable by its environment variable without touching
            code.
          </p>
        </div>
        <div className="divide-y divide-[var(--line)]">
          {STAGE_MODELS.map((s) => {
            const m = registered(s.modelId);
            const fallback = registered(s.fallbackId);
            return (
              <div key={s.stage + s.label} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <h3 className="font-bold text-[13px]">{s.label}</h3>
                    <div className="flex items-center gap-2 flex-wrap mt-1.5">
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[var(--bg)] border border-[var(--line)] text-[var(--ink-2)]">
                        {m ? m.name : s.modelId}
                      </span>
                      {m && (
                        <span className="text-[10.5px] text-[var(--ink-4)]">
                          {m.provider} · {m.tier} · ${m.pricing.in}/$
                          {m.pricing.out} per M
                          {m.priceChange && (
                            <span className="text-[var(--warning)] font-semibold">
                              {" "}
                              → ${m.priceChange.pricing.in}/$
                              {m.priceChange.pricing.out} from {m.priceChange.on}
                            </span>
                          )}
                        </span>
                      )}
                      {s.envVar !== "—" && (
                        <code className="text-[10.5px] text-[var(--accent)]">
                          {s.envVar}
                        </code>
                      )}
                    </div>
                  </div>
                </div>

                <p className="text-[12px] text-[var(--ink-2)] leading-relaxed mt-2.5 max-w-3xl">
                  {s.why}
                </p>

                <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2.5 text-[11px]">
                  <span className="text-[var(--ink-3)]">
                    <span className="text-[var(--ink-4)]">Needs: </span>
                    {s.requires.join(" · ")}
                  </span>
                  {s.fallbackId !== "—" && (
                    <span className="text-[var(--ink-3)]">
                      <span className="text-[var(--ink-4)]">If unavailable: </span>
                      {fallback?.name ?? s.fallbackId}
                    </span>
                  )}
                </div>

                {s.constraint && (
                  <p className="text-[11.5px] text-[var(--warning)] leading-relaxed mt-2.5 pl-3 border-l-2 border-[var(--warning)]/40">
                    {s.constraint}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* --- Cross-family ------------------------------------------------ */}
      <div className="card p-5">
        <h2 className="font-bold text-sm mb-2">
          Why two vendors instead of one
        </h2>
        <div className="grid sm:grid-cols-2 gap-5 mt-3">
          {(["claude", "gpt"] as const).map((f) => (
            <div key={f}>
              <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] mb-1.5">
                {f === "claude" ? "Anthropic" : "OpenAI"}
              </div>
              <ul className="space-y-1">
                {split[f].map((s) => (
                  <li
                    key={s}
                    className="text-[11.5px] text-[var(--ink-2)] leading-snug pl-3 relative"
                  >
                    <span className="absolute left-0 text-[var(--ink-4)]">·</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-[12px] text-[var(--ink-2)] leading-relaxed mt-4 pt-4 border-t border-[var(--line)] max-w-3xl">
          Consolidating on one vendor would be simpler to bill and would quietly
          remove the review stage. A reviewer sharing the writer&apos;s lineage
          shares its blind spots and largely agrees with itself — it would keep
          returning verdicts, and they would stop meaning anything. The second
          vendor is the cost of the gate being real.
        </p>
      </div>

      {/* --- Savings ------------------------------------------------------ */}
      {savings.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--line)]">
            <h2 className="font-bold text-sm">Cheaper options</h2>
            <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
              Same vendor family, so the cross-family review still holds.
              Surfaced, not taken — changing a production model is a decision,
              not a side effect of reading a page.
            </p>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {savings.map(({ current, options }) => (
              <div key={current!.id} className="px-5 py-3.5">
                <div className="text-[12px]">
                  <span className="font-semibold">{current!.name}</span>{" "}
                  <span className="text-[var(--ink-3)]">
                    ${current!.pricing.in}/${current!.pricing.out}
                  </span>
                </div>
                {options.map(({ model: o, tierChange, cheaperOn }) => {
                  const cut =
                    cheaperOn === "output" || cheaperOn === "both"
                      ? Math.round((1 - o.pricing.out / current!.pricing.out) * 100)
                      : Math.round((1 - o.pricing.in / current!.pricing.in) * 100);
                  const drop = tierChange === "lower";
                  return (
                    <div
                      key={o.id}
                      className="text-[11.5px] text-[var(--ink-2)] mt-2 pl-3 border-l-2"
                      style={{
                        borderColor: drop
                          ? "var(--warning)"
                          : "var(--success)",
                      }}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{o.name}</span>
                        <span className="text-[var(--ink-3)]">
                          ${o.pricing.in}/${o.pricing.out}
                        </span>
                        <span
                          className="text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border"
                          style={{
                            color: drop ? "var(--warning)" : "var(--success)",
                            borderColor: drop
                              ? "color-mix(in srgb, var(--warning) 35%, transparent)"
                              : "color-mix(in srgb, var(--success) 35%, transparent)",
                          }}
                        >
                          {drop ? `drops to ${o.tier}` : "same tier or better"}
                        </span>
                        <span className="text-[10.5px] text-[var(--ink-4)]">
                          {cut}% less on{" "}
                          {cheaperOn === "both" ? "both axes" : cheaperOn}
                        </span>
                      </div>
                      {o.notes && (
                        <p className="text-[11px] text-[var(--ink-3)] leading-relaxed mt-1">
                          {o.notes}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="px-5 py-3.5 text-[11px] text-[var(--ink-3)] leading-relaxed border-t border-[var(--line)]">
            Measure before switching. Five real runs on each track moves the cost
            page from a modelled figure to a measured one, and a model that
            drafts 10% worse costs more in extra revision passes than it saves
            per token. A tier drop on research is the one to be most careful
            about: a source the strategy stage misses is a fact the article
            cannot contain, and nothing downstream can recover it.
          </p>
        </div>
      )}

      {/* --- Price table -------------------------------------------------- */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--line)]">
          <h2 className="font-bold text-sm">The register</h2>
          <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
            USD per million tokens. Verified against the providers&apos; own
            price lists on{" "}
            <span className="text-[var(--ink-2)] font-medium">{PRICED_ON}</span>.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] border-b border-[var(--line)]">
                <th className="text-left font-medium px-5 py-2.5">Model</th>
                <th className="text-left font-medium px-3 py-2.5">Tier</th>
                <th className="text-right font-medium px-3 py-2.5">In</th>
                <th className="text-right font-medium px-3 py-2.5">Out</th>
                <th className="text-left font-medium px-3 py-2.5">Context</th>
                <th className="text-left font-medium px-5 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {MODEL_LIST.map((m) => (
                <tr
                  key={m.id}
                  className={m.status === "retired" ? "opacity-55" : ""}
                >
                  <td className="px-5 py-2.5 align-top">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{m.name}</span>
                      {inUse.has(m.id) && (
                        <span className="text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)]">
                          In use
                        </span>
                      )}
                    </div>
                    <code className="text-[10.5px] text-[var(--ink-4)]">
                      {m.id}
                    </code>
                    {m.notes && (
                      <p className="text-[11px] text-[var(--ink-3)] leading-relaxed mt-1 max-w-md">
                        {m.notes}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--ink-2)] align-top whitespace-nowrap">
                    {m.tier}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums align-top">
                    ${m.pricing.in.toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums align-top">
                    ${m.pricing.out.toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--ink-3)] align-top whitespace-nowrap">
                    {m.contextWindow ?? "—"}
                  </td>
                  <td className="px-5 py-2.5 align-top whitespace-nowrap">
                    <span
                      className={`text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${STATUS_STYLE[m.status]}`}
                    >
                      {m.status}
                    </span>
                    {m.supersededBy && (
                      <div className="text-[10.5px] text-[var(--ink-4)] mt-1">
                        → {registered(m.supersededBy)?.name}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-[var(--line)] flex flex-wrap gap-x-5 gap-y-1">
          {PRICING_SOURCES.map((s) => (
            <a
              key={s.url}
              href={s.url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-[11px] text-[var(--accent)] hover:underline"
            >
              {s.label} ↗
            </a>
          ))}
        </div>
      </div>

      {/* --- What it costs ------------------------------------------------ */}
      <div className="card p-5">
        <h2 className="font-bold text-sm mb-2">What the tiering costs</h2>
        <div className="flex flex-wrap gap-6 mt-3">
          {(["wire", "blog"] as const).map((t) => (
            <div key={t}>
              <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)]">
                {t === "wire" ? "One wire release" : "One blog post"}
              </div>
              <div className="text-xl font-extrabold mt-1">
                {usd(modelledUnitCost(t))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[12px] text-[var(--ink-2)] leading-relaxed mt-4 max-w-3xl">
          Modelled from the prompt sizes in this system against the prices above.
          Research is roughly 55% of it, because that is the stage carrying search
          results into context — which is also why weakening it to save money is
          the worst available saving. The full breakdown, and what a given cadence
          costs per month, is on{" "}
          <Link
            href={`/client/${ref}/costs`}
            className="text-[var(--accent)] font-medium"
          >
            API costs
          </Link>
          .
        </p>
      </div>

      {/* --- Maintenance -------------------------------------------------- */}
      <div className="card p-5">
        <h2 className="font-bold text-sm mb-2">Keeping this true</h2>
        <ul className="space-y-2 text-[12px] text-[var(--ink-2)] leading-relaxed max-w-3xl">
          {[
            "Prices move. Re-check them against the two links above roughly quarterly, and update PRICED_ON when you do — a stale date is more useful than a confident wrong number.",
            "When a model is retired, set its status here and point supersededBy at the replacement. The stage assignment keeps working because it names a fallback.",
            "Changing a stage's model is one environment variable. Changing the reviewer to a Claude model is the one change to refuse — it removes the gate without removing the stage, so everything keeps passing and nothing is being checked.",
            "This register once carried Opus at $15/$75 when the real price was $5/$25. It was a second hand-maintained copy of the price table; it is now the only copy, and the cost code derives from it.",
          ].map((x, i) => (
            <li key={i} className="pl-4 relative">
              <span className="absolute left-0 text-[var(--ink-4)]">—</span>
              {x}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
