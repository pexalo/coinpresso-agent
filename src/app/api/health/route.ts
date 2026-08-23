import { NextResponse } from "next/server";
import { MODELS, mockMode } from "@/lib/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    mode: mockMode() ? "mock" : "live",
    models: MODELS,
    configured: {
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      openai: Boolean(process.env.OPENAI_API_KEY),
      googleExport: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_B64),
      contentCalendar: Boolean(process.env.CONTENT_CALENDAR_SHEET_ID),
    },
  });
}
