"use client";

import { useParams } from "next/navigation";
import { InsightsPanel } from "@/components/Insights";

export default function InsightsPage() {
  const { ref } = useParams<{ ref: string }>();
  return (
    <div className="space-y-5 pt-2">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Insights &amp; data</h1>
        <p className="text-[var(--ink-3)] text-sm mt-1 max-w-3xl">
          Every finding and link Liam has added. To tie one to a single post, add it from that
          post&apos;s page or its topic (Topics &amp; keywords → open the topic) — attached data always
          reaches that post. Data added here without attaching is used by any post whose topic it matches.
        </p>
      </div>
      <InsightsPanel clientRef={ref} />
    </div>
  );
}
