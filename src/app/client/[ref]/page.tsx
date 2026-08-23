import Link from "next/link";
import { notFound } from "next/navigation";
import { clientModules, getClient } from "@/lib/clients";

export const dynamic = "force-dynamic";

export default async function ClientOverviewPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const client = getClient(ref);
  if (!client) notFound();

  const mods = clientModules(client);

  return (
    <div className="space-y-6 pt-2">
      <div>
        <Link href="/" className="text-[11px] text-[#7F8CA8] hover:text-[#4E78FF]">
          ← Clients
        </Link>
        <h1 className="text-2xl font-extrabold tracking-tight mt-1.5">
          {client.name}
        </h1>
        <p className="text-[#7F8CA8] text-sm mt-1">{client.engagement}</p>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {mods.map((m) =>
          m.built ? (
            <Link
              key={m.id}
              href={`/client/${client.ref}/${m.slug}`}
              className="card p-5 hover:border-[#4E78FF]/50 transition-colors block"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <h2 className="font-bold text-sm">{m.name}</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#3DDC97]/10 border border-[#3DDC97]/30 text-[#3DDC97]">
                  Live
                </span>
              </div>
              <p className="text-[12px] text-[#B8C2D6] leading-relaxed">
                {m.summary}
              </p>
              <span className="inline-block text-[12px] font-semibold text-[#4E78FF] mt-3">
                Open →
              </span>
            </Link>
          ) : (
            <div key={m.id} className="card p-5 opacity-60">
              <div className="flex items-center gap-2 mb-1.5">
                <h2 className="font-bold text-sm">{m.name}</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#0D1B2A] border border-[#2A3A52] text-[#5A6884]">
                  Not in this prototype
                </span>
              </div>
              <p className="text-[12px] text-[#7F8CA8] leading-relaxed">
                {m.summary}
              </p>
            </div>
          )
        )}
      </div>

      {client.campaigns && client.campaigns.length > 0 && (
        <div className="card p-5">
          <h2 className="font-bold text-sm mb-2">Campaigns</h2>
          <div className="flex flex-wrap gap-2">
            {client.campaigns.map((c) => (
              <span
                key={c.id}
                className="text-[11.5px] px-2.5 py-1 rounded-lg bg-[#0D1B2A] border border-[#2A3A52] text-[#B8C2D6]"
              >
                {c.name}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-[#7F8CA8] leading-relaxed mt-3 max-w-2xl">
            {client.name} is an agency, so campaigns nest under the client rather
            than each one becoming a separate account. A second token project
            adds a campaign here and reuses the same style profile store, model
            budget and approval history.
          </p>
        </div>
      )}
    </div>
  );
}
