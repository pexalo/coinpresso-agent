import { BLOG_PLAYBOOK, BLOG_STYLE } from "@/lib/blog";
import { MODELS } from "@/lib/models";
import { readFeedback } from "@/lib/feedback";
import FeedbackLog from "@/components/FeedbackLog";

export const dynamic = "force-dynamic";

/**
 * The blog house style, shown as the writer and reviewer actually receive it.
 *
 * Rendering the real strings rather than a prettified summary is deliberate: if
 * the page and the prompt can drift apart, the page becomes decoration and the
 * client stops trusting it.
 */
export default async function BlogStylePage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const feedback = await readFeedback(ref);
  return (
    <div className="space-y-5 pt-2">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">
          Blog house style
        </h1>
        <p className="text-[var(--ink-3)] text-sm mt-1 max-w-3xl">
          This is the exact text the writer and the reviewer receive for the blog
          track — not a summary of it. The wire voice is a separate profile;
          nothing here applies to a Moonberg release.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            label: "Reader",
            value: "A founder choosing a vendor",
            note: "Technical enough to spot vagueness, pitched by five agencies this month.",
          },
          {
            label: "Writer",
            value: MODELS.writer,
            note: "Same model as the wire track, a different brief and a different voice.",
          },
          {
            label: "Reviewer",
            value: MODELS.reviewer,
            note: "A stricter bar than the wire: a post carrying nothing original is a blocker.",
          },
        ].map((k) => (
          <div key={k.label} className="card p-4">
            <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)]">
              {k.label}
            </div>
            <div className="text-[13px] font-bold mt-1.5">{k.value}</div>
            <p className="text-[11px] text-[var(--ink-3)] leading-relaxed mt-1.5">
              {k.note}
            </p>
          </div>
        ))}
      </div>

      <FeedbackLog initial={feedback} />

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--line)]">
          <h2 className="font-bold text-sm">Voice</h2>
          <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
            Passed to the writer verbatim, and to the reviewer as the thing to
            judge against.
          </p>
        </div>
        <pre className="px-5 py-4 text-[11.5px] leading-relaxed text-[var(--ink-2)] whitespace-pre-wrap font-mono">
          {BLOG_STYLE}
        </pre>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--line)]">
          <h2 className="font-bold text-sm">The framework</h2>
          <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
            What every post has to do, and the rule that keeps eight a day from
            becoming a content farm.
          </p>
        </div>
        <pre className="px-5 py-4 text-[11.5px] leading-relaxed text-[var(--ink-2)] whitespace-pre-wrap font-mono">
          {BLOG_PLAYBOOK}
        </pre>
      </div>

      <div className="card p-5">
        <h2 className="font-bold text-sm mb-2">
          Where this differs from the Moonberg voice
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px] mt-1">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] border-b border-[var(--line)]">
                <th className="text-left font-medium py-2.5 pr-4">&nbsp;</th>
                <th className="text-left font-medium py-2.5 pr-4">Wire PR</th>
                <th className="text-left font-medium py-2.5">Coinpresso blog</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {[
                ["Published on", "Third-party newswires", "coinpresso.io"],
                ["Selling", "A token", "An agency retainer"],
                ["Reader", "Retail trader", "A founder choosing a vendor"],
                ["Search demand", "Borrowed from a bigger asset", "Earned and held"],
                ["Bullet lists", "Never — prose only", "Allowed, sparingly"],
                ["Contractions", "Not used", "Fine"],
                ["Disclaimer", "Required", "None"],
                ["Price predictions", "The whole structure", "Never"],
                ["Structure", "One piece, one keyword", "Pillar and cluster"],
              ].map(([k, a, b]) => (
                <tr key={k}>
                  <td className="py-2.5 pr-4 text-[var(--ink-3)] whitespace-nowrap">
                    {k}
                  </td>
                  <td className="py-2.5 pr-4 text-[var(--ink-2)]">{a}</td>
                  <td className="py-2.5 text-[var(--ink-2)]">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
