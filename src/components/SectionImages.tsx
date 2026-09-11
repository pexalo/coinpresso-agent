"use client";

// ---------------------------------------------------------------------------
// In-body images, one per section, briefed by hand.
//
// The featured image is derived from the draft because there is exactly one of
// them and its job never changes. These are different: they exist because
// somebody read a section and decided a picture would help there, and only
// that person knows which picture. So the brief leads and the agent draws.
//
// They are downloaded rather than pushed, because they get placed inside the
// article body by whoever is doing the posting.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";

interface Version {
  id: string;
  createdAt: string;
  section?: string;
  brief?: string;
  prompt: string;
  costUsd: number;
}

export default function SectionImages({
  clientRef,
  runId,
  sections,
}: {
  clientRef: string;
  runId: string;
  sections: string[];
}) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const [section, setSection] = useState(sections[0] ?? "");
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/clients/${clientRef}/runs/${runId}/image`);
    const data = (await res.json()) as { versions: Version[] };
    setVersions((data.versions ?? []).filter((v) => v.section));
  }, [clientRef, runId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const generate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientRef}/runs/${runId}/image`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ section, brief }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Generation failed.");
        return;
      }
      await load();
      setActive(data.version.id);
      setBrief("");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }, [clientRef, runId, section, brief, load]);

  const [driveMsg, setDriveMsg] = useState<string | null>(null);
  const [driveOk, setDriveOk] = useState(false);

  const toDrive = useCallback(
    async (versionId: string) => {
      setBusy(true);
      setDriveMsg(null);
      try {
        const res = await fetch(`/api/clients/${clientRef}/runs/${runId}/image/drive`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ versionId }),
        });
        const data = await res.json();
        setDriveOk(res.ok);
        setDriveMsg(res.ok ? `Saved to Drive as “${data.name}” in Graphics.` : data.error);
      } catch {
        setDriveOk(false);
        setDriveMsg("Could not reach the server.");
      } finally {
        setBusy(false);
      }
    },
    [clientRef, runId]
  );

  const mine = versions.filter((v) => v.section === section);

  return (
    <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-[var(--surface-2)]/50 transition-colors"
      >
        <span>
          <span className="block text-[13px] font-semibold">
            Section images
            {versions.length > 0 && (
              <span className="ml-2 text-[11px] font-normal text-[var(--ink-3)]">
                {versions.length} generated
              </span>
            )}
          </span>
          <span className="block text-[11px] text-[var(--ink-3)] mt-0.5">
            A picture for one of the headings. You write the brief — the agent
            does not guess these.
          </span>
        </span>
        <span className="text-[11px] text-[var(--ink-3)] shrink-0">
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {open && (
        <div className="border-t border-[var(--line)] p-5 space-y-4">
          <div className="space-y-2">
            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-3)] mb-1">
                Which section
              </span>
              <select
                value={section}
                onChange={(e) => {
                  setSection(e.target.value);
                  setActive(null);
                }}
                className="w-full text-[12.5px] px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--line)] outline-none focus:border-[var(--accent)]/60"
              >
                {sections.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-3)] mb-1">
                What should it show
              </span>
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                rows={3}
                placeholder="Cards labelled GitBook, GitHub, Docs and Tokenomics, chained to a cracked ring in the middle, warning markers on the broken links."
                className="w-full text-[12.5px] px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--line)] outline-none focus:border-[var(--accent)]/60 leading-relaxed resize-y"
              />
              <span className="block text-[11px] text-[var(--ink-3)] mt-1 leading-relaxed">
                Name objects rather than ideas. Short labels on objects are fine;
                paragraphs of text and data values are not.
              </span>
            </label>

            <button
              onClick={generate}
              disabled={busy || brief.trim().length < 8}
              className="text-[12px] font-semibold px-4 py-2 rounded-lg bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40"
            >
              {busy ? "Generating…" : "Generate image"}
            </button>
          </div>

          {error && (
            <div className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/10 px-3 py-2.5 text-[12px] text-[var(--warning)] leading-relaxed">
              {error}
            </div>
          )}

          {mine.length > 0 && (
            <div className="space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/clients/${clientRef}/runs/${runId}/image?v=${active ?? mine[0].id}`}
                alt=""
                className="w-full rounded-lg border border-[var(--line)] bg-black"
              />
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={`/api/clients/${clientRef}/runs/${runId}/image?v=${active ?? mine[0].id}`}
                  download={`${section.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.png`}
                  className="text-[12px] font-semibold px-3.5 py-2 rounded-lg border border-[var(--line)] hover:border-[var(--accent)]/50"
                >
                  Download
                </a>
                <button
                  onClick={() => toDrive(active ?? mine[0].id)}
                  disabled={busy}
                  className="text-[12px] font-semibold px-3.5 py-2 rounded-lg border border-[var(--line)] hover:border-[var(--accent)]/50 disabled:opacity-40"
                >
                  Save to Drive
                </button>
                <span className="text-[11px] text-[var(--ink-3)]">
                  Place it under the heading when you paste the article in.
                </span>
              </div>
              {mine.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {mine.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setActive(v.id)}
                      title={v.brief}
                      className={`shrink-0 rounded-md overflow-hidden border-2 ${
                        v.id === (active ?? mine[0].id)
                          ? "border-[var(--accent)]"
                          : "border-transparent hover:border-[var(--line)]"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/clients/${clientRef}/runs/${runId}/image?v=${v.id}`}
                        alt=""
                        className="block w-24 h-[54px] object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {driveMsg && (
            <div
              className={`rounded-lg border px-3 py-2.5 text-[12px] leading-relaxed ${
                driveOk
                  ? "border-[var(--success)]/30 bg-[var(--success)]/10 text-[var(--success)]"
                  : "border-[var(--warning)]/30 bg-[var(--warning)]/10 text-[var(--warning)]"
              }`}
            >
              {driveMsg}
            </div>
          )}

          <p className="text-[11px] text-[var(--ink-3)] leading-relaxed border-t border-[var(--line)] pt-3">
            <span className="font-semibold text-[var(--ink-2)]">Charts are refused on purpose.</span>{" "}
            Coinpresso&apos;s own in-body charts carry real figures from a named
            source. An image model asked for a chart invents the numbers and
            draws them convincingly — the exact failure this pipeline rejects in
            the writing. Build those from real data and place them by hand.
          </p>
        </div>
      )}
    </section>
  );
}
