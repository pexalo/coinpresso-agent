// ---------------------------------------------------------------------------
// Google Docs + Sheets export, on approval.
//
// No googleapis dependency — a service-account JWT is ~40 lines with node:crypto
// and keeps this module self-contained, which matters when it gets lifted into
// Pexalo HQ.
//
// Everything here degrades gracefully. If credentials are absent the approval
// still succeeds and the article is still exportable from the dashboard; only
// the Doc and the sheet row are skipped, and the caller is told why.
// ---------------------------------------------------------------------------

import crypto from "node:crypto";
import type { Run } from "./types";
import { PUBLICATIONS } from "./publications";
import { renderPlainText, bodyOf } from "./render";
import { buildDoc, readTableShapes, fillTableRequests } from "./google-doc";

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

const SCOPES = [
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
].join(" ");

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function credentials(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: SCOPES,
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  );
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const sig = b64url(signer.sign(sa.private_key.replace(/\\n/g, "\n")));

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claim}.${sig}`,
    }),
  });
  if (!res.ok) throw new Error(`Google token ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

export interface ExportResult {
  docUrl: string | null;
  sheetUpdated: boolean;
  skippedReason?: string;
}

export async function exportRun(run: Run): Promise<ExportResult> {
  const sa = credentials();
  if (!sa) {
    return {
      docUrl: null,
      sheetUpdated: false,
      skippedReason:
        "GOOGLE_SERVICE_ACCOUNT_B64 is not set. The article is still exportable from the dashboard.",
    };
  }

  const token = await accessToken(sa);
  const pub = PUBLICATIONS[run.brief.publication];
  const title = `${run.draft?.headline ?? run.brief.title} | Moonberg | PR`;

  // 1. Create the document.
  const created = await fetch("https://docs.googleapis.com/v1/documents", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ title }),
  });
  if (!created.ok) {
    throw new Error(`Docs create ${created.status}: ${await created.text()}`);
  }
  const doc = (await created.json()) as { documentId: string };

  // 2. Insert the article body.
  const text = renderPlainText(run);
  await fetch(
    `https://docs.googleapis.com/v1/documents/${doc.documentId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        requests: [{ insertText: { location: { index: 1 }, text } }],
      }),
    }
  );

  // 3. Move it into the working folder, if one is configured.
  const folder = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (folder) {
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${doc.documentId}?addParents=${folder}&removeParents=root&supportsAllDrives=true`,
      { method: "PATCH", headers: { authorization: `Bearer ${token}` } }
    );
  }

  const docUrl = `https://docs.google.com/document/d/${doc.documentId}/edit`;

  // 4. Append a row to the content calendar, matching Liam's column order.
  let sheetUpdated = false;
  const sheetId = process.env.CONTENT_CALENDAR_SHEET_ID;
  if (sheetId) {
    const d = new Date();
    const dmy = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
    const row = [
      dmy, // Copy Date
      dmy, // Publishing Date
      "PR", // Type of content
      pub.name, // Publication/Domain
      run.draft?.headline ?? run.brief.title, // Article Title
      run.brief.keywords.join(", "), // Target Keywords
      "Pexalo Agent", // Writer
      "Edited - Waiting to publish", // Status
      docUrl, // Drive Link
      "", // Disseminated Article Link
    ];
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1:J1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ values: [row] }),
      }
    );
    sheetUpdated = res.ok;
  }

  return { docUrl, sheetUpdated };
}

/** The folder Coinpresso keeps blog drafts in. Overridable per deployment. */
const BLOG_FOLDER_FALLBACK = "1-_FTFU7m1JFoPJdGyhkPNWMspyhNYGxx";

export interface BlogExportResult {
  docUrl: string | null;
  skippedReason?: string;
  /** Named so the operator knows who to share the folder with on a 403. */
  serviceAccount?: string;
}

/**
 * Put a blog draft in Drive as a formatted Google Doc, on demand.
 *
 * Separate from exportRun because the two want different things. That one fires
 * once, at release, and writes a PR-shaped row to the campaign calendar. This
 * one is a button next to a queued draft: it can be pressed while the post is
 * still being argued over, so it must be safe to press twice, and it must not
 * touch the calendar or the run's approval state.
 */

