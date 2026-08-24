"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { ClientSettings } from "@/lib/settings";

/** What the API actually returns: secrets replaced by a mask plus a has-it flag. */
type Masked = ClientSettings & {
  delivery: ClientSettings["delivery"] & {
    telegram: ClientSettings["delivery"]["telegram"] & { hasToken?: boolean };
  };
  wordpress: ClientSettings["wordpress"] & { hasAppPassword?: boolean };
};

const DAYS = [
  ["mon", "Mon"],
  ["tue", "Tue"],
  ["wed", "Wed"],
  ["thu", "Thu"],
  ["fri", "Fri"],
  ["sat", "Sat"],
  ["sun", "Sun"],
];

const TIMEZONES = [
  "Asia/Kuala_Lumpur",
  "Asia/Singapore",
  "Asia/Dubai",
  "Europe/London",
  "Europe/Lisbon",
  "America/New_York",
  "UTC",
];

const field =
  "w-full bg-[var(--bg)] border border-[var(--line)] rounded-lg px-3 py-2 text-sm placeholder:text-[var(--ink-4)] focus:border-[var(--accent)] outline-none transition-colors";
const label =
  "block text-[10px] uppercase tracking-wider text-[var(--ink-3)] mb-1.5";

function Section({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--line)]">
        <h2 className="font-bold text-sm">{title}</h2>
        {blurb && (
          <p className="text-[11px] text-[var(--ink-3)] mt-0.5 max-w-2xl leading-relaxed">
            {blurb}
          </p>
        )}
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  title,
  detail,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  detail?: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 w-9 h-5 rounded-full shrink-0 transition-colors relative ${
          checked ? "bg-[var(--accent)]" : "bg-[var(--line)]"
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </button>
      <span>
        <span className="text-[12.5px] font-medium block">{title}</span>
        {detail && (
          <span className="text-[11px] text-[var(--ink-3)] block leading-relaxed">
            {detail}
          </span>
        )}
      </span>
    </label>
  );
}

