import { notFound } from "next/navigation";
import ClientHeader from "@/components/ClientHeader";
import ClientSidebar, { MobileSectionTabs } from "@/components/ClientSidebar";
import { PoweredBy } from "@/components/Brand";
import { clientModules, getClient } from "@/lib/clients";

export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const client = getClient(ref);
  if (!client) notFound();

  return (
    <>
      <ClientHeader client={client} />
      <div
        className="max-w-[1240px] mx-auto px-5 md:px-8 pb-12 lg:flex lg:gap-8"
        style={{ paddingTop: "var(--top-gap)" }}
      >
        <ClientSidebar client={client} modules={clientModules(client)} />
        <div className="min-w-0 flex-1">
          <MobileSectionTabs clientRef={client.ref} />
          {children}
        </div>
      </div>
      <PoweredBy />
    </>
  );
}