/** Create the Doc through Drive, in the client's folder. */
async function createDoc(
  token: string,
  folder: string,
  title: string,
  serviceEmail: string
): Promise<{ id: string }> {
  // documents.create always makes the file in the caller's own My Drive, and a
  // service account's My Drive has no storage of its own — which surfaces as a
  // bare "The caller does not have permission" rather than anything about
  // quota. Creating through Drive with an explicit parent puts the Doc straight
  // into Coinpresso's folder, where the folder's owner provides the space.
  const created = await fetch(
    "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id",
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        name: title,
        mimeType: "application/vnd.google-apps.document",
        parents: [folder],
      }),
    }
  );
  if (!created.ok) {
    const detail = await created.text();
    throw new Error(
      created.status === 403 || created.status === 404
        ? `Drive refused to create the Doc in folder ${folder} (${created.status}). Share that folder with ${serviceEmail} as an Editor, and check the Google Drive API is enabled on the same project the key came from. Google said: ${detail}`
        : `Drive create ${created.status}: ${detail}`
    );
  }
  return (await created.json()) as { id: string };
}

/**
 * Empty an existing Doc's body so it can be rewritten in place.
 *
 * Returns false when the Doc cannot be reached — deleted from the bin, or
 * permissions changed — so the caller creates a fresh one rather than failing
 * the export. Comment threads survive: Docs keeps them on the file and marks
 * the ones whose anchor text is gone.
 */
