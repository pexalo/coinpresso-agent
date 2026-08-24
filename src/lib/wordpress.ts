// ---------------------------------------------------------------------------
// WordPress integration for coinpresso.io.
//
// Two directions, and they matter for different reasons.
//
// PULL is the more valuable one, and its purpose is STYLE. Coinpresso have been
// publishing on their own domain for years, and until now the writer had no idea
// what that sounds like — the exemplar block was empty, so the blog voice was
// assembled from a description of a voice rather than from the voice itself.
// Importing the live blog fixes that. The posts are examples of how they write,
// not a canon of what may be written about.
//
// PUSH is deliberately the smaller half. Approved posts are created as WordPress
// DRAFTS and never anything else. There is no status parameter threaded through
// this file, no config flag, and no override — the constant below is the only
// value ever sent. An agency's own domain is the asset it sells against, and the
// failure mode of an automated publish is not a bad post, it is a bad post
// nobody knew was live.
//
// Auth is a WordPress Application Password over Basic. It is scoped to one user,
// revocable from wp-admin without touching the real password, and it never
// leaves the server — the settings layer masks it on every read.
// ---------------------------------------------------------------------------

import { renderHtml } from "./render";
import type { Run } from "./types";

/** The only status this module will ever create. Not configurable, on purpose. */
const CREATE_STATUS = "draft" as const;

export interface WpConfig {
  siteUrl: string;
  username: string;
  appPassword: string;
}

export interface WpPost {
  id: number;
  date: string;
  slug: string;
  link: string;
  status: string;
  title: string;
  /** Rendered HTML, converted to text by `textFromHtml`. */
  html: string;
  excerpt: string;
  categories: number[];
  tags: number[];
}

export interface WpCategory {
  id: number;
  name: string;
  slug: string;
  count: number;
}

function base(cfg: Pick<WpConfig, "siteUrl">): string {
  return `${cfg.siteUrl.replace(/\/+$/, "")}/wp-json/wp/v2`;
}

function authHeader(cfg: WpConfig): Record<string, string> {
  if (!cfg.username || !cfg.appPassword) return {};
  // Application passwords are issued with spaces for readability; WordPress
  // accepts them either way, but stripping avoids a whole class of paste bugs.
  const token = Buffer.from(
    `${cfg.username}:${cfg.appPassword.replace(/\s+/g, "")}`
  ).toString("base64");
  return { authorization: `Basic ${token}` };
}

/**
 * HTML to readable text.
 *
 * Deliberately crude and deliberately not a parser dependency. What the writer
 * learns from is rhythm, paragraph length and how a sentence turns — none of
 * which survive in markup, and none of which need it.
 */
