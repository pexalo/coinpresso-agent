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
  titleTop, PALETTE, FONTS, splitTitle, ROUNDUP_TITLE, ROUNDUP_ACCENT } from "@/lib/blog-image";

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
    // Neutral on a roundup — those images carry no Coinpresso colour.
    const tint = isRoundup ? "8,9,11" : "14,1,26";
    const scrim = ctx.createLinearGradient(0, 0, CANVAS.w * TEMPLATE.scrim.to, 0);
    scrim.addColorStop(0, `rgba(${tint},${TEMPLATE.scrim.strength})`);
    scrim.addColorStop(0.55, `rgba(${tint},${TEMPLATE.scrim.strength * 0.7})`);
    scrim.addColorStop(1, `rgba(${tint},0)`);
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, CANVAS.w * TEMPLATE.scrim.to, CANVAS.h);

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

    // 3. The Coinpresso logo, at its own aspect ratio — except on a
    // competitor roundup. Liam, 5 Oct: "for all listicles, the creatives need
    // to be non-branded, organic feel."
    if (!isRoundup) {
      const logo = await loadImg("/brand/clients/coinpresso.png");
      if (logo) {
        const h = TEMPLATE.logo.h;
        const w = (logo.width / logo.height) * h;
        ctx.drawImage(logo, TEMPLATE.logo.x, TEMPLATE.logo.y, w, h);
      }
    }

    // 3b. On a roundup, the listed companies' real logos in glass orbs ringed
    // around the scene's subject, Coinpresso at the top. Each is the
    // company's own published mark, fetched from its site — never drawn.
    const shown = logos.filter((l) => l.on && (l.ours || l.domain));
    if (isRoundup && shown.length) {
      const list = [...shown.filter((l) => l.ours), ...shown.filter((l) => !l.ours)].slice(0, 8);
      const n = list.length;
      const R = n <= 5 ? 66 : n <= 6 ? 60 : 52;
      const CX = 705, CY = 292, RX = 190, RY = 200;
      for (let i = 0; i < n; i++) {
        const l = list[i];
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const x = Math.round(CX + RX * Math.cos(a));
        const y = Math.round(CY + RY * Math.sin(a));
        ctx.save();
        // Glass body.
        ctx.shadowColor = "rgba(0,0,0,0.45)";
        ctx.shadowBlur = 24;
        ctx.beginPath();
        ctx.arc(x, y, R, 0, Math.PI * 2);
        const body = ctx.createRadialGradient(x - R * 0.3, y - R * 0.35, R * 0.1, x, y, R);
        body.addColorStop(0, "rgba(255,255,255,0.10)");
        body.addColorStop(0.7, "rgba(20,24,30,0.55)");
        body.addColorStop(1, "rgba(10,12,16,0.75)");
        ctx.fillStyle = body;
        ctx.fill();
        ctx.shadowBlur = 0;
        // The mark.
        const icon = l.ours
          ? await loadImg("/brand/clients/coinpresso.png")
          : l.domain
            ? await loadImg(`/api/clients/${clientRef}/runs/${runId}/image/logos?domain=${encodeURIComponent(l.domain)}`)
            : null;
        if (icon) {
          const ratio = icon.width / icon.height;
          if (ratio > 1.3) {
            // A wordmark: fit across the orb.
            const w = R * 1.4;
            const h = w / ratio;
            ctx.drawImage(icon, x - w / 2, y - h / 2, w, h);
          } else {
            // A square icon: a disc inside the glass.
            const d = R * 1.25;
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, d / 2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(icon, x - d / 2, y - d / 2, d, d);
            ctx.restore();
          }
        } else {
          ctx.fillStyle = "#FFFFFF";
          let size = 16;
          ctx.font = `700 ${size}px ${FONTS.display}, ${FONTS.fallback}`;
          while (ctx.measureText(l.name).width > R * 1.6 && size > 10) {
            size -= 1;
            ctx.font = `700 ${size}px ${FONTS.display}, ${FONTS.fallback}`;
          }
          ctx.textAlign = "center";
          ctx.fillText(l.name, x, y + size / 3);
          ctx.textAlign = "left";
        }
        // Rim and highlight, warm one side and cool the other.
        ctx.beginPath();
        ctx.arc(x, y, R, 0, Math.PI * 2);
        const rim = ctx.createLinearGradient(x - R, y - R, x + R, y + R);
        rim.addColorStop(0, "rgba(120,220,235,0.85)");
        rim.addColorStop(1, "rgba(240,160,80,0.85)");
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = rim;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, R * 0.86, Math.PI * 1.1, Math.PI * 1.45);
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.stroke();
        ctx.restore();
      }
    }

    // 4. The title, accent phrase then white. On a roundup the block moves
    // left and narrows to clear the orbs, with no logo above it to avoid.
    const T = isRoundup ? ROUNDUP_TITLE : TEMPLATE.title;
    const { accent, rest } = splitTitle(headline);
    ctx.font = `700 ${T.size}px ${FONTS.display}, ${FONTS.fallback}`;
    ctx.textBaseline = "alphabetic";
    const all = wrap(
      ctx,
      `${accent} ${rest}`.split(" "),
      T.maxWidth
    ).slice(0, T.maxLines);

    // Which characters are still inside the accent phrase, so a colour change
    // can land mid-line exactly as it does in their own images.
    const accentChars = accent.length;
    let consumed = 0;
    // Centred on centerY, then pushed clear of the logo if a long title would
    // climb into it — see titleTop. A roundup has no logo, so it just centres.
    const top = isRoundup
      ? Math.max(T.size, T.centerY - ((all.length - 1) * T.lineHeight) / 2)
      : titleTop(all.length);

    all.forEach((line, i) => {
      const y = top + i * T.lineHeight;
      let x = T.x;
      for (const word of line.split(" ")) {
        const isAccent = consumed < accentChars;
        ctx.fillStyle = isAccent ? (isRoundup ? ROUNDUP_ACCENT : PALETTE.accent) : PALETTE.ink;
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
