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

/**
 * Ordered as the funnel actually runs, not alphabetically and not by how the
 * pages happened to get built.
 *
 * The old order opened with the Queue and buried Ideas third, which reads as
 * "here is a list of things" rather than "here is the sequence". Anyone new had
 * to be told where to start. Numbering the steps and splitting the reference
 * pages below a divider makes the path obvious without a tour.
 *
 * The last step feeding the first is the useful part: what went out is what the
 * ideation scan reads to avoid repeating itself.
 */
interface Section {
  slug: string;
  label: string;
  /** Position in the funnel. Absent means it is reference, not a step. */
  step?: number;
  /** One line on what happens here, for the title attribute. */
  note?: string;
}

const SECTIONS: Record<string, Section[]> = {
  "crypto-pr": [
    { slug: "ideas", label: "Ideas", step: 1, note: "Scan the market for topics and titles" },
    { slug: "new", label: "New article", step: 2, note: "Or brief one by hand" },
    { slug: "", label: "Queue", step: 3, note: "Runs in flight, then review and approve" },
    { slug: "archive", label: "Published archive", step: 4, note: "What went out — feeds back into Ideas" },
    { slug: "campaigns", label: "Campaigns", note: "The fact sheet every brief is stamped with" },
    { slug: "agents", label: "Agents", note: "What each stage does" },
    { slug: "style", label: "House style", note: "The wire voice, as the agents receive it" },
  ],
  "own-blog": [
    { slug: "topics", label: "Topics & keywords", step: 1, note: "What Coinpresso want covered, in their words" },
    { slug: "plan", label: "Plan the day", step: 2, note: "5–8 posts across pillars and formats" },
    { slug: "", label: "Blog queue", step: 3, note: "Read the day together, then approve" },
    { slug: "integration", label: "Integration", step: 4, note: "Import the style reference; push drafts to WordPress" },
    { slug: "pillars", label: "Pillars", note: "Clusters and formats" },
    { slug: "style", label: "Blog style", note: "The blog voice and the framework" },
  ],
};

/** Cross-module pages. They describe the whole workspace, not one product. */
const WORKSPACE = [
  { slug: "workflow", label: "Agent workflow" },
  { slug: "costs", label: "API costs" },
  { slug: "resources", label: "Resources" },
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
                {sections.map((s, i) => {
                  const sHref = s.slug ? `${href}/${s.slug}` : href;
                  const sActive = s.slug
                    ? pathname.startsWith(sHref)
                    : pathname === href;
                  const firstReference =
                    !s.step && Boolean(sections[i - 1]?.step);
                  return (
                    <div key={s.label}>
                      {firstReference && (
                        <div className="text-[9.5px] uppercase tracking-wider text-[var(--ink-4)] px-2.5 pt-3 pb-1">
                          Setup &amp; reference
                        </div>
                      )}
                      <Link
                        href={sHref}
                        title={s.note}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12.5px] transition-colors ${
                          sActive
                            ? "text-[var(--ink)] font-medium"
                            : "text-[var(--ink-3)] hover:text-[var(--ink)]"
                        }`}
                      >
                        {s.step ? (
                          <span
                            className={`w-4 h-4 shrink-0 rounded-full text-[9px] font-bold flex items-center justify-center ${
                              sActive
                                ? "bg-[var(--accent)] text-white"
                                : "bg-[var(--surface)] border border-[var(--line)] text-[var(--ink-4)]"
                            }`}
                          >
                            {s.step}
                          </span>
                        ) : (
                          <span className="w-4 shrink-0" />
                        )}
                        {s.label}
                      </Link>
                    </div>
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
