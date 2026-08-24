import { NextResponse } from "next/server";
import { getClient, hasModule } from "@/lib/clients";
import { mockMode } from "@/lib/models";
import { mockBlogIdeas, runBlogIdeas } from "@/lib/agents/blog-ideas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;
  const client = getClient(ref);
  if (!client || !hasModule(client, "own-blog")) {
    return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  }

  let body: { count?: number; pillar?: string; steer?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // Eight is the top of the stated cadence and also the practical ceiling: a day
  // planned beyond it stops spreading across pillars and starts repeating.
  const count = Math.min(Math.max(body.count ?? 6, 1), 8);

  const request = {
    clientRef: ref,
    count,
    pillar: body.pillar,
    steer: body.steer,
  };

  try {
    if (mockMode()) {
      return NextResponse.json({
        ideas: await mockBlogIdeas(request),
        mock: true,
      });
    }
    const r = await runBlogIdeas(request);
    return NextResponse.json({
      ideas: r.ideas,
      mock: false,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
