"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PoweredBy } from "@/components/Brand";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Only ever send people back inside this app. A `next` of https://elsewhere
  // would make the login page an open redirect.
  const rawNext = params.get("next") ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not sign in.");
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card p-6 w-full max-w-sm space-y-4">
      <div>
        <h1 className="text-lg font-extrabold tracking-tight">Sign in</h1>
        <p className="text-[12px] text-[var(--ink-3)] mt-1">
          Enter the passcode Pexalo gave you. It stays signed in on this browser
          for thirty days.
        </p>
      </div>
      <input
        type="password"
        autoFocus
        autoComplete="current-password"
        value={passcode}
        onChange={(e) => setPasscode(e.target.value)}
        placeholder="Passcode"
        className="w-full bg-[var(--bg)] border border-[var(--line)] rounded-lg px-3 py-2.5 text-sm placeholder:text-[var(--ink-4)] focus:border-[var(--accent)] outline-none transition-colors"
      />
      {error && (
        <div className="text-[12px] text-[var(--danger)] border border-[var(--danger)]/30 bg-[var(--danger)]/10 rounded-lg px-3.5 py-2.5">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={busy || !passcode}
        className="w-full text-[12.5px] font-semibold px-4 py-2.5 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
      >
        {busy ? "Signing in…" : "Continue"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <>
      <div
        className="min-h-[70vh] flex items-center justify-center px-5"
        style={{ paddingTop: "var(--top-gap)" }}
      >
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
      <PoweredBy />
    </>
  );
}
