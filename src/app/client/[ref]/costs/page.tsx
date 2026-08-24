import Link from "next/link";
import { notFound } from "next/navigation";
import { getClient } from "@/lib/clients";
import { listRuns } from "@/lib/store";
import { buildReport, tokens, usd } from "@/lib/costs";
import { PRICING } from "@/lib/models";
import CostForecast from "@/components/CostForecast";

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
          { label: "Spent to date", value: usd(report.totalUsd), tone: "var(--ink)" },
          {
            label: "Billable runs",
            value: report.billableRuns,
            tone: "var(--accent)",
          },
          {
            label: "Tokens in / out",
            value: `${tokens(report.tokensIn)} / ${tokens(report.tokensOut)}`,
            tone: "var(--ink-2)",
          },
          {
            label: "Mock runs",
            value: report.mockRuns,
            tone: "var(--warning)",
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

      {report.mockRuns > 0 && (
        <div className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/10 px-4 py-3 text-[12px] text-[var(--warning)]">
          {report.mockRuns} run{report.mockRuns === 1 ? " is" : "s are"} mock and
          excluded from every figure and average on this page. A mock run costs
          nothing and finishes in nine seconds, so counting it would put the
          per-article cost near zero and the monthly forecast out by two orders
          of magnitude.
        </div>
      )}

      <CostForecast report={report} />

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
          Web search is billed separately by the provider and is not in these
          figures. On the research stage it is a real line item, so treat the
          strategy row as a floor rather than a total.
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
