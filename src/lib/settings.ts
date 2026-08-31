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
import { dataDir } from "./data-dir";
import { DEFAULT_APPROVERS, DEFAULT_REQUIRED, type Approver } from "./approval";

const DIR = dataDir("settings");

export interface TelegramSettings {
  enabled: boolean;
  /** Never returned by the API. */
  botToken: string;
  /** Coinpresso's OWN chat — internal notifications, never client reports. */
  chatId: string;
  /**
   * Where each campaign's daily report goes: campaignId → chat id.
   *
   * One bot, many chats. Each report carries one end client's revenue and spend
   * figures under Coinpresso's name, so routing is strict: a campaign report is
   * sent to that campaign's chat or NOT SENT. There is deliberately no fallback
   * to the internal chat or to another campaign's — the failure mode of a
   * fallback is Moonberg's revenue landing in someone else's Telegram, which is
   * not an inconvenience but a breach. A missing mapping fails loudly instead.
   */
  campaignChats: Record<string, string>;
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
  /**
   * The gate. Nothing reaches coinpresso.io or a publisher until `required`
   * named people have signed the exact draft.
   *
   * This replaced a placeholder pair — a boolean and a comma-separated string of
   * names — that nothing ever read. A setting that appears to govern publishing
   * and does not is worse than no setting: it reads as a control that is on.
   */
  approvals: {
    approvers: Approver[];
    /** How many of them must sign. Cannot exceed the number of approvers. */
    required: number;
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
    telegram: { enabled: false, botToken: "", chatId: "", campaignChats: {} },
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
    approvers: DEFAULT_APPROVERS,
    required: DEFAULT_REQUIRED,
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

/**
 * The gate configuration, made safe to use.
 *
 * Clamped rather than validated on write, because a stored file can be edited by
 * hand and a `required` of 9 against three approvers would make every piece
 * unreleasable with no visible cause. An empty approver list falls back to the
 * defaults for the same reason — a gate with nobody who can pass it is a
 * publishing outage, not a strict policy.
 */
export function gateConfig(s: ClientSettings): {
  approvers: Approver[];
  required: number;
} {
  const approvers = s.approvals.approvers.length
    ? s.approvals.approvers
    : DEFAULT_APPROVERS;
  const required = Math.min(
    Math.max(Math.floor(s.approvals.required) || 1, 1),
    approvers.length
  );
  return { approvers, required };
}

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

/**
 * Repair a settings file written by an older version of this app.
 *
 * `approvals` used to be `{ requireApprovalBeforeExport: boolean, approvers:
 * string }` — a placeholder nothing read. It is now `{ approvers: Approver[],
 * required: number }`. A file saved before the change therefore carries a STRING
 * where the UI calls `.map`, and the Settings page crashed on load with a stack
 * trace rather than degrading.
 *
 * `merge` cannot catch this on its own: spreading a stored object over a default
 * preserves whatever type the stored value had. Any field whose SHAPE changes
 * needs a step like this one, and it belongs at the read boundary so every
 * caller — page, API and gate — sees the corrected value.
 *
 * Deliberately falls back to defaults rather than throwing. The alternative is a
 * client whose entire settings page is unreachable because of a field they never
 * set, and whose publishing gate cannot be read.
 */
function normalise(s: ClientSettings): ClientSettings {
  const stored = s.approvals as unknown as {
    approvers?: unknown;
    required?: unknown;
  };

  const approvers = Array.isArray(stored?.approvers)
    ? (stored.approvers as unknown[])
        .filter(
          (a): a is Approver =>
            typeof a === "object" &&
            a !== null &&
            typeof (a as Approver).id === "string" &&
            typeof (a as Approver).name === "string"
        )
        .map((a) => ({ ...a, role: a.role ?? "" }))
    : DEFAULT_APPROVERS;

  return {
    ...s,
    approvals: {
      approvers: approvers.length ? approvers : DEFAULT_APPROVERS,
      required:
        typeof stored?.required === "number" && stored.required > 0
          ? stored.required
          : DEFAULT_REQUIRED,
    },
  };
}

export async function readSettings(clientRef: string): Promise<ClientSettings> {
  try {
    const raw = await fs.readFile(keyFor(clientRef), "utf8");
    return normalise(
      merge(DEFAULT_SETTINGS, JSON.parse(raw) as Partial<ClientSettings>)
    );
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
  text: string,
  opts?: {
    /** Route to this campaign's configured chat. Absent = the internal chat. */
    campaignId?: string;
    campaignName?: string;
  }
): Promise<TelegramResult> {
  const s = await readSettings(clientRef);
  const { botToken, chatId: internalChat, campaignChats } = s.delivery.telegram;
  if (!botToken) return { ok: false, detail: "No bot token saved." };

  // Strict routing: a campaign's report goes to that campaign's chat or
  // nowhere. See the note on campaignChats — no fallback, by design.
  let chatId: string;
  if (opts?.campaignId) {
    const mapped = campaignChats?.[opts.campaignId]?.trim();
    if (!mapped) {
      return {
        ok: false,
        detail: `No Telegram chat is configured for ${opts.campaignName ?? opts.campaignId}. This report carries that client's figures, so it is not sent anywhere else — add the campaign's chat ID in Settings → Delivery.`,
      };
    }
    chatId = mapped;
  } else {
    if (!internalChat) return { ok: false, detail: "No chat ID saved." };
    chatId = internalChat;
  }

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
