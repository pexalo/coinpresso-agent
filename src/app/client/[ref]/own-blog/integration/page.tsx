"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface Mapping {
  pillar: string;
  pillarName: string;
  hub: string;
  wpId: number | null;
  wpSlug: string | null;
  liveName: string | null;
  livePosts: number | null;
  ok: boolean;
}

interface Status {
  connection: {
    ok: boolean;
    reachable: boolean;
    authenticated: boolean;
    siteName?: string;
    user?: string;
    canPublish?: boolean;
    postCount?: number;
    detail: string;
  };
  stats: {
    total: number;
    withBody: number;
    words: number;
    newest?: string;
    oldest?: string;
    byPillar: Array<{ pillar: string; count: number }>;
    unmapped: number;
  };
  siteUrl: string;
  username: string;
  hasAppPassword: boolean;
  lastImportAt: string | null;
  lastImportCount: number | null;
  categoryError: string | null;
  mapping: Mapping[];
  unmapped: Array<{ id: number; name: string; slug: string; count: number }>;
}

interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  pagesRead: number;
  totalPages: number;
  totalPosts: number;
  errors: string[];
}

function Dot({ tone }: { tone: string }) {
  return (
    <span
      className="w-2 h-2 rounded-full shrink-0 inline-block"
      style={{ background: tone }}
    />
  );
}

