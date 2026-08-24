"use client";

import { useState } from "react";
import type { DailyReport } from "@/lib/daily-report";

const money = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 1 : 2)}k` : `$${n}`;

/**
 * Daily revenue. One series, so no legend box — the title names it. The single
 * wallet is shown as a separate segment inside the 20 Aug bar with a 2px surface
 * gap, because the whole point of the report is that the day is not repeatable
 * once that deposit is removed.
 */
export function DailyRevenueChart({
  data,
}: {
  data: DailyReport["dailyRevenue"];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.total), 1);
  const H = 150;
  const scale = (v: number) => (v / max) * H;

  return (
    <div>
      <div className="flex items-end gap-2 sm:gap-4" style={{ height: H + 26 }}>
        {data.map((d, i) => {
          const organic = d.total - (d.singleWallet ?? 0);
          const isHover = hover === i;
          return (
            <div
              key={d.day}
              className="flex-1 flex flex-col justify-end items-center relative"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {d.label && (
                <span
                  className={`text-[10px] mb-1 whitespace-nowrap ${
                    d.singleWallet ? "text-[var(--ink)] font-semibold" : "text-[var(--ink-3)]"
                  }`}
                >
                  {d.label}
                </span>
              )}

              {d.singleWallet ? (
                <div
                  className="w-full flex flex-col justify-end"
                  style={{ height: scale(d.total) }}
                >
                  <div
                    title={`Single wallet ${money(d.singleWallet)}`}
                    style={{
                      height: scale(d.singleWallet) - 2,
                      background: "#5F5A34",
                      borderTopLeftRadius: 4,
                      borderTopRightRadius: 4,
                      marginBottom: 2,
                      opacity: isHover ? 1 : 0.92,
                    }}
                  />
                  <div
                    title={`Rest of day ${money(organic)}`}
                    style={{
                      height: Math.max(scale(organic), 2),
                      background: "#967D28",
                      opacity: isHover ? 1 : 0.92,
                    }}
                  />
                </div>
              ) : (
                <div
                  className="w-full"
                  style={{
                    height: Math.max(scale(d.total), d.total > 0 ? 3 : 1),
                    background: d.total > 0 ? "#967D28" : "var(--line)",
                    borderRadius: 4,
                    opacity: isHover ? 1 : 0.92,
                  }}
                />
              )}

              <span className="text-[10px] text-[var(--ink-4)] mt-1.5">{d.day}</span>

              {isHover && d.total > 0 && (
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full z-10 whitespace-nowrap rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-[10.5px] shadow-xl">
                  <div className="text-[var(--ink)] font-semibold">
                    {money(d.total)} total
                  </div>
                  {d.singleWallet && (
                    <>
                      <div className="text-[var(--ink-2)]">
                        {money(d.singleWallet)} one wallet
                      </div>
                      <div className="text-[var(--ink-2)]">
                        {money(organic)} everything else
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-4 mt-3 text-[10px] text-[var(--ink-3)]">
        <span className="flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-sm"
            style={{ background: "#967D28" }}
          />
          Deposits
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-sm"
            style={{ background: "#5F5A34" }}
          />
          Single wallet
        </span>
      </div>
    </div>
  );
}

/** Two series, one axis, direct-labelled — the gap is the whole message. */
export function SpendVsRevenueChart({
  series,
}: {
  series: Array<{ name: string; value: number; colour: string }>;
}) {
  const max = Math.max(...series.map((s) => s.value), 1);

  return (
    <div className="space-y-4">
      {series.map((s) => (
        <div key={s.name}>
          <div className="flex justify-between items-baseline mb-1.5">
            <span className="text-[11px] text-[var(--ink-2)] flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-sm"
                style={{ background: s.colour }}
              />
              {s.name}
            </span>
            <span className="text-[12px] font-semibold text-[var(--ink)]">
              ${s.value.toLocaleString()}
            </span>
          </div>
          <div className="h-3 rounded bg-[var(--bg)] overflow-hidden">
            <div
              className="h-full rounded"
              style={{
                width: `${(s.value / max) * 100}%`,
                background: s.colour,
              }}
            />
          </div>
        </div>
      ))}
      <div className="pt-1 text-[11px] text-[var(--ink-2)]">
        Net{" "}
        <span className="text-[var(--danger)] font-semibold">
          −${(series[0].value - series[1].value).toLocaleString()}
        </span>{" "}
        over the period.
      </div>
    </div>
  );
}
