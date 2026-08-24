"use client";

import { useEffect, useState } from "react";

/**
 * A client or campaign logo, with a monogram fallback.
 *
 * The monogram is the DEFAULT and the image replaces it only once it has been
 * confirmed to load. Rendering the <img> first and relying on onError does not
 * work: the browser requests the image while parsing the server HTML, so a 404
 * fires before React hydrates and the handler never runs — leaving a broken-image
 * icon in a dashboard you are showing to that client, which is worse than no
 * logo at all.
 */
export function EntityLogo({
  name,
  logo,
  accent,
  size = 24,
}: {
  name: string;
  logo?: string;
  accent: string;
  size?: number;
}) {
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!logo) return;
    let alive = true;
    const probe = new Image();
    probe.onload = () => alive && setOk(true);
    probe.onerror = () => alive && setOk(false);
    probe.src = logo;
    return () => {
      alive = false;
    };
  }, [logo]);

  if (logo && ok) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt={name}
        style={{ height: size, width: "auto", maxWidth: size * 5 }}
        className="object-contain wordmark-invert"
      />
    );
  }

  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <span
      className="inline-flex items-center justify-center rounded-md font-black shrink-0"
      style={{
        height: size,
        width: size,
        background: `${accent}22`,
        color: accent,
        border: `1px solid ${accent}55`,
        fontSize: size * 0.42,
      }}
      aria-label={name}
    >
      {initials}
    </span>
  );
}

/** Bottom-centre attribution. Present on every page. */
export function PoweredBy() {
  return (
    <footer className="border-t border-[var(--line)] mt-12">
      <div className="max-w-[1240px] mx-auto px-5 md:px-8 py-8 flex flex-col items-center gap-2.5">
        <div className="flex items-center gap-2.5">
          <span className="text-[11px] text-[var(--ink-3)]">Powered by</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/pexalo-logo.png"
            alt="Pexalo"
            className="h-5 w-auto opacity-90 wordmark-invert"
          />
        </div>
        <p className="text-[10.5px] text-[var(--ink-4)] text-center max-w-md leading-relaxed">
          Drafts are prepared for review. Nothing is submitted to a newswire
          without a person approving it.
        </p>
      </div>
    </footer>
  );
}

/** Live vs mock, with the missing key named. */
export function ModeBadge() {
  const [mode, setMode] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => {
        setMode(d.mode);
        const gaps: string[] = [];
        if (!d.configured?.anthropic) gaps.push("ANTHROPIC_API_KEY");
        if (!d.configured?.openai) gaps.push("OPENAI_API_KEY");
        setMissing(gaps);
      })
      .catch(() => setMode(null));
  }, []);

  if (!mode) return null;

  return (
    <span
      className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${
        mode === "live"
          ? "text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10"
          : "text-[var(--warning)] border-[var(--warning)]/30 bg-[var(--warning)]/10"
      }`}
      title={
        mode === "live"
          ? "Both model keys usable — agents call live APIs"
          : missing.length
            ? `Running on canned responses. Missing or placeholder: ${missing.join(", ")}`
            : "Forced into mock mode by MOCK_AGENTS=1"
      }
    >
      {mode === "live" ? "LIVE" : "MOCK MODE"}
    </span>
  );
}

/**
 * Light / dark switch.
 *
 * Dark is the default because the design was drawn for it. The choice is stamped
 * on <html> and persisted, and a tiny inline script in the layout applies it
 * before first paint — without that, every load flashes dark before switching,
 * which is worse than having no toggle.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const current =
      (document.documentElement.getAttribute("data-theme") as
        | "dark"
        | "light"
        | null) ?? "dark";
    setTheme(current);
  }, []);

  function apply(next: "dark" | "light") {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem("pexalo.theme", next);
    } catch {
      // Blocked storage just means the choice does not survive a reload.
    }
  }

  return (
    <button
      onClick={() => apply(theme === "dark" ? "light" : "dark")}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className="w-8 h-8 rounded-lg border border-[var(--line)] bg-[var(--surface)] hover:border-[var(--accent)]/50 transition-colors flex items-center justify-center shrink-0"
    >
      {theme === "dark" ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="4.5" stroke="var(--ink-2)" strokeWidth="1.8" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <line
              key={a}
              x1="12"
              y1="2.5"
              x2="12"
              y2="5"
              stroke="var(--ink-2)"
              strokeWidth="1.8"
              strokeLinecap="round"
              transform={`rotate(${a} 12 12)`}
            />
          ))}
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"
            stroke="var(--ink-2)"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
