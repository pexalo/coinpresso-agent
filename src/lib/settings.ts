// ---------------------------------------------------------------------------
// Per-client settings.
//
// Delivery is the interesting part: Coinpresso want the daily report to arrive
// in Telegram rather than being fetched from a dashboard nobody has open at
// 08:00. Everything else here is configuration that would otherwise live in
// someone's head.
//
// SECRETS. The Telegram bot token is a credential. It is stored under .data/ in
// this prototype and MASKED on every read — the API never returns it, and the UI
// never sees it after the first save. In HQ it belongs in the same secret store
// as the model keys, not in a settings row.
// ---------------------------------------------------------------------------

import fs from "node:fs/promises";
import path from "node:path";

const DIR = path.join(process.cwd(), ".data", "settings");

export interface TelegramSettings {
  enabled: boolean;
  /** Never returned by the API. */
  botToken: string;
  chatId: string;
  connectedAt?: string;
  lastTestAt?: string;
  lastTestOk?: boolean;
}

/**
 * WordPress on coinpresso.io.
 *
 * The application password is a credential and is handled exactly like the
 * Telegram token: stored server-side, masked on every read, and preserved when a
 * partial save arrives without it. Reading the blog needs none of this — the
 * site serves its REST API publicly — so an unconfigured install can still
 * import the archive, which is why the connection test reports reachable and
 * authenticated separately.
 */
export interface WordPressSettings {
  enabled: boolean;
  siteUrl: string;
  username: string;
  /** Never returned by the API. */
  appPassword: string;
  connectedAt?: string;
  lastImportAt?: string;
  lastImportCount?: number;
}

export interface ClientSettings {
  delivery: {
    telegram: TelegramSettings;
    email: { enabled: boolean; recipients: string };
  };
  schedule: {
    dailyReportTime: string;
    timezone: string;
    /** Which days the report is sent. */
    days: string[];
  };
  notify: {
    dailyReport: boolean;
    runReady: boolean;
    reviewBlockers: boolean;
    weeklyDigest: boolean;
  };
  approvals: {
    requireApprovalBeforeExport: boolean;
    approvers: string;
  };
  integrations: {
    lookerStudioUrl: string;
    ga4PropertyId: string;
    metaAdAccountId: string;
    contentCalendarSheetId: string;
  };
  wordpress: WordPressSettings;
}

export const DEFAULT_SETTINGS: ClientSettings = {
  delivery: {
    telegram: { enabled: false, botToken: "", chatId: "" },
    email: { enabled: false, recipients: "" },
  },
  schedule: {
    dailyReportTime: "08:00",
    timezone: "Asia/Kuala_Lumpur",
    days: ["mon", "tue", "wed", "thu", "fri"],
  },
  notify: {
    dailyReport: true,
    runReady: true,
    reviewBlockers: true,
    weeklyDigest: false,
  },
  approvals: {
    requireApprovalBeforeExport: true,
    approvers: "",
  },
  integrations: {
    lookerStudioUrl: "",
    ga4PropertyId: "",
    metaAdAccountId: "",
    contentCalendarSheetId: "",
  },
  wordpress: {
    enabled: true,
    siteUrl: "https://coinpresso.io",
    username: "",
    appPassword: "",
  },
};

function keyFor(clientRef: string): string {
  return path.join(DIR, `${clientRef}.json`);
}

function merge(base: ClientSettings, patch: Partial<ClientSettings>): ClientSettings {
  return {
    delivery: {
      telegram: { ...base.delivery.telegram, ...patch.delivery?.telegram },
      email: { ...base.delivery.email, ...patch.delivery?.email },
    },
    schedule: { ...base.schedule, ...patch.schedule },
    notify: { ...base.notify, ...patch.notify },
    approvals: { ...base.approvals, ...patch.approvals },
    integrations: { ...base.integrations, ...patch.integrations },
    wordpress: { ...base.wordpress, ...patch.wordpress },
  };
}

