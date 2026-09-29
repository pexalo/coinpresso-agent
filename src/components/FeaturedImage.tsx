"use client";

// ---------------------------------------------------------------------------
// Featured image: generate, look at it, regenerate, attach.
//
// The compositing happens HERE, in the browser, not on the server. That is a
// deliberate choice. Drawing text and the logo server-side would mean a
// rasteriser and font binaries in the Railway build, and this deployment has
// paid enough for extra build complexity. A canvas already has the fonts, the
// operator is always present for this flow, and the preview is the composite
// rather than a picture of one — what you approve is the file that ships.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { CANVAS, TEMPLATE,
  titleTop, PALETTE, FONTS, splitTitle } from "@/lib/blog-image";

interface Version {
  id: string;
  createdAt: string;
  prompt: string;
  nudge?: string;
  costUsd: number;
  composed?: boolean;
}

/** Greedy wrap against real measured text, so nothing overflows the column. */
function wrap(ctx: CanvasRenderingContext2D, words: string[], max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export default function FeaturedImage({
  clientRef,
  runId,
  headline,
  hasDraft,
}: {
  clientRef: string;
  runId: string;
  headline: string;
  hasDraft: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nudge, setNudge] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  // Roundups ("Best crypto SEO agencies") carry the listed companies' real
  // logos on the right. Editable, because a guessed domain can be wrong.
  const [logos, setLogos] = useState<Array<{ name: string; domain: string; ours: boolean; on: boolean }>>([]);
  const [isRoundup, setIsRoundup] = useState(false);

  useEffect(() => {
    // The two faces the brand uses. Both are on Google Fonts; the canvas will
    // silently fall back to a system sans if they have not loaded, which looks
    // subtly wrong rather than obviously broken — so we wait for them.
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONTS.googleHref;
    document.head.appendChild(link);
    document.fonts.ready.then(() => setFontsReady(true));
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(`/api/clients/${clientRef}/runs/${runId}/image`);
    const data = (await res.json()) as { versions: Version[] };
    setVersions(data.versions ?? []);
    setActive((a) => a ?? data.versions?.[0]?.id ?? null);
  }, [clientRef, runId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetch(`/api/clients/${clientRef}/runs/${runId}/image/logos`)
      .then((r) => r.json())
      .then((d: { roundup?: boolean; entries?: Array<{ name: string; domain: string; ours: boolean }> }) => {
        setIsRoundup(Boolean(d.roundup));
        setLogos((d.entries ?? []).map((e) => ({ ...e, on: Boolean(e.domain) })));
      })
      .catch(() => {});
  }, [clientRef, runId]);

  /** Draw scene, scrim, logo and title — the template, at the measured numbers. */
  const draw = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !active) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = CANVAS.w;
    canvas.height = CANVAS.h;

    // 1. The generated scene, cover-cropped to 16:9.
    const scene = new Image();
    scene.src = `/api/clients/${clientRef}/runs/${runId}/image?v=${active}`;
    try {
      await scene.decode();
      const scale = Math.max(CANVAS.w / scene.width, CANVAS.h / scene.height);
      const dw = scene.width * scale;
      const dh = scene.height * scale;
      ctx.drawImage(scene, (CANVAS.w - dw) / 2, (CANVAS.h - dh) / 2, dw, dh);
    } catch {
      ctx.fillStyle = PALETTE.bgEdge;
      ctx.fillRect(0, 0, CANVAS.w, CANVAS.h);
    }

    // 2. A scrim across the left, so the title reads whatever the scene did.
    const scrim = ctx.createLinearGradient(0, 0, CANVAS.w * TEMPLATE.scrim.to, 0);
    scrim.addColorStop(0, `rgba(14,1,26,${TEMPLATE.scrim.strength})`);
    scrim.addColorStop(0.55, `rgba(14,1,26,${TEMPLATE.scrim.strength * 0.7})`);
    scrim.addColorStop(1, "rgba(14,1,26,0)");
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, CANVAS.w * TEMPLATE.scrim.to, CANVAS.h);

    // 3. The logo, at its own aspect ratio. Never stretched to fit a box.
    const logo = new Image();
    logo.src = "/brand/clients/coinpresso.png";
    try {
      await logo.decode();
      const h = TEMPLATE.logo.h;
      const w = (logo.width / logo.height) * h;
      ctx.drawImage(logo, TEMPLATE.logo.x, TEMPLATE.logo.y, w, h);
    } catch {
      // No logo asset: leave the space rather than draw a wrong mark.
    }

    // 3b. On a roundup, the listed companies' real logos down the right:
    // Coinpresso first and largest, then the rest in two columns. Each is
    // the company's own published mark, fetched from its site — never drawn.
    const shown = logos.filter((l) => l.on && (l.ours || l.domain));
    if (isRoundup && shown.length) {
      const X0 = 640, X1 = 984, GAP = 12;
      const round = (x: number, y: number, w: number, h: number, r: number) => {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
      };
      const loadImg = async (src: string) => {
        const im = new Image();
        im.src = src;
        try {
          await im.decode();
          return im;
        } catch {
          return null;
        }
      };
      const others = shown.filter((l) => !l.ours).slice(0, 6);
      const ours = shown.find((l) => l.ours);
      const rows = Math.ceil(others.length / 2);
      const topH = ours ? 96 : 0;
      const tileH = 64;
      const totalH = topH + (ours && rows ? GAP : 0) + rows * tileH + Math.max(0, rows - 1) * GAP;
      let y = Math.round((CANVAS.h - totalH) / 2);
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 18;
      if (ours) {
        round(X0, y, X1 - X0, topH, 16);
        ctx.fillStyle = PALETTE.bgCenter;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 2;
        ctx.strokeStyle = PALETTE.accent;
        ctx.stroke();
        const mark = await loadImg("/brand/clients/coinpresso.png");
        if (mark) {
          const h = 44;
          const w = (mark.width / mark.height) * h;
          ctx.drawImage(mark, X0 + 24, y + (topH - h) / 2, w, h);
        }
        ctx.font = `700 22px ${FONTS.display}, ${FONTS.fallback}`;
        ctx.fillStyle = PALETTE.accent;
        ctx.textAlign = "right";
        ctx.fillText("#1", X1 - 22, y + topH / 2 + 8);
        ctx.textAlign = "left";
        y += topH + GAP;
        ctx.shadowBlur = 18;
      }
      const colW = (X1 - X0 - GAP) / 2;
      for (let i = 0; i < others.length; i++) {
        const l = others[i];
        const x = X0 + (i % 2) * (colW + GAP);
        const ty = y + Math.floor(i / 2) * (tileH + GAP);
        ctx.shadowBlur = 18;
        round(x, ty, colW, tileH, 12);
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();
        ctx.shadowBlur = 0;
        const icon = l.domain
          ? await loadImg(`/api/clients/${clientRef}/runs/${runId}/image/logos?domain=${encodeURIComponent(l.domain)}`)
          : null;
        let tx = x + 16;
        if (icon) {
          ctx.drawImage(icon, x + 12, ty + 12, 40, 40);
          tx = x + 62;
        }
        ctx.fillStyle = "#1c1330";
        let size = 17;
        ctx.font = `700 ${size}px ${FONTS.display}, ${FONTS.fallback}`;
        while (ctx.measureText(l.name).width > x + colW - tx - 10 && size > 11) {
          size -= 1;
          ctx.font = `700 ${size}px ${FONTS.display}, ${FONTS.fallback}`;
        }
        ctx.fillText(l.name, tx, ty + tileH / 2 + size / 3);
      }
      ctx.restore();
    }

    // 4. The title, accent phrase then white, block centred on centerY.
    const { accent, rest } = splitTitle(headline);
    ctx.font = `700 ${TEMPLATE.title.size}px ${FONTS.display}, ${FONTS.fallback}`;
    ctx.textBaseline = "alphabetic";
    const all = wrap(
      ctx,
      `${accent} ${rest}`.split(" "),
      TEMPLATE.title.maxWidth
    ).slice(0, TEMPLATE.title.maxLines);

    // Which characters are still inside the accent phrase, so a colour change
    // can land mid-line exactly as it does in their own images.
    const accentChars = accent.length;
    let consumed = 0;
    // Centred on centerY, then pushed clear of the logo if a long title would
    // climb into it — see titleTop.
    const top = titleTop(all.length);

    all.forEach((line, i) => {
      const y = top + i * TEMPLATE.title.lineHeight;
      let x = TEMPLATE.title.x;
      for (const word of line.split(" ")) {
        const isAccent = consumed < accentChars;
        ctx.fillStyle = isAccent ? PALETTE.accent : PALETTE.ink;
        ctx.fillText(word, x, y);
        x += ctx.measureText(`${word} `).width;
        consumed += word.length + 1;
      }
    });
  }, [active, clientRef, runId, headline, logos, isRoundup]);

  useEffect(() => {
    if (fontsReady) void draw();
  }, [draw, fontsReady]);

  const generate = useCallback(
    async (withNudge?: string) => {
      setBusy(true);
      setMsg(null);
      setFailed(false);
      try {
        const res = await fetch(`/api/clients/${clientRef}/runs/${runId}/image`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ nudge: withNudge }),
        });
        const data = await res.json();
        if (!res.ok) {
          setFailed(true);
          setMsg(data.error ?? "Generation failed.");
          return;
        }
        setVersions(data.versions ?? []);
        setActive(data.version.id);
        setNudge("");
      } catch {
        setFailed(true);
        setMsg("Could not reach the server.");
      } finally {
        setBusy(false);
      }
    },
    [clientRef, runId]
  );

  const save = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !active) return;
    setBusy(true);
    try {
      const png = canvas.toDataURL("image/png");
      const res = await fetch(`/api/clients/${clientRef}/runs/${runId}/image`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ versionId: active, png }),
      });
      setFailed(!res.ok);
      setMsg(res.ok ? "Saved. It will go up as the WordPress featured image." : "Could not save.");
      if (res.ok) await load();
    } finally {
      setBusy(false);
    }
  }, [active, clientRef, runId, load]);

  const toDrive = useCallback(async () => {
    if (!active) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/clients/${clientRef}/runs/${runId}/image/drive`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ versionId: active }),
      });
      const data = await res.json();
      setFailed(!res.ok);
      setMsg(res.ok ? `Saved to Drive as “${data.name}” in Graphics.` : data.error);
    } catch {
      setFailed(true);
      setMsg("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }, [active, clientRef, runId]);

  if (!hasDraft) return null;

  return (
    <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h2 className="text-[13px] font-semibold tracking-wide uppercase text-[var(--ink-3)]">
          Featured image
        </h2>
        {versions.length > 0 && (
          <span className="text-[11px] text-[var(--ink-3)] tabular-nums">
            {versions.length} version{versions.length === 1 ? "" : "s"} · $
            {versions.reduce((n, v) => n + v.costUsd, 0).toFixed(3)}
          </span>
        )}
      </div>

      {versions.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-[13px] text-[var(--ink-3)] max-w-md mx-auto mb-4">
            The designer reads the finished post and illustrates what it argues.
            The title and logo are drawn from the template, so they are always
            exact.
          </p>
          <button
            onClick={() => generate()}
            disabled={busy}
            className="text-[12px] font-semibold px-4 py-2 rounded-lg bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Generating…" : "Generate image"}
          </button>
        </div>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            className="w-full rounded-lg border border-[var(--line)] bg-black"
            style={{ aspectRatio: "1024 / 576" }}
          />

          {isRoundup && logos.length > 0 && (
            <div className="mt-3 rounded-lg border border-[var(--line)] p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-3)] mb-1">
                Company logos on the image
              </div>
              <p className="text-[11px] text-[var(--ink-3)] mb-2 leading-relaxed">
                Each company&apos;s real logo, taken from its own website. Check the
                website for each — a wrong one shows the wrong company&apos;s logo. Untick any
                you don&apos;t want. Coinpresso always goes first.
              </p>
              <div className="space-y-1.5">
                {logos.map((l, i) => (
                  <label key={l.name + i} className="flex items-center gap-2 text-[12px]">
                    <input
                      type="checkbox"
                      checked={l.on}
                      onChange={(e) =>
                        setLogos((ls) => ls.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))
                      }
                    />
                    <span className="w-40 truncate font-semibold">{l.name}</span>
                    {l.ours ? (
                      <span className="text-[var(--ink-3)]">coinpresso.io (our logo)</span>
                    ) : (
                      <input
                        value={l.domain}
                        placeholder="company website, e.g. icoda.io"
                        onChange={(e) =>
                          setLogos((ls) =>
                            ls.map((x, j) => (j === i ? { ...x, domain: e.target.value, on: Boolean(e.target.value) } : x))
                          )
                        }
                        className="flex-1 min-w-0 rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1 text-[12px]"
                      />
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-3">
            <input
              value={nudge}
              onChange={(e) => setNudge(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && nudge.trim() && !busy) void generate(nudge.trim());
              }}
              placeholder="Change something — darker, less literal, add a vault…"
              className="flex-1 min-w-[220px] text-[12px] px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--line)] focus:border-[var(--accent)]/60 outline-none"
            />
            <button
              onClick={() => generate(nudge.trim() || undefined)}
              disabled={busy}
              className="text-[12px] font-semibold px-3.5 py-2 rounded-lg border border-[var(--line)] hover:border-[var(--accent)]/50 disabled:opacity-40"
            >
              {busy ? "Working…" : "Regenerate"}
            </button>
            <button
              onClick={save}
              disabled={busy}
              className="text-[12px] font-semibold px-4 py-2 rounded-lg bg-[var(--success)] text-white hover:opacity-90 disabled:opacity-40"
            >
              Use this one
            </button>
            <button
              onClick={toDrive}
              disabled={busy || !versions.find((v) => v.id === active)?.composed}
              title={
                versions.find((v) => v.id === active)?.composed
                  ? "Uploads to the Graphics folder in Drive."
                  : "Press “Use this one” first — Drive should get the finished image, not the bare scene."
              }
              className="text-[12px] font-semibold px-3.5 py-2 rounded-lg border border-[var(--line)] hover:border-[var(--accent)]/50 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Save to Drive
            </button>
          </div>

          {versions.length > 1 && (
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
              {versions.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setActive(v.id)}
                  title={v.nudge ? `Nudge: ${v.nudge}` : v.prompt}
                  className={`shrink-0 rounded-md overflow-hidden border-2 transition-colors ${
                    v.id === active
                      ? "border-[var(--accent)]"
                      : "border-transparent hover:border-[var(--line)]"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/clients/${clientRef}/runs/${runId}/image?v=${v.id}`}
                    alt=""
                    width={96}
                    height={54}
                    className="block w-24 h-[54px] object-cover"
                  />
                </button>
              ))}
            </div>
          )}

          {versions.find((v) => v.id === active)?.prompt && (
            <p className="text-[11px] text-[var(--ink-3)] mt-3 leading-relaxed">
              <span className="font-semibold">Scene:</span>{" "}
              {versions.find((v) => v.id === active)?.prompt}
            </p>
          )}
        </>
      )}

      {msg && (
        <div
          className={`mt-3 rounded-lg border px-3 py-2 text-[12px] ${
            failed
              ? "border-[var(--danger)]/30 bg-[var(--danger)]/10 text-[var(--danger)]"
              : "border-[var(--success)]/30 bg-[var(--success)]/10 text-[var(--success)]"
          }`}
        >
          {msg}
        </div>
      )}
    </section>
  );
}
