// ---------------------------------------------------------------------------
// The Coinpresso featured-image template.
//
// Every number here was measured off the client's own published images, not
// chosen. Thirteen posts were sampled and the geometry is identical to the
// pixel across all of them — logo at x157 y130 w310 h76, title left edge at
// x163, line pitch ~51px — which is what you would expect from a template
// rather than hand placement. Treat these as facts about their brand, and
// change them only against a new measurement.
//
// The division of labour matters more than any single number. The generated
// image supplies ONLY the scene: the 3D objects, the lighting, the purple
// ground. Every piece of text and every brand mark is drawn by the template,
// because an image model renders text unreliably and renders real logos badly
// enough to be a trademark problem. See SCENE_RULES below.
// ---------------------------------------------------------------------------

export const CANVAS = { w: 1024, h: 576 } as const;

/** Measured off eight editorial posts; identical in all of them. */
export const TEMPLATE = {
  logo: { x: 157, y: 130, h: 76 },
  title: {
    x: 163,
    /** The block is centred on this line, so 2- and 5-line titles both sit right. */
    centerY: 356,
    size: 40,
    lineHeight: 51,
    maxWidth: 430,
    maxLines: 6,
  },
  /** Keeps the left side readable when the scene is bright behind it. */
  scrim: { to: 0.62, strength: 0.82 },
} as const;

export const PALETTE = {
  /** The accent in every editorial post, sampled: #825AF0. */
  accent: "#825AF0",
  ink: "#FFFFFF",
  bgCenter: "#390363",
  bgEdge: "#18012B",
  /** The two ends of the logo's own gradient, for scene direction. */
  gradientTeal: "#7FF4E1",
  gradientViolet: "#895CFF",
} as const;

export const FONTS = {
  /** Both are the site's own faces, and both are free on Google Fonts. */
  display: "'Space Grotesk'",
  fallback: "Poppins, system-ui, sans-serif",
  googleHref:
    "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700&family=Poppins:wght@600;700&display=swap",
} as const;

/**
 * The posts the template was measured from. Shown on the Style page so anyone
 * can check the reference rather than take the numbers on trust.
 */
export const IMAGE_EXEMPLARS: Array<{ title: string; url: string; note: string }> = [
  {
    title: "The Ultimate Guide to Link Building for Crypto Projects",
    url: "https://coinpresso.io/blog",
    note: "Publisher logos in a constellation — the clearest case for why real marks are composited, never generated.",
  },
  {
    title: "The Ultimate Guide to Measuring Crypto PR ROI",
    url: "https://coinpresso.io/blog",
    note: "Isometric panels and coins. The scene type the generator imitates.",
  },
  {
    title: "How to Market a Crypto Exchange: The 2026 Growth Playbook",
    url: "https://coinpresso.io/blog",
    note: "Two-line title, showing the block stays centred rather than top-aligned.",
  },
  {
    title: "llms.txt for Crypto & Web3 Sites: Do You Need One in 2026?",
    url: "https://coinpresso.io/blog",
    note: "Neon rather than isometric — the style varies, the layout does not.",
  },
];

/**
 * What the image model is allowed to draw.
 *
 * The prohibitions are the important half. A model asked for the CoinDesk logo
 * produces something that looks nearly like it, which is worse than leaving it
 * out: visibly wrong to a reader who knows the brand, and not ours to publish.
 */
export const SCENE_RULES = [
  "3D rendered objects on a deep purple ground, glossy and softly lit, floating with soft contact shadows",
  "Isometric or three-quarter view, never flat vector, never photographic",
  "Violet and teal rim lighting, drawn from the Coinpresso logo gradient",
  "Composition weighted to the RIGHT half of the frame — the left half stays clear for the title",
  "NO text, letters, numbers or words anywhere in the image",
  "NO real company logos, brand marks or recognisable wordmarks",
  "NO people, faces or hands",
] as const;

/** Split a headline into the accent-coloured opening and the white remainder. */
export function splitTitle(headline: string): { accent: string; rest: string } {
  const clean = headline.replace(/\s+/g, " ").trim();
  // Their own pattern: the generic lead-in carries the accent, the specific
  // subject stays white. "The Ultimate Guide to" + "Link Building for…".
  const leadIns = [
    /^(The Ultimate Guide To\b)/i,
    /^(The Ultimate Toolkit for Your\b)/i,
    /^(How to Market a [A-Za-z]+ [A-Za-z]+:)/i,
    /^(Best [A-Za-z0-9 ]+ in \d{4}:)/i,
  ];
  for (const re of leadIns) {
    const m = clean.match(re);
    if (m) return { accent: m[1], rest: clean.slice(m[1].length).trim() };
  }
  // Otherwise colour the first clause, which is what the other posts do.
  const colon = clean.indexOf(":");
  if (colon > 8 && colon < clean.length - 4) {
    return { accent: clean.slice(0, colon + 1), rest: clean.slice(colon + 1).trim() };
  }
  const parts = clean ? clean.split(" ") : [];
  if (parts.length < 2) return { accent: clean, rest: "" };
  // Always leave at least one word white. A title entirely in the accent
  // colour loses the contrast the whole treatment depends on, and a two-word
  // headline is exactly where the naive percentage swallows the lot.
  const take = Math.min(Math.max(1, Math.round(parts.length * 0.4)), parts.length - 1, 6);
  return { accent: parts.slice(0, take).join(" "), rest: parts.slice(take).join(" ") };
}
