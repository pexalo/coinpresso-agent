// ---------------------------------------------------------------------------
// Editorial feedback from the client, as standing instructions.
//
// Liam reviews a draft, writes up what is wrong, and the next draft has to be
// different — without a code change each time. This store holds each point of
// feedback as a rule the writer follows and the reviewer checks, with the
// before/after example where he gave one, because a model imitates a
// demonstrated correction far better than it follows a described one.
//
// Both blog agents read it on every run. The first entries are his review of
// the E-E-A-T piece (2 Sep 2026); later rounds are added on the Style page.
// ---------------------------------------------------------------------------

import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./data-dir";

const DIR = dataDir("feedback");

export interface FeedbackEntry {
  id: string;
  /** Who said it and about which piece — "Liam, E-E-A-T review". */
  source: string;
  date: string;
  /** The instruction, as the writer should read it. */
  rule: string;
  /** A line he marked and the line he wanted instead. */
  before?: string;
  after?: string;
  /** Rules can be retired without being lost. */
  active: boolean;
  addedAt: string;
}

export interface FeedbackLog {
  entries: FeedbackEntry[];
  /**
   * Seed ids someone deleted on purpose. Without this, a new seed shipped in
   * code would be indistinguishable from a deleted one and would come back.
   */
  dismissed?: string[];
  updatedAt: string;
}

/**
 * Liam's review of "E-E-A-T for Crypto Websites in the Age of AI Search",
 * distilled. Seeded in code so a fresh install carries it; the stored file
 * wins once anything has been saved.
 */
