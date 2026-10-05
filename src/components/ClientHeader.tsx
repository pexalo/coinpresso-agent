"use client";

import Link from "next/link";
import { EntityLogo, ModeBadge, ThemeToggle } from "./Brand";
import type { Client } from "@/lib/clients";

/**
 * The workspace bar. One row: whose workspace this is on the left, the run mode
 * on the right. Module navigation lives in the rail, not here — it was
 * unfindable competing with the logo for this strip.
 *
 * The campaign picker used to sit here too and no longer does. A control in the
 * global header claims to apply globally, and this one never did: Coinpresso's
 * own blog has no end client, and neither do costs, resources or settings. It
 * now lives in the Crypto PR layout, which is the only place campaigns exist.
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
          <ModeBadge />
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
