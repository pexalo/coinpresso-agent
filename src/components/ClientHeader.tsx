"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { EntityLogo, ModeBadge, ThemeToggle } from "./Brand";
import { useCampaign } from "./CampaignContext";
import { factsAgeDays, type Client } from "@/lib/clients";

/** How many days before a campaign's fact sheet is treated as stale. */
const STALE_AFTER_DAYS = 3;

function CampaignPicker({ clientRef }: { clientRef: string }) {
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

  const stale = selected ? factsAgeDays(selected.facts) > STALE_AFTER_DAYS : false;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] hover:border-[var(--accent)]/50 transition-colors"
      >
        <span className="text-[10px] uppercase tracking-wider text-[var(--ink-3)]">
          Client
        </span>
        {selected ? (
          <>
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: selected.accent }}
            />
            <span className="text-[12.5px] font-semibold">{selected.name}</span>
            <span className="text-[11px] text-[var(--ink-3)]">{selected.ticker}</span>
          </>
        ) : (
          <span className="text-[12.5px] font-semibold">All campaigns</span>
        )}
        {stale && (
          <span
            title={`Fact sheet last updated ${selected!.facts.updatedAt}`}
            className="w-1.5 h-1.5 rounded-full bg-[var(--warning)]"
          />
        )}
        <span className="text-[var(--ink-3)] text-[10px]">▾</span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full mt-1.5 w-72 rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl z-50 overflow-hidden"
        >
          {campaigns.map((c) => {
            const age = factsAgeDays(c.facts);
            const isStale = age > STALE_AFTER_DAYS;
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
                  <span className="text-[11px] text-[var(--ink-3)]">{c.ticker}</span>
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
                  {isStale ? ` — ${age} days old` : ""}
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
              queue across every client
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
  );
}

/**
 * The client bar. One row: whose workspace this is on the left, what they are
 * working on and the run mode on the right. Module navigation lives in the rail,
 * not here — it was unfindable competing with the logo for this strip.
 */
export default function ClientHeader({ client }: { client: Client }) {
  return (
    <div className="border-b border-[var(--line)] bg-[var(--bg)] sticky top-0 z-40 backdrop-blur">
      <div className="max-w-[1240px] mx-auto px-5 md:px-8 h-[88px] flex items-center gap-4">
        <Link
          href={`/client/${client.ref}`}
          className="flex items-center gap-2.5 shrink-0"
        >
          <EntityLogo
            name={client.name}
            logo={client.logo}
            accent={client.accent}
            size={48}
          />
          {!(client.logo && client.logoIncludesName) && (
            <span className="text-[15px] font-bold">{client.name}</span>
          )}
        </Link>

        <Link
          href="/"
          className="hidden sm:block text-[11px] text-[var(--ink-4)] hover:text-[var(--accent)] transition-colors"
        >
          All clients
        </Link>

        <div className="ml-auto flex items-center gap-3">
          <CampaignPicker clientRef={client.ref} />
          <ModeBadge />
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
