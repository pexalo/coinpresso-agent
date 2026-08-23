"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Client, ModuleDef } from "@/lib/clients";

/**
 * The client workspace header. Its tabs are built from the client's enabled
 * modules, which is why Coinpresso and Geo One share a shell but not a
 * navigation — the nav is a property of the client record, not a constant.
 */
export default function ClientHeader({
  client,
  modules,
}: {
  client: Client;
  modules: ModuleDef[];
}) {
  const pathname = usePathname();
  const base = `/client/${client.ref}`;

  const cryptoTabs = [
    { href: `${base}/crypto-pr`, label: "Queue", exact: true },
    { href: `${base}/crypto-pr/new`, label: "New article" },
    { href: `${base}/crypto-pr/agents`, label: "Agents" },
    { href: `${base}/crypto-pr/style`, label: "House style" },
  ];

  const inCryptoPr = pathname.startsWith(`${base}/crypto-pr`);

  return (
    <div className="border-b border-[#2A3A52] bg-[#0D1B2A]">
      <div className="max-w-[1240px] mx-auto px-5 md:px-8">
        {/* Client identity + module switcher */}
        <div className="flex items-center gap-4 py-3 flex-wrap">
          <Link href={base} className="flex items-center gap-2.5 shrink-0">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: client.accent }}
            />
            <span className="text-[14px] font-bold">{client.name}</span>
          </Link>

          <div className="flex items-center gap-1 overflow-x-auto">
            {modules.map((m) => {
              const href = `${base}/${m.slug}`;
              const active = pathname.startsWith(href);
              return m.built ? (
                <Link
                  key={m.id}
                  href={href}
                  className={`px-2.5 py-1 rounded-md text-[12px] font-medium whitespace-nowrap transition-colors ${
                    active
                      ? "bg-[#4E78FF]/15 text-[#4E78FF]"
                      : "text-[#B8C2D6] hover:text-white hover:bg-[#152538]"
                  }`}
                >
                  {m.name}
                </Link>
              ) : (
                <span
                  key={m.id}
                  title="Not built in this prototype"
                  className="px-2.5 py-1 rounded-md text-[12px] font-medium whitespace-nowrap text-[#5A6884] cursor-not-allowed"
                >
                  {m.name}
                </span>
              );
            })}
          </div>

          {client.campaigns && client.campaigns.length > 0 && (
            <div className="ml-auto text-[11px] text-[#7F8CA8]">
              Campaign:{" "}
              <span className="text-[#B8C2D6]">{client.campaigns[0].name}</span>
            </div>
          )}
        </div>

        {/* Section tabs for the active module */}
        {inCryptoPr && (
          <nav className="flex items-center gap-1 pb-2 overflow-x-auto">
            {cryptoTabs.map((t) => {
              const active = t.exact
                ? pathname === t.href
                : pathname.startsWith(t.href);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`px-3 py-1.5 rounded-lg text-[12.5px] font-medium whitespace-nowrap transition-colors ${
                    active
                      ? "bg-[#152538] text-white border border-[#2A3A52]"
                      : "text-[#7F8CA8] hover:text-white"
                  }`}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
}
