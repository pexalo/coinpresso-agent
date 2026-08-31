import Link from "next/link";
import { redirect } from "next/navigation";
import { EntityLogo, ModeBadge, PoweredBy, ThemeToggle } from "@/components/Brand";
import { clientModules, tenantRef, visibleClients } from "@/lib/clients";
import { isAdmin } from "@/lib/portal-session";

export const dynamic = "force-dynamic";

/**
 * Pexalo HQ — the client list. Every client owns a workspace; what is inside it
 * is decided by the modules on their record, not by a shared template.
 *
 * On a single-tenant deployment a client never sees this page at all: they are
 * sent straight into their own workspace, because the roster is Pexalo's
 * commercial information, not theirs.
 */
export default async function HqPage() {
  const admin = await isAdmin();
  const only = tenantRef();
  if (!admin && only) redirect(`/client/${only}`);

  const clients = visibleClients(admin);

  return (
    <>
    <div
      className="max-w-[1240px] mx-auto px-5 md:px-8 pb-12 space-y-6"
      style={{ paddingTop: "var(--top-gap)" }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Clients</h1>
        <p className="text-[var(--ink-3)] text-sm mt-1 max-w-2xl">
          Each client gets their own workspace. The modules on their record
          decide what is in it — they share an account model and a job queue,
          and almost no screens.
        </p>
        </div>
        <div className="flex items-center gap-3">
          <ModeBadge />
          <ThemeToggle />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {clients.map((c) => {
          const mods = clientModules(c);
          const built = mods.filter((m) => m.built).length;
          return (
            <Link
              key={c.ref}
              href={`/client/${c.ref}`}
              className="card p-5 hover:border-[var(--accent)]/50 transition-colors block"
            >
              <div className="flex items-center gap-2.5 mb-1">
                <EntityLogo
                  name={c.name}
                  logo={c.logo}
                  accent={c.accent}
                  size={22}
                />
                {!(c.logo && c.logoIncludesName) && (
                  <h2 className="font-bold text-sm">{c.name}</h2>
                )}
                <span className="ml-auto text-[10px] text-[var(--ink-4)] font-mono">
                  /{c.ref}
                </span>
              </div>
              <p className="text-[12px] text-[var(--ink-2)]">{c.engagement}</p>

              {c.campaigns.length > 0 && (
                <p className="text-[11px] text-[var(--ink-3)] mt-2">
                  {c.campaigns.length} campaign
                  {c.campaigns.length === 1 ? "" : "s"} ·{" "}
                  {c.campaigns.map((x) => `${x.name} ${x.ticker}`).join(", ")}
                </p>
              )}

              <div className="flex flex-wrap gap-1.5 mt-3.5">
                {mods.map((m) => (
                  <span
                    key={m.id}
                    className={`text-[10px] px-2 py-0.5 rounded-full border ${
                      m.built
                        ? "bg-[var(--accent)]/10 border-[var(--accent)]/30 text-[var(--accent)]"
                        : "bg-[var(--bg)] border-[var(--line)] text-[var(--ink-4)]"
                    }`}
                  >
                    {m.name}
                  </span>
                ))}
              </div>

              <p className="text-[10.5px] text-[var(--ink-4)] mt-3">
                {built} of {mods.length} modules built in this prototype
              </p>
            </Link>
          );
        })}
      </div>

      <div className="card p-5">
        <h2 className="font-bold text-sm mb-2">Why this is a list and not a template</h2>
        <p className="text-[12px] text-[var(--ink-2)] leading-relaxed max-w-3xl">
          The tempting shape is one dashboard with fixed tabs and different data
          behind them. Coinpresso is the proof it does not hold: there is no site
          to publish to, no visibility score to track and no citations to match,
          because the output goes to third-party newswires. It needs a production
          queue, and Geo One does not. Composing each workspace from the modules
          a client actually bought is what stops every future client having to be
          shaped like the first one.
        </p>
      </div>
    </div>
    <PoweredBy />
    </>
  );
}
