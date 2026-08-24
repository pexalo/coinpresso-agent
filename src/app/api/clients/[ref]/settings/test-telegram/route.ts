import { NextResponse } from "next/server";
import { getClient } from "@/lib/clients";
import { readSettings, sendTelegram, telegramDigest, writeSettings } from "@/lib/settings";
import { reportsFor } from "@/lib/daily-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sends the most recent real report to the configured chat, rather than a "hello
 * world". Testing with the actual payload is the only way to find out that the
 * message is too long, that the formatting breaks, or that the link is wrong.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;
  const client = getClient(ref);
  if (!client) {
    return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  }

  const origin = new URL(req.url).origin;
  const campaign = client.campaigns[0];
  const report = campaign ? reportsFor(campaign.id)[0] : null;

  const text = report
    ? telegramDigest({
        campaign: `${campaign.name} ${campaign.ticker}`,
        reportingDay: report.reportingDay,
        headline: `${report.headline} ${report.headlineHighlight ?? ""}`.trim(),
        keyNumbers: report.keyNumbers.map((k) => ({
          label: k.label,
          value: k.value,
          note: k.note,
        })),
        actions: report.actions.map((a) => ({
          headline: a.headline,
          owner: a.owner,
          due: a.due,
        })),
        url: `${origin}/client/${ref}/daily-report`,
      })
    : `<b>${client.name}</b>\nTelegram delivery is connected. No report to send yet.`;

  const result = await sendTelegram(ref, text);

  const current = await readSettings(ref);
  await writeSettings(ref, {
    delivery: {
      ...current.delivery,
      telegram: {
        ...current.delivery.telegram,
        lastTestAt: new Date().toISOString(),
        lastTestOk: result.ok,
      },
    },
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
