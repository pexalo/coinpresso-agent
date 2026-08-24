"use client";

import { useState } from "react";
import type { FlowNode, NodeKind, Workflow } from "@/lib/workflow";
import { usd } from "@/lib/costs";

/**
 * The flow view.
 *
 * One module at a time, picked from a dropdown, drawn left to right as an actual
 * flow rather than a stack of cards. Detail lives in a panel under the lane and
 * opens on click, so the shape of the pipeline is readable in one glance and the
 * reasoning is one click away instead of scrolling past it.
 */

const KIND: Record<NodeKind, { label: string; chip: string; dot: string }> = {
  input: {
    label: "Input",
    chip: "border-[var(--line)] bg-[var(--bg)] text-[var(--ink-3)]",
    dot: "var(--ink-4)",
  },
  agent: {
    label: "Agent",
    chip: "border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)]",
    dot: "var(--accent)",
  },
  check: {
    label: "Code",
    chip: "border-[var(--warning)]/30 bg-[var(--warning)]/10 text-[var(--warning)]",
    dot: "var(--warning)",
  },
  gate: {
    label: "Gate",
    chip: "border-[var(--line)] bg-[var(--bg)] text-[var(--ink-3)]",
    dot: "var(--ink-4)",
  },
  human: {
    label: "Human",
    chip: "border-[var(--success)]/30 bg-[var(--success)]/10 text-[var(--success)]",
    dot: "var(--success)",
  },
  output: {
    label: "Output",
    chip: "border-[var(--line)] bg-[var(--bg)] text-[var(--ink-3)]",
    dot: "var(--ink-4)",
  },
};

function Arrow({ loop, label }: { loop?: boolean; label?: string }) {
  return (
    <div className="shrink-0 w-10 flex flex-col items-center justify-center self-center">
      <div className="flex items-center w-full">
        <span
          className="h-px flex-1"
          style={{ background: loop ? "var(--warning)" : "var(--line)" }}
        />
        <span
          className="text-[10px] -ml-[2px]"
          style={{ color: loop ? "var(--warning)" : "var(--ink-4)" }}
        >
          {loop ? "⇄" : "▶"}
        </span>
      </div>
      {label && (
        <span className="text-[9px] text-[var(--warning)] mt-1 whitespace-nowrap">
          {label}
        </span>
      )}
    </div>
  );
}

function NodeCard({
  node,
  active,
  tone,
  onClick,
}: {
  node: FlowNode;
  active: boolean;
  tone: string;
  onClick: () => void;
}) {
  const k = KIND[node.kind];
  const planned = node.status === "planned";

  return (
    <button
      onClick={onClick}
      className={`shrink-0 w-[170px] text-left rounded-xl border p-3 transition-colors ${
        active
          ? "bg-[var(--surface-2)]"
          : "bg-[var(--surface)] hover:bg-[var(--surface-2)]"
      } ${planned ? "border-dashed" : ""}`}
      style={{
        borderColor: active ? tone : "var(--line)",
        opacity: planned && !active ? 0.65 : 1,
      }}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: k.dot }}
        />
        <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--ink-4)]">
          {k.label}
        </span>
      </div>
      <div className="text-[12.5px] font-bold leading-tight mt-1.5">
        {node.title}
      </div>
      <div className="text-[10.5px] text-[var(--ink-3)] leading-snug mt-1 line-clamp-2">
        {node.role}
      </div>
      {planned && (
        <div className="text-[9px] font-semibold text-[var(--warning)] mt-1.5">
          not built yet
        </div>
      )}
      {node.model && !planned && (
        <div className="text-[9.5px] text-[var(--ink-4)] mt-1.5 truncate">
          {node.model}
        </div>
      )}
    </button>
  );
}