async function clearDocBody(token: string, docId: string): Promise<boolean> {
  const got = await fetch(`https://docs.googleapis.com/v1/documents/${docId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!got.ok) return false;
  const doc = (await got.json()) as { body?: { content?: Array<{ endIndex?: number }> } };
  const end = doc.body?.content?.reduce((m, el) => Math.max(m, el.endIndex ?? 0), 0) ?? 0;
  // The body always ends with a newline that cannot be deleted; the range
  // stops one short of it. An empty Doc has end === 2 and nothing to clear.
  if (end <= 2) return true;
  const cleared = await fetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      requests: [{ deleteContentRange: { range: { startIndex: 1, endIndex: end - 1 } } }],
    }),
  });
  return cleared.ok;
}

/**
 * The Doc's current text, as markdown-ish plain text, for diffing against
 * what was exported. Headings come back as "## …" so the diff can attribute a
 * paragraph to its section; links come back as their text.
 */
export async function readDocText(docUrl: string): Promise<string> {
  const sa = credentials();
  if (!sa) throw new Error("GOOGLE_SERVICE_ACCOUNT_B64 is not set, so the Doc cannot be read back.");
  const id = docUrl.match(/\/document\/d\/([^/]+)/)?.[1];
  if (!id) throw new Error("That is not a Google Doc link.");
  const token = await accessToken(sa);
  // Read the Doc as if every suggestion were accepted. Liam reviews in
  // Suggesting mode; the default view returns both the suggested and the
  // deleted text run together ("project foundersfinance").
  const res = await fetch(
    `https://docs.googleapis.com/v1/documents/${id}?suggestionsViewMode=PREVIEW_SUGGESTIONS_ACCEPTED`,
    { headers: { authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Docs read ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return docToMarkdown(await res.json());
}

interface DocJson {
  body?: {
    content?: Array<{
      paragraph?: {
        paragraphStyle?: { namedStyleType?: string };
        bullet?: unknown;
        elements?: Array<{
          textRun?: {
            content?: string;
            textStyle?: { bold?: boolean; link?: { url?: string } };
          };
        }>;
      };
      table?: unknown;
    }>;
  };
}

/**
 * A Docs body as markdown — links and bold kept, bullets as "- ".
 *
 * The first version returned bare text. That was enough to SEE what the
 * reviewer changed, and not enough to KEEP it: his paragraph went back into
 * the draft with every link stripped out of it. Pure, so it is tested
 * against a Docs JSON fixture rather than a live Doc.
 */
export function docToMarkdown(doc: DocJson): string {
  const lines: string[] = [];
  for (const el of doc.body?.content ?? []) {
    if (el.table) {
      lines.push("| table |");
      continue;
    }
    const p = el.paragraph;
    if (!p) continue;
    const style = p.paragraphStyle?.namedStyleType ?? "";
    const heading = style === "HEADING_1" ? "# " : style === "HEADING_2" ? "## " : style === "HEADING_3" ? "### " : "";

    // Adjacent runs with the same link are one link; Docs splits a link at
    // any style change inside it.
    const runs: Array<{ text: string; url?: string; bold: boolean }> = [];
    for (const e of p.elements ?? []) {
      const r = e.textRun;
      if (!r?.content) continue;
      const url = r.textStyle?.link?.url;
      const bold = !heading && Boolean(r.textStyle?.bold);
      const prev = runs[runs.length - 1];
      if (prev && prev.url === url && prev.bold === bold) prev.text += r.content;
      else runs.push({ text: r.content, url, bold });
    }
    // Markdown wants the markers hugging the words, not the spaces round them.
    const wrap = (t: string, open: string, close: string) => {
      const m = t.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
      return m[2] ? `${m[1]}${open}${m[2]}${close}${m[3]}` : t;
    };
    let text = runs
      .map((r) => {
        let t = r.text;
        if (r.url) t = wrap(t, "[", `](${r.url})`);
        if (r.bold) t = wrap(t, "**", "**");
        return t;
      })
      .join("")
      .replace(/\n$/, "");
    if (!text.trim()) continue;
    if (p.bullet && !heading) text = `- ${text}`;
    lines.push(heading + text);
  }
  return lines.join("\n\n");
}

export async function exportBlogRun(run: Run): Promise<BlogExportResult> {
  const sa = credentials();
  if (!sa) {
    return {
      docUrl: null,
      skippedReason:
        "GOOGLE_SERVICE_ACCOUNT_B64 is not set on this deployment, so there is no Google identity to create the Doc with.",
    };
  }
  if (!run.draft) {
    return { docUrl: null, skippedReason: "This run has no draft yet." };
  }

  const token = await accessToken(sa);
  const folder = process.env.GOOGLE_DRIVE_BLOG_FOLDER_ID || BLOG_FOLDER_FALLBACK;
  const title = run.draft.headline || run.brief.title;

  // UPDATE THE DOC THE REVIEWER IS ALREADY IN, when there is one.
  //
  // Every export used to create a new Doc, and the old one — with Liam's
  // inline comments on it — went to the bin. His text-level feedback on the
  // first version of the Circumventing Systems piece was never seen by
  // anyone on this side: "pretty much all my text feedback not implemented".
  // The Doc was replaced underneath him, and a comment on a binned file is a
  // comment nobody reads.
  //
  // So if the run already has a Doc, its body is cleared and rewritten in
  // place. Docs keeps every comment thread on the file; ones anchored to text
  // that changed show as "original content deleted" with the thread intact,
  // which is exactly what a reviewer needs to check their notes were applied.
  const existingId = run.docUrl?.match(/\/document\/d\/([^/]+)/)?.[1];
  const reuse = existingId ? await clearDocBody(token, existingId) : false;
  const doc = reuse
    ? { id: existingId! }
    : await createDoc(token, folder, title, sa.client_email);
  if (reuse) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${doc.id}?supportsAllDrives=true`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ name: title }),
    }).catch(() => {});
  }

  const built = buildDoc(title, bodyOf(run.draft), run.draft.faqs ?? []);
  const styled = await fetch(
    `https://docs.googleapis.com/v1/documents/${doc.id}:batchUpdate`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        // The insert has to land before anything styles it, and the styling
        // ranges were measured against exactly this string.
        requests: [
          { insertText: { location: { index: 1 }, text: built.text } },
          ...built.requests,
        ],
      }),
    }
  );
  if (!styled.ok) {
    const detail = await styled.text();
    throw new Error(
      styled.status === 403
        ? `The Doc was created in the folder but could not be written to (403). This is almost always the Google Docs API being disabled on the project the key came from — Drive and Docs are separate switches. Google said: ${detail}`
        : `Docs write ${styled.status}: ${detail}`
    );
  }

  // Pass 2: the tables are in the Doc but empty. Ask Google where the cells
  // landed rather than working it out — the offset a cell takes after
  // insertTable is undocumented, and a one-character error puts every value in
  // the wrong column, which reads as a broken table rather than a broken
  // calculation. One GET removes the guess entirely.
  if (built.tables.length) {
    const shape = await fetch(
      `https://docs.googleapis.com/v1/documents/${doc.id}`,
      { headers: { authorization: `Bearer ${token}` } }
    );
    if (!shape.ok) {
      throw new Error(
        `The Doc was written but its tables could not be measured (Docs read ${shape.status}), so they are in it empty. ${await shape.text()}`
      );
    }
    const fill = fillTableRequests(
      built.tables,
      readTableShapes(await shape.json())
    );
    if (fill.length) {
      const filled = await fetch(
        `https://docs.googleapis.com/v1/documents/${doc.id}:batchUpdate`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ requests: fill }),
        }
      );
      if (!filled.ok) {
        throw new Error(
          `The Doc's tables were created but could not be filled (Docs write ${filled.status}). ${await filled.text()}`
        );
      }
    }
  }

  return {
    docUrl: `https://docs.google.com/document/d/${doc.id}/edit`,
    serviceAccount: sa.client_email,
  };
}