export const SEED_FEEDBACK: Omit<FeedbackEntry, "addedAt">[] = [
  {
    id: "liam-no-competitor-links",
    source: "Liam, Crypto PPC Attribution review (19 Sep)",
    date: "2026-09-19",
    rule:
      "Liam: \"We should not be linking competitor agency blogs under any circumstances. Gives them a free backlink. Gives them clout for the intent we are looking to capture.\" Never link, cite or name another crypto marketing, PR, SEO, PPC, analytics or attribution agency or vendor. Cite the platform, the regulator, the data publisher or the trade press instead; if a claim's only source is a rival, the claim goes unmade.",
    active: true,
  },
  {
    id: "liam-keep-readers-in-house",
    source: "Liam, Crypto PPC Attribution review (19 Sep)",
    date: "2026-09-19",
    rule:
      "Liam: \"We want to keep users within our website hierarchy as much as possible as opposed to sending them elsewhere. We can be using contact us page, case studies page, about page, main blog page.\" Internal links carry the piece; an external link exists only where a claim genuinely needs its primary source. The FAQ answers in particular link inward — a service page, an earlier post, the case studies, the contact page — not to vendors.",
    active: true,
  },
  {
    id: "liam-one-link-per-page",
    source: "Liam, Crypto PPC Attribution review (19 Sep)",
    date: "2026-09-19",
    rule:
      "Liam: \"Has also duplicated use of crypto PPC internal link, already been used in the composition.\" Each coinpresso.io page is linked once per post. A page linked in the body is not linked again in the FAQs or the conclusion — pick a different relevant page.",
    active: true,
  },
  {
    id: "liam-relevant-not-adjacent",
    source: "Liam, Crypto PPC Attribution review (19 Sep)",
    date: "2026-09-19",
    rule:
      "Liam, on a conclusion that linked a memecoin-programmatic post and the Web3 PR page from a PPC attribution piece: \"These aren't relevant links to support the piece.\" A link supports the sentence it sits in, or it does not go in. Being in the same pillar is not relevance. The conclusion never introduces a page the body has not already discussed.",
    active: true,
  },
  {
    id: "liam-link-the-relevant-page",
    source: "Liam, internal-linking pointers (19 Sep)",
    date: "2026-09-19",
    rule:
      "Liam: \"there are 100s of pages on Coinpresso.io and we don't need to always look to fit the same 3-4 links into different articles, we should link to relevant pages in line with the article topic.\" Pick the page the sentence is genuinely about — a service page or an older post — rather than reaching for crypto SEO, GEO or PR because they are familiar. A post from two years ago on exactly this subject is a better link than a recent one on a different subject. And the anchor is placed \"naturally, within the composition of the blog where it actually fits — not stuffed onto the end of sentences out of context 'after the fact'.\"",
    active: true,
  },
  {
    id: "liam-mapped-anchors",
    source: "Liam, internal-linking pointers (19 Sep)",
    date: "2026-09-19",
    rule:
      "The anchor phrases Coinpresso wants used, page by page. Home: crypto marketing, crypto marketing agency, crypto advertising agency. Web3 marketing agency: Web3 marketing, Web3 marketing agency. Crypto content: crypto content, crypto copywriting, crypto content writers. Crypto PR: crypto PR, crypto press release distribution, crypto press releases, crypto PR agency. Crypto presale marketing: crypto presale marketing, presale marketing agency. Crypto PPC: crypto PPC, crypto PPC agency, crypto PPC marketing agency, crypto PPC marketing services. Social media: crypto social media management, crypto SMM, SMM for crypto. Use the phrase that reads naturally in the sentence — they are alternatives, not a list to work through.",
    active: true,
  },
  {
    id: "liam-no-bolt-on-links",
    source: "Liam, Circumventing Systems review (Telegram, 18 Sep)",
    date: "2026-09-18",
    rule:
      "Liam: \"irrelevant and stuffing to get links on the end just to fit rules.\" Never bolt a clause onto the end of a sentence or section whose only job is to carry an internal link. If a page is not genuinely what the sentence is about, do not link it there — leave the count short and let the FAQs or a later section carry it where it belongs. A link the reader would not click is worse than no link.",
    before:
      "…the account was being treated as a growth lever rather than a compliance surface, the same discipline we'd expect a project to bring to crypto SEO or PR.",
    after:
      "…the account was being treated as a growth lever rather than a compliance surface.",
    active: true,
  },
  {
    id: "liam-faq-links",
    source: "Liam, September batch (FAQ review)",
    date: "2026-09-18",
    rule:
      "Liam: \"we should also get some internal links in the FAQ as well — looks like none is on the FAQ.\" And on the next draft, which cited three vendors in the FAQs instead: \"we want to keep users within our website hierarchy.\" So the FAQ links point inward — a service page, an earlier post, the case studies, the contact page — one or two across the block, never to a page the body already linked, and an external citation only where an answer states a figure that needs its source.",
    active: true,
  },
  {
    id: "liam-what-good-looks-like",
    source: "Liam, September batch (the piece he approved)",
    date: "2026-09-09",
    rule:
      "What he praised, in his own words, on the only piece he passed without changes: 'Readability is there, it has a lot of good takeaways that can be implemented for free while also showcasing our expertise in this realm. Internal linking is really solid. Like the structure, flow, tone of voice. It reads pretty closely to my own writing style.' Two things to take from that. Give the reader things they can act on for free, and let the expertise show through the specificity of the advice rather than through claims about the agency.",
    active: true,
  },
  {
    id: "liam-link-in-the-opening",
    source: "Liam, September batch (his own edit)",
    date: "2026-09-09",
    rule:
      "An internal link belongs in the opening paragraph where a natural phrase carries one. He said 'internal linking is really solid, added one opportunity missed' and then added a Web3 marketing link to the first sentence himself. Scan the intro for the service phrase the piece already uses and link it there, rather than saving every internal link for the body.",
    before: "There is a belief doing the rounds in Web3 marketing that if you rank well enough on Google…",
    after: "There is a belief doing the rounds in [Web3 marketing](https://coinpresso.io/web3-marketing-agency) that if you rank well enough on Google…",
    active: true,
  },
  // ---- Round 5: the September batch. Four of five cleared to publish; the
  // E-E-A-T piece sent back. Every rule below is his wording, and each has a
  // matching check in writer.ts so it costs a rejection rather than a reviewer
  // noticing it later.
  {
    id: "liam-structure-paragraphs",
    source: "Liam, September batch (E-E-A-T and DeFi)",
    date: "2026-09-09",
    rule:
      "Keep paragraphs to two to four sentences. He said the agent 'seemed to forget structure and use of line breaks/new paragraphs' and that 'there are lots of big sections of text here which need to be broken up better'. He then went through three approved drafts and split the long paragraphs by hand — every one he split was over 125 words, and nothing under that was touched. Break at the turn in the argument, not mid-thought.",
    before:
      "What matters inside the block is specificity. operatingSystem and applicationCategory are the properties an engine uses to disambiguate… There is no dedicated schema property for 'audited by', so the working pattern is a review or citation pointing at the published audit, plus the audit firm named in author or publisher on that nested entity. It is a workaround, and it is the best one available until the vocabulary catches up.",
    after:
      "…plus the audit firm named in author or publisher on that nested entity.\n\nIt is a workaround, and it is the best one available until the vocabulary catches up.",
    active: true,
  },
  {
    id: "liam-anchor-length",
    source: "Liam, September batch (E-E-A-T)",
    date: "2026-09-09",
    rule:
      "Anchor text is the phrase a reader would click, not the whole claim. He flagged 'a lot of really long external links taking up whole sentences'. Cap anchors at about a dozen words and leave the rest of the sentence outside the link.",
    before:
      "[BrightEdge has tracked AI agent requests reaching 88% of human organic search volume as of April 2026](url)",
    after:
      "[BrightEdge has tracked AI agent requests](url) reaching 88% of human organic search volume as of April 2026",
    active: true,
  },
  {
    id: "liam-link-scatter",
    source: "Liam, September batch (E-E-A-T)",
    date: "2026-09-09",
    rule:
      "Scatter links through the piece rather than clustering them. His note: 'a lot of links stuffed into a small body of text. Links need to be naturally placed throughout, both internal and external.' Two links inside the same sentence or a dozen words apart is stuffing.",
    active: true,
  },
  {
    id: "liam-sentence-variety",
    source: "Liam, September batch (comparison pages)",
    date: "2026-09-09",
    rule:
      "Vary sentence length. He warned that the short punchy style, pushed too far, 'can go too far and come off as word salad' — and in the same breath warned against overcorrecting: 'don't wanna make it start writing encyclopaedias for one sentence, but there is a middle ground'. Never run more than about four short sentences together without a longer one carrying the argument.",
    active: true,
  },
  {
    id: "liam-render-what-you-promise",
    source: "Liam, September batch (DeFi and Schema)",
    date: "2026-09-09",
    rule:
      "If the prose says 'in a table' or calls something a checklist, render a real markdown table or list. He raised this twice in one round: 'We are referencing a table here but haven't formatted as a table?' and 'Referenced a checklist here. Should also be in a checklist format of which can then be crawled/parsed by AIs as a result and get us more mentions.' These posts argue that engines lift structured facts and skip prose claims, so describing a table in a paragraph fails the post's own advice in public.",
    active: true,
  },
  {
    id: "liam-american-spelling",
    source: "Liam, September batch (inline edits)",
    date: "2026-09-09",
    rule:
      "House spelling is American: centralized, recognize, optimization, analyze, behavior. He changed these by hand in the drafts rather than commenting on them.",
    before: "a centralised exchange engines recognise",
    after: "a centralized exchange engines recognize",
    active: true,
  },
  {
    id: "liam-structural-exemplar",
    source: "Liam, September batch (verdicts)",
    date: "2026-09-09",
    rule:
      "\"Why ChatGPT and Perplexity Don't Cite Crypto Brands\" is the structural exemplar. His words: 'The structure in that piece was perfect and should be what the agent follows. Readable, bite-sized paragraphs with naturally scattered links throughout.' When a structural choice is uncertain, match that piece.",
    active: true,
  },
  {
    id: "liam-eeat-voice",
    source: "Liam, E-E-A-T review",
    date: "2026-09-02",
    rule:
      "Write in the Coinpresso voice: bold, sometimes borderline hyperbolic statements that make the reader pay attention — Jeremy Clarkson's charisma transposed to crypto content. Where a safe line and a bold line say the same thing, take the bold one. Prose must read as native-English, expert-level and unmistakably human.",
    before: "E-E-A-T hasn't died, but its job has changed.",
    after: "E-E-A-T hasn't died, but it's undergone major surgery on most of its internal organs.",
    active: true,
  },
  {
    id: "liam-eeat-impact",
    source: "Liam, E-E-A-T review",
    date: "2026-09-02",
    rule:
      "When the underlying point is right but flat, add impact — a concrete image or a blunt qualifier — rather than another clause of qualification.",
    before: "Experience means the product has real on-chain usage.",
    after: "Experience, for a crypto product, means on-chain proof the thing is actually used — not a fugazzi whitepaper concept, actual use.",
    active: true,
  },
  {
    id: "liam-eeat-connectives",
    source: "Liam, E-E-A-T review",
    date: "2026-09-02",
    rule:
      "Connecting words are the clearest AI tell. Never open a sentence with \"Separately\", \"Furthermore\", \"Additionally\" or \"Moreover\". Join two facts the way a person making a point would: say what they mean together.",
    before: "Separately, a related analysis found that ranking first on Google only correlates with getting cited by an AI engine around 22% of the time.",
    after: "It doesn't stop there. A related analysis found that ranking first on Google only correlates with getting cited by an AI engine around 22% of the time. Read together, those two figures say something founders continue to be blind to: you can win the search results page and still be utterly invisible in the answer.",
    active: true,
  },
  {
    id: "liam-eeat-intro",
    source: "Liam, E-E-A-T review",
    date: "2026-09-01",
    rule:
      "Open with one to two paragraphs before the first H2 that set the scene: name a problem the reader recognises straight away, then say what the piece will give them. Do not go straight into section one.",
    active: true,
  },
  {
    id: "liam-eeat-links",
    source: "Liam, E-E-A-T review",
    date: "2026-09-02",
    rule:
      "Per post: 3-5 internal links to Coinpresso landing pages and posts, woven in where the topic arises with anchor text naming the topic (\"crypto SEO\" links to the crypto SEO page), never bunched into the conclusion. 3-5 external links that substantiate specific claims.",
    active: true,
  },
  {
    id: "liam-eeat-citations",
    source: "Liam, E-E-A-T review",
    date: "2026-09-02",
    rule:
      "The sourcing is strong — keep it — but spread citations through the piece. Several in consecutive sentences read as a citation dump.",
    active: true,
  },
  {
    id: "liam-eeat-web3-vocab",
    source: "Liam, E-E-A-T review (second pass)",
    date: "2026-09-03",
    rule:
      "Use Web3-native vocabulary. Web2 and e-commerce agency terms sound like a different industry — \"named consultancy\" is not a Web3 term. Say what a crypto founder would say: a named team, a protocol, a project, a launch.",
    before: "a named consultancy",
    active: true,
  },
  {
    id: "liam-eeat-newest-post",
    source: "Liam, E-E-A-T review (second pass)",
    date: "2026-09-03",
    rule:
      "When linking a Coinpresso post, link the most recent one on that topic and name it for what it is. The GEO guide from a few weeks ago is \"the crypto GEO guide\" — never send the reader to a years-old SEO guide when a newer, more relevant post exists.",
    before: "our existing crypto SEO guide",
    after: "our crypto GEO guide",
    active: true,
  },
  {
    id: "liam-eeat-links-in-body",
    source: "Liam, E-E-A-T review (second pass)",
    date: "2026-09-03",
    rule:
      "Internal links go where the topic comes up, in the body. A cluster of them at the end reads as \"stuffed on after the fact\" even when the anchor text is right.",
    active: true,
  },
];

