import Link from "next/link";
import { notFound } from "next/navigation";
import { getClient } from "@/lib/clients";
import { MODELS } from "@/lib/models";
import { PRICED_ON } from "@/lib/model-registry";

export const dynamic = "force-dynamic";

const CARDS = [
  {
    slug: "models",
    title: "LLM and model register",
    blurb:
      "Which model runs which stage, why that tier, what it costs, and what to do when one is retired. Prices carry the date they were verified.",
  },
  {
    slug: "guide",
    title: "Operating guide",
    blurb:
      "What this system is, what it will not do, and how to get from a blank queue to a draft worth sending. Written for whoever is using it on a Tuesday.",
  },
  {
    slug: "steps",
    title: "Workflow steps",
    blurb:
      "The numbered procedure for each track — a wire release, a day of blog posts, the daily report — with what to check at every gate.",
  },
];

export default async function ResourcesPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const client = getClient(ref);
  if (!client) notFound();

  return (
    <div className="space-y-5 pt-2">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Resources</h1>
        <p className="text-[var(--ink-3)] text-sm mt-1 max-w-3xl">
          The reference material behind the dashboard. Everything here is
          generated from the same configuration the agents actually run on, so it
          cannot quietly drift out of date the way a document would.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {CARDS.map((c) => (
          <Link
            key={c.slug}
            href={`/client/${ref}/resources/${c.slug}`}
            className="card p-5 hover:border-[var(--accent)]/50 transition-colors block"
          >
            <h2 className="font-bold text-sm">{c.title}</h2>
            <p className="text-[11.5px] text-[var(--ink-3)] leading-relaxed mt-1.5">
              {c.blurb}
            </p>
            <span className="inline-block text-[12px] font-semibold text-[var(--accent)] mt-3">
              Open →
            </span>
          </Link>
        ))}
      </div>

      <div className="card p-5">
        <h2 className="font-bold text-sm mb-3">Running right now</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { label: "Strategy and writer", value: MODELS.strategy },
            { label: "Reviewer", value: MODELS.reviewer },
            { label: "Prices verified", value: PRICED_ON },
          ].map((k) => (
            <div key={k.label}>
              <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)]">
                {k.label}
              </div>
              <div className="text-[13px] font-bold mt-1 font-mono">
                {k.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-bold text-sm mb-2">Elsewhere in the dashboard</h2>
        <div className="flex flex-wrap gap-2">
          {[
            ["Agent workflow", "workflow", "The pipelines drawn as flows"],
            ["API costs", "costs", "Spend to date and the cadence forecast"],
            ["House style", "crypto-pr/style", "The wire voice, as the agents receive it"],
            ["Blog style", "own-blog/style", "The blog voice and the framework"],
            ["Pillars", "own-blog/pillars", "Clusters and formats"],
            ["Integration", "own-blog/integration", "WordPress, both directions"],
          ].map(([label, slug, note]) => (
            <Link
              key={slug}
              href={`/client/${ref}/${slug}`}
              title={note}
              className="text-[12px] px-3 py-1.5 rounded-lg bg-[var(--bg)] border border-[var(--line)] text-[var(--ink-2)] hover:border-[var(--accent)]/50 hover:text-[var(--ink)] transition-colors"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
