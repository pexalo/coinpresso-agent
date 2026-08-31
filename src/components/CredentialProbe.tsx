"use client";

import { useState } from "react";

interface Probe {
  provider: "anthropic" | "openai";
  ok: boolean;
  status: number | null;
  detail: string;
}

interface Provenance {
  variable: string;
  source: "shell" | "env-file" | "shell-shadowing-file" | "absent";
  file?: string;
  shape?: string;
  detail: string;
}

const SOURCE_LABEL: Record<Provenance["source"], string> = {
  "env-file": "from the env file",
  shell: "from your shell",
  "shell-shadowing-file": "shell is overriding the file",
  absent: "not set anywhere",
};

/**
 * A button that actually calls both providers.
 *
 * The alternative to this is finding out a key is wrong three minutes into a
 * run, or partway through a twenty-article batch having already paid for
 * everything up to that point. One token per provider, a second, and a definite
 * answer.
 */
export default function CredentialProbe() {
  const [probes, setProbes] = useState<Probe[] | null>(null);
  const [creds, setCreds] = useState<Provenance[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setProbes(null);
    try {
      const res = await fetch("/api/health?probe=1");
      const data = await res.json();
      setProbes(data.probe ?? []);
      setCreds(data.credentials ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-sm">Test the credentials</h2>
          <p className="text-[11.5px] text-[var(--ink-3)] leading-relaxed mt-1 max-w-2xl">
            Sends a one-token request to each provider and reports what came
            back. Costs a fraction of a cent, and tells you now rather than
            partway through a batch.
          </p>
        </div>
        <button
          onClick={run}
          disabled={busy}
          className="text-[12.5px] font-semibold px-4 py-2.5 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors shrink-0"
        >
          {busy ? "Testing…" : "Test now"}
        </button>
      </div>

      {error && (
        <div className="mt-3 text-[12px] text-[var(--danger)] border border-[var(--danger)]/30 bg-[var(--danger)]/10 rounded-lg px-3.5 py-2.5">
          {error}
        </div>
      )}

      {creds && creds.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)]">
            Where each key is coming from
          </div>
          {creds.map((c) => {
            const bad =
              c.source === "shell-shadowing-file" || c.source === "absent";
            return (
              <div
                key={c.variable}
                className="text-[11.5px] leading-relaxed pl-3 border-l-2"
                style={{
                  borderColor: bad ? "var(--warning)" : "var(--line)",
                }}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-[11px] text-[var(--ink-2)]">
                    {c.variable}
                  </code>
                  <span
                    className="text-[10px] font-semibold"
                    style={{
                      color: bad ? "var(--warning)" : "var(--ink-3)",
                    }}
                  >
                    {SOURCE_LABEL[c.source]}
                    {c.file ? ` · ${c.file}` : ""}
                  </span>
                  {c.shape && (
                    <span className="text-[10px] text-[var(--ink-4)]">
                      {c.shape}
                    </span>
                  )}
                </div>
                {bad && (
                  <p className="text-[11px] text-[var(--ink-2)] mt-1">
                    {c.detail}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {probes && (
        <div className="mt-4 space-y-2.5">
          {probes.map((p) => (
            <div
              key={p.provider}
              className="rounded-lg border px-3.5 py-3"
              style={{
                borderColor: p.ok
                  ? "color-mix(in srgb, var(--success) 35%, transparent)"
                  : "color-mix(in srgb, var(--danger) 35%, transparent)",
                background: p.ok
                  ? "color-mix(in srgb, var(--success) 8%, transparent)"
                  : "color-mix(in srgb, var(--danger) 8%, transparent)",
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    background: p.ok ? "var(--success)" : "var(--danger)",
                  }}
                />
                <span className="text-[12.5px] font-bold">
                  {p.provider === "anthropic" ? "Anthropic" : "OpenAI"}
                </span>
                <span className="text-[11px] text-[var(--ink-3)]">
                  {p.status !== null ? `HTTP ${p.status}` : "no response"}
                </span>
              </div>
              <pre className="text-[11.5px] leading-relaxed mt-2 whitespace-pre-wrap font-sans text-[var(--ink-2)]">
                {p.detail}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