function fileFor(clientRef: string): string {
  return path.join(DIR, `${clientRef}.json`);
}

function seeded(): FeedbackLog {
  const now = new Date().toISOString();
  return {
    entries: SEED_FEEDBACK.map((e) => ({ ...e, addedAt: now })),
    updatedAt: "",
  };
}

/**
 * Stored log, plus any seed shipped since it was last written.
 *
 * The client's feedback arrives in rounds and each round adds seeds in code.
 * An install that has already saved the file must still pick the new ones
 * up — merged by id, so a seed that was edited or deleted stays as it is.
 */
export async function readFeedback(clientRef: string): Promise<FeedbackLog> {
  try {
    const raw = await fs.readFile(fileFor(clientRef), "utf8");
    const parsed = JSON.parse(raw) as Partial<FeedbackLog>;
    const entries = dedupe(parsed.entries ?? []);
    const known = new Set([...entries.map((e) => e.id), ...(parsed.dismissed ?? [])]);
    const now = new Date().toISOString();
    for (const seed of SEED_FEEDBACK) {
      if (!known.has(seed.id)) entries.push({ ...seed, addedAt: now });
    }
    return { entries, dismissed: parsed.dismissed ?? [], updatedAt: parsed.updatedAt ?? "" };
  } catch {
    return seeded();
  }
}

