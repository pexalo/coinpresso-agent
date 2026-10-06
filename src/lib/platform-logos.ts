// ---------------------------------------------------------------------------
// Platform logos on a featured image.
//
// Bernard, 6 Oct: "we can use logos for OpenAI, Gemini, Perplexity etc when
// we are talking about AIs." The image model never draws a real logo — it
// produces a near-miss, which is worse than none — so, as with roundups, the
// platform's own published icon is composited onto the finished image.
// Only platforms the post is actually about, named in the title (or, for a
// post about AI search in general, the four engines readers know).
// ---------------------------------------------------------------------------

export interface PlatformLogo {
  name: string;
  domain: string;
}

const PLATFORMS: Array<{ name: string; domain: string; re: RegExp }> = [
  { name: "ChatGPT", domain: "chatgpt.com", re: /\b(chat\s?gpt|openai|gpt-?\d)\b/i },
  { name: "Gemini", domain: "gemini.google.com", re: /\bgemini\b/i },
  { name: "Perplexity", domain: "perplexity.ai", re: /\bperplexity\b/i },
  { name: "Claude", domain: "claude.ai", re: /\bclaude\b/i },
  { name: "Grok", domain: "grok.com", re: /\bgrok\b/i },
  { name: "Copilot", domain: "copilot.microsoft.com", re: /\bcopilot\b/i },
  { name: "Google", domain: "google.com", re: /\bgoogle(?! ?gemini)\b/i },
  { name: "Meta", domain: "facebook.com", re: /\b(meta|facebook)\b/i },
  { name: "Instagram", domain: "instagram.com", re: /\binstagram\b/i },
  { name: "X", domain: "x.com", re: /\b(twitter|x\.com|on x)\b/i },
  { name: "Telegram", domain: "telegram.org", re: /\btelegram\b/i },
  { name: "Discord", domain: "discord.com", re: /\bdiscord\b/i },
  { name: "Reddit", domain: "reddit.com", re: /\breddit\b/i },
  { name: "YouTube", domain: "youtube.com", re: /\byoutube\b/i },
  { name: "TikTok", domain: "tiktok.com", re: /\btiktok\b/i },
  { name: "LinkedIn", domain: "linkedin.com", re: /\blinkedin\b/i },
  { name: "CoinMarketCap", domain: "coinmarketcap.com", re: /\bcoinmarketcap\b/i },
  { name: "CoinGecko", domain: "coingecko.com", re: /\bcoingecko\b/i },
];

/** A post about AI search in general, with no engine named. */
const GENERIC_AI = /\b(ai (models?|search|engines?|overviews?|assistants?|answers?|visibility|citations?)|llms?|large language models?|generative engine|geo\b|chatbots?)\b/i;
const AI_DEFAULT = ["ChatGPT", "Gemini", "Perplexity", "Claude"];

export function platformLogos(title: string, max = 5): PlatformLogo[] {
  const named = PLATFORMS.filter((p) => p.re.test(title));
  const picked = named.length
    ? named
    : GENERIC_AI.test(title)
      ? PLATFORMS.filter((p) => AI_DEFAULT.includes(p.name))
      : [];
  return picked.slice(0, max).map(({ name, domain }) => ({ name, domain }));
}
