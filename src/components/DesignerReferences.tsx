// ---------------------------------------------------------------------------
// Where the image style comes from.
//
// The writing rules have always been visible on this page; the image rules
// should be too. Everything below was measured off Coinpresso's own published
// posts, so it can be checked rather than taken on trust — and when the brand
// moves, this is the page that says what has to be re-measured.
// ---------------------------------------------------------------------------

import { CANVAS, TEMPLATE, PALETTE, FONTS, IMAGE_EXEMPLARS, SCENE_RULES } from "@/lib/blog-image";

function Swatch({ hex, name }: { hex: string; name: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block w-7 h-7 rounded-md border border-[var(--line)] shrink-0"
        style={{ background: hex }}
      />
      <span className="text-[11px] leading-tight">
        <span className="block font-semibold">{name}</span>
        <span className="block text-[var(--ink-3)] tabular-nums">{hex}</span>
      </span>
    </div>
  );
}

export default function DesignerReferences() {
  const allowed = SCENE_RULES.filter((r) => !r.startsWith("NO "));
  const refused = SCENE_RULES.filter((r) => r.startsWith("NO "));

  return (
    <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-5">
      <div>
        <h2 className="font-bold text-sm">What the designer learns from</h2>
        <p className="text-[12px] text-[var(--ink-3)] mt-1 max-w-2xl leading-relaxed">
          The template was measured off thirteen published Coinpresso posts. The
          geometry was identical to the pixel in every one of them, which is why
          these are fixed numbers rather than a house preference.
        </p>
      </div>

      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-3)] mb-2">
          Reference posts
        </h3>
        <ul className="space-y-2">
          {IMAGE_EXEMPLARS.map((e) => (
            <li key={e.title} className="text-[12px] leading-relaxed">
              <a
                href={e.url}
                target="_blank"
                rel="noreferrer noopener"
                className="font-semibold text-[var(--accent)] hover:underline"
              >
                {e.title}
              </a>
              <span className="block text-[var(--ink-3)]">{e.note}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-3)] mb-2">
            Palette
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <Swatch hex={PALETTE.accent} name="Title accent" />
            <Swatch hex={PALETTE.bgCenter} name="Ground, centre" />
            <Swatch hex={PALETTE.bgEdge} name="Ground, edge" />
            <Swatch hex={PALETTE.gradientViolet} name="Logo violet" />
            <Swatch hex={PALETTE.gradientTeal} name="Logo teal" />
          </div>
          <p className="text-[11px] text-[var(--ink-3)] mt-2 leading-relaxed">
            The two logo colours are the ends of the Coinpresso gradient,
            sampled from the mark itself. They set the rim lighting in every
            generated scene.
          </p>
        </div>

        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-3)] mb-2">
            Template
          </h3>
          <dl className="text-[11px] space-y-1 tabular-nums">
            {[
              ["Canvas", `${CANVAS.w} × ${CANVAS.h}`],
              ["Logo", `x ${TEMPLATE.logo.x}, y ${TEMPLATE.logo.y}, height ${TEMPLATE.logo.h}`],
              ["Title left", `x ${TEMPLATE.title.x}`],
              ["Title size", `${TEMPLATE.title.size}px, ${TEMPLATE.title.lineHeight}px line`],
              ["Type", `${FONTS.display.replace(/'/g, "")}, then Poppins`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-[var(--line)]/50 pb-1">
                <dt className="text-[var(--ink-3)]">{k}</dt>
                <dd className="font-semibold text-right">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-3)] mb-2">
            What it draws
          </h3>
          <ul className="text-[12px] space-y-1 text-[var(--ink-2)] leading-relaxed">
            {allowed.map((r) => (
              <li key={r} className="flex gap-2">
                <span className="text-[var(--success)] shrink-0">+</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-3)] mb-2">
            What it never draws
          </h3>
          <ul className="text-[12px] space-y-1 text-[var(--ink-2)] leading-relaxed">
            {refused.map((r) => (
              <li key={r} className="flex gap-2">
                <span className="text-[var(--danger)] shrink-0">−</span>
                <span>{r.replace(/^NO /, "")}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/10 px-3 py-2.5 text-[12px] text-[var(--warning)] leading-relaxed">
        <span className="font-semibold">Real brand logos are never generated.</span>{" "}
        Most of Coinpresso&apos;s own images place real marks — CoinDesk, Forbes,
        Binance, Ethereum. An image model draws those nearly right, which is
        worse than leaving them out: visibly wrong to anyone who knows the brand,
        and not ours to publish. Those are composited from a held asset library
        or added by a designer, the same way the Coinpresso logo is.
      </div>
    </section>
  );
}
