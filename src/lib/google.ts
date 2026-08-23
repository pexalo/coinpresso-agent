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
