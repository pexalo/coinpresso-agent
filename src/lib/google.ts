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
import { renderPlainText } from "./render";
import { buildDoc } from "./google-doc";

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

  // Create through Drive, not Docs.
  //
  // documents.create always makes the file in the caller's own My Drive, and a
  // service account's My Drive has no storage of its own — which surfaces as a
  // bare "The caller does not have permission" rather than anything about
  // quota. Creating through Drive with an explicit parent puts the Doc straight
  // into Coinpresso's folder, where the folder's owner provides the space, and
  // skips the separate move step entirely.
  const created = await fetch(
    "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
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
        ? `Drive refused to create the Doc in folder ${folder} (${created.status}). Share that folder with ${sa.client_email} as an Editor, and check the Google Drive API is enabled on the same project the key came from. Google said: ${detail}`
        : `Drive create ${created.status}: ${detail}`
    );
  }
  const doc = (await created.json()) as { id: string };

  const built = buildDoc(title, run.draft.body, run.draft.faqs ?? []);
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
