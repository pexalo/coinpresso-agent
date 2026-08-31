import Link from "next/link";
import { notFound } from "next/navigation";
import { getClient } from "@/lib/clients";
import { listRuns } from "@/lib/store";
import {
  buildReport,
  MODELLED_SEARCHES_PER_RUN,
  tokens,
  usd,
} from "@/lib/costs";
import { SEARCH_PRICE_PER_1000 } from "@/lib/model-registry";
import { PRICING } from "@/lib/models";
import CostForecast from "@/components/CostForecast";
import { listSpend, summarizeSpend } from "@/lib/spend-log";
import { isAdmin } from "@/lib/portal-session";
import { forecast } from "@/lib/costs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRACK_LABEL: Record<string, string> = {
  wire: "Crypto PR",
  blog: "Coinpresso blog",
};

export default async function CostsPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const client = getClient(ref);
  if (!client) notFound();

  const report = buildReport(await listRuns(ref));
  const maxDay = Math.max(0.0001, ...report.days.map((d) => d.costUsd));

  // Off-run spend: ideation scans and day planning. Real model calls, real
  // search fees, no run record — kept in their own ledger and added to the
  // headline here so "spent to date" means what it says.
  const scans = summarizeSpend(await listSpend(ref));
  const grandTotalUsd = report.totalUsd + scans.totalUsd;

  // RE-BILLING IS SHOWN TO PEXALO ONLY. PEXALO-HQ-BILLING.md explains why the
  // markup panel was removed from this page: it is Coinpresso's own tool, and a
  // "billed to you, of which margin $X" card was the agency showing the client
  // its margin on them. The portal login now distinguishes the two, so the
  // figure comes back — for the Pexalo role alone. Liam sees the cost base
  // exactly as before.
  //
  // The base INCLUDES search, per the doc's first "easy to get wrong": a markup
  // on tokens alone charges less than the work cost.
  const admin = await isAdmin();
  const markupPct = Math.max(0, Number(process.env.BILLING_MARKUP_PCT ?? 10) || 0);
  const billable = (cost: number) => cost * (1 + markupPct / 100);
  const monthly = forecast(report, { wirePerDay: 4, blogPerDay: 6 });
  const monthlyBaseUsd = monthly.reduce((a, f) => a + f.perMonthUsd, 0);
  // Hosting is a FLAT ALLOWANCE, not a measurement. Railway bills the whole
  // project by usage and cannot attribute a dollar figure to one client, so any
  // per-client hosting number is a decision, not a reading. Set it in the
  // deployment; 0 (the default) means "included in the retainer" and the tile
  // does not render. Not marked up — it is a pass-through.
  const hostingUsd = Math.max(0, Number(process.env.BILLING_HOSTING_USD ?? 0) || 0);

  return (
    <div className="space-y-5 pt-2">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">API costs</h1>
        <p className="text-[var(--ink-3)] text-sm mt-1 max-w-3xl">
          Every stage records the model it called and the tokens it burned. This
          is what that adds up to, where it went, and what a given publishing
          cadence would cost per month.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Spent to date", value: usd(grandTotalUsd), tone: "var(--ink)" },
          {
            label: "Of which tokens",
            value: usd(report.tokenCostUsd + scans.tokenCostUsd),
            tone: "var(--ink-2)",
          },
          {
            label: "Of which search",
            value: `${usd(report.searchCostUsd + scans.searchCostUsd)} · ${report.searchRequests + scans.searchRequests}`,
            tone: "var(--warning)",
          },
          {
            label: "Tokens in / out",
            value: `${tokens(report.tokensIn)} / ${tokens(report.tokensOut)}`,
            tone: "var(--ink-2)",
          },
        ].map((k) => (
          <div key={k.label} className="card p-4">
            <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)]">
              {k.label}
            </div>
            <div
              className="text-xl font-extrabold mt-1.5"
              style={{ color: k.tone }}
            >
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {admin && (
        <div className="card overflow-hidden border-[var(--accent)]/40">
          <div className="px-5 py-4 border-b border-[var(--line)] flex items-baseline gap-3 flex-wrap">
            <h2 className="font-bold text-sm">Billable to Coinpresso</h2>
            <span className="text-[10px] uppercase tracking-wider text-[var(--accent)] font-semibold">
              Pexalo only · not shown to the client login
            </span>
          </div>
          <div className="p-5 grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Cost base to date", value: usd(grandTotalUsd) },
              { label: `Markup ${markupPct}%`, value: usd(grandTotalUsd * (markupPct / 100)) },
              { label: "Billable to date", value: usd(billable(grandTotalUsd)), strong: true },
              {
                label: "Billable / month at 4 wire + 6 blog",
                value: usd(billable(monthlyBaseUsd) + hostingUsd),
                sub: hostingUsd
                  ? `models ${usd(billable(monthlyBaseUsd))} + hosting ${usd(hostingUsd)}`
                  : `base ${usd(monthlyBaseUsd)}`,
              },
              ...(hostingUsd
                ? [
                    {
                      label: "Hosting allowance / month",
                      value: usd(hostingUsd),
                      sub: "flat, not marked up",
                    },
                  ]
                : []),
            ].map((k) => (
              <div key={k.label} className="rounded-lg border border-[var(--line)] px-4 py-3">
                <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)]">{k.label}</div>
                <div
                  className="text-lg font-extrabold mt-1"
                  style={{ color: k.strong ? "var(--accent)" : "var(--ink)" }}
                >
                  {k.value}
                </div>
                {k.sub && <div className="text-[10.5px] text-[var(--ink-4)] mt-0.5">{k.sub}</div>}
              </div>
            ))}
          </div>
          <p className="px-5 pb-4 text-[11px] text-[var(--ink-4)] max-w-3xl">
            Every model is in the base — Claude for research and writing, GPT for
            review — plus web-search fees, all measured from the providers&apos;
            own usage reports. Failed calls that were still billed are included.
            Change the rate with <code>BILLING_MARKUP_PCT</code> in the deployment;
            set <code>BILLING_HOSTING_USD</code> to add a flat monthly hosting
            allowance, or leave it at 0 to treat hosting as part of the retainer.
            At this volume the markup is a pass-through, not a revenue line — the
            money is in the retainer.
          </p>
        </div>
      )}

      {grandTotalUsd === 0 && (
        <div className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/10 px-4 py-3 text-[12px] text-[var(--warning)] space-y-1.5">
          <div>
            <strong>$0.00 here does not mean $0.00 was spent.</strong> This
            ledger counts calls this app made <em>and finished</em>. A call that
            came back and then failed to parse was still billed by Anthropic,
            and until recently it was recorded nowhere — so a run of failed day
            plans could drain a balance while this page stayed at zero. Failed
            calls now write to the ledger, but only from this version onward:
            anything spent before it is not here and cannot be recovered.
          </div>
          <div>
            The authority on what was actually charged is the Anthropic console
            under Usage, filtered to the API key this app uses. Anything else on
            that key — another app, a terminal session — spends the same
            balance and will never appear on this page.
          </div>
        </div>
      )}

      {report.mockRuns > 0 && (
        <div className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/10 px-4 py-3 text-[12px] text-[var(--warning)]">
          {report.mockRuns} run{report.mockRuns === 1 ? " is" : "s are"} mock and
          excluded from every figure and average on this page. A mock run costs
          nothing and finishes in nine seconds, so counting it would put the
          per-article cost near zero and the monthly forecast out by two orders
          of magnitude.
        </div>
      )}

      {report.unpriced.length > 0 && (
        <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-4 py-3 text-[12px] text-[var(--danger)]">
          <strong>Every dollar figure on this page is understated.</strong>{" "}
          {report.unpriced
            .map(
              (u) =>
                `${u.model} burned ${tokens(u.tokensIn)} in / ${tokens(u.tokensOut)} out`
            )
            .join("; ")}{" "}
          on a model the register cannot price, so those tokens are counted at
          $0. Add the model to the register with its real price — until then the
          totals here are a floor, not a figure.
        </div>
      )}

      {scans.count > 0 && (
        <div className="card p-5">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-bold text-sm">Scans &amp; planning</h2>
              <p className="text-[11px] text-[var(--ink-3)] mt-0.5 max-w-2xl">
                Model calls that do not produce an article — the ideation scan
                and the blog day-planner. They are in the totals above; this is
                the line-item. The scan is the most search-heavy call in the
                system, so at daily use this is not a rounding error.
              </p>
            </div>
            <div className="text-right">
              <div className="text-xl font-extrabold tabular-nums">
                {usd(scans.totalUsd)}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)]">
                {scans.count} call{scans.count === 1 ? "" : "s"} ·{" "}
                {scans.searchRequests} searches
              </div>
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            {scans.byKind.map((k) => (
              <div
                key={k.kind}
                className="flex items-baseline gap-3 text-[12px] border-t border-[var(--line)] pt-1.5"
              >
                <span className="text-[var(--ink-2)]">{k.label}</span>
                <span className="text-[var(--ink-4)] text-[11px]">
                  {k.count}× · {k.searchRequests} searches
                </span>
                <span className="ml-auto tabular-nums font-semibold">
                  {usd(k.totalUsd)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <CostForecast report={report} />

      {/* --- Where the invoice is -------------------------------------- */}
      <div className="card px-5 py-4">
        <h2 className="font-bold text-sm">What this page is, and is not</h2>
        <p className="text-[12px] text-[var(--ink-3)] leading-relaxed mt-1.5 max-w-3xl">
          This is the <strong>cost base</strong> — what the providers actually
          charged to run this programme, measured from their own usage reports
          rather than estimated. Tokens and search are separated because the
          provider bills them separately, and search is roughly a quarter of a
          run.
        </p>
        <p className="text-[12px] text-[var(--ink-3)] leading-relaxed mt-2 max-w-3xl">
          Invoicing is not here. It lives in Pexalo HQ, alongside the contract —
          this dashboard is Coinpresso&apos;s own tool, and an invoice panel in it
          would have been the agency showing a client its margin on them, with a
          field to edit the rate.
        </p>
      </div>

      {/* --- Per-run breakdown -------------------------------------------- */}
      {report.runsDetail.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--line)]">
            <h2 className="font-bold text-sm">Every run</h2>
            <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
              The line-item view — what an invoice would itemise. Mock runs
              excluded.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11.5px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] border-b border-[var(--line)]">
                  <th className="text-left font-medium px-5 py-2.5">Run</th>
                  <th className="text-right font-medium px-3 py-2.5">In</th>
                  <th className="text-right font-medium px-3 py-2.5">Out</th>
                  <th className="text-right font-medium px-3 py-2.5">Tokens</th>
                  <th className="text-right font-medium px-3 py-2.5">Search</th>
                  <th className="text-right font-medium px-3 py-2.5">Rev</th>
                  <th className="text-right font-medium px-5 py-2.5">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {report.runsDetail.slice(0, 60).map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-2.5 max-w-[320px]">
                      <div className="truncate font-medium">{r.title}</div>
                      <div className="text-[10.5px] text-[var(--ink-4)]">
                        {r.createdAt.slice(0, 10)} · {r.track}
                        {r.status === "failed" && (
                          <span className="text-[var(--danger)]"> · failed</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--ink-3)]">
                      {tokens(r.tokensIn)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--ink-3)]">
                      {tokens(r.tokensOut)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {usd(r.tokenCostUsd)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--ink-2)]">
                      {r.searchRequests
                        ? `${usd(r.searchCostUsd)} (${r.searchRequests})`
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--ink-3)]">
                      {r.revisions || "—"}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-semibold">
                      {usd(r.totalUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report.runsDetail.length > 60 && (
            <p className="px-5 py-3 text-[11px] text-[var(--ink-4)] border-t border-[var(--line)]">
              Showing the 60 most recent of {report.runsDetail.length}.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--line)]">
            <h2 className="font-bold text-sm">By track</h2>
          </div>
          {report.tracks.every((t) => t.billableRuns === 0) ? (
            <p className="px-5 py-6 text-[12px] text-[var(--ink-3)]">
              No billable runs yet. Add model keys and generate something, and
              the real numbers land here.
            </p>
          ) : (
            <div className="divide-y divide-[var(--line)]">
              {report.tracks.map((t) => (
                <div key={t.track} className="px-5 py-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-semibold text-[13px]">
                      {TRACK_LABEL[t.track]}
                    </h3>
                    <span className="text-[13px] font-bold tabular-nums">
                      {usd(t.costUsd)}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--ink-3)] mt-1">
                    {t.billableRuns} billable run
                    {t.billableRuns === 1 ? "" : "s"}
                    {t.runs > t.billableRuns
                      ? ` (${t.runs - t.billableRuns} mock)`
                      : ""}
                    {t.averageUsd !== null && (
                      <> · {usd(t.averageUsd)} average</>
                    )}
                    {t.billableRuns > 0 && (
                      <>
                        {" "}
                        · {(t.revisions / t.billableRuns).toFixed(1)} revision
                        passes per run
                      </>
                    )}
                  </div>
                  <div className="text-[11px] text-[var(--ink-4)] mt-0.5">
                    {tokens(t.tokensIn)} in · {tokens(t.tokensOut)} out
                  </div>
                </div>
              ))}
            </div>
          )}

          {(report.cheapest || report.dearest) && (
            <div className="px-5 py-4 border-t border-[var(--line)]">
              <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] mb-2">
                The spread
              </div>
              {report.cheapest && (
                <div className="text-[11.5px] text-[var(--ink-2)] truncate">
                  <span className="text-[var(--success)] font-medium">
                    {usd(report.cheapest.costUsd)}
                  </span>{" "}
                  · {report.cheapest.title}
                </div>
              )}
              {report.dearest && report.dearest.id !== report.cheapest?.id && (
                <div className="text-[11.5px] text-[var(--ink-2)] truncate mt-1">
                  <span className="text-[var(--warning)] font-medium">
                    {usd(report.dearest.costUsd)}
                  </span>{" "}
                  · {report.dearest.title}
                </div>
              )}
              <p className="text-[10.5px] text-[var(--ink-4)] leading-relaxed mt-2">
                The gap is almost always the revision loop and how much the
                search stage pulled into context. An average alone hides it.
              </p>
            </div>
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--line)]">
            <h2 className="font-bold text-sm">By stage</h2>
            <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
              Where the money actually goes.
            </p>
          </div>
          {report.stages.length === 0 ? (
            <p className="px-5 py-6 text-[12px] text-[var(--ink-3)]">
              Nothing measured yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11.5px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] border-b border-[var(--line)]">
                    <th className="text-left font-medium px-5 py-2.5">Stage</th>
                    <th className="text-right font-medium px-3 py-2.5">Calls</th>
                    <th className="text-right font-medium px-3 py-2.5">In</th>
                    <th className="text-right font-medium px-3 py-2.5">Out</th>
                    <th className="text-right font-medium px-5 py-2.5">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {report.stages.map((s) => (
                    <tr key={`${s.id}:${s.model}`}>
                      <td className="px-5 py-2.5">
                        <div className="font-medium">{s.label}</div>
                        <div className="text-[10.5px] text-[var(--ink-4)]">
                          {s.model}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[var(--ink-2)]">
                        {s.runs}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[var(--ink-3)]">
                        {tokens(s.tokensIn)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[var(--ink-3)]">
                        {tokens(s.tokensOut)}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums font-semibold">
                        {usd(s.costUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {report.days.length > 0 && (
        <div className="card p-5">
          <h2 className="font-bold text-sm mb-3">Daily spend</h2>
          <div className="flex items-end gap-1.5 h-32">
            {report.days.map((d) => (
              <div
                key={d.date}
                className="flex-1 min-w-[6px] group relative"
                title={`${d.date}: ${usd(d.costUsd)} across ${d.runs} run${d.runs === 1 ? "" : "s"}`}
              >
                <div
                  className="w-full rounded-t bg-[var(--accent)]/70 group-hover:bg-[var(--accent)] transition-colors"
                  style={{
                    height: `${Math.max(2, Math.round((d.costUsd / maxDay) * 128))}px`,
                  }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10.5px] text-[var(--ink-4)] mt-2">
            <span>{report.days[0].date}</span>
            <span>{report.days[report.days.length - 1].date}</span>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--line)]">
          <h2 className="font-bold text-sm">Rates in use</h2>
          <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
            USD per million tokens. Change a model in the environment and every
            figure on this page moves with it.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] border-b border-[var(--line)]">
                <th className="text-left font-medium px-5 py-2.5">Model</th>
                <th className="text-right font-medium px-3 py-2.5">Input</th>
                <th className="text-right font-medium px-5 py-2.5">Output</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {Object.entries(PRICING).map(([m, p]) => (
                <tr key={m}>
                  <td className="px-5 py-2.5 font-mono text-[11px]">{m}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[var(--ink-2)]">
                    ${p.in.toFixed(2)}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-[var(--ink-2)]">
                    ${p.out.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-3.5 text-[11px] text-[var(--ink-3)] leading-relaxed border-t border-[var(--line)]">
          <span className="font-semibold text-[var(--ink-2)]">
            Web search: ${SEARCH_PRICE_PER_1000} per 1,000 searches
          </span>
          , billed on top of tokens. A research call makes up to a dozen — around{" "}
          {MODELLED_SEARCHES_PER_RUN} typically — so it is roughly a quarter of a
          run and it IS counted in every figure on this page. It is measured from
          the API&apos;s own usage block, not estimated.
        </p>
      </div>

      <div className="flex gap-3">
        <Link
          href={`/client/${ref}/workflow`}
          className="text-[12.5px] font-semibold px-4 py-2.5 rounded-lg border border-[var(--line)] hover:border-[var(--accent)]/50 transition-colors"
        >
          See the workflow these costs come from
        </Link>
      </div>
    </div>
  );
}
