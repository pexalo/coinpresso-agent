"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { PUBLICATION_LIST, PUBLICATIONS } from "@/lib/publications";
import type { PublicationId } from "@/lib/types";

const EXAMPLES = [
  {
    title:
      "Crypto News Today: Moonberg Crypto Presale Hits $300,000 as Solana Price Prediction Eyes $500",
    keywords: "crypto news, new crypto presale, solana price prediction",
    publication: "openpr" as PublicationId,
  },
  {
    title:
      "Best Crypto To Buy Now: New Crypto Presale Moonberg, Solana, Ethereum, Kaspa",
    keywords: "best crypto to buy now, new crypto presale, solana, ethereum",
    publication: "techbullion" as PublicationId,
  },
  {
    title:
      "New Crypto Presale Moonberg Surpasses $300,000 as Shiba Inu Price Prediction Targets $0.0000054",
    keywords:
      "shiba inu price prediction, new crypto presale, shib price prediction",
    publication: "streetinsider" as PublicationId,
  },
];

export default function NewRunPage() {
  const router = useRouter();
  const { ref } = useParams<{ ref: string }>();
  const [title, setTitle] = useState("");
  const [keywords, setKeywords] = useState("");
  const [publication, setPublication] = useState<PublicationId>("openpr");
  const [presaleRaised, setPresaleRaised] = useState("");
  const [presaleStage, setPresaleStage] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pub = PUBLICATIONS[publication];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${ref}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          keywords: keywords
            .split(/[,\n]/)
            .map((k) => k.trim())
            .filter(Boolean),
          publication,
          presaleRaised,
          presaleStage,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start the run");
      router.push(`/client/${ref}/crypto-pr/runs/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const field =
    "w-full bg-[#0D1B2A] border border-[#2A3A52] rounded-lg px-3.5 py-2.5 text-sm placeholder:text-[#5A6884] focus:border-[#4E78FF] outline-none transition-colors";
  const label = "block text-[11px] uppercase tracking-wider text-[#7F8CA8] mb-1.5";

  return (
    <div className="max-w-3xl mx-auto space-y-6 pt-2">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">New article</h1>
        <p className="text-[#7F8CA8] text-sm mt-1">
          Three fields decide the piece. The agents work out the rest.
        </p>
      </div>

      <form onSubmit={submit} className="card p-6 space-y-5">
        <div>
          <label className={label} htmlFor="title">
            Article title
          </label>
          <textarea
            id="title"
            required
            rows={2}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Crypto News Today: Moonberg Crypto Presale Hits $300,000 as Solana Price Prediction Eyes $500"
            className={field}
          />
          <p className="text-[11px] text-[#5A6884] mt-1.5">
            The writer uses this verbatim unless it is ungrammatical.
          </p>
        </div>

        <div>
          <label className={label} htmlFor="keywords">
            Target keywords
          </label>
          <input
            id="keywords"
            required
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="crypto news, new crypto presale, solana price prediction"
            className={field}
          />
          <p className="text-[11px] text-[#5A6884] mt-1.5">
            Comma separated. The first is treated as primary and must appear in
            the headline, opening, an H2, the conclusion and an FAQ.
          </p>
        </div>

        <div>
          <label className={label} htmlFor="publication">
            Publication
          </label>
          <select
            id="publication"
            value={publication}
            onChange={(e) => setPublication(e.target.value as PublicationId)}
            className={field}
          >
            {PUBLICATION_LIST.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="mt-3 rounded-lg bg-[#0D1B2A] border border-[#2A3A52] p-3.5">
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[#7F8CA8] mb-2">
              <span>
                Links:{" "}
                <span className="text-[#B8C2D6]">
                  {pub.linkStyle === "naked"
                    ? "naked URLs on their own line"
                    : "embedded anchor text"}
                </span>
              </span>
              <span>
                Length:{" "}
                <span className="text-[#B8C2D6]">
                  {pub.wordTarget[0]}–{pub.wordTarget[1]} words
                </span>
              </span>
              <span>
                FAQs:{" "}
                <span className="text-[#B8C2D6]">
                  {pub.faqCount[0]}–{pub.faqCount[1]}
                </span>
              </span>
            </div>
            <p className="text-[11px] text-[#7F8CA8] leading-relaxed">
              {pub.notes}
            </p>
          </div>
        </div>

        <details className="group">
          <summary className="cursor-pointer text-[12px] font-semibold text-[#4E78FF] select-none">
            Presale figures and notes (optional)
          </summary>
          <div className="mt-4 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={label} htmlFor="raised">
                  Raised to date
                </label>
                <input
                  id="raised"
                  value={presaleRaised}
                  onChange={(e) => setPresaleRaised(e.target.value)}
                  placeholder="$300,000"
                  className={field}
                />
              </div>
              <div>
                <label className={label} htmlFor="stage">
                  Current stage
                </label>
                <input
                  id="stage"
                  value={presaleStage}
                  onChange={(e) => setPresaleStage(e.target.value)}
                  placeholder="Stage 2, nearing allocation limit"
                  className={field}
                />
              </div>
            </div>
            <p className="text-[11px] text-[#F4B740]">
              Left blank, the strategy agent marks these unverified and the
              writer is barred from stating a figure. Published pieces have
              carried four different totals in one week — pin the number here.
            </p>
            <div>
              <label className={label} htmlFor="notes">
                Anything else the agents should know
              </label>
              <textarea
                id="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Compare against Pepeto and AlphaPepe. Avoid mentioning the exchange listing."
                className={field}
              />
            </div>
          </div>
        </details>

        {error && (
          <div className="text-[13px] text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg px-3.5 py-2.5">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full font-semibold text-sm px-4 py-3 rounded-lg bg-[#4E78FF] hover:bg-[#3D63E6] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {busy ? "Starting the pipeline…" : "Run the agents"}
        </button>
      </form>

      <div className="card p-5">
        <div className="text-[11px] uppercase tracking-wider text-[#7F8CA8] mb-3">
          From the content calendar
        </div>
        <div className="space-y-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.title}
              onClick={() => {
                setTitle(ex.title);
                setKeywords(ex.keywords);
                setPublication(ex.publication);
              }}
              className="w-full text-left p-3 rounded-lg bg-[#0D1B2A] border border-[#2A3A52] hover:border-[#4E78FF]/50 transition-colors"
            >
              <div className="text-[12px] font-medium leading-snug">
                {ex.title}
              </div>
              <div className="text-[11px] text-[#7F8CA8] mt-1">
                {PUBLICATIONS[ex.publication].name} · {ex.keywords}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
