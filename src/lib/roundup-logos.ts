// ---------------------------------------------------------------------------
// Real logos for a roundup's featured image.
//
// Liam, 29 Sep: "for listicle featured images, it should have logos for the
// companies within the listicle to make it more relevant."
//
// These are the companies' REAL marks, fetched from their own sites and
// composited onto the image — never drawn by the image model. An image model
// asked for a brand logo invents a lookalike, and a lookalike of a rival's
// mark on our own blog is worse than no mark at all.
// ---------------------------------------------------------------------------

import { COMPETITOR_DOMAINS, isCompetitorRoundup } from "./blog";
import { roundupEntries } from "./agents/writer";
import type { Run } from "./types";

export interface LogoEntry {
  name: string;
  /** The company's own domain. Empty when it could not be worked out. */
  domain: string;
  /** Coinpresso's own logo comes from the app, not the web. */
  ours: boolean;
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** "1. Coinpresso: The Premier Web3 GEO Agency" → "Coinpresso". */
export function entryName(heading: string): string {
  return heading
    .replace(/^#?\s*\d+[.):]?\s*/, "")
    .split(/\s*[:—–|]\s*|\s+-\s+/)[0]
    .replace(/\*\*/g, "")
    .trim();
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Best guess at a company's domain: the research ledger first, then the rival list. */
export function guessDomain(name: string, sources: Array<{ url: string; publisher?: string }>): string {
  const key = squash(name);
  if (!key) return "";
  for (const s of sources) {
    const host = hostOf(s.url);
    const label = squash(host.split(".")[0] ?? "");
    if (label && (label === key || label.startsWith(key) || key.startsWith(label))) return host;
    if (s.publisher && squash(s.publisher) === key && host) return host;
  }
  const hit = COMPETITOR_DOMAINS.find((d) => squash(d.split(".")[0]) === key);
  return hit ?? "";
}

export function roundupLogos(run: Run): { roundup: boolean; entries: LogoEntry[] } {
  // Only a roundup of competitors gets logos. Any other post — including a
  // roundup of YouTube channels or news outlets — carries none.
  const roundup = isCompetitorRoundup(run.brief.title, run.brief.contentType);
  if (!roundup || !run.draft) return { roundup: false, entries: [] };
  const sources = run.research?.sources ?? [];
  const entries = roundupEntries(run.draft.body)
    .map((e) => entryName(e.name))
    .filter(Boolean)
    .slice(0, 7)
    .map((name) => {
      const ours = /coinpresso/i.test(name);
      return { name, ours, domain: ours ? "coinpresso.io" : guessDomain(name, sources) };
    });
  // Ours is always first, whatever order the draft put the entries in.
  entries.sort((a, b) => Number(b.ours) - Number(a.ours));
  // No rivals among the entries → nothing to show beside our own mark.
  if (!entries.some((e) => !e.ours)) return { roundup: false, entries: [] };
  return { roundup, entries };
}

/** A domain we are willing to fetch a logo for: a plain hostname, nothing else. */
export function safeDomain(d: string): string | null {
  const h = d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h) && h.length < 100 ? h : null;
}

/** Likely homes for a company with no domain on record, most likely first. */
export function domainCandidates(name: string): string[] {
  const words = name.toLowerCase().replace(/\.(io|com|co|xyz|agency)$/, "").split(/[^a-z0-9]+/).filter(Boolean);
  if (!words.length) return [];
  // A name that already is a domain ("CryptoSEO.io") is tried as written.
  const asWritten = safeDomain(name);
  const joined = words.join("");
  const dashed = words.join("-");
  const tlds = ["com", "io", "co", "agency", "xyz"];
  const out = [asWritten, ...tlds.map((t) => `${joined}.${t}`), ...(dashed !== joined ? [`${dashed}.com`] : [])];
  return [...new Set(out.filter(Boolean) as string[])].slice(0, 7);
}
