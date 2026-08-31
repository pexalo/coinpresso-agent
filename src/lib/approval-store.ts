// ---------------------------------------------------------------------------
// Where approval records live.
//
// One file per client holding every run's record, rather than a file per run.
// The blog approves a day at a time, so the common read is "the records for
// these eight runs" — twenty small reads to answer that is the wrong shape, and
// the whole file is a few KB per hundred runs.
//
// In HQ this is an `approvals` table with a row per signature and an immutable
// audit log. Signatures are never deleted here either: withdrawing one removes
// it from the live record, and the write-ahead log below keeps what happened.
// ---------------------------------------------------------------------------

import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./data-dir";
import { emptyRecord, type ApprovalRecord } from "./approval";

const DIR = dataDir("approvals");

type Book = Record<string, ApprovalRecord>;

function fileFor(clientRef: string): string {
  return path.join(DIR, `${clientRef}.json`);
}

function logFor(clientRef: string): string {
  return path.join(DIR, `${clientRef}.log.jsonl`);
}

async function readBook(clientRef: string): Promise<Book> {
  try {
    return JSON.parse(await fs.readFile(fileFor(clientRef), "utf8")) as Book;
  } catch {
    return {};
  }
}

async function writeBook(clientRef: string, book: Book): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(fileFor(clientRef), JSON.stringify(book, null, 2), "utf8");
}

/**
 * Append-only record of every approval action.
 *
 * The live record answers "can this go out". This answers "what happened", and
 * it is the one that matters if a published claim is ever disputed. Withdrawing
 * a signature edits the first and never the second.
 */
async function append(
  clientRef: string,
  entry: Record<string, unknown>
): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  await fs.appendFile(
    logFor(clientRef),
    JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n",
    "utf8"
  );
}

export async function getRecord(
  clientRef: string,
  runId: string
): Promise<ApprovalRecord> {
  const book = await readBook(clientRef);
  return book[runId] ?? emptyRecord(runId);
}

export async function getRecords(
  clientRef: string,
  runIds: string[]
): Promise<Record<string, ApprovalRecord>> {
  const book = await readBook(clientRef);
  const out: Record<string, ApprovalRecord> = {};
  for (const id of runIds) out[id] = book[id] ?? emptyRecord(id);
  return out;
}

export async function saveRecord(
  clientRef: string,
  record: ApprovalRecord,
  audit: Record<string, unknown>
): Promise<ApprovalRecord> {
  const book = await readBook(clientRef);
  book[record.runId] = record;
  await writeBook(clientRef, book);
  await append(clientRef, { runId: record.runId, ...audit });
  return record;
}

/** The audit trail for one run, oldest first. */
export async function history(
  clientRef: string,
  runId: string
): Promise<Array<Record<string, unknown>>> {
  try {
    const raw = await fs.readFile(logFor(clientRef), "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Record<string, unknown>)
      .filter((e) => e.runId === runId);
  } catch {
    return [];
  }
}
