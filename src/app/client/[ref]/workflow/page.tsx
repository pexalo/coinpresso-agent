import { notFound } from "next/navigation";
import Link from "next/link";
import { clientModules, getClient } from "@/lib/clients";
import { workflowsFor } from "@/lib/workflow";
import { modelledUnitCost } from "@/lib/costs";
import WorkflowFlow from "@/components/WorkflowFlow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function WorkflowPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const client = getClient(ref);
  if (!client) notFound();

  // Only the modules this client holds, and only the ones actually built — a
  // picker offering a flow for something they have not bought is a support call.
  const built = clientModules(client)
    .filter((m) => m.built)
    .map((m) => m.id);
  const workflows = workflowsFor(built);
  if (!workflows.length) notFound();

  const unitCosts: Record<string, number> = {};
  workflows.forEach((w) => {
    if (w.track) unitCosts[w.id] = modelledUnitCost(w.track);
  });

  return (
    <div className="space-y-5 pt-2">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">
          Agent workflow
        </h1>
        <p className="text-[var(--ink-3)] text-sm mt-1 max-w-3xl">
          One flow per module {client.name} runs. Pick it from the dropdown, then
          click any stage to see what it reads, what it hands on, and the failure
          mode it exists to prevent.
        </p>
      </div>

      <WorkflowFlow workflows={workflows} unitCosts={unitCosts} />

      <div className="card p-5">
        <h2 className="font-bold text-sm mb-3">
          The three fixed points, whichever flow you are looking at
        </h2>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            {
              t: "Nothing is invented",
              d: "The writer may only use sources the strategy agent actually retrieved. Where a fact is missing, the draft says so instead of filling the gap.",
            },
            {
              t: "Verification is code, not a model",
              d: "Citations are compared against the ledger and requested over HTTP; report anomalies are thresholds. A model asked whether it fabricated something sometimes says no.",
            },
            {
              t: "A person approves",
              d: "Nothing reaches a wire, the blog or a client inbox automatically. Every flow ends in a queue, not a send button.",
            },
          ].map((x) => (
            <div key={x.t}>
              <div className="text-[12.5px] font-bold">{x.t}</div>
              <p className="text-[11.5px] text-[var(--ink-3)] leading-relaxed mt-1">
                {x.d}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-bold text-sm mb-2">What the run costs</h2>
        <p className="text-[12px] text-[var(--ink-2)] leading-relaxed max-w-3xl">
          The per-stage figures are modelled from the prompt sizes in this system
          and the published token prices — right to an order of magnitude and no
          better. Research dominates both content flows because it is the stage
          carrying search results into context; that is also why weakening it to
          save money is the worst available saving.
        </p>
        <Link
          href={`/client/${ref}/costs`}
          className="inline-block mt-3.5 text-[12.5px] font-semibold px-4 py-2.5 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
        >
          See actual spend
        </Link>
      </div>
    </div>
  );
}