export async function readSettings(clientRef: string): Promise<ClientSettings> {
  try {
    const raw = await fs.readFile(keyFor(clientRef), "utf8");
    return merge(DEFAULT_SETTINGS, JSON.parse(raw) as Partial<ClientSettings>);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function writeSettings(
  clientRef: string,
  patch: Partial<ClientSettings>
): Promise<ClientSettings> {
  const current = await readSettings(clientRef);
  const next = merge(current, patch);

  // An empty or masked token in the patch means "leave it alone" — otherwise
  // saving any other field would silently wipe the credential.
  const incoming = patch.delivery?.telegram?.botToken;
  if (!incoming || incoming.includes("•")) {
    next.delivery.telegram.botToken = current.delivery.telegram.botToken;
  } else if (incoming !== current.delivery.telegram.botToken) {
    next.delivery.telegram.connectedAt = new Date().toISOString();
  }

  // Same rule for the WordPress application password.
  const wpIncoming = patch.wordpress?.appPassword;
  if (!wpIncoming || wpIncoming.includes("•")) {
    next.wordpress.appPassword = current.wordpress.appPassword;
  } else if (wpIncoming !== current.wordpress.appPassword) {
    next.wordpress.connectedAt = new Date().toISOString();
  }

  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(keyFor(clientRef), JSON.stringify(next, null, 2), "utf8");
  return next;
}

/** What the API is allowed to return. The token never leaves the server. */
export function maskSettings(s: ClientSettings) {
  const t = s.delivery.telegram;
  return {
    ...s,
    delivery: {
      ...s.delivery,
      telegram: {
        ...t,
        botToken: t.botToken
          ? `••••••••${t.botToken.slice(-4)}`
          : "",
        hasToken: Boolean(t.botToken),
      },
    },
    wordpress: {
      ...s.wordpress,
      appPassword: s.wordpress.appPassword
        ? `••••••••${s.wordpress.appPassword.slice(-4)}`
        : "",
      hasAppPassword: Boolean(s.wordpress.appPassword),
    },
  };
}

export interface TelegramResult {
  ok: boolean;
  detail: string;
  botName?: string;
}

/** Send a message to the configured chat. Used by the test button and, once a
 *  scheduler exists, by the daily send. */
export async function sendTelegram(
  clientRef: string,
  text: string
): Promise<TelegramResult> {
  const s = await readSettings(clientRef);
  const { botToken, chatId } = s.delivery.telegram;
  if (!botToken) return { ok: false, detail: "No bot token saved." };
  if (!chatId) return { ok: false, detail: "No chat ID saved." };

  // A blocked network or a proxy returns an HTML error page, and calling .json()
  // on it throws a parse error that tells the operator nothing useful.
  const asJson = async (res: Response, what: string) => {
    const body = await res.text();
    try {
      return JSON.parse(body) as Record<string, unknown>;
    } catch {
      throw new Error(
        `${what}: Telegram did not return JSON (HTTP ${res.status}). ` +
          `Usually this means the network cannot reach api.telegram.org.`
      );
    }
  };

  try {
    // getMe first, so a bad token reads as "bad token" rather than as a chat
    // problem — the two failures need different fixes.
    const me = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const meJson = (await asJson(me, "Checking the bot token")) as {
      ok: boolean;
      result?: { username?: string };
      description?: string;
    };
    if (!meJson.ok) {
      return {
        ok: false,
        detail: `Telegram rejected the bot token: ${meJson.description ?? me.status}`,
      };
    }

    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      }
    );
    const json = (await asJson(res, "Sending the message")) as {
      ok: boolean;
      description?: string;
    };
    if (!json.ok) {
      return {
        ok: false,
        detail:
          json.description ??
          `Telegram returned ${res.status}. Check the chat ID, and that the bot has been added to the chat.`,
        botName: meJson.result?.username,
      };
    }
    return {
      ok: true,
      detail: "Message delivered.",
      botName: meJson.result?.username,
    };
  } catch (e) {
    return {
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

/** The daily report, rendered for a Telegram message. */
export function telegramDigest(opts: {
  campaign: string;
  reportingDay: string;
  headline: string;
  keyNumbers: Array<{ label: string; value: string; note?: string }>;
  actions: Array<{ headline: string; owner: string; due: string }>;
  url: string;
}): string {
  const lines = [
    `<b>${opts.campaign} — daily report</b>`,
    `<i>${opts.reportingDay}</i>`,
    "",
    opts.headline,
    "",
    ...opts.keyNumbers.map(
      (k) => `• <b>${k.value}</b> ${k.label}${k.note ? ` — ${k.note}` : ""}`
    ),
  ];
  if (opts.actions.length) {
    lines.push("", "<b>Actions</b>");
    opts.actions.forEach((a, i) =>
      lines.push(`${i + 1}. ${a.headline} — ${a.owner}, ${a.due}`)
    );
  }
  lines.push("", `<a href="${opts.url}">Open the full report</a>`);
  return lines.join("\n");
}
