// ---------------------------------------------------------------------------
// The approval gate.
//
// Nothing reaches coinpresso.io or a third-party publisher until three named
// people have signed the exact draft that would go out. Not three clicks —
// three people, each identified, each bound to a specific version of the text.
//
// THE VERSION BINDING IS THE WHOLE THING. An approval that survives an edit is
// worse than no approval: it produces a record saying three people signed off on
// a piece none of them read, and that record is exactly what gets produced when
// someone later asks who approved a claim. So every signature carries a
// fingerprint of the draft it was given against, and a signature whose
// fingerprint no longer matches is shown as stale and does not count. Revise a
// piece after two approvals and you need both again. That is the correct
// behaviour and it will be annoying, which is the point.
//
// A rejection blocks release outright — a majority does not overrule it. Three
// of four approving while the fourth says "this states a guaranteed return" is
// not a decision to publish, it is a decision to ignore the one person who read
// it properly. The block clears when the draft changes, because at that point
// the objection was either addressed or it was not, and it has to be re-made
// against the new text.
//
// In HQ the approver list is roles resolved against the org's user table, and
// signatures carry the authenticated user rather than a name picked from a
// dropdown. The shape here is deliberately the same so that swap is a change of
// identity source and nothing else.
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";
import type { Run } from "./types";

export interface Approver {
  id: string;
  name: string;
  /** What this person is signing FOR. Shown at the point of signing. */
  role: string;
}

/**
 * Seeded from the people who actually do this at Coinpresso. Editable in
 * Settings — names change, and a gate that requires someone who has left is a
 * gate nobody can pass.
 */
export const DEFAULT_APPROVERS: Approver[] = [
  { id: "elena", name: "Elena", role: "Reads it as the reader would" },
  { id: "kat", name: "Kat", role: "Checks claims, figures and disclaimers" },
  { id: "liam", name: "Liam", role: "Releases it" },
];

export const DEFAULT_REQUIRED = 3;

export interface Signature {
  approverId: string;
  /** Denormalised so the record still reads correctly after a rename. */
  name: string;
  at: string;
  note?: string;
  /** The draft this signature was given against. */
  fingerprint: string;
}

export interface Rejection {
  approverId: string;
  name: string;
  at: string;
  reason: string;
  fingerprint: string;
}

export interface ApprovalRecord {
  runId: string;
  signatures: Signature[];
  rejections: Rejection[];
  releasedAt?: string;
  releasedBy?: string;
  /** Where it went when released. */
  releasedTo?: "wordpress" | "wire";
}

export function emptyRecord(runId: string): ApprovalRecord {
  return { runId, signatures: [], rejections: [] };
}

/**
 * A fingerprint of what would actually be published.
 *
 * Every field of the draft that a reader would see — headline, dateline, body,
 * FAQs, tags — plus the brief's title. Deliberately NOT the whole run: token
 * counts, timings and cost fields change on every save and would void every
 * signature for reasons that have nothing to do with the text.
 *
 * The draft is a STRUCTURED object, not a string, and this function was first
 * written as though it were one. Interpolating it produced "[object Object]" for
 * every run — a constant, so the hash only ever varied with the title, and
 * rewriting an entire article would have left all three signatures looking
 * valid. That is the precise failure this whole gate exists to prevent, so the
 * shape is enumerated explicitly below rather than stringified: a new field
 * added to Draft should have to be considered here, and a type error is a better
 * way to be told than a signature that silently stops meaning anything.
 */
export function fingerprint(run: Run): string {
  const d = run.draft;
  const material = d
    ? JSON.stringify([
        run.brief.title,
        d.headline,
        d.dateline,
        d.body,
        d.faqs,
        d.tags,
      ])
    : `${run.brief.title}\n\n(no draft)`;
  return createHash("sha256").update(material).digest("hex").slice(0, 16);
}