// ---------------------------------------------------------------------------
// Images into Drive.
//
// Same Shared Drive as the documents, in a "Graphics" subfolder so the Docs
// people are reviewing do not get buried under PNGs. The folder is created on
// first use rather than configured, because one more environment variable to
// forget is one more way for this to fail quietly.
// ---------------------------------------------------------------------------

export interface DriveUploadResult {
  url: string;
  name: string;
  folder: string;
}

/** Find the Graphics folder under the blog folder, or make it. */
async function graphicsFolder(token: string, parent: string): Promise<string> {
  const q = encodeURIComponent(
    `name = 'Graphics' and '${parent}' in parents and ` +
      `mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  const found = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)` +
      `&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { authorization: `Bearer ${token}` } }
  );
  if (found.ok) {
    const json = (await found.json()) as { files?: Array<{ id: string }> };
    if (json.files?.length) return json.files[0].id;
  }

  const made = await fetch(
    "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id",
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        name: "Graphics",
        mimeType: "application/vnd.google-apps.folder",
        parents: [parent],
      }),
    }
  );
  if (!made.ok) {
    throw new Error(
      `Could not create the Graphics folder in Drive (${made.status}). ${await made.text()}`
    );
  }
  return ((await made.json()) as { id: string }).id;
}

/**
 * Upload a PNG. Names are the client's convention, and Drive is happy to hold
 * two files with the same name — so the caller passes a name that already
 * distinguishes one image from another.
 */
export async function uploadImageToDrive(
  name: string,
  png: Buffer
): Promise<DriveUploadResult> {
  const sa = credentials();
  if (!sa) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_B64 is not set on this deployment, so there is no Google identity to upload with."
    );
  }
  const token = await accessToken(sa);
  const parent = process.env.GOOGLE_DRIVE_BLOG_FOLDER_ID || BLOG_FOLDER_FALLBACK;
  const folder = await graphicsFolder(token, parent);

  // Multipart: the metadata and the bytes in one request. Drive's resumable
  // upload is for large files; a blog image is well under the threshold.
  const boundary = `cp${Date.now().toString(36)}`;
  const meta = JSON.stringify({ name, parents: [folder] });
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
        `--${boundary}\r\nContent-Type: image/png\r\n\r\n`
    ),
    png,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": `multipart/related; boundary=${boundary}`,
      },
      body: new Uint8Array(body),
    }
  );
  if (!res.ok) {
    const detail = await res.text();
    if (res.status === 403 && /storageQuota/i.test(detail)) {
      throw new Error(
        "Drive refused the upload on storage quota. The destination has to be a Shared Drive — " +
          "a service account owns what it creates and has no storage of its own."
      );
    }
    throw new Error(`Drive upload failed (${res.status}). Google said: ${detail.slice(0, 300)}`);
  }

  const file = (await res.json()) as { id: string; name: string };
  return {
    url: `https://drive.google.com/file/d/${file.id}/view`,
    name: file.name,
    folder,
  };
}

/**
 * The reviewer's comments on a Doc, with the text each one is anchored to.
 * Comments carry the WHY that an edit alone does not: "add 'crypto' to the
 * anchor — programmatic advertising on its own means Web2 ads".
 */
export interface DocComment {
  author: string;
  text: string;
  quote?: string;
  replies: string[];
  resolved: boolean;
}

export async function readDocComments(docUrl: string): Promise<DocComment[]> {
  const sa = credentials();
  if (!sa) return [];
  const id = docUrl.match(/\/document\/d\/([^/]+)/)?.[1];
  if (!id) return [];
  const token = await accessToken(sa);
  const fields = "comments(content,resolved,deleted,author/displayName,quotedFileContent/value,replies(content,deleted))";
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${id}/comments?pageSize=100&fields=${encodeURIComponent(fields)}`,
    { headers: { authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return [];
  const json = (await res.json()) as {
    comments?: Array<{
      content?: string;
      resolved?: boolean;
      deleted?: boolean;
      author?: { displayName?: string };
      quotedFileContent?: { value?: string };
      replies?: Array<{ content?: string; deleted?: boolean }>;
    }>;
  };
  return (json.comments ?? [])
    .filter((c) => !c.deleted && c.content?.trim())
    .map((c) => ({
      author: c.author?.displayName ?? "",
      text: c.content!.trim(),
      quote: c.quotedFileContent?.value?.trim() || undefined,
      replies: (c.replies ?? []).filter((r) => !r.deleted && r.content?.trim()).map((r) => r.content!.trim()),
      resolved: Boolean(c.resolved),
    }));
}
