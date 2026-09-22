import { NextResponse } from "next/server";
import { getClient } from "@/lib/clients";
import { listRuns } from "@/lib/store";
import { listSpend, SPEND_LABELS } from "@/lib/spend-log";
import { monthlyStatement, previousMonth, statementCsv } from "@/lib/costs";
import { isAdmin } from "@/lib/portal-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One month's cost, itemised — the invoice backing. ?month=YYYY-MM&format=csv */
export async function GET(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  if (!getClient(ref)) return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  const url = new URL(req.url);
  const month = /^\d{4}-\d{2}$/.test(url.searchParams.get("month") ?? "") ? url.searchParams.get("month")! : previousMonth();
  const st = monthlyStatement(await listRuns(ref), await listSpend(ref), month, SPEND_LABELS);
  if (url.searchParams.get("format") === "csv") {
    // Markup and hosting only on the Pexalo login — see PEXALO-HQ-BILLING.md.
    const admin = await isAdmin();
    const markup = admin ? Math.max(0, Number(process.env.BILLING_MARKUP_PCT ?? 10) || 0) : 0;
    const hosting = admin ? Math.max(0, Number(process.env.BILLING_HOSTING_USD ?? 0) || 0) : 0;
    return new NextResponse(statementCsv(st, markup, hosting), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="coinpresso-api-costs-${month}.csv"`,
      },
    });
  }
  return NextResponse.json(st);
}
