#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Snapshot everything under the data directory into one file, for moving a
// working installation (topics, imported archive, settings, finished runs)
// onto a freshly deployed server. The counterpart is POST /api/admin/snapshot,
// which restores it — see src/app/api/admin/snapshot/route.ts.
//
//   node scripts/export-data.mjs            → coinpresso-data-YYYYMMDD.snapshot.gz
//   DATA_DIR=/data node scripts/export-data.mjs
//
// The format is deliberately boring: gzip over JSON over base64 file bodies,
// nothing but Node built-ins on either side. It INCLUDES settings, which hold
// the WordPress application password and the Telegram token — treat the file
// like a credential and delete it once the restore is confirmed.
// ---------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = process.env.DATA_DIR?.trim() || path.join(process.cwd(), ".data");
if (!fs.existsSync(root)) {
  console.error(`No data directory at ${root}`);
  process.exit(1);
}

const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile()) {
      files.push({
        path: path.relative(root, full).split(path.sep).join("/"),
        b64: fs.readFileSync(full).toString("base64"),
      });
    }
  }
}
walk(root);

const snapshot = {
  version: 1,
  exportedAt: new Date().toISOString(),
  from: root,
  files,
};
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const out = `coinpresso-data-${stamp}.snapshot.gz`;
fs.writeFileSync(out, zlib.gzipSync(Buffer.from(JSON.stringify(snapshot), "utf8")));

const bytes = fs.statSync(out).size;
const byDir = files.reduce((m, f) => {
  const d = f.path.split("/")[0];
  m[d] = (m[d] ?? 0) + 1;
  return m;
}, {});
console.log(`Wrote ${out} (${(bytes / 1024).toFixed(0)} KB, ${files.length} files)`);
for (const [d, n] of Object.entries(byDir)) console.log(`  ${d}: ${n}`);
console.log("\nThis file contains credentials (settings). Delete it after restoring.");