export function textFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "· ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#8217;|&rsquo;/gi, "’")
    .replace(/&#8216;|&lsquo;/gi, "‘")
    .replace(/&#8220;|&ldquo;/gi, "“")
    .replace(/&#8221;|&rdquo;/gi, "”")
    .replace(/&#8211;|&ndash;/gi, "–")
    .replace(/&#8212;|&mdash;/gi, "—")
    .replace(/&hellip;/gi, "…")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function call(
  cfg: WpConfig,
  pathname: string,
  init: RequestInit = {},
  timeoutMs = 20_000
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(`${base(cfg)}${pathname}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        accept: "application/json",
        // Named rather than anonymous. A WAF in front of a client's WordPress
        // will often refuse a request with no user agent, and when someone reads
        // their access log the entry should say what this was.
        "user-agent": "Pexalo-Coinpresso-Agent/1.0 (+https://pexalo.com)",
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...authHeader(cfg),
        ...(init.headers as Record<string, string>),
      },
    });
  } finally {
    clearTimeout(t);
  }
}

/** Parse defensively — a WAF or a cache plugin can return HTML on any route. */
async function asJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `WordPress returned ${res.status} and a non-JSON body. The REST API may be disabled or behind a firewall. First 120 characters: ${text.slice(0, 120)}`
    );
  }
}

// --- Read ------------------------------------------------------------------

export async function listCategories(cfg: WpConfig): Promise<WpCategory[]> {
  const res = await call(cfg, "/categories?per_page=100&orderby=count&order=desc");
  if (!res.ok) throw new Error(`Categories request failed: ${res.status}`);
  const raw = await asJson<
    Array<{ id: number; name: string; slug: string; count: number }>
  >(res);
  return raw.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    count: c.count,
  }));
}

interface RawPost {
  id: number;
  date: string;
  slug: string;
  link: string;
  status: string;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  categories?: number[];
  tags?: number[];
}

/** One page of posts, newest first, plus how many pages there are in total. */
export async function listPosts(
  cfg: WpConfig,
  page = 1,
  perPage = 50
): Promise<{ posts: WpPost[]; totalPages: number; total: number }> {
  const res = await call(
    cfg,
    `/posts?per_page=${perPage}&page=${page}&orderby=date&order=desc&_fields=id,date,slug,link,status,title,content,excerpt,categories,tags`
  );
  if (!res.ok) {
    throw new Error(
      res.status === 400
        ? `Page ${page} is past the end of the archive.`
        : `Posts request failed: ${res.status}`
    );
  }
  const raw = await asJson<RawPost[]>(res);
  return {
    posts: raw.map((p) => ({
      id: p.id,
      date: p.date,
      slug: p.slug,
      link: p.link,
      status: p.status,
      title: textFromHtml(p.title.rendered),
      html: p.content.rendered,
      excerpt: textFromHtml(p.excerpt.rendered),
      categories: p.categories ?? [],
      tags: p.tags ?? [],
    })),
    totalPages: Number(res.headers.get("x-wp-totalpages") ?? 1),
    total: Number(res.headers.get("x-wp-total") ?? raw.length),
  };
}

// --- Connection test -------------------------------------------------------

export interface WpTestResult {
  ok: boolean;
  /** True when the site answered at all — separates "wrong URL" from "wrong password". */
  reachable: boolean;
  /** True when the credentials were accepted. Reading needs none; writing does. */
  authenticated: boolean;
  siteName?: string;
  user?: string;
  canPublish?: boolean;
  postCount?: number;
  detail: string;
}

/**
 * Reading and writing fail in different ways and the difference is the whole
 * diagnosis: coinpresso.io serves its REST API publicly, so an import can work
 * perfectly while the push half is still unconfigured. Reporting one boolean
 * would send someone to check the wrong thing.
 */
export async function testConnection(cfg: WpConfig): Promise<WpTestResult> {
  if (!cfg.siteUrl) {
    return {
      ok: false,
      reachable: false,
      authenticated: false,
      detail: "No site URL set. Add it in Settings.",
    };
  }

  let siteName: string | undefined;
  let postCount: number | undefined;

  try {
    const root = await fetch(
      `${cfg.siteUrl.replace(/\/+$/, "")}/wp-json`,
      { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) }
    );
    if (!root.ok) {
      return {
        ok: false,
        reachable: false,
        authenticated: false,
        detail: `The site answered ${root.status} at /wp-json. The REST API may be disabled.`,
      };
    }
    const info = await asJson<{ name?: string }>(root);
    siteName = info.name;
  } catch (e) {
    return {
      ok: false,
      reachable: false,
      authenticated: false,
      detail: `Could not reach the site: ${e instanceof Error ? e.message : String(e)}. If this app is running somewhere with restricted outbound network access, that is the more likely cause than anything on the WordPress side.`,
    };
  }

  try {
    const probe = await listPosts(cfg, 1, 1);
    postCount = probe.total;
  } catch {
    // Readable is the common case; a failure here is worth reporting but not fatal.
  }

  if (!cfg.username || !cfg.appPassword) {
    return {
      ok: true,
      reachable: true,
      authenticated: false,
      siteName,
      postCount,
      detail:
        "Reachable, and the archive can be imported without credentials. Add a username and application password to push drafts back.",
    };
  }

  try {
    const me = await call(cfg, "/users/me?context=edit");
    if (me.status === 401 || me.status === 403) {
      return {
        ok: false,
        reachable: true,
        authenticated: false,
        siteName,
        postCount,
        detail:
          "The site is reachable but rejected the credentials. Check the username and regenerate the application password in WP Admin → Users → Profile.",
      };
    }
    const user = await asJson<{
      name?: string;
      slug?: string;
      capabilities?: Record<string, boolean>;
    }>(me);
    const canPublish = Boolean(
      user.capabilities?.edit_posts || user.capabilities?.publish_posts
    );
    return {
      ok: true,
      reachable: true,
      authenticated: true,
      siteName,
      postCount,
      user: user.name ?? user.slug,
      canPublish,
      detail: canPublish
        ? "Connected. Drafts can be created."
        : "Connected, but this user cannot create posts. Give it Author or Editor in WordPress.",
    };
  } catch (e) {
    return {
      ok: false,
      reachable: true,
      authenticated: false,
      siteName,
      postCount,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

// --- Write -----------------------------------------------------------------

export interface DraftResult {
  ok: boolean;
  id?: number;
  editUrl?: string;
  link?: string;
  status?: string;
  /** Anything that did not make it, stated rather than swallowed. */
  warnings: string[];
  detail: string;
}

/**
 * Resolve tag names to ids, creating the ones that do not exist.
 *
 * Best-effort: a user with Author rights can usually create tags, an Editor
 * always can, and some hardened installs allow neither. A tag that cannot be
 * created is reported as a warning rather than failing the post — losing a tag
 * is a nuisance, losing the draft is a lost run.
 */
async function resolveTags(
  cfg: WpConfig,
  names: string[],
  warnings: string[]
): Promise<number[]> {
  const ids: number[] = [];
  for (const name of names.slice(0, 8)) {
    const term = name.trim();
    if (!term) continue;
    try {
      const found = await call(
        cfg,
        `/tags?search=${encodeURIComponent(term)}&per_page=10`
      );
      const hits = await asJson<Array<{ id: number; name: string }>>(found);
      const exact = hits.find(
        (h) => h.name.toLowerCase() === term.toLowerCase()
      );
      if (exact) {
        ids.push(exact.id);
        continue;
      }
      const made = await call(cfg, "/tags", {
        method: "POST",
        body: JSON.stringify({ name: term }),
      });
      if (made.ok) {
        const t = await asJson<{ id: number }>(made);
        ids.push(t.id);
      } else {
        warnings.push(`Tag "${term}" could not be created (${made.status}).`);
      }
    } catch {
      warnings.push(`Tag "${term}" could not be resolved.`);
    }
  }
  return ids;
}

export interface CreateDraftInput {
  run: Run;
  /** WordPress category id, from the pillar mapping. */
  categoryId?: number;
  /** Optional excerpt override; falls back to the first paragraph. */
  excerpt?: string;
}

export async function createDraft(
  cfg: WpConfig,
  input: CreateDraftInput
): Promise<DraftResult> {
  const warnings: string[] = [];
  const { run } = input;

  if (!run.draft) {
    return { ok: false, warnings, detail: "This run has no draft to send." };
  }
  if (!cfg.siteUrl || !cfg.username || !cfg.appPassword) {
    return {
      ok: false,
      warnings,
      detail:
        "WordPress credentials are not set. Add the site URL, username and application password in Settings.",
    };
  }

  // No H1 — WordPress renders the title from its own field, and a body H1 makes
  // the post show its headline twice. No tag line and no wire comment either;
  // both belong to the newswire format, not to a post on your own domain.
  const content = renderHtml(run, {
    includeH1: false,
    includeTagLine: false,
    includePublicationComment: false,
  });

  const firstPara =
    run.draft.body
      .split(/\n{2,}/)
      .map((s) => s.trim())
      .find((s) => s && !s.startsWith("#")) ?? "";

  const tagIds = await resolveTags(cfg, run.draft.tags, warnings);

  const body: Record<string, unknown> = {
    title: run.draft.headline,
    content,
    excerpt: (input.excerpt ?? firstPara).slice(0, 300),
    status: CREATE_STATUS,
  };
  if (input.categoryId) body.categories = [input.categoryId];
  else warnings.push("No category mapped — the draft will be uncategorised.");
  if (tagIds.length) body.tags = tagIds;

  try {
    const res = await call(cfg, "/posts", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        warnings,
        detail:
          "WordPress rejected the credentials, or this user cannot create posts. Check the application password and that the user is at least an Author.",
      };
    }
    if (!res.ok) {
      const err = await asJson<{ message?: string }>(res).catch(
        () => ({}) as { message?: string }
      );
      return {
        ok: false,
        warnings,
        detail: `WordPress returned ${res.status}. ${err.message ?? ""}`.trim(),
      };
    }

    const post = await asJson<{ id: number; link: string; status: string }>(res);
    const site = cfg.siteUrl.replace(/\/+$/, "");
    return {
      ok: true,
      id: post.id,
      link: post.link,
      status: post.status,
      editUrl: `${site}/wp-admin/post.php?post=${post.id}&action=edit`,
      warnings,
      detail:
        post.status === CREATE_STATUS
          ? "Created as a draft in WordPress. Nothing is live until someone publishes it there."
          : `WordPress created the post with status "${post.status}", which is not what was requested. Check for a plugin overriding post status.`,
    };
  } catch (e) {
    return {
      ok: false,
      warnings,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}
