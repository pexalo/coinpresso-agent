"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { EntityLogo } from "@/components/Brand";
import type { Campaign } from "@/lib/clients";

function ageDays(iso: string): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Infinity;
  return Math.floor((Date.now() - t) / 86_400_000);
}

function FactSheet({
  campaign,
  clientRef,
  onSaved,
}: {
  campaign: Campaign;
  clientRef: string;
  onSaved: (c: Campaign) => void;
}) {
  const [raised, setRaised] = useState(campaign.facts.raised);
  const [stage, setStage] = useState(campaign.facts.stage);
  const [tokenPrice, setTokenPrice] = useState(campaign.facts.tokenPrice);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty =
    raised !== campaign.facts.raised ||
    stage !== campaign.facts.stage ||
    tokenPrice !== campaign.facts.tokenPrice;

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/clients/${clientRef}/campaigns`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          campaignId: campaign.id,
          raised,
          stage,
          tokenPrice,
          updatedBy: "Liam",
        }),
      });
      const data = (await res.json()) as Campaign;
      onSaved(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  const field =
    "w-full bg-[var(--bg)] border border-[var(--line)] rounded-lg px-3 py-2 text-sm focus:border-[var(--accent)] outline-none transition-colors";
  const label =
    "block text-[10px] uppercase tracking-wider text-[var(--ink-3)] mb-1.5";
  const stale = ageDays(campaign.facts.updatedAt) > 3;

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--line)] flex items-center gap-3 flex-wrap">
        <EntityLogo name={campaign.name} accent={campaign.accent} size={24} />
        <div>
          <h2 className="font-bold text-sm">
            {campaign.name}{" "}
            <span className="text-[var(--ink-3)] font-medium">{campaign.ticker}</span>
          </h2>
          <a
            href={campaign.site}
            target="_blank"
            rel="noreferrer noopener"
            className="text-[11px] text-[var(--accent)] hover:underline"
          >
            {campaign.site.replace(/^https?:\/\//, "")}
          </a>
        </div>
        <span
          className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
            campaign.status === "active"
              ? "text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10"
              : "text-[var(--ink-3)] border-[var(--line)] bg-[var(--surface)]"
          }`}
        >
          {campaign.status}
        </span>
      </div>

      <div className="px-5 py-4 border-b border-[var(--line)]">
        <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
          <h3 className="text-[12px] font-semibold">Fact sheet</h3>
          <span
            className={`text-[10.5px] ${stale ? "text-[var(--warning)]" : "text-[var(--ink-4)]"}`}
          >
            Set {campaign.facts.updatedAt} by {campaign.facts.updatedBy}
            {stale
              ? ` — ${ageDays(campaign.facts.updatedAt)} days old`
              : ""}
          </span>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className={label} htmlFor={`${campaign.id}-raised`}>
              Raised to date
            </label>
            <input
              id={`${campaign.id}-raised`}
              value={raised}
              onChange={(e) => setRaised(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className={label} htmlFor={`${campaign.id}-stage`}>
              Current stage
            </label>
            <input
              id={`${campaign.id}-stage`}
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className={label} htmlFor={`${campaign.id}-price`}>
              Token price
            </label>
            <input
              id={`${campaign.id}-price`}
              value={tokenPrice}
              onChange={(e) => setTokenPrice(e.target.value)}
              className={field}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 mt-3.5">
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="text-[12px] font-semibold px-3.5 py-2 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Saving…" : "Save figures"}
          </button>
          {saved && (
            <span className="text-[11.5px] text-[var(--success)]">
              Saved. Every new brief uses these.
            </span>
          )}
        </div>

        <p className="text-[11px] text-[var(--ink-3)] leading-relaxed mt-3.5 max-w-2xl">
          These are the only figures the agents may state. The published archive
          carries four different raised totals inside one week — no agent can
          work out which is current, so one person sets it here and everything
          downstream reads it. Leave a field blank and the writer is barred from
          quoting a number at all.
        </p>
      </div>

      <div className="px-5 py-4">
        <h3 className="text-[12px] font-semibold mb-2.5">
          Claims the agents must never make
        </h3>
        <ul className="space-y-1.5">
          {campaign.bannedClaims.map((c) => (
            <li
              key={c}
              className="text-[11.5px] text-[var(--ink-2)] leading-relaxed pl-4 relative"
            >
              <span className="absolute left-0 text-[var(--danger)]">×</span>
              {c}
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-[var(--ink-4)] leading-relaxed mt-3">
          Campaign-level rules sit above the house style and above any brief. The
          reviewer treats a breach as a blocker.
        </p>
      </div>
    </div>
  );
}

export default function CampaignsPage() {
  const { ref } = useParams<{ ref: string }>();
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/clients/${ref}/campaigns`);
    setCampaigns(res.ok ? await res.json() : []);
  }, [ref]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5 pt-2">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Campaigns</h1>
        <p className="text-[var(--ink-3)] text-sm mt-1 max-w-2xl">
          The clients you run PR for. Each carries its own fact sheet and its own
          hard limits, so onboarding a second token project does not mean a
          second account.
        </p>
      </div>

      {campaigns === null && (
        <div className="card p-8 text-center text-[var(--ink-3)] text-sm">
          Loading…
        </div>
      )}

      {campaigns?.map((c) => (
        <FactSheet
          key={c.id}
          campaign={c}
          clientRef={ref}
          onSaved={(updated) =>
            setCampaigns((prev) =>
              (prev ?? []).map((x) => (x.id === updated.id ? updated : x))
            )
          }
        />
      ))}

      {campaigns?.length === 0 && (
        <div className="card p-10 text-center text-[var(--ink-3)] text-sm">
          No campaigns yet.
        </div>
      )}

      <div className="card p-5">
        <h2 className="font-bold text-sm mb-2">Adding a campaign</h2>
        <p className="text-[12px] text-[var(--ink-2)] leading-relaxed max-w-3xl">
          A new token project is added to{" "}
          <code className="text-[var(--accent)]">src/lib/clients.ts</code> in this
          prototype, and becomes a row in the <code>campaigns</code> table once
          this is folded into HQ. It needs a name, ticker, site, accent, an
          opening fact sheet and its banned claims — and its own style profile if
          its voice differs from Moonberg&apos;s.
        </p>
      </div>
    </div>
  );
}
