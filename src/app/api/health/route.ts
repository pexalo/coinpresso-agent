import { NextResponse } from "next/server";
import { MODELS, keyStatus, mockMode, unpricedModels } from "@/lib/models";
import { dataRoot, storageIsEphemeral } from "@/lib/data-dir";
import { portalConfigured } from "@/lib/portal-auth";
import { probeProviders } from "@/lib/providers/routing";
import { credentialProvenance } from "@/lib/providers/provenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Railway's healthcheck target, and the first thing to curl after any deploy.
 *
 * It reports what is actually true rather than just "ok", because the two ways
 * this app fails silently are both invisible from the dashboard: it can be in
 * mock mode and look completely normal, and it can be storing everything on a
 * disk the next deploy will wipe.
 */
export async function GET(req: Request) {
  // ?probe=1 makes a real one-token call to each provider. Costs a fraction of
  // a cent and answers definitively whether the credentials work — which is
  // better learned here than partway through a twenty-article batch.
  const probe = new URL(req.url).searchParams.get("probe") === "1";
  const probes = probe ? await probeProviders() : null;

  // Where each key actually came from. Cheap, and it catches the failure that
  // otherwise looks unfixable: a shell export shadowing .env.local.
  const provenance = keyStatus().mode === "direct"
    ? await credentialProvenance()
    : null;

  const keys = keyStatus();
  const ephemeral = storageIsEphemeral();

  const warnings: string[] = [];
  if (keys.warning) warnings.push(keys.warning);

  // A model override the register cannot price is a cost-report hole, not just
  // a config nit: the calls succeed, the tokens are recorded, and every one of
  // them shows as $0. Cheap-looking articles are how that gets noticed months
  // late, so it is a warning at the door instead.
  for (const m of unpricedModels()) {
    warnings.push(
      `Model "${m}" is set via an env override but is not in the model register, so its calls are being costed at $0 and every figure on the API costs page is understated. Add it to src/lib/model-registry.ts with its real price, or use a registered model.`
    );
  }
  // The portal gate. In production proxy.ts already refuses to serve without
  // a passcode, so this warning is for the case where someone is reading the
  // health output wondering why every page is a 503.
  const portal = portalConfigured();
  if (!portal && process.env.NODE_ENV === "production") {
    warnings.push(
      "No PORTAL_PASSCODE / PORTAL_ADMIN_PASSCODE set. Every page and API route is returning 503 until one is — the app refuses to run unauthenticated in production."
    );
  }
  if (ephemeral) {
    warnings.push(
      "Running on Railway with no DATA_DIR set. Runs, batches, the archive, campaign facts and the saved credentials are on an ephemeral disk and will be lost on the next deploy. Mount a volume and set DATA_DIR to its path."
    );
  }
  if (mockMode() && process.env.MOCK_AGENTS !== "1") {
    warnings.push(
      keys.mode === "gateway"
        ? "In gateway mode but not callable — check PEXALO_AI_URL and PEXALO_SERVICE_TOKEN."
        : `No usable model credentials: ${[
            !keys.anthropic && "ANTHROPIC_API_KEY",
            !keys.openai && "OPENAI_API_KEY",
          ]
            .filter(Boolean)
            .join(" and ")} missing or still a placeholder.`
    );
  }

  if (probes) {
    probes.filter((p) => !p.ok).forEach((p) => warnings.push(p.detail));
  }

  provenance
    ?.filter((p) => p.source === "shell-shadowing-file" || p.source === "shell")
    .forEach((p) => warnings.push(p.detail));

  return NextResponse.json({
    ok: true,
    ...(probes ? { probe: probes } : {}),
    ...(provenance ? { credentials: provenance } : {}),
    mode: mockMode() ? "mock" : "live",
    /** Where model calls go: straight to the providers, or via Pexalo HQ. */
    routing: keys.mode,
    models: MODELS,
    storage: {
      dataDir: dataRoot(),
      ephemeral,
    },
    /** Whether the passcode login is configured. Never the passcode itself. */
    portal: portal ? "configured" : process.env.NODE_ENV === "production" ? "MISSING" : "open (development)",
    // Reports whether each credential is USABLE, not merely present — a
    // placeholder left over from the env template counts as missing. In gateway
    // mode both read true because HQ holds the provider keys, not this app.
    configured: {
      anthropic: keys.anthropic,
      openai: keys.openai,
      googleExport: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_B64),
      contentCalendar: Boolean(process.env.CONTENT_CALENDAR_SHEET_ID),
    },
    warnings,
  });
}
