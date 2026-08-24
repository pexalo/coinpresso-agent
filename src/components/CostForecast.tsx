"use client";

import { useState } from "react";
import { forecast, MIN_SAMPLE, usd, type CostReport } from "@/lib/costs";

/**
 * The forecast panel.
 *
 * The cadence is a control rather than a constant because the only interesting
 * question here is a what-if: five wire releases a day and eight blog posts is a
 * different business from two and three, and the difference is the whole
 * argument for or against running this.
 *
 * Each line says whether it rests on measured runs or on modelled token counts.
 * An average over two articles is a guess with a decimal point on it.
 */
export default function CostForecast({ report }: { report: CostReport }) {
  const [wirePerDay, setWire] = useState(4);
  const [blogPerDay, setBlog] = useState(6);

  const rows = forecast(report, { wirePerDay, blogPerDay });
  const monthly = rows.reduce((a, r) => a + r.perMonthUsd, 0);
  const daily = rows.reduce((a, r) => a + r.perDayUsd, 0);
  const anyMeasured = rows.some((r) => r.basis === "measured");

  const LABEL: Record<string, string> = {
    wire: "Crypto PR — wire releases",
    blog: "Coinpresso blog posts",
  };

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--line)]">
        <h2 className="font-bold text-sm">What a cadence costs</h2>
        <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
          Model spend only — wire distribution fees, staff time and tooling are
          not in these numbers.
        </p>
      </div>

      <div className="px-5 py-4 grid sm:grid-cols-2 gap-5 border-b border-[var(--line)]">
        {[
          {
            label: "Wire releases per day",
            value: wirePerDay,
            set: setWire,
            max: 12,
          },
          {
            label: "Blog posts per day",
            value: blogPerDay,
            set: setBlog,
            max: 12,
          },
        ].map((c) => (
          <div key={c.label}>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] uppercase tracking-wider text-[var(--ink-3)]">
                {c.label}
              </span>
              <span className="text-[13px] font-bold tabular-nums">
                {c.value}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={c.max}
              step={1}
              value={c.value}
              onChange={(e) => c.set(Number(e.target.value))}
              className="w-full mt-2 accent-[var(--accent)]"
            />
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11.5px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] border-b border-[var(--line)]">
              <th className="text-left font-medium px-5 py-2.5">Track</th>
              <th className="text-right font-medium px-3 py-2.5">Per piece</th>
              <th className="text-right font-medium px-3 py-2.5">Per day</th>
              <th className="text-right font-medium px-3 py-2.5">
                Per month
              </th>
              <th className="text-left font-medium px-5 py-2.5">Basis</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {rows.map((r) => (
              <tr key={r.track}>
                <td className="px-5 py-3 font-medium">{LABEL[r.track]}</td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {usd(r.perArticleUsd)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-[var(--ink-2)]">
                  {usd(r.perDayUsd)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums font-semibold">
                  {usd(r.perMonthUsd)}
                </td>
                <td className="px-5 py-3">
                  {r.basis === "measured" ? (
                    <span className="text-[var(--success)]">
                      measured over {r.sampleSize} runs
                    </span>
                  ) : (
                    <span className="text-[var(--warning)]">
                      modelled
                      {r.sampleSize > 0
                        ? ` — only ${r.sampleSize} real run${r.sampleSize === 1 ? "" : "s"}, ${MIN_SAMPLE} needed`
                        : " — no real runs yet"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-[var(--line)] bg-[var(--surface-2)]">
              <td className="px-5 py-3 font-bold">Combined</td>
              <td className="px-3 py-3" />
              <td className="px-3 py-3 text-right tabular-nums font-semibold">
                {usd(daily)}
              </td>
              <td className="px-3 py-3 text-right tabular-nums font-extrabold text-[var(--accent)]">
                {usd(monthly)}
              </td>
              <td className="px-5 py-3 text-[10.5px] text-[var(--ink-3)]">
                30-day month
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="px-5 py-3.5 text-[11px] text-[var(--ink-3)] leading-relaxed border-t border-[var(--line)]">
        {anyMeasured
          ? "Measured lines come from this client's own completed runs, mock runs excluded. Modelled lines use the prompt sizes in this system against published token prices — the right order of magnitude and no better."
          : "Every line here is modelled: prompt sizes in this system against published token prices. It is the right order of magnitude and no better. Once five real runs exist on a track, that line switches to this client's own measured average."}{" "}
        The revision loop is the main source of variance — a draft that passes
        first time costs roughly a fifth less than one sent back twice.
      </p>
    </div>
  );
}
