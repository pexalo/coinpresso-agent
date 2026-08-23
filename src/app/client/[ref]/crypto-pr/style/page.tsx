import { LIAM_STYLE_PROFILE, PLAYBOOK } from "@/lib/style-profile";

export const dynamic = "force-dynamic";

const s = LIAM_STYLE_PROFILE;

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid sm:grid-cols-[160px_minmax(0,1fr)] gap-1 sm:gap-4 py-2.5 border-b border-[#2A3A52] last:border-0">
      <div className="text-[11px] uppercase tracking-wider text-[#7F8CA8]">
        {label}
      </div>
      <div className="text-[12px] text-[#B8C2D6] leading-relaxed">{value}</div>
    </div>
  );
}

function Chips({ items, tone }: { items: string[]; tone?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <span
          key={i}
          className="text-[10.5px] px-2 py-0.5 rounded-full bg-[#0D1B2A] border border-[#2A3A52]"
          style={tone ? { color: tone, borderColor: `${tone}40` } : undefined}
        >
          {i}
        </span>
      ))}
    </div>
  );
}

export default function StylePage() {
  return (
    <div className="space-y-5 pt-2">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">House style</h1>
        <p className="text-[#7F8CA8] text-sm mt-1 max-w-2xl">
          Extracted from the published Moonberg corpus. Injected into the writer
          on every draft and held by the reviewer as the standard to judge
          against.
        </p>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#4E78FF]/10 border border-[#4E78FF]/30 text-[#4E78FF]">
            v{s.version}
          </span>
          <span className="text-[11px] text-[#7F8CA8]">
            {s.sourceCount} reference articles · extracted{" "}
            {s.extractedAt.slice(0, 10)}
          </span>
        </div>
        <p className="text-[13px] text-[#B8C2D6] leading-relaxed">
          {s.styleSummary}
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        <div className="card p-5">
          <h2 className="font-bold text-sm mb-3">Profile</h2>
          <Row label="Formality" value={s.voice.formality} />
          <Row label="Person" value={s.voice.person} />
          <Row label="Tone" value={<Chips items={s.voice.tone} />} />
          <Row
            label="Sentences"
            value={`~${s.sentences.averageWords} words average, ${s.sentences.variability}`}
          />
          <Row label="Paragraphs" value={s.structure.paragraphLength} />
          <Row label="Opens with" value={s.structure.opensWith} />
          <Row label="Headings" value={s.structure.headingStyle} />
          <Row label="Spelling" value={s.vocabulary.spelling} />
          <Row label="Numbers" value={s.conventions.numbers} />
          <Row
            label="Punctuation"
            value={`em dash ${s.punctuation.emDash ? "yes" : "no"} · exclamation ${
              s.punctuation.exclamation ? "yes" : "no"
            } · contractions ${s.punctuation.contractions ? "yes" : "no"}`}
          />
          <Row label="CTA" value={s.conventions.ctaStyle} />
          <Row
            label="Bullet lists"
            value={s.structure.usesBulletLists ? "used" : "not used — prose only"}
          />
        </div>

        <div className="space-y-5">
          <div className="card p-5">
            <h2 className="font-bold text-sm mb-3">Vocabulary</h2>
            <div className="text-[10px] uppercase tracking-wider text-[#7F8CA8] mb-2">
              Prefers
            </div>
            <Chips items={s.vocabulary.prefers} tone="#3DDC97" />
            <div className="text-[10px] uppercase tracking-wider text-[#7F8CA8] mt-4 mb-2">
              Never uses
            </div>
            <Chips items={s.vocabulary.avoids} tone="#EF4444" />
          </div>

          <div className="card p-5">
            <h2 className="font-bold text-sm mb-3">Hard rules</h2>
            <ul className="space-y-2">
              {s.doNot.map((d) => (
                <li
                  key={d}
                  className="text-[12px] text-[#B8C2D6] leading-relaxed pl-4 relative"
                >
                  <span className="absolute left-0 text-[#EF4444]">×</span>
                  {d}
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-[#7F8CA8] leading-relaxed mt-4 pt-4 border-t border-[#2A3A52]">
              These override style. A style profile must never be able to talk an
              agent out of attributing a price target or into inventing a source.
            </p>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[#2A3A52]">
          <h2 className="font-bold text-sm">The framework</h2>
          <p className="text-[11px] text-[#7F8CA8] mt-0.5">
            Sent to the writer verbatim on every draft.
          </p>
        </div>
        <pre className="p-5 text-[11px] leading-relaxed text-[#B8C2D6] whitespace-pre-wrap overflow-x-auto">
          {PLAYBOOK}
        </pre>
      </div>

      <div className="card p-5">
        <h2 className="font-bold text-sm mb-2">Editing this</h2>
        <p className="text-[12px] text-[#B8C2D6] leading-relaxed">
          The profile lives in{" "}
          <code className="text-[#4E78FF]">src/lib/style-profile.ts</code> and
          matches the schema in Pexalo HQ&apos;s{" "}
          <code className="text-[#4E78FF]">FEATURE-SPEC-writing-style.md</code>,
          so it ports into the Client Profile → Writing Style tab without a
          translation layer. When it is re-extracted, push a new version rather
          than editing in place — &ldquo;the new articles sound wrong&rdquo;
          needs a rollback path.
        </p>
      </div>
    </div>
  );
}
