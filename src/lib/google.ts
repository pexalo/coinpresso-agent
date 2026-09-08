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

  const built = buildDoc(title, run.draft.body, run.draft.faqs ?? []);
  const styled = await fetch(
    `https://docs.googleapis.com/v1/documents/${doc.documentId}:batchUpdate`,
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
    throw new Error(`Docs write ${styled.status}: ${await styled.text()}`);
  }

  const moved = await fetch(
    `https://www.googleapis.com/drive/v3/files/${doc.documentId}?addParents=${folder}&removeParents=root&supportsAllDrives=true`,
    { method: "PATCH", headers: { authorization: `Bearer ${token}` } }
  );
  if (!moved.ok) {
    // The Doc exists and is written; it just could not be filed. Say where it
    // is and who needs access, rather than failing silently in the client's
    // Drive where nobody will ever look for it.
    return {
      docUrl: `https://docs.google.com/document/d/${doc.documentId}/edit`,
      serviceAccount: sa.client_email,
      skippedReason: `The Doc was created but could not be moved into the Coinpresso Blog folder (Drive said ${moved.status}). Share that folder with ${sa.client_email} as an Editor, then press the button again.`,
    };
  }

  return {
    docUrl: `https://docs.google.com/document/d/${doc.documentId}/edit`,
    serviceAccount: sa.client_email,
  };
}
