import { NextResponse } from "next/server";
import { MODELS, keyStatus, mockMode } from "@/lib/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    mode: mockMode() ? "mock" : "live",
    models: MODELS,
    // Reports whether each key is USABLE, not merely present — a placeholder
    // left over from .env.example counts as missing.
    configured: {
      ...keyStatus(),
      googleExport: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_B64),
      contentCalendar: Boolean(process.env.CONTENT_CALENDAR_SHEET_ID),
    },
  });
}