export default function IntegrationPage() {
  const { ref } = useParams<{ ref: string }>();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${ref}/integrations/wordpress`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not read the status.");
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [ref]);

  useEffect(() => {
    load();
  }, [load]);

  async function runImport() {
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(
        `/api/clients/${ref}/integrations/wordpress/import`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "The import failed.");
      setResult(data);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }

  const c = status?.connection;
  const readTone = !c
    ? "var(--line)"
    : c.reachable
      ? "var(--success)"
      : "var(--danger)";
  const writeTone = !c
    ? "var(--line)"
    : c.authenticated && c.canPublish
      ? "var(--success)"
      : "var(--warning)";

  return (
    <div className="space-y-5 pt-2">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Integration</h1>
        <p className="text-[var(--ink-3)] text-sm mt-1 max-w-3xl">
          coinpresso.io runs on WordPress. Two directions: importing what is
          already published so the writer has real examples of how Coinpresso
          writes, and creating approved posts back there as drafts.
        </p>
      </div>

      {loading && !status && (
        <div className="card p-8 text-center text-[var(--ink-3)] text-sm">
          Checking the connection…
        </div>
      )}

      {status && (
        <>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-1.5">
                <Dot tone={readTone} />
                <h2 className="font-bold text-sm">Reading — import</h2>
              </div>
              <p className="text-[12px] text-[var(--ink-2)] leading-relaxed">
                {c?.reachable
                  ? `Connected to ${c.siteName ?? status.siteUrl}. The REST API is public, so importing needs no credentials.`
                  : c?.detail}
              </p>
              {c?.postCount !== undefined && (
                <p className="text-[11px] text-[var(--ink-3)] mt-2">
                  {c.postCount} posts live on the site.
                </p>
              )}
            </div>

            <div className="card p-5">
              <div className="flex items-center gap-2 mb-1.5">
                <Dot tone={writeTone} />
                <h2 className="font-bold text-sm">Writing — drafts</h2>
              </div>
              <p className="text-[12px] text-[var(--ink-2)] leading-relaxed">
                {c?.authenticated
                  ? c.canPublish
                    ? `Authenticated as ${c.user}. Approved posts can be created as drafts.`
                    : `Authenticated as ${c.user}, but this user cannot create posts. Give it Author or Editor in WordPress.`
                  : "Not configured. Add a WordPress username and application password in Settings to push drafts back."}
              </p>
              <Link
                href={`/client/${ref}/settings`}
                className="inline-block text-[11.5px] text-[var(--accent)] font-medium mt-2"
              >
                {c?.authenticated ? "Change credentials" : "Add credentials"} →
              </Link>
            </div>
          </div>

          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[12px] text-[var(--ink-2)] flex items-start gap-2.5">
            <span className="text-[var(--success)] mt-0.5">🔒</span>
            <p className="leading-relaxed">
              <span className="font-semibold">Posts are only ever created as drafts.</span>{" "}
              There is no publish option in this system, no setting that enables
              one, and no override. The failure mode of an automated publish is
              not a bad post — it is a bad post nobody knew was live. Whoever
              publishes does it in WordPress, having read it.
            </p>
          </div>

          {/* --- Import ---------------------------------------------------- */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--line)] flex items-center gap-3 flex-wrap">
              <div className="min-w-0">
                <h2 className="font-bold text-sm">Style reference</h2>
                <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
                  Published posts imported as examples of the house voice — not
                  as a list of topics that are off limits.
                </p>
              </div>
              <button
                onClick={runImport}
                disabled={importing || !c?.reachable}
                className="ml-auto text-[12.5px] font-semibold px-4 py-2.5 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
              >
                {importing ? "Importing…" : "Import from coinpresso.io"}
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-[var(--line)] border-b border-[var(--line)]">
              {[
                { label: "In the archive", value: status.stats.total },
                {
                  label: "With full text",
                  value: status.stats.withBody,
                  tone:
                    status.stats.withBody === 0
                      ? "var(--warning)"
                      : "var(--success)",
                },
                {
                  label: "Words of house voice",
                  value:
                    status.stats.words >= 1000
                      ? `${Math.round(status.stats.words / 1000)}k`
                      : status.stats.words,
                },
                {
                  label: "Not in a pillar",
                  value: status.stats.unmapped,
                  tone: status.stats.unmapped ? "var(--warning)" : undefined,
                },
              ].map((k) => (
                <div key={k.label} className="px-5 py-4">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)]">
                    {k.label}
                  </div>
                  <div
                    className="text-xl font-extrabold mt-1"
                    style={{ color: k.tone ?? "var(--ink)" }}
                  >
                    {k.value}
                  </div>
                </div>
              ))}
            </div>

            {status.stats.withBody === 0 && (
              <p className="px-5 py-3.5 text-[12px] text-[var(--warning)] border-b border-[var(--line)]">
                Nothing imported yet, so the writer is working from the written
                style description alone. That gets you a post which obeys the
                description; two real posts get you one that sounds like
                Coinpresso. This is the single highest-value button on the page.
              </p>
            )}

            {status.lastImportAt && (
              <p className="px-5 py-3 text-[11px] text-[var(--ink-3)] border-b border-[var(--line)]">
                Last import {new Date(status.lastImportAt).toLocaleString()} ·{" "}
                {status.lastImportCount} posts. Re-running updates rather than
                duplicates, so it is safe to run weekly.
              </p>
            )}

            {result && (
              <div className="px-5 py-4 border-b border-[var(--line)]">
                <p className="text-[12.5px] font-semibold">
                  {result.imported} new · {result.updated} updated ·{" "}
                  {result.skipped} skipped
                </p>
                <p className="text-[11px] text-[var(--ink-3)] mt-1">
                  Read {result.pagesRead} of {result.totalPages} pages covering{" "}
                  {result.totalPosts} posts. Skipped ones are drafts, or under
                  150 words — usually landing pages rather than articles. The
                  writer now shows three of these to itself as examples on every
                  blog run.
                </p>
                {result.errors.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {result.errors.slice(0, 5).map((e) => (
                      <li key={e} className="text-[11px] text-[var(--danger)]">
                        {e}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {importing && (
              <p className="px-5 py-3.5 text-[12px] text-[var(--accent)] flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-[var(--accent)] running-dot" />
                Walking the blog one page at a time. Sequential on purpose —
                hammering a client&apos;s live site to save a minute is a bad
                trade.
              </p>
            )}
          </div>

          {/* --- Mapping --------------------------------------------------- */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--line)]">
              <h2 className="font-bold text-sm">Where drafts get filed</h2>
              <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
                Each pillar publishes into one real WordPress category. Six
                pillars are the planning unit because 34 categories cannot be
                spread across a day — but a draft still has to land where a human
                would have filed it.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11.5px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] border-b border-[var(--line)]">
                    <th className="text-left font-medium px-5 py-2.5">Pillar</th>
                    <th className="text-left font-medium px-3 py-2.5">
                      WordPress category
                    </th>
                    <th className="text-right font-medium px-3 py-2.5">
                      Live posts
                    </th>
                    <th className="text-right font-medium px-5 py-2.5">
                      Imported
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {status.mapping.map((m) => {
                    const imported =
                      status.stats.byPillar.find((b) => b.pillar === m.pillar)
                        ?.count ?? 0;
                    return (
                      <tr key={m.pillar}>
                        <td className="px-5 py-2.5">
                          <div className="font-medium">{m.pillarName}</div>
                          <code className="text-[10.5px] text-[var(--ink-4)]">
                            {m.hub}
                          </code>
                        </td>
                        <td className="px-3 py-2.5">
                          {m.ok ? (
                            <span className="text-[var(--ink-2)]">
                              {m.liveName}{" "}
                              <span className="text-[var(--ink-4)]">
                                #{m.wpId}
                              </span>
                            </span>
                          ) : (
                            <span className="text-[var(--warning)]">
                              {m.wpSlug
                                ? `${m.wpSlug} — not found on the site`
                                : "not mapped"}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[var(--ink-3)]">
                          {m.livePosts ?? "—"}
                        </td>
                        <td className="px-5 py-2.5 text-right tabular-nums text-[var(--ink-2)]">
                          {imported}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {status.categoryError && (
              <p className="px-5 py-3 text-[11.5px] text-[var(--danger)] border-t border-[var(--line)]">
                Could not read the live category list: {status.categoryError}
              </p>
            )}

            {status.unmapped.length > 0 && (
              <div className="px-5 py-4 border-t border-[var(--line)]">
                <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] mb-2">
                  Categories no pillar plans for
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {status.unmapped.map((u) => (
                    <span
                      key={u.id}
                      className="text-[11px] px-2 py-1 rounded-lg bg-[var(--bg)] border border-[var(--line)] text-[var(--ink-2)]"
                    >
                      {u.name}{" "}
                      <span className="text-[var(--ink-4)]">{u.count}</span>
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-[var(--ink-3)] leading-relaxed mt-2.5 max-w-3xl">
                  These carry real volume on the site but sit outside the six
                  service pillars, so the planner never proposes into them. That
                  is a choice rather than a bug — but if one of them is a service
                  Coinpresso actually sells, it should become a pillar.
                </p>
              </div>
            )}
          </div>

          {error && (
            <div className="text-[12px] text-[var(--danger)] border border-[var(--danger)]/30 bg-[var(--danger)]/10 rounded-lg px-3.5 py-2.5">
              {error}
            </div>
          )}

          <div className="card p-5">
            <h2 className="font-bold text-sm mb-2">Setting up the push</h2>
            <ol className="space-y-2 text-[12px] text-[var(--ink-2)] leading-relaxed max-w-3xl">
              {[
                "In WordPress, go to Users → Profile for the account posts should be authored by. It needs Author or Editor.",
                "Scroll to Application Passwords, name one “Pexalo agent”, and generate it. This is not the account password — it is scoped, and revoking it later locks out only this integration.",
                "Paste the username and that password into Settings here. It is stored server-side and masked on every read; the browser never sees it again.",
                "Come back to this page — the writing indicator should turn green and name the user.",
              ].map((step, i) => (
                <li key={i} className="pl-6 relative">
                  <span className="absolute left-0 font-bold text-[var(--accent)]">
                    {i + 1}.
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
