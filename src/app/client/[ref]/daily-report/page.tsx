import { notFound } from "next/navigation";
import { getClient, hasModule } from "@/lib/clients";
import { reportsFor, type StatCard } from "@/lib/daily-report";
import {
  DailyRevenueChart,
  SpendVsRevenueChart,
} from "@/components/ReportCharts";

export const dynamic = "force-dynamic";

const TONE: Record<string, string> = {
  up: "var(--success)",
  down: "var(--danger)",
  warn: "var(--warning)",
  neutral: "var(--ink-2)",
};

const SEV: Record<string, { mark: string; colour: string }> = {
  alert: { mark: "!", colour: "var(--danger)" },
  down: { mark: "▼", colour: "var(--danger)" },
  flat: { mark: "▪", colour: "var(--warning)" },
  note: { mark: "⇄", colour: "var(--ink-3)" },
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-4)] mb-2.5 font-medium">
      {children}
    </div>
  );
}

function Stat({ card, big }: { card: StatCard; big?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)] leading-tight">
        {card.label}
        {card.sub && (
          <div className="text-[var(--ink-4)] normal-case tracking-normal mt-0.5">
            {card.sub}
          </div>
        )}
      </div>
      <div
        className={`font-extrabold tabular-nums mt-2 ${big ? "text-2xl" : "text-xl"}`}
        style={{ color: card.tone ? TONE[card.tone] : "var(--ink)" }}
      >
        {card.value}
      </div>
      {card.note && (
        <div
          className="text-[10.5px] mt-1.5"
          style={{ color: card.tone ? TONE[card.tone] : "var(--ink-3)" }}
        >
          {card.note}
        </div>
      )}
    </div>
  );
}

