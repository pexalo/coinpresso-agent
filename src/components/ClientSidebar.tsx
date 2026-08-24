"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Client, ModuleDef } from "@/lib/clients";

/**
 * Module navigation.
 *
 * This started as pills wedged beside the logo and nobody could find them. A
 * rail gives each module a full-width target with its sections nested under it,
 * so what the client bought is the first thing on the page rather than the
 * smallest thing on it — and a third module does not make the row unreadable.
 */

const SECTIONS: Record<string, Array<{ slug: string; label: string }>> = {
  "crypto-pr": [
    { slug: "", label: "Queue" },
    { slug: "new", label: "New article" },
    { slug: "ideas", label: "Ideas" },
    { slug: "archive", label: "Published archive" },
    { slug: "campaigns", label: "Campaigns" },
    { slug: "agents", label: "Agents" },
    { slug: "style", label: "House style" },
  ],
  "own-blog": [
    { slug: "", label: "Blog queue" },
    { slug: "plan", label: "Plan the day" },
    { slug: "pillars", label: "Pillars" },
    { slug: "style", label: "Blog style" },
  ],
};

/** Cross-module pages. They describe the whole workspace, not one product. */
const WORKSPACE = [
  { slug: "workflow", label: "Agent workflow" },
  { slug: "costs", label: "API costs" },
  { slug: "settings", label: "Settings" },
];

export default function ClientSidebar({
  client,
  modules,
}: {
  client: Client;
  modules: ModuleDef[];
}) {
  const pathname = usePathname();
  const base = `/client/${client.ref}`;

  const body = (
    <>
      {modules.map((m) => {
        const href = `${base}/${m.slug}`;
        const active = pathname.startsWith(href);
        const sections = SECTIONS[m.id] ?? [];

        if (!m.built) {
          return (
            <span
              key={m.id}
              title="Not built in this prototype"
              className="block px-3 py-2 rounded-lg text-[13px] font-medium text-[var(--ink-4)] cursor-not-allowed whitespace-nowrap"
            >
              {m.name}
            </span>
          );
        }

        return (
          <div key={m.id} className="lg:mb-1">
            <Link
              href={href}
              className={`block px-3 py-2 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-colors ${
                active
                  ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                  : "text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--surface)]"
              }`}
            >
              {m.name}
            </Link>

            {active && sections.length > 0 && (
              <div className="hidden lg:block mt-0.5 ml-3 pl-3 border-l border-[var(--line)]">
                {sections.map((s) => {
                  const sHref = s.slug ? `${href}/${s.slug}` : href;
                  const sActive = s.slug
                    ? pathname.startsWith(sHref)
                    : pathname === href;
                  return (
                    <Link
                      key={s.label}
                      href={sHref}
                      className={`block px-2.5 py-1.5 rounded-md text-[12.5px] transition-colors ${
                        sActive
                          ? "text-[var(--ink)] font-medium"
                          : "text-[var(--ink-3)] hover:text-[var(--ink)]"
                      }`}
                    >
                      {s.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <div className="lg:mt-4 lg:pt-4 lg:border-t lg:border-[var(--line)] flex lg:block gap-1">
        {WORKSPACE.map((w) => (
          <Link
            key={w.slug}
            href={`${base}/${w.slug}`}
            className={`block px-3 py-2 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors ${
              pathname.startsWith(`${base}/${w.slug}`)
                ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                : "text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--surface)]"
            }`}
          >
            {w.label}
          </Link>
        ))}
      </div>
    </>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside className="hidden lg:block w-[190px] shrink-0 sticky top-[104px] self-start">
        <nav>{body}</nav>
      </aside>

      {/* Mobile: the same targets, scrolled horizontally under the header */}
      <div className="lg:hidden border-b border-[var(--line)] -mx-5 md:-mx-8 px-5 md:px-8 mb-5">
        <nav className="flex items-center gap-1 overflow-x-auto py-2">{body}</nav>
      </div>
    </>
  );
}

/** Section tabs for the active module, shown on mobile where the rail cannot nest. */
export function MobileSectionTabs({ clientRef }: { clientRef: string }) {
  const pathname = usePathname();
  const root = `/client/${clientRef}`;

  const moduleId = Object.keys(SECTIONS).find((m) =>
    pathname.startsWith(`${root}/${m}`)
  );
  if (!moduleId) return null;

  const base = `${root}/${moduleId}`;

  return (
    <nav className="lg:hidden flex items-center gap-1 overflow-x-auto pb-4 -mt-1">
      {SECTIONS[moduleId].map((s) => {
        const href = s.slug ? `${base}/${s.slug}` : base;
        const active = s.slug ? pathname.startsWith(href) : pathname === base;
        return (
          <Link
            key={s.label}
            href={href}
            className={`px-3 py-1.5 rounded-lg text-[12.5px] font-medium whitespace-nowrap transition-colors ${
              active
                ? "bg-[var(--surface)] text-[var(--ink)] border border-[var(--line)]"
                : "text-[var(--ink-3)]"
            }`}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