export default function SettingsPage() {
  const { ref } = useParams<{ ref: string }>();
  const [s, setS] = useState<Masked | null>(null);
  const [token, setToken] = useState("");
  const [appPw, setAppPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; detail: string } | null>(
    null
  );

  const load = useCallback(async () => {
    const res = await fetch(`/api/clients/${ref}/settings`);
    if (res.ok) setS(await res.json());
  }, [ref]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(patch: Partial<ClientSettings>) {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/clients/${ref}/settings`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        setS(await res.json());
        setToken("");
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveWordPress() {
    if (!s) return;
    await save({
      wordpress: {
        ...s.wordpress,
        ...(appPw ? { appPassword: appPw } : {}),
      },
    });
    setAppPw("");
  }

  async function testTelegram() {
    setTesting(true);
    setTestMsg(null);
    try {
      const res = await fetch(`/api/clients/${ref}/settings/test-telegram`, {
        method: "POST",
      });
      const data = await res.json();
      setTestMsg({ ok: Boolean(data.ok), detail: data.detail ?? "No response." });
      await load();
    } catch (e) {
      setTestMsg({
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setTesting(false);
    }
  }

  if (!s) {
    return (
      <div className="card p-10 text-center text-[var(--ink-3)] text-sm mt-2">
        Loading…
      </div>
    );
  }

  const tg = s.delivery.telegram;

  return (
    <div className="space-y-5 pt-2 max-w-4xl">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Settings</h1>
          <p className="text-[var(--ink-3)] text-sm mt-1">
            Where things are delivered, when, and who signs them off.
          </p>
        </div>
        {saved && (
          <span className="text-[12px] text-[var(--success)]">Saved.</span>
        )}
      </div>

      <Section
        title="Telegram"
        blurb="The daily report is pushed to a Telegram chat rather than waiting in a dashboard nobody has open at 08:00."
      >
        <Toggle
          checked={tg.enabled}
          onChange={(v) =>
            save({ delivery: { ...s.delivery, telegram: { ...tg, enabled: v } } })
          }
          title="Send to Telegram"
          detail="Daily report, and anything else ticked under Notifications."
        />

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={label} htmlFor="tg-token">
              Bot token
            </label>
            <input
              id="tg-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={tg.hasToken ? tg.botToken : "123456:ABC-DEF…"}
              className={field}
              autoComplete="off"
            />
            <p className="text-[10.5px] text-[var(--ink-4)] mt-1.5 leading-relaxed">
              {tg.hasToken
                ? "A token is saved. Leave blank to keep it; type a new one to replace it."
                : "From @BotFather → /newbot. Write-only: it is never sent back to this page."}
            </p>
          </div>
          <div>
            <label className={label} htmlFor="tg-chat">
              Chat ID
            </label>
            <input
              id="tg-chat"
              value={tg.chatId}
              onChange={(e) =>
                setS({
                  ...s,
                  delivery: {
                    ...s.delivery,
                    telegram: { ...tg, chatId: e.target.value },
                  },
                })
              }
              placeholder="-1001234567890"
              className={field}
            />
            <p className="text-[10.5px] text-[var(--ink-4)] mt-1.5 leading-relaxed">
              Add the bot to the group, then read the id from{" "}
              <code className="text-[var(--accent)]">getUpdates</code>. Group ids start
              with a minus.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() =>
              save({
                delivery: {
                  ...s.delivery,
                  telegram: {
                    ...tg,
                    chatId: tg.chatId,
                    ...(token ? { botToken: token } : {}),
                  },
                },
              })
            }
            disabled={saving}
            className="text-[12px] font-semibold px-3.5 py-2 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
          >
            {saving ? "Saving…" : "Save connection"}
          </button>
          <button
            onClick={testTelegram}
            disabled={testing || !tg.hasToken || !tg.chatId}
            className="text-[12px] font-semibold px-3.5 py-2 rounded-lg border border-[var(--line)] hover:border-[var(--accent)]/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title={
              !tg.hasToken || !tg.chatId
                ? "Save a bot token and chat ID first"
                : "Sends the latest real report, not a hello-world"
            }
          >
            {testing ? "Sending…" : "Send the latest report now"}
          </button>
          {tg.lastTestAt && (
            <span className="text-[11px] text-[var(--ink-3)]">
              Last test {tg.lastTestAt.slice(0, 16).replace("T", " ")} —{" "}
              <span
                className={tg.lastTestOk ? "text-[var(--success)]" : "text-[var(--danger)]"}
              >
                {tg.lastTestOk ? "delivered" : "failed"}
              </span>
            </span>
          )}
        </div>

        {testMsg && (
          <div
            className={`text-[12px] rounded-lg px-3.5 py-2.5 border ${
              testMsg.ok
                ? "text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10"
                : "text-[var(--danger)] border-[var(--danger)]/30 bg-[var(--danger)]/10"
            }`}
          >
            {testMsg.detail}
          </div>
        )}
      </Section>

      <Section
        title="Schedule"
        blurb="When the daily report goes out. Malaysia's working week is not uniform — Kelantan, Terengganu and Kedah run Sunday to Thursday — so the days are explicit rather than assumed."
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={label} htmlFor="time">
              Send at
            </label>
            <input
              id="time"
              type="time"
              value={s.schedule.dailyReportTime}
              onChange={(e) =>
                save({
                  schedule: { ...s.schedule, dailyReportTime: e.target.value },
                })
              }
              className={field}
            />
          </div>
          <div>
            <label className={label} htmlFor="tz">
              Timezone
            </label>
            <select
              id="tz"
              value={s.schedule.timezone}
              onChange={(e) =>
                save({ schedule: { ...s.schedule, timezone: e.target.value } })
              }
              className={field}
            >
              {TIMEZONES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <span className={label}>Days</span>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map(([id, name]) => {
              const on = s.schedule.days.includes(id);
              return (
                <button
                  key={id}
                  onClick={() =>
                    save({
                      schedule: {
                        ...s.schedule,
                        days: on
                          ? s.schedule.days.filter((d) => d !== id)
                          : [...s.schedule.days, id],
                      },
                    })
                  }
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                    on
                      ? "bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30"
                      : "border border-[var(--line)] text-[var(--ink-3)] hover:text-[var(--ink)]"
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      </Section>

      <Section title="Notifications" blurb="What gets pushed, beyond the report.">
        <Toggle
          checked={s.notify.dailyReport}
          onChange={(v) => save({ notify: { ...s.notify, dailyReport: v } })}
          title="Daily report"
          detail="Headline finding, key numbers and the actions arising."
        />
        <Toggle
          checked={s.notify.runReady}
          onChange={(v) => save({ notify: { ...s.notify, runReady: v } })}
          title="Article ready for review"
          detail="When a draft clears the pipeline and is waiting on a human."
        />
        <Toggle
          checked={s.notify.reviewBlockers}
          onChange={(v) => save({ notify: { ...s.notify, reviewBlockers: v } })}
          title="Blockers raised"
          detail="A fabricated citation or a campaign-limit breach should interrupt someone, not sit in a queue."
        />
        <Toggle
          checked={s.notify.weeklyDigest}
          onChange={(v) => save({ notify: { ...s.notify, weeklyDigest: v } })}
          title="Weekly digest"
          detail="Volume, spend and what was published, Monday morning."
        />
      </Section>

      <Section
        title="Approvals"
        blurb="Who takes editorial responsibility. Recorded against every export."
      >
        <Toggle
          checked={s.approvals.requireApprovalBeforeExport}
          onChange={(v) =>
            save({
              approvals: { ...s.approvals, requireApprovalBeforeExport: v },
            })
          }
          title="Require approval before a draft leaves the dashboard"
          detail="Turning this off would let drafts reach a Doc unread. The wires are third parties and a release cannot be recalled."
        />
        <div>
          <label className={label} htmlFor="approvers">
            Approvers
          </label>
          <input
            id="approvers"
            value={s.approvals.approvers}
            onChange={(e) =>
              setS({
                ...s,
                approvals: { ...s.approvals, approvers: e.target.value },
              })
            }
            onBlur={() => save({ approvals: s.approvals })}
            placeholder="liam@coinpresso.io, pete@coinpresso.io"
            className={field}
          />
        </div>
      </Section>


      <Section
        title="WordPress — coinpresso.io"
        blurb="Where approved blog posts are created, and where the published archive is imported from. Reading needs no credentials; writing does."
      >
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className={label} htmlFor="wp-url">
              Site URL
            </label>
            <input
              id="wp-url"
              value={s.wordpress.siteUrl}
              onChange={(e) =>
                setS({
                  ...s,
                  wordpress: { ...s.wordpress, siteUrl: e.target.value },
                })
              }
              placeholder="https://coinpresso.io"
              className={field}
            />
            <p className="text-[10.5px] text-[var(--ink-4)] mt-1.5 leading-relaxed">
              No trailing slash needed. The REST API is found at{" "}
              <code className="text-[var(--accent)]">/wp-json</code>.
            </p>
          </div>
          <div>
            <label className={label} htmlFor="wp-user">
              Username
            </label>
            <input
              id="wp-user"
              value={s.wordpress.username}
              onChange={(e) =>
                setS({
                  ...s,
                  wordpress: { ...s.wordpress, username: e.target.value },
                })
              }
              placeholder="pexalo-agent"
              className={field}
              autoComplete="off"
            />
            <p className="text-[10.5px] text-[var(--ink-4)] mt-1.5 leading-relaxed">
              The WordPress account posts will be authored by. Author or Editor.
            </p>
          </div>
          <div>
            <label className={label} htmlFor="wp-pass">
              Application password
            </label>
            <input
              id="wp-pass"
              type="password"
              value={appPw}
              onChange={(e) => setAppPw(e.target.value)}
              placeholder={
                s.wordpress.hasAppPassword
                  ? s.wordpress.appPassword
                  : "xxxx xxxx xxxx xxxx xxxx xxxx"
              }
              className={field}
              autoComplete="off"
            />
            <p className="text-[10.5px] text-[var(--ink-4)] mt-1.5 leading-relaxed">
              {s.wordpress.hasAppPassword
                ? "A password is saved. Leave blank to keep it; type a new one to replace it."
                : "WP Admin → Users → Profile → Application Passwords. Not the account password — revoking it locks out only this integration."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={saveWordPress}
            disabled={saving}
            className="text-[12px] font-semibold px-3.5 py-2 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
          >
            {saving ? "Saving…" : "Save connection"}
          </button>
          <a
            href={`/client/${ref}/own-blog/integration`}
            className="text-[12px] font-semibold px-3.5 py-2 rounded-lg border border-[var(--line)] hover:border-[var(--accent)]/50 transition-colors"
          >
            Test it and import the archive
          </a>
        </div>

        <p className="text-[11px] text-[var(--ink-3)] leading-relaxed">
          Posts are only ever created as <strong>drafts</strong>. There is no
          publish setting here because there is no publish path in the code —
          whoever publishes does it in WordPress, having read the post.
        </p>
      </Section>

      <Section
        title="Data sources"
        blurb="Where the daily report's numbers come from. Empty means the report is running on transcribed figures rather than live data."
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={label} htmlFor="looker">
              Looker Studio report URL
            </label>
            <input
              id="looker"
              value={s.integrations.lookerStudioUrl}
              onChange={(e) =>
                setS({
                  ...s,
                  integrations: {
                    ...s.integrations,
                    lookerStudioUrl: e.target.value,
                  },
                })
              }
              onBlur={() => save({ integrations: s.integrations })}
              placeholder="https://lookerstudio.google.com/…"
              className={field}
            />
          </div>
          <div>
            <label className={label} htmlFor="ga4">
              GA4 property ID
            </label>
            <input
              id="ga4"
              value={s.integrations.ga4PropertyId}
              onChange={(e) =>
                setS({
                  ...s,
                  integrations: {
                    ...s.integrations,
                    ga4PropertyId: e.target.value,
                  },
                })
              }
              onBlur={() => save({ integrations: s.integrations })}
              placeholder="properties/123456789"
              className={field}
            />
          </div>
          <div>
            <label className={label} htmlFor="meta">
              Meta ad account ID
            </label>
            <input
              id="meta"
              value={s.integrations.metaAdAccountId}
              onChange={(e) =>
                setS({
                  ...s,
                  integrations: {
                    ...s.integrations,
                    metaAdAccountId: e.target.value,
                  },
                })
              }
              onBlur={() => save({ integrations: s.integrations })}
              placeholder="act_1234567890"
              className={field}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="sheet">
              Content calendar sheet ID
            </label>
            <input
              id="sheet"
              value={s.integrations.contentCalendarSheetId}
              onChange={(e) =>
                setS({
                  ...s,
                  integrations: {
                    ...s.integrations,
                    contentCalendarSheetId: e.target.value,
                  },
                })
              }
              onBlur={() => save({ integrations: s.integrations })}
              placeholder="1WBmkWxbpfeORG_uL8Kl9JAGdYcVjh5qaBA61qstbMmc"
              className={field}
            />
          </div>
        </div>
      </Section>

      <div className="card p-5">
        <h2 className="font-bold text-sm mb-2">A note on the bot token</h2>
        <p className="text-[12px] text-[var(--ink-2)] leading-relaxed">
          It is a credential. This prototype stores it under{" "}
          <code className="text-[var(--accent)]">.data/settings</code> and never returns
          it to the browser — the field above is write-only and shows only the
          last four characters once saved. When this moves into Pexalo HQ it
          belongs in the same secret store as the model keys. Anyone holding the
          token can post as the bot, so it should not travel by email or land in
          the repo.
        </p>
      </div>
    </div>
  );
}
