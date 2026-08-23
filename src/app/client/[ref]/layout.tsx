import { notFound } from "next/navigation";
import ClientHeader from "@/components/ClientHeader";
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
      <ClientHeader client={client} modules={clientModules(client)} />
      <div className="max-w-[1240px] mx-auto px-5 md:px-8 pb-24 pt-6">
        {children}
      </div>
    </>
  );
}
