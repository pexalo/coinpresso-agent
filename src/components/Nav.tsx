"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** The Pexalo HQ shell bar. Present on every page, client or not. */
export default function Nav() {
  const [mode, setMode] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setMode(d.mode))
      .catch(() => setMode(null));
  }, []);

  return (
    <header className="border-b border-[#2A3A52] bg-[#0D1B2A]/95 backdrop-blur sticky top-0 z-40">
      <div className="max-w-[1240px] mx-auto px-5 md:px-8 h-14 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-[#4E78FF] to-[#6C3AFF] flex items-center justify-center">
            <span className="text-[11px] font-black text-white">P</span>
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-bold">Pexalo HQ</div>
            <div className="text-[10px] text-[#7F8CA8]">Client workspaces</div>
          </div>
        </Link>

        <div className="ml-auto flex items-center gap-3">
          {mode && (
            <span
              className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${
                mode === "live"
                  ? "text-[#3DDC97] border-[#3DDC97]/30 bg-[#3DDC97]/10"
                  : "text-[#F4B740] border-[#F4B740]/30 bg-[#F4B740]/10"
              }`}
              title={
                mode === "live"
                  ? "Model keys detected — agents call live APIs"
                  : "No model keys — the pipeline runs with canned responses"
              }
            >
              {mode === "live" ? "LIVE" : "MOCK MODE"}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
