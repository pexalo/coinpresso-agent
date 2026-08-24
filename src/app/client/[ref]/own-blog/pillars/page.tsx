import Link from "next/link";
import { notFound } from "next/navigation";
import { getClient, hasModule } from "@/lib/clients";
import { listRuns } from "@/lib/store";
import { CONTENT_TYPE_LIST, PILLARS } from "@/lib/blog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The cluster map.
 *
 * Its real job is to make the thin pillars visible. A blog at five to eight a
 * day will always drift toward whatever the planner found easiest last week, and
 * six months of that produces one deep hub and five stubs — which is the same
 * outcome as not having published at all for those five services.
 */
export default async function PillarsPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const client = getClient(ref);
  if (!client || !hasModule(client, "own-blog")) notFound();

  const runs = (await listRuns(ref)).filter((r) => r.brief.track === "blog");

  const counts = new Map<string, number>();
  const titles = new Map<string, string[]>();
  runs.forEach((r) => {
    const p = r.brief.pillar;
    if (!p) return;
    counts.set(p, (counts.get(p) ?? 0) + 1);
    titles.set(p, [...(titles.get(p) ?? []), r.brief.title]);
  });

  const total = runs.length;
  const most = Math.max(1, ...PILLARS.map((p) => counts.get(p.id) ?? 0));

  return (
    <div className="space-y-5 pt-2">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">
          Pillars and clusters
        </h1>
        <p className="text-[var(--ink-3)] text-sm mt-1 max-w-3xl">
          Every post belongs to one pillar and links to its hub. The cluster is
          the asset — a post with no home is a post that will not rank. The bars
          show where the {total} post{total === 1 ? "" : "s"} written so far
          landed.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {PILLARS.map((p) => {
          const n = counts.get(p.id) ?? 0;
          const thin = n < Math.max(2, most * 0.25);
          return (
            <div key={p.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-bold text-sm">{p.name}</h2>
                  <code className="text-[11px] text-[var(--ink-3)]">{p.hub}</code>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-extrabold tabular-nums">{n}</div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)]">
                    posts
                  </div>
                </div>
              </div>

              <div className="h-1.5 rounded-full bg-[var(--bg)] mt-3 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.round((n / most) * 100)}%`,
                    background: thin ? "var(--warning)" : "var(--accent)",
                  }}
                />
              </div>

              <p className="text-[11.5px] text-[var(--ink-2)] leading-relaxed mt-3.5 italic">
                &ldquo;{p.buyerQuestion}&rdquo;
              </p>

              <div className="mt-3.5 pt-3.5 border-t border-[var(--line)]">
                <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] mb-1.5">
                  Seed clusters
                </div>
                <ul className="space-y-1">
                  {p.clusters.map((c) => (
                    <li
                      key={c}
                      className="text-[11.5px] text-[var(--ink-2)] leading-relaxed pl-3.5 relative"
                    >
                      <span className="absolute left-0 text-[var(--ink-4)]">—</span>
                      {c}
                    </li>
                  ))}
                </ul>
                <p className="text-[10.5px] text-[var(--ink-4)] mt-2">
                  The planner extends these; it is not limited to them.
                </p>
              </div>

              {n > 0 && (
                <div className="mt-3.5 pt-3.5 border-t border-[var(--line)]">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] mb-1.5">
                    Written so far
                  </div>
                  <ul className="space-y-1">
                    {(titles.get(p.id) ?? []).slice(0, 5).map((t) => (
                      <li
                        key={t}
                        className="text-[11.5px] text-[var(--ink-3)] truncate"
                      >
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--line)]">
          <h2 className="font-bold text-sm">Formats</h2>
          <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
            Variety is a quality control, not a preference. Publishing eight
            pieces a day in one shape is the most recognisable signature of
            machine-produced content there is.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] border-b border-[var(--line)]">
                <th className="text-left font-medium px-5 py-2.5">Format</th>
                <th className="text-left font-medium px-3 py-2.5">Words</th>
                <th className="text-left font-medium px-3 py-2.5">Shape</th>
                <th className="text-left font-medium px-3 py-2.5">
                  What it is for
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {CONTENT_TYPE_LIST.map((t) => (
                <tr key={t.id}>
                  <td className="px-5 py-2.5 font-medium whitespace-nowrap align-top">
                    {t.name}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--ink-2)] whitespace-nowrap align-top">
                    {t.words[0]}–{t.words[1]}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--ink-2)] align-top max-w-[320px]">
                    {t.shape}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--ink-3)] align-top max-w-[260px]">
                    {t.job}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex gap-3">
        <Link
          href={`/client/${ref}/own-blog/plan`}
          className="text-[12.5px] font-semibold px-4 py-2.5 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
        >
          Plan a day
        </Link>
        <Link
          href={`/client/${ref}/own-blog/style`}
          className="text-[12.5px] font-semibold px-4 py-2.5 rounded-lg border border-[var(--line)] hover:border-[var(--accent)]/50 transition-colors"
        >
          Blog house style
        </Link>
      </div>
    </div>
  );
}
