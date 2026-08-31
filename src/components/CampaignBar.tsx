"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCampaign } from "./CampaignContext";
import { factsAgeDays } from "@/lib/clients";

/**
 * Which end client the PR work is for.
 *
 * This used to be a pill in the workspace header, which put it above every
 * screen including the ones it means nothing on. Coinpresso's own blog has no
 * end client — it is their domain — so a global picker there was answering a
 * question nobody had asked, and the honest place for it is the one module that
 * genuinely has campaigns.
 *
 * Moving it down bought room, and the room is spent on the FACT SHEET. Those
 * three figures are stamped onto every brief submitted while this campaign is
 * selected, and a stale one puts last week's raised total on a newswire. In the
 * header they did not fit; here they sit next to the work they govern, and going
 * stale is visible rather than something you had to open a dropdown to find.
 */

/** How many days before a fact sheet is treated as stale. */
const STALE_AFTER_DAYS = 3;

export default function CampaignBar({ clientRef }: { clientRef: string }) {
  const { campaigns, selected, selectedId, setSelectedId } = useCampaign();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!campaigns.length) return null;

  const age = selected ? factsAgeDays(selected.facts) : 0;
  const stale = selected ? age > STALE_AFTER_DAYS : false;

  return (
    <div className="card px-4 py-3 flex items-center gap-x-5 gap-y-2 flex-wrap mb-5">
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-[var(--line)] bg-[var(--bg)] hover:border-[var(--accent)]/50 transition-colors"
        >
          <span className="text-[10px] uppercase tracking-wider text-[var(--ink-3)]">
            Working on
          </span>
          {selected ? (
            <>
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: selected.accent }}
              />
              <span className="text-[13px] font-semibold">{selected.name}</span>
              <span className="text-[11.5px] text-[var(--ink-3)]">
                {selected.ticker}
              </span>
            </>
          ) : (
            <span className="text-[13px] font-semibold">All campaigns</span>
          )}
          <span className="text-[var(--ink-3)] text-[10px]">▾</span>
        </button>

        {open && (
          <div
            role="listbox"
            className="absolute left-0 top-full mt-1.5 w-72 rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl z-50 overflow-hidden"
          >
            {campaigns.map((c) => {
              const a = factsAgeDays(c.facts);
              const isStale = a > STALE_AFTER_DAYS;
              return (
                <button
                  key={c.id}
                  role="option"
                  aria-selected={selectedId === c.id}
                  onClick={() => {
                    setSelectedId(c.id);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3.5 py-3 hover:bg-[var(--surface-2)] transition-colors border-b border-[var(--line)] ${
                    selectedId === c.id ? "bg-[var(--surface-2)]" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: c.accent }}
                    />
                    <span className="text-[12.5px] font-semibold">{c.name}</span>
                    <span className="text-[11px] text-[var(--ink-3)]">
                      {c.ticker}
                    </span>
                    {c.status === "paused" && (
                      <span className="text-[10px] text-[var(--ink-4)] ml-auto">
                        paused
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[var(--ink-3)] mt-1">
                    {c.facts.raised} · {c.facts.stage} · {c.facts.tokenPrice}
                  </div>
                  <div
                    className={`text-[10px] mt-0.5 ${isStale ? "text-[var(--warning)]" : "text-[var(--ink-4)]"}`}
                  >
                    Figures set {c.facts.updatedAt} by {c.facts.updatedBy}
                    {isStale ? ` — ${a} days old` : ""}
                  </div>
                </button>
              );
            })}

            <button
              role="option"
              aria-selected={selectedId === null}
              onClick={() => {
                setSelectedId(null);
                setOpen(false);
              }}
              className={`w-full text-left px-3.5 py-2.5 hover:bg-[var(--surface-2)] transition-colors border-b border-[var(--line)] ${
                selectedId === null ? "bg-[var(--surface-2)]" : ""
              }`}
            >
              <span className="text-[12.5px] font-medium">All campaigns</span>
              <span className="text-[11px] text-[var(--ink-3)] ml-2">
                queue across every campaign
              </span>
            </button>

            <Link
              href={`/client/${clientRef}/crypto-pr/campaigns`}
              onClick={() => setOpen(false)}
              className="block px-3.5 py-2.5 text-[12px] font-semibold text-[var(--accent)] hover:bg-[var(--surface-2)] transition-colors"
            >
              Manage campaigns →
            </Link>
          </div>
        )}
      </div>

      {selected ? (
        <>
          <div className="flex items-center gap-5 text-[12px]">
            <Fact label="Raised" value={selected.facts.raised} />
            <Fact label="Stage" value={selected.facts.stage} />
            <Fact label="Token price" value={selected.facts.tokenPrice} />
          </div>

          {/* Provenance always takes its own row. Trying to keep it on the
              first one meant it wrapped anyway as soon as a stage was described
              in more than two words — and a stage is free text someone types,
              so the long case is the normal case, not the edge. A row it always
              owns is also the row the staleness warning needs. */}
          <Link
            href={`/client/${clientRef}/crypto-pr/campaigns`}
            className={`w-full text-[11px] transition-colors ${
              stale
                ? "text-[var(--warning)] font-semibold"
                : "text-[var(--ink-4)] hover:text-[var(--accent)]"
            }`}
          >
            {stale
              ? `${age} days old — check before briefing`
              : `Set ${selected.facts.updatedAt} · ${selected.facts.updatedBy}`}
          </Link>
        </>
      ) : (
        <span className="text-[11.5px] text-[var(--ink-3)]">
          Showing every campaign. Pick one before briefing an article — the
          figures stamped on a brief come from the campaign.
        </span>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-[9.5px] uppercase tracking-wider text-[var(--ink-4)]">
        {label}
      </span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}