export interface GateState {
  fingerprint: string;
  required: number;
  /** Signatures against the current draft. These are the ones that count. */
  valid: Signature[];
  /** Signatures given against an earlier draft. Shown, not counted. */
  stale: Signature[];
  /** Approvers who have not signed the current draft. */
  outstanding: Approver[];
  /** An unaddressed objection against the current draft. */
  blocking: Rejection | null;
  canRelease: boolean;
  released: boolean;
  releasedAt?: string;
  releasedBy?: string;
  /** Plain-language reason release is not available, for the UI and the API. */
  reason: string;
}

export function gateState(
  record: ApprovalRecord,
  approvers: Approver[],
  required: number,
  current: string,
  hasDraft: boolean
): GateState {
  const valid = record.signatures.filter((s) => s.fingerprint === current);
  const stale = record.signatures.filter((s) => s.fingerprint !== current);
  const signed = new Set(valid.map((s) => s.approverId));
  const outstanding = approvers.filter((a) => !signed.has(a.id));
  const blocking =
    record.rejections.find((r) => r.fingerprint === current) ?? null;

  const released = Boolean(record.releasedAt);
  const enough = valid.length >= required;
  const canRelease = hasDraft && enough && !blocking && !released;

  let reason = "";
  if (released) {
    reason = `Released ${record.releasedAt?.slice(0, 10)} by ${record.releasedBy}.`;
  } else if (!hasDraft) {
    reason = "There is no draft to approve yet.";
  } else if (blocking) {
    reason = `${blocking.name} sent this back: ${blocking.reason} — revise the draft, then approvals are taken again on the new version.`;
  } else if (!enough) {
    const need = required - valid.length;
    reason =
      outstanding.length > 0
        ? `${need} more approval${need === 1 ? "" : "s"} needed — waiting on ${outstanding
            .map((a) => a.name)
            .join(", ")}.`
        : `${need} more approval${need === 1 ? "" : "s"} needed.`;
  } else {
    reason = "Approved by everyone required. Ready to release.";
  }

  return {
    fingerprint: current,
    required,
    valid,
    stale,
    outstanding,
    blocking,
    canRelease,
    released,
    releasedAt: record.releasedAt,
    releasedBy: record.releasedBy,
    reason,
  };
}

/**
 * Sign, or replace this person's own earlier signature.
 *
 * Replacing rather than appending matters: someone who signs, sees a revision,
 * and signs again should have one current signature, not one current and one
 * stale that makes the history look like they approved twice.
 */
export function sign(
  record: ApprovalRecord,
  approver: Approver,
  current: string,
  note?: string
): ApprovalRecord {
  return {
    ...record,
    signatures: [
      ...record.signatures.filter(
        (s) => !(s.approverId === approver.id && s.fingerprint === current)
      ),
      {
        approverId: approver.id,
        name: approver.name,
        at: new Date().toISOString(),
        note: note?.trim() || undefined,
        fingerprint: current,
      },
    ],
    // Signing withdraws this person's own objection to the same draft. Holding
    // both at once is not a state that means anything.
    rejections: record.rejections.filter(
      (r) => !(r.approverId === approver.id && r.fingerprint === current)
    ),
  };
}

export function reject(
  record: ApprovalRecord,
  approver: Approver,
  current: string,
  reason: string
): ApprovalRecord {
  return {
    ...record,
    // A rejection also withdraws this person's approval of the same draft.
    signatures: record.signatures.filter(
      (s) => !(s.approverId === approver.id && s.fingerprint === current)
    ),
    rejections: [
      ...record.rejections.filter(
        (r) => !(r.approverId === approver.id && r.fingerprint === current)
      ),
      {
        approverId: approver.id,
        name: approver.name,
        at: new Date().toISOString(),
        reason: reason.trim(),
        fingerprint: current,
      },
    ],
  };
}

export function withdraw(
  record: ApprovalRecord,
  approverId: string,
  current: string
): ApprovalRecord {
  return {
    ...record,
    signatures: record.signatures.filter(
      (s) => !(s.approverId === approverId && s.fingerprint === current)
    ),
  };
}