function Detail({
  node,
  unitCost,
  tone,
}: {
  node: FlowNode;
  unitCost: number | null;
  tone: string;
}) {
  const share = node.costShare ?? 0;

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${KIND[node.kind].chip}`}
            >
              {KIND[node.kind].label}
            </span>
            <h3 className="font-extrabold text-[15px]">{node.title}</h3>
            {node.status === "planned" && (
              <span className="text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-[var(--warning)]/30 bg-[var(--warning)]/10 text-[var(--warning)]">
                Not built
              </span>
            )}
          </div>
          <p className="text-[12.5px] text-[var(--ink-2)] mt-1.5">{node.role}</p>
        </div>
        {unitCost !== null && share > 0 && (
          <div className="text-right shrink-0">
            <div className="text-[15px] font-extrabold tabular-nums">
              {usd(unitCost * share)}
            </div>
            <div className="text-[10px] text-[var(--ink-4)]">
              {Math.round(share * 100)}% of a run
            </div>
          </div>
        )}
      </div>

      {(node.model || node.tools?.length) && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {node.model && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg)] border border-[var(--line)] text-[var(--ink-3)]">
              {node.model}
            </span>
          )}
          {node.tools?.map((t) => (
            <span
              key={t}
              className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg)] border border-[var(--line)] text-[var(--ink-3)]"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-5 mt-4 pt-4 border-t border-[var(--line)]">
        <div>
          <div className="text-[9.5px] uppercase tracking-wider text-[var(--ink-4)] mb-1.5">
            Reads
          </div>
          <ul className="space-y-1">
            {node.reads.map((r) => (
              <li
                key={r}
                className="text-[11.5px] text-[var(--ink-3)] leading-snug pl-3 relative"
              >
                <span className="absolute left-0 text-[var(--ink-4)]">·</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-[9.5px] uppercase tracking-wider text-[var(--ink-4)] mb-1.5">
            Emits
          </div>
          <ul className="space-y-1">
            {node.emits.map((r) => (
              <li
                key={r}
                className="text-[11.5px] text-[var(--ink-2)] leading-snug pl-3 relative"
              >
                <span className="absolute left-0" style={{ color: tone }}>
                  ·
                </span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {node.why && (
        <p className="text-[12px] text-[var(--ink-2)] leading-relaxed mt-4 pt-4 border-t border-[var(--line)]">
          <span className="text-[var(--ink-4)] font-medium">Why: </span>
          {node.why}
        </p>
      )}
    </div>
  );
}

export default function WorkflowFlow({
  workflows,
  unitCosts,
}: {
  workflows: Workflow[];
  /** Modelled cost per piece, by workflow id. Absent where none applies. */
  unitCosts: Record<string, number>;
}) {
  const [id, setId] = useState(workflows[0]?.id ?? "");
  const wf = workflows.find((w) => w.id === id) ?? workflows[0];
  const [openId, setOpenId] = useState<string | null>(null);

  if (!wf) return null;

  const unitCost = unitCosts[wf.id] ?? null;
  const open = wf.nodes.find((n) => n.id === openId) ?? null;
  const plannedCount = wf.nodes.filter((n) => n.status === "planned").length;

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-start gap-4 flex-wrap">
          <div>
            <label
              htmlFor="flow"
              className="block text-[10px] uppercase tracking-wider text-[var(--ink-3)] mb-1.5"
            >
              Flow
            </label>
            <select
              id="flow"
              value={wf.id}
              onChange={(e) => {
                setId(e.target.value as typeof wf.id);
                setOpenId(null);
              }}
              className="bg-[var(--bg)] border border-[var(--line)] rounded-lg px-3 py-2 text-[13px] font-semibold focus:border-[var(--accent)] outline-none transition-colors min-w-[200px]"
            >
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-0 flex-1 pt-1">
            <p className="text-[12.5px] text-[var(--ink-2)] leading-relaxed">
              {wf.subtitle}
            </p>
            <div className="flex items-center gap-x-5 gap-y-1 flex-wrap mt-2 text-[11px] text-[var(--ink-3)]">
              <span>
                <span className="text-[var(--ink-4)]">Lands on </span>
                {wf.destination}
              </span>
              {unitCost !== null && (
                <span>
                  <span className="text-[var(--ink-4)]">Modelled </span>
                  {usd(unitCost)} per piece
                </span>
              )}
              <span>
                <span className="text-[var(--ink-4)]">Stages </span>
                {wf.nodes.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {plannedCount > 0 && (
        <div className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/10 px-4 py-3 text-[12px] text-[var(--warning)]">
          {plannedCount} of {wf.nodes.length} stages in this flow are not built
          yet — drawn dashed below. What runs today is the delivery end; the data
          behind it is still the report transcribed from the PDF Coinpresso
          already produces.
        </div>
      )}

      <div className="card p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)]">
            {wf.name} pipeline
          </div>
          <div className="text-[10.5px] text-[var(--ink-4)]">
            Click a stage for detail
          </div>
        </div>

        {/* Wraps rather than scrolls. A lane that runs off the right edge hides
            the end of the pipeline, and the stages nobody sees are the ones
            people assume do not exist. */}
        <div className="-mx-1 px-1 pb-1">
          <div className="flex flex-wrap items-stretch gap-y-3">
            {wf.nodes.map((n, i) => (
              <div key={n.id} className="flex items-stretch">
                <NodeCard
                  node={n}
                  tone={wf.tone}
                  active={openId === n.id}
                  onClick={() => setOpenId(openId === n.id ? null : n.id)}
                />
                {i < wf.nodes.length - 1 && (
                  <Arrow
                    loop={
                      n.id === wf.loop.from &&
                      wf.nodes[i + 1].id === wf.loop.to
                    }
                    label={
                      n.id === wf.loop.from && wf.nodes[i + 1].id === wf.loop.to
                        ? "loop"
                        : undefined
                    }
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-[var(--line)] flex items-start gap-2.5">
          <span className="text-[var(--warning)] text-[13px] leading-none mt-0.5">
            ↺
          </span>
          <p className="text-[11.5px] text-[var(--ink-2)] leading-relaxed">
            <span className="font-semibold">
              {wf.nodes.find((n) => n.id === wf.loop.from)?.title} ⇄{" "}
              {wf.nodes.find((n) => n.id === wf.loop.to)?.title}
            </span>{" "}
            on {wf.loop.label}. {wf.loop.bound}.
          </p>
        </div>
      </div>

      {open ? (
        <Detail node={open} unitCost={unitCost} tone={wf.tone} />
      ) : (
        <div className="card p-5">
          <h3 className="font-bold text-sm mb-2">What every stage emits</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[11.5px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] border-b border-[var(--line)]">
                  <th className="text-left font-medium py-2.5 pr-4">Stage</th>
                  <th className="text-left font-medium py-2.5 pr-4">Runs on</th>
                  <th className="text-left font-medium py-2.5">Hands on</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {wf.nodes.map((n) => (
                  <tr
                    key={n.id}
                    className={n.status === "planned" ? "opacity-60" : ""}
                  >
                    <td className="py-2.5 pr-4 font-medium whitespace-nowrap align-top">
                      {n.title}
                      {n.status === "planned" && (
                        <span className="text-[var(--warning)] font-normal">
                          {" "}
                          · planned
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-[var(--ink-3)] align-top whitespace-nowrap">
                      {n.model ?? KIND[n.kind].label}
                    </td>
                    <td className="py-2.5 text-[var(--ink-2)] align-top">
                      {n.emits.join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