async function write(clientRef: string, log: FeedbackLog): Promise<FeedbackLog> {
  await fs.mkdir(DIR, { recursive: true });
  const next = { ...log, updatedAt: new Date().toISOString() };
  await fs.writeFile(fileFor(clientRef), JSON.stringify(next, null, 2));
  return next;
}

/** Same words, same rule. Case and whitespace do not make a second one. */
export function ruleKey(rule: string): string {
  return rule.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Drop entries that repeat an earlier one word for word.
 *
 * The fix box under a rejection could save a note as a house rule, and each
 * retry saved it again: one run put the same "scatter the links" rule into
 * the store four times, and every one of them went into every prompt. The
 * seeds — Liam's actual words — are never touched by this: each has a unique
 * id and unique text, and this keeps the FIRST of any duplicate pair, which
 * for a seed is the seed.
 */
export function dedupe(entries: FeedbackEntry[]): FeedbackEntry[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    const k = ruleKey(e.rule);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function addFeedback(
  clientRef: string,
  entry: Pick<FeedbackEntry, "source" | "rule"> & Partial<Pick<FeedbackEntry, "date" | "before" | "after">>
): Promise<FeedbackLog> {
  const log = await readFeedback(clientRef);
  // Already a rule, in the same words: nothing to add. Returning the log
  // unchanged rather than throwing, because the caller is usually saving
  // several notes at once and one repeat should not fail the rest.
  if (log.entries.some((e) => ruleKey(e.rule) === ruleKey(entry.rule))) return log;
  const now = new Date().toISOString();
  log.entries.push({
    id: `fb-${Date.now().toString(36)}`,
    source: entry.source.trim() || "Client",
    date: entry.date?.trim() || now.slice(0, 10),
    rule: entry.rule.trim(),
    before: entry.before?.trim() || undefined,
    after: entry.after?.trim() || undefined,
    active: true,
    addedAt: now,
  });
  return write(clientRef, log);
}

export async function setFeedbackActive(
  clientRef: string,
  id: string,
  active: boolean
): Promise<FeedbackLog> {
  const log = await readFeedback(clientRef);
  const e = log.entries.find((x) => x.id === id);
  if (e) e.active = active;
  return write(clientRef, log);
}

export async function removeFeedback(clientRef: string, id: string): Promise<FeedbackLog> {
  const log = await readFeedback(clientRef);
  log.entries = log.entries.filter((x) => x.id !== id);
  if (SEED_FEEDBACK.some((sd) => sd.id === id)) {
    log.dismissed = [...new Set([...(log.dismissed ?? []), id])];
  }
  return write(clientRef, log);
}

/**
 * The prompt block. One shape for both agents: the writer reads it as
 * instructions, the reviewer as the checklist — and a point the client has
 * already made once is a MAJOR finding the second time.
 */
export function feedbackBlock(log: FeedbackLog, audience: "writer" | "reviewer"): string {
  const live = log.entries.filter((e) => e.active);
  if (!live.length) return "";
  const lines = live.map((e, i) => {
    const ex =
      e.before && e.after
        ? `\n   Not this: "${e.before}"\n   This: "${e.after}"`
        : e.after
          ? `\n   For example: "${e.after}"`
          : e.before
            ? `\n   Not this: "${e.before}"`
            : "";
    return `${i + 1}. ${e.rule} (${e.source}, ${e.date})${ex}`;
  });
  const head =
    audience === "writer"
      ? `WHAT THE CLIENT HAS ALREADY CORRECTED — each of these was flagged on a
previous draft. A draft that repeats one goes back for revision.`
      : `WHAT THE CLIENT HAS ALREADY CORRECTED — check the draft against every
point. Any repeat is a MAJOR finding, categorised "style", quoting the text.`;
  return `${head}\n\n${lines.join("\n")}`;
}
