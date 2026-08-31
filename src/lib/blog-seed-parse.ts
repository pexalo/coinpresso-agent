// ---------------------------------------------------------------------------
// Turning a pasted block or an uploaded file into seed topics.
//
// Split from the store so the browser can parse and PREVIEW before anything is
// sent — fifty rows is exactly the size where a separator guessed wrong should
// be visible on screen rather than discovered afterwards in the queue. Keeping
// it out of the store module also keeps node:fs out of the client bundle.
// ---------------------------------------------------------------------------

import type { NewSeedTopic } from "./blog-seed";

export interface ParsedSeeds {
  rows: NewSeedTopic[];
  /** Lines that produced nothing, with the reason, so nothing vanishes quietly. */
  skipped: Array<{ line: number; text: string; why: string }>;
}

const HEADER_WORDS = /^(topic|title|subject|idea)\b/i;

/** One http(s) URL and nothing else. */
const LONE_URL = /^https?:\/\/\S+$/i;

function splitKeywords(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;]+/)
    .map((k) => k.trim())
    .filter(Boolean);
}

function urlField(raw: string | undefined): string | undefined {
  const v = raw?.trim();
  return v && LONE_URL.test(v) ? v : undefined;
}

/**
 * Columns are: topic, keywords, notes, pillar, reference doc, link target.
 * Extra columns are ignored rather than concatenated into notes — a spreadsheet
 * usually has a status or owner column nobody meant to send, and appending it to
 * the brief would put it in front of the writer.
 *
 * ONE CORRECTION IS APPLIED. A content calendar is very often two columns —
 * topic, and a link to the brief for it — and positionally that URL is a
 * keyword. So a keywords cell that is a bare URL and nothing else is read as the
 * reference doc instead. A URL is never a keyword, and the alternative is a
 * queue of fifty topics each targeting "https://docs.google.com/…" as its search
 * term, which is silent and survives all the way into a published post.
 */
export function parseSeedText(raw: string): ParsedSeeds {
  const rows: NewSeedTopic[] = [];
  const skipped: ParsedSeeds["skipped"] = [];
  const seen = new Set<string>();

  raw.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;

    // Split the RAW line, not a trimmed one. Trimming first eats a leading tab
    // or pipe, which is how a row with an empty topic column arrives — and the
    // second column then slides into first position, so a stray keyword cell
    // becomes a topic. Fields are trimmed individually below instead.
    const fields = (
      line.includes("\t")
        ? line.split("\t")
        : line.includes("|")
          ? line.split("|")
          : [line]
    ).map((f) => f.trim());

    const text = line.trim();

    const topic = fields[0] ?? "";
    if (!topic) {
      skipped.push({ line: i + 1, text, why: "no topic in the first column" });
      return;
    }

    // A header row only when it is the FIRST line. "Topic clusters we should
    // own" further down is a real topic, and dropping it because it starts with
    // the word topic would be worse than the header slipping through once.
    if (i === 0 && HEADER_WORDS.test(topic) && topic.split(/\s+/).length <= 2) {
      skipped.push({ line: 1, text, why: "looks like a header row" });
      return;
    }

    const key = topic.toLowerCase();
    if (seen.has(key)) {
      skipped.push({ line: i + 1, text, why: "duplicate of an earlier line" });
      return;
    }
    seen.add(key);

    const keywordCell = fields[1];
    const keywordsAreAUrl = urlField(keywordCell);

    rows.push({
      topic,
      keywords: keywordsAreAUrl ? [] : splitKeywords(keywordCell),
      notes: fields[2] || undefined,
      pillar: fields[3] || undefined,
      referenceUrl: urlField(fields[4]) ?? keywordsAreAUrl,
      linkTarget: urlField(fields[5]),
    });
  });

  return { rows, skipped };
}

/**
 * A CSV reader that handles quoted fields, embedded commas and doubled quotes.
 *
 * Worth the thirty lines: the whole reason commas are not guessed at above is
 * that quoting is what makes them unambiguous, and a naive split would corrupt
 * exactly the rows that carry the most keywords.
 */
export function parseCsv(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];

    if (quoted) {
      if (c === '"') {
        if (raw[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((f) => f.trim()));
}

/** A .csv file, mapped by header names where present and by position otherwise. */
export function parseSeedCsv(raw: string): ParsedSeeds {
  const table = parseCsv(raw);
  if (!table.length) return { rows: [], skipped: [] };

  const head = table[0].map((h) => h.trim().toLowerCase());
  const named =
    head.some((h) => /^(topic|title|subject|idea)$/.test(h)) &&
    head.some((h) => /keyword/.test(h));

  const at = (name: RegExp, fallback: number) => {
    const i = head.findIndex((h) => name.test(h));
    return i === -1 ? fallback : i;
  };

  const cols = named
    ? {
        topic: at(/^(topic|title|subject|idea)$/, 0),
        keywords: at(/keyword/, 1),
        notes: at(/note|detail|context/, 2),
        pillar: at(/pillar|category|cluster/, 3),
        reference: at(/reference|recommendation|brief|doc/, 4),
        linkTarget: at(/link ?to|link target|destination/, 5),
      }
    : { topic: 0, keywords: 1, notes: 2, pillar: 3, reference: 4, linkTarget: 5 };

  const body = named ? table.slice(1) : table;
  // Re-serialised into the tab format so both entry paths converge on one
  // parser, and one set of skip reasons.
  //
  // NEWLINES INSIDE A FIELD ARE FLATTENED FIRST. parseCsv correctly keeps a
  // quoted multi-line notes cell as one field; joining rows with "\n" and
  // handing that to a line-based parser then tears it back apart, and the
  // fragment after the break becomes a phantom topic with no keywords — a row
  // nobody typed, in a queue nobody re-reads, flagged as nothing.
  const asText = body
    .map((r) =>
      [
        r[cols.topic] ?? "",
        r[cols.keywords] ?? "",
        r[cols.notes] ?? "",
        r[cols.pillar] ?? "",
        r[cols.reference] ?? "",
        r[cols.linkTarget] ?? "",
      ]
        .map((f) => f.replace(/[\t\r\n]+/g, " ").trim())
        .join("\t")
    )
    .join("\n");

  return parseSeedText(asText);
}
