import Link from "next/link";
import { CLIENT_LIST, clientModules } from "@/lib/clients";

export const dynamic = "force-dynamic";

/**
 * Pexalo HQ — the client list. Every client owns a workspace; what is inside it
 * is decided by the modules on their record, not by a shared template.
 */
export default function HqPage() {
  return (
    <div className="max-w-[1240px] mx-auto px-5 md:px-8 pb-24 pt-8 space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Clients</h1>
        <p className="text-[#7F8CA8] text-sm mt-1 max-w-2xl">
          Each client gets their own workspace. The modules on their record
          decide what is in it — these two share an account model and a job
          queue, and almost no screens.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {CLIENT_LIST.map((c) => {
          const mods = clientModules(c);
          const built = mods.filter((m) => m.built).length;
          return (
            <Link
              key={c.ref}
              href={`/client/${c.ref}`}
              className="card p-5 hover:border-[#4E78FF]/50 transition-colors block"
            >
              <div className="flex items-center gap-2.5 mb-1">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: c.accent }}
                />
                <h2 className="font-bold text-sm">{c.name}</h2>
                <span className="ml-auto text-[10px] text-[#5A6884] font-mono">
                  /{c.ref}
                </span>
              </div>
              <p className="text-[12px] text-[#B8C2D6]">{c.engagement}</p>

              {c.campaigns && (
                <p className="text-[11px] text-[#7F8CA8] mt-2">
                  {c.campaigns.length} campaign
                  {c.campaigns.length === 1 ? "" : "s"} ·{" "}
                  {c.campaigns.map((x) => x.name).join(", ")}
                </p>
              )}

              <div className="flex flex-wrap gap-1.5 mt-3.5">
                {mods.map((m) => (
                  <span
                    key={m.id}
                    className={`text-[10px] px-2 py-0.5 rounded-full border ${
                      m.built
                        ? "bg-[#4E78FF]/10 border-[#4E78FF]/30 text-[#4E78FF]"
                        : "bg-[#0D1B2A] border-[#2A3A52] text-[#5A6884]"
                    }`}
                  >
                    {m.name}
                  </span>
                ))}
              </div>

              <p className="text-[10.5px] text-[#5A6884] mt-3">
                {built} of {mods.length} modules built in this prototype
              </p>
            </Link>
          );
        })}
      </div>

      <div className="card p-5">
        <h2 className="font-bold text-sm mb-2">Why this is a list and not a template</h2>
        <p className="text-[12px] text-[#B8C2D6] leading-relaxed max-w-3xl">
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
  );
}