export default async function DailyReportPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const client = getClient(ref);
  if (!client || !hasModule(client, "daily-report")) notFound();

  // One campaign has reports today. When a second does, this reads the picker.
  const campaign = client.campaigns[0];
  const report = reportsFor(campaign?.id ?? "")[0];

  if (!report) {
    return (
      <div className="card p-10 text-center text-[var(--ink-3)] text-sm mt-2">
        No report for this campaign yet.
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-2">
      {/* Masthead */}
      <div className="card p-5 md:p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-extrabold tracking-[0.12em]">
              {campaign.name.toUpperCase()}
            </h1>
            <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-4)] mt-1">
              Daily marketing report · by {client.name}
            </p>
          </div>
          <div className="text-right">
            {report.badge && (
              <span className="inline-block text-[9.5px] font-bold tracking-[0.1em] px-2.5 py-1 rounded border border-[var(--warning)]/40 bg-[var(--warning)]/10 text-[var(--warning)] mb-2">
                {report.badge}
              </span>
            )}
            <div className="text-[13px] font-semibold">
              Issued {report.issued}
            </div>
            <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--ink-4)] mt-0.5">
              Reporting day: {report.reportingDay}
            </div>
          </div>
        </div>

        <div className="mt-5 font-mono text-[11px] text-[var(--ink-3)]">
          <span className="text-[var(--success)]">&gt;</span> {campaign.id}{" "}
          <span className="text-[var(--accent)]">--daily</span> {report.reportingDay}
        </div>

        <h2 className="text-xl md:text-2xl font-extrabold leading-snug mt-2.5">
          {report.headline}{" "}
          {report.headlineHighlight && (
            <span className="text-[var(--warning)]">{report.headlineHighlight}</span>
          )}
        </h2>
        <p className="text-[12.5px] text-[var(--ink-2)] leading-relaxed mt-3 max-w-4xl">
          {report.standfirst}
        </p>
      </div>

      {/* Key numbers */}
      <div>
        <Label>Key numbers · {report.reportingDay}</Label>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {report.keyNumbers.map((c) => (
            <Stat key={c.label} card={c} big />
          ))}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
          {report.secondary.map((c) => (
            <Stat key={c.label} card={c} />
          ))}
        </div>
      </div>

      {/* Trends */}
      <div>
        <Label>Trends</Label>
        <div className="grid lg:grid-cols-2 gap-3">
          <div className="card p-5">
            <h3 className="text-[12px] font-bold">Daily revenue · 15–21 Aug</h3>
            <p className="text-[10.5px] text-[var(--ink-4)] mb-4">
              Deposits, excluding MBX team transactions
            </p>
            <DailyRevenueChart data={report.dailyRevenue} />
          </div>

          <div className="card p-5">
            <h3 className="text-[12px] font-bold">
              {report.spendVsRevenue.caption}
            </h3>
            <p className="text-[10.5px] text-[var(--ink-4)] mb-4">
              {report.spendVsRevenue.period}
            </p>
            <SpendVsRevenueChart series={report.spendVsRevenue.series} />
            <p className="text-[10.5px] text-[var(--ink-4)] leading-relaxed mt-4">
              {report.spendVsRevenue.note}
            </p>
          </div>
        </div>
      </div>

      {/* Attribution */}
      <div>
        <Label>What the report attributes · {report.attribution.period}</Label>
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[11.5px] tabular-nums">
              <thead>
                <tr className="text-[9.5px] uppercase tracking-[0.1em] text-[var(--ink-4)] border-b border-[var(--line)]">
                  <th className="text-left font-medium px-5 py-2.5">Source</th>
                  <th className="text-right font-medium px-3 py-2.5">Sessions</th>
                  <th className="text-right font-medium px-3 py-2.5">1st touch</th>
                  <th className="text-right font-medium px-3 py-2.5">1st touch $</th>
                  <th className="text-right font-medium px-3 py-2.5">Last touch</th>
                  <th className="text-right font-medium px-3 py-2.5">Last touch $</th>
                  <th className="text-right font-medium px-3 py-2.5">All touch $</th>
                  <th className="text-right font-medium px-5 py-2.5">Spend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {report.attribution.rows.map((r) => (
                  <tr key={r.source} className={r.emphasis ? "font-semibold" : ""}>
                    <td className="px-5 py-2.5 whitespace-nowrap">
                      <span className="flex items-center gap-2">
                        {r.colour && (
                          <span
                            className="w-2 h-2 rounded-sm shrink-0"
                            style={{ background: r.colour }}
                          />
                        )}
                        {r.source}
                      </span>
                    </td>
                    <td className="text-right px-3 py-2.5 text-[var(--ink-2)]">{r.sessions}</td>
                    <td className="text-right px-3 py-2.5 text-[var(--ink-2)]">{r.firstTouch}</td>
                    <td className="text-right px-3 py-2.5 text-[var(--ink-2)]">{r.firstTouchValue}</td>
                    <td className="text-right px-3 py-2.5 text-[var(--ink-2)]">{r.lastTouch}</td>
                    <td className="text-right px-3 py-2.5 text-[var(--ink-2)]">{r.lastTouchValue}</td>
                    <td className="text-right px-3 py-2.5 text-[var(--ink-2)]">{r.allTouchValue}</td>
                    <td
                      className={`text-right px-5 py-2.5 whitespace-nowrap ${
                        r.spend.startsWith("$") ? "text-[var(--danger)]" : "text-[var(--ink-4)]"
                      }`}
                    >
                      {r.spend}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3.5 text-[10.5px] text-[var(--ink-3)] leading-relaxed border-t border-[var(--line)]">
            {report.attribution.footnote}
          </p>
        </div>
      </div>

      {/* Anomalies + market */}
      <div className="grid lg:grid-cols-2 gap-3 items-start">
        <div>
          <Label>Movements &amp; anomalies</Label>
          <div className="card divide-y divide-[var(--line)]">
            {report.anomalies.map((a) => {
              const s = SEV[a.severity];
              return (
                <div key={a.headline} className="px-5 py-3.5 flex gap-3">
                  <span
                    className="text-[12px] font-bold shrink-0 leading-relaxed"
                    style={{ color: s.colour }}
                  >
                    {s.mark}
                  </span>
                  <div>
                    <span className="text-[12px] font-semibold">
                      {a.headline}
                    </span>{" "}
                    <span className="text-[12px] text-[var(--ink-2)] leading-relaxed">
                      — {a.detail}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <Label>Market &amp; external factors</Label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            {report.market.map((m) => (
              <Stat key={m.label} card={m} />
            ))}
          </div>
          <div className="card divide-y divide-[var(--line)]">
            {report.externalNotes.map((n) => (
              <div key={n.tag} className="px-5 py-3.5">
                <span className="inline-block text-[9px] font-bold tracking-[0.1em] px-2 py-0.5 rounded border border-[var(--warning)]/40 bg-[var(--warning)]/10 text-[var(--warning)] mr-2 align-middle">
                  {n.tag}
                </span>
                <span className="text-[12px] text-[var(--ink-2)] leading-relaxed">
                  {n.body}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div>
        <Label>What we&apos;re doing about it</Label>
        <div className="grid md:grid-cols-3 gap-3">
          {report.actions.map((a) => (
            <div key={a.index} className="card p-5 flex flex-col">
              <span className="text-[10px] font-bold text-[var(--accent)] tracking-[0.1em]">
                {a.index}
              </span>
              <h3 className="text-[12.5px] font-semibold mt-1.5 leading-snug">
                {a.headline}
              </h3>
              <p className="text-[11.5px] text-[var(--ink-2)] leading-relaxed mt-1.5 flex-1">
                {a.detail}
              </p>
              <p className="text-[10px] text-[var(--ink-4)] mt-3.5 pt-3 border-t border-[var(--line)]">
                {a.owner} · {a.due}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <Label>Sources</Label>
        <ul className="space-y-1.5">
          {report.sources.map((s) => (
            <li
              key={s}
              className="text-[10.5px] text-[var(--ink-3)] leading-relaxed"
            >
              {s}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
