import Link from "next/link";
import { notFound } from "next/navigation";
import { getClient, hasModule } from "@/lib/clients";
import { BLOG_PUBLICATION } from "@/lib/blog";
import { listSeeds } from "@/lib/blog-seed";

/**
 * Coinpresso's own domain, and only ever theirs.
 *
 * Crypto PR carries a campaign picker because the wire work is done on behalf of
 * end clients. This module has no such thing and must not grow one: posts here
 * publish under Coinpresso's byline on Coinpresso's domain, so the brand, the
 * voice and the claims are Coinpresso's own. A post written for a token project
 * belongs on the wire, and the two answer to different rules — the wire carries
 * a campaign's fact sheet and banned claims, the blog carries none because there
 * is no client to misrepresent.
 *
 * The strip says so out loud, in the place the picker sits one module over. It
 * is worth the row: the difference between the two tracks is the thing most
 * likely to be got wrong by someone moving between them quickly.
 *
 * ONE THIN ROW. It is orientation, not content — as a card with its own padding
 * it pushed the actual work of every page in this module a third of a screen
 * down, and on the topics page it repeated a queued count the list's own toolbar
 * already carries.
 */
export default async function OwnBlogLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const client = getClient(ref);
  if (!client || !hasModule(client, "own-blog")) notFound();

  const seeds = await listSeeds(ref);
  const queued = seeds.topics.filter((t) => t.status === "queued").length;

  return (
    <>
      <div className="flex items-center gap-2.5 flex-wrap mb-3 text-[11.5px]">
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: client.accent }}
        />
        <span className="font-semibold">{client.name}</span>
        <span className="text-[var(--ink-4)]">{BLOG_PUBLICATION}</span>
        <span className="text-[var(--ink-4)]">
          · their own domain, no campaign or end client
        </span>

        <Link
          href={`/client/${ref}/own-blog/topics`}
          className={`ml-auto transition-colors ${
            queued > 0
              ? "text-[var(--accent)] font-medium"
              : "text-[var(--ink-4)] hover:text-[var(--accent)]"
          }`}
        >
          {queued > 0 ? `${queued} topics waiting →` : "Add topics →"}
        </Link>
      </div>
      {children}
    </>
  );
}
