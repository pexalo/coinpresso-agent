// ---------------------------------------------------------------------------
// Link and claim verification. Deliberately NOT a model.
//
// This is the highest-value guardrail in the pipeline and it must not be
// probabilistic. A model asked "did you make this URL up?" will sometimes say no.
// String comparison against the research ledger, plus an actual HTTP request,
// cannot be talked round.
//
// Hallucinated citations are the specific failure mode that would embarrass this
// programme on a wire, because they look exactly like real ones until clicked.
// ---------------------------------------------------------------------------

import type { Draft, LinkCheckResult, ResearchBrief } from "../types";

/**
 * Domains a piece may link without a ledger entry — its own property, in other
 * words. On the wire track that is the campaign's site; on the blog track it is
 * Coinpresso's own domain, where internal cluster links are the entire point.
 */
const ALWAYS_ALLOWED = ["moonberg.com"];
const BLOG_ALLOWED = ["coinpresso.io"];

const URL_RE = /https?:\/\/[^\s)<>\]"'`]+/g;

function normalise(u: string): string {
  try {
    const url = new URL(u.replace(/[.,;:]+$/, ""));
    // Tracking parameters have leaked into drafts before. Strip them so a link
    // that differs only by utm_source still matches its ledger entry.
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach(
      (p) => url.searchParams.delete(p)
    );
    url.hash = "";
    let s = url.toString();
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s.toLowerCase();
  } catch {
    return u.trim().toLowerCase();
  }
}

function hostOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function extractUrls(draft: Draft): string[] {
  const haystack = [
    draft.body,
    ...draft.faqs.map((f) => `${f.q} ${f.a}`),
  ].join("\n");
  const found = haystack.match(URL_RE) || [];
  return [...new Set(found.map((u) => u.replace(/[.,;:]+$/, "")))];
}

async function head(url: string, timeoutMs = 8000): Promise<number | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // Some publishers reject HEAD. Fall back to a ranged GET before failing.
    let res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; PexaloLinkCheck/1.0)" },
    });
    if (res.status === 405 || res.status === 403 || res.status === 501) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: ctrl.signal,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; PexaloLinkCheck/1.0)",
          range: "bytes=0-2048",
        },
      });
    }
    return res.status;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function runLinkCheck(
  draft: Draft,
  research: ResearchBrief,
  opts: { verifyReachable?: boolean; track?: "wire" | "blog" } = {}
): Promise<LinkCheckResult> {
  const ledger = new Set(research.sources.map((s) => normalise(s.url)));
  const urls = extractUrls(draft);
  const allowed =
    opts.track === "blog" ? BLOG_ALLOWED : ALWAYS_ALLOWED;

  const unsourced: string[] = [];
  for (const u of urls) {
    const host = hostOf(u);
    if (allowed.some((d) => host === d || host.endsWith(`.${d}`))) continue;
    if (!ledger.has(normalise(u))) unsourced.push(u);
  }

  const unreachable: Array<{ url: string; status: number | null }> = [];
  if (opts.verifyReachable !== false) {
    const results = await Promise.all(
      urls.map(async (u) => ({ url: u, status: await head(u) }))
    );
    for (const r of results) {
      if (r.status === null || r.status >= 400) {
        unreachable.push(r);
      }
    }
  }

  return {
    unsourced,
    unreachable,
    checked: urls.length,
    passed: unsourced.length === 0 && unreachable.length === 0,
  };
}
