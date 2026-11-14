// Transactional email: verification, password reset, invites, purchase receipts.
// `log` (the default outside production) prints each message instead of sending it.

import { planFor } from "./plans";
import type { FetchLike } from "./shape";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Branded HTML part; customer emails carry one, internal notices stay plain text. */
  html?: string;
  template: string;
}

export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}

export interface MailerConfig {
  provider?: string;
  apiKey?: string;
  from?: string;
  /** Where replies go, e.g. hello@barnstar.dev, so a no-reply sender still reaches a person. */
  replyTo?: string;
  fetch?: FetchLike;
}

export class MailerError extends Error {}

export function createLogMailer(
  write: (line: string) => void = (line) => console.log(line),
): Mailer & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
      write(
        `[mail:${message.template}] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`,
      );
    },
  };
}

interface Sender {
  apiKey: string;
  from: string;
  replyTo?: string;
  doFetch: FetchLike;
}

function createResendMailer({ apiKey, from, replyTo, doFetch }: Sender): Mailer {
  return {
    async send(message) {
      const res = await doFetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          from,
          to: [message.to],
          ...(replyTo ? { reply_to: replyTo } : {}),
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
          tags: [{ name: "template", value: message.template }],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new MailerError(`resend answered ${res.status}: ${await res.text()}`);
    },
  };
}

function createPostmarkMailer({ apiKey, from, replyTo, doFetch }: Sender): Mailer {
  return {
    async send(message) {
      const res = await doFetch("https://api.postmarkapp.com/email", {
        method: "POST",
        headers: {
          "x-postmark-server-token": apiKey,
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          From: from,
          To: message.to,
          ...(replyTo ? { ReplyTo: replyTo } : {}),
          Subject: message.subject,
          TextBody: message.text,
          ...(message.html ? { HtmlBody: message.html } : {}),
          Tag: message.template,
          MessageStream: "outbound",
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new MailerError(`postmark answered ${res.status}: ${await res.text()}`);
    },
  };
}

export function createMailer(config: MailerConfig): Mailer {
  const provider = config.provider || "log";
  if (provider === "log") return createLogMailer();
  const doFetch = config.fetch ?? ((input, init) => fetch(input, init));
  if (!config.apiKey || !config.from) {
    throw new MailerError(`MAIL_PROVIDER=${provider} needs MAIL_API_KEY and MAIL_FROM`);
  }
  const sender: Sender = {
    apiKey: config.apiKey,
    from: config.from,
    ...(config.replyTo ? { replyTo: config.replyTo } : {}),
    doFetch,
  };
  if (provider === "resend") return createResendMailer(sender);
  if (provider === "postmark") return createPostmarkMailer(sender);
  throw new MailerError(`unknown MAIL_PROVIDER ${provider}`);
}

export interface EmailLinks {
  /** Public website origin, e.g. https://barnstar.dev; links land on its /account/ page. */
  siteUrl: string;
  downloadUrl: string;
}

const siteRoot = (links: EmailLinks) => links.siteUrl.replace(/\/+$/, "");

const accountLink = (links: EmailLinks, query: Record<string, string>) => {
  const search = new URLSearchParams(query).toString();
  return `${siteRoot(links)}/account/${search ? `?${search}` : ""}`;
};

// One content model renders both parts, so the plain-text and HTML versions never drift apart.
type Inline = string | { text: string; href: string };
type Block =
  | { kind: "p"; parts: Inline[] }
  | { kind: "button"; label: string; href: string }
  | { kind: "code"; label: string; value: string }
  | { kind: "steps"; items: Inline[][] }
  | { kind: "facts"; rows: [string, string][] }
  | { kind: "note"; parts: Inline[] };

interface Content {
  /** Inbox preview line shown next to the subject. */
  preheader: string;
  eyebrow: string;
  heading: string;
  blocks: Block[];
}

const SUPPORT = "hello@barnstar.dev";
const INK = "#1b1915";
const BODY = "#4a443b";
const MUTED = "#8a8275";
const AMBER = "#b4611d";
const LINE = "#e8e1d4";
// Single quotes only: these stacks sit inside double-quoted style attributes.
const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif`;
const MONO = `ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const inlineText = (parts: Inline[]) =>
  parts
    .map((part) =>
      typeof part === "string"
        ? part
        : part.text === part.href
          ? part.href
          : `${part.text} (${part.href})`,
    )
    .join("");

const inlineHtml = (parts: Inline[]) =>
  parts
    .map((part) =>
      typeof part === "string"
        ? escapeHtml(part)
        : `<a href="${escapeHtml(part.href)}" style="color:${AMBER};text-decoration:underline;">${escapeHtml(part.text)}</a>`,
    )
    .join("");

function blockText(block: Block): string {
  switch (block.kind) {
    case "p":
    case "note":
      return inlineText(block.parts);
    case "button":
      return `${block.label}:\n${block.href}`;
    case "code":
      return `${block.label}:\n\n    ${block.value}`;
    case "steps":
      return block.items.map((item, i) => `${i + 1}. ${inlineText(item)}`).join("\n");
    case "facts":
      return block.rows.map(([label, value]) => `${label}: ${value}`).join("\n");
  }
}

function renderText(content: Content, links: EmailLinks): string {
  const body = content.blocks.map(blockText);
  return [content.heading, ...body, `--\nBarnstar · ${siteRoot(links)} · ${SUPPORT}`].join("\n\n");
}

function renderBlock(block: Block): string {
  const para = `margin:0 0 20px;font-family:${FONT};font-size:16px;line-height:26px;color:${BODY};`;
  switch (block.kind) {
    case "p":
      return `<p style="${para}">${inlineHtml(block.parts)}</p>`;
    case "note":
      return `<p style="margin:0 0 4px;font-family:${FONT};font-size:14px;line-height:22px;color:${MUTED};">${inlineHtml(block.parts)}</p>`;
    case "button": {
      const href = escapeHtml(block.href);
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 28px;"><tr><td bgcolor="${AMBER}" style="border-radius:10px;background:${AMBER};"><a href="${href}" target="_blank" style="display:inline-block;padding:15px 30px;font-family:${FONT};font-size:16px;font-weight:600;line-height:20px;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(block.label)}&nbsp;&rarr;</a></td></tr></table>
<p style="margin:0 0 24px;font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED};">Button not working? Paste this link into your browser:<br><a href="${href}" style="color:${MUTED};word-break:break-all;">${href}</a></p>`;
    }
    case "code":
      return `<p style="margin:0 0 8px;font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${MUTED};">${escapeHtml(block.label)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;"><tr><td align="center" style="padding:20px 16px;background:#f6f1e7;border:1px dashed #d9cdb8;border-radius:12px;font-family:${MONO};font-size:24px;font-weight:600;letter-spacing:3px;color:${INK};word-break:break-all;">${escapeHtml(block.value)}</td></tr></table>`;
    case "steps":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">${block.items
        .map(
          (item, i) =>
            `<tr><td valign="top" width="40" style="padding:0 0 16px;"><div style="width:28px;height:28px;border-radius:14px;background:#fbefe2;border:1px solid #efd3b6;font-family:${FONT};font-size:13px;font-weight:700;line-height:28px;text-align:center;color:${AMBER};">${i + 1}</div></td><td valign="top" style="padding:3px 0 16px;font-family:${FONT};font-size:15px;line-height:23px;color:${BODY};">${inlineHtml(item)}</td></tr>`,
        )
        .join("")}</table>`;
    case "facts":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;border:1px solid ${LINE};border-radius:12px;border-collapse:separate;">${block.rows
        .map(
          ([label, value], i) =>
            `<tr><td style="padding:14px 18px;${i ? `border-top:1px solid ${LINE};` : ""}font-family:${FONT};font-size:14px;color:${MUTED};">${escapeHtml(label)}</td><td align="right" style="padding:14px 18px;${i ? `border-top:1px solid ${LINE};` : ""}font-family:${FONT};font-size:15px;font-weight:600;color:${INK};">${escapeHtml(value)}</td></tr>`,
        )
        .join("")}</table>`;
  }
}

function renderHtml(content: Content, links: EmailLinks, subject: string): string {
  const site = siteRoot(links);
  const host = escapeHtml(site.replace(/^https?:\/\//, ""));
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${escapeHtml(subject)}</title>
<style>
  :root { color-scheme: light only; }
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; }
  a { color:${AMBER}; }
  @media (max-width:620px) {
    .shell { padding:20px 12px !important; }
    .card { padding:32px 24px 28px !important; border-radius:16px !important; }
    .heading { font-size:26px !important; line-height:32px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f3eee5;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(content.preheader)}${"&#8199;&#65279;&#847; ".repeat(30)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f3eee5" style="background:#f3eee5;">
<tr><td align="center" class="shell" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:0 4px 24px;"><a href="${escapeHtml(site)}" target="_blank" style="text-decoration:none;"><img src="${escapeHtml(site)}/shared/logo/barnstar-wordmark-light.png" width="156" height="34" alt="Barnstar" style="display:block;width:156px;height:auto;border:0;outline:none;"></a></td></tr>
<tr><td class="card" bgcolor="#ffffff" style="background:#ffffff;border-radius:20px;padding:44px 44px 36px;border:1px solid ${LINE};box-shadow:0 1px 2px rgba(27,25,21,0.04),0 12px 32px rgba(27,25,21,0.06);">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:0 0 24px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="28" height="3" bgcolor="${AMBER}" style="font-size:0;line-height:0;background:${AMBER};border-radius:2px;">&nbsp;</td><td width="6" style="font-size:0;">&nbsp;</td><td width="14" height="3" bgcolor="#2f9a5c" style="font-size:0;line-height:0;background:#2f9a5c;border-radius:2px;">&nbsp;</td></tr></table></td></tr></table>
<p style="margin:0 0 10px;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${AMBER};">${escapeHtml(content.eyebrow)}</p>
<h1 class="heading" style="margin:0 0 20px;font-family:${FONT};font-size:30px;font-weight:700;line-height:36px;letter-spacing:-0.6px;color:${INK};">${escapeHtml(content.heading)}</h1>
${content.blocks.map(renderBlock).join("\n")}
</td></tr>
<tr><td style="padding:28px 8px 0;font-family:${FONT};font-size:13px;line-height:21px;color:${MUTED};">
Cameras that know every animal. An open app that builds what you ask.<br>
Questions? Reply to this email or write to <a href="mailto:${SUPPORT}" style="color:${BODY};text-decoration:underline;">${SUPPORT}</a>.
</td></tr>
<tr><td style="padding:16px 8px 0;font-family:${FONT};font-size:12px;line-height:19px;color:#a89f90;">
Barnstar AS &middot; Finn&oslash;y, Norway &middot; <a href="${escapeHtml(site)}" style="color:#a89f90;text-decoration:underline;">${host}</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function compose(
  links: EmailLinks,
  to: string,
  template: string,
  subject: string,
  content: Content,
): EmailMessage {
  return {
    to,
    template,
    subject,
    text: renderText(content, links),
    html: renderHtml(content, links, subject),
  };
}

const download = (links: EmailLinks): Inline => ({
  text: "Download Orbit",
  href: links.downloadUrl,
});

export const emails = {
  verify(links: EmailLinks, to: string, token: string): EmailMessage {
    return compose(links, to, "verify_email", "Confirm your Barnstar email address", {
      preheader: "One click and your Barnstar account is ready.",
      eyebrow: "Welcome to Barnstar",
      heading: "Confirm your email address",
      blocks: [
        { kind: "p", parts: [`Confirm ${to} to finish setting up your Barnstar account.`] },
        { kind: "button", label: "Confirm email", href: accountLink(links, { verify: token }) },
        {
          kind: "note",
          parts: [
            "The link works for 48 hours. If you did not create an account, ignore this email.",
          ],
        },
      ],
    });
  },
  reset(links: EmailLinks, to: string, token: string): EmailMessage {
    return compose(links, to, "password_reset", "Reset your Barnstar password", {
      preheader: "Choose a new password. The link works for one hour.",
      eyebrow: "Account security",
      heading: "Reset your password",
      blocks: [
        {
          kind: "p",
          parts: [`Someone asked to reset the password for ${to}. Choose a new one here.`],
        },
        {
          kind: "button",
          label: "Choose a new password",
          href: accountLink(links, { reset: token }),
        },
        {
          kind: "note",
          parts: [
            "The link works for one hour and signs you out everywhere else. If it was not you, ignore this email; your password stays the same.",
          ],
        },
      ],
    });
  },
  passwordChanged(links: EmailLinks, to: string): EmailMessage {
    return compose(links, to, "password_changed", "Your Barnstar password was changed", {
      preheader: "Every device was signed out. Not you? Reset it now.",
      eyebrow: "Account security",
      heading: "Your password was changed",
      blocks: [
        {
          kind: "p",
          parts: [`The password for ${to} was just changed and every device was signed out.`],
        },
        {
          kind: "p",
          parts: [
            "If this was not you, reset your password right away from the ",
            { text: "sign-in page", href: accountLink(links, {}) },
            " and contact us.",
          ],
        },
      ],
    });
  },
  invite(
    links: EmailLinks,
    to: string,
    farmName: string,
    role: string,
    code: string,
  ): EmailMessage {
    return compose(links, to, "farm_invite", `You are invited to ${farmName} on Barnstar`, {
      preheader: `Join ${farmName} as ${role}. The invite works for 7 days.`,
      eyebrow: "Farm invite",
      heading: `Join ${farmName}`,
      blocks: [
        { kind: "p", parts: [`You have been invited to join ${farmName} as ${role}.`] },
        {
          kind: "steps",
          items: [
            ["Install Orbit: ", download(links)],
            [`Sign in or create an account with this email address (${to}).`],
            ["In Settings > Account, enter this invite code:"],
          ],
        },
        { kind: "code", label: "Invite code", value: code },
        { kind: "note", parts: ["The invite works for 7 days."] },
      ],
    });
  },
  planActive(links: EmailLinks, to: string, plan: string, interval: string): EmailMessage {
    const name = planFor(plan).name;
    const billing = interval === "year" ? "Yearly" : "Monthly";
    return compose(links, to, "plan_active", `Your Barnstar ${name} plan is active`, {
      preheader: `Thanks! Your ${name} plan is active and Orion is ready.`,
      eyebrow: "Plan active",
      heading: "Thanks! Your plan is active.",
      blocks: [
        {
          kind: "p",
          parts: ["Orion is ready on Barnstar's cloud. Here is how to get started on the farm."],
        },
        {
          kind: "facts",
          rows: [
            ["Plan", name],
            ["Billing", billing],
            ["Account", to],
          ],
        },
        {
          kind: "steps",
          items: [
            ["Install Orbit on the farm PC: ", download(links)],
            [`Open Settings > Account and sign in with ${to}.`],
            [
              "Ask Orion anything about your herd. Your monthly Orion allowance is included in the plan.",
            ],
          ],
        },
        { kind: "button", label: "Manage your plan", href: accountLink(links, {}) },
        { kind: "note", parts: ["You can change or cancel your plan any time."] },
      ],
    });
  },
  hardwareOrder(links: EmailLinks, to: string, boxes: number, cameras: number): EmailMessage {
    return compose(links, to, "hardware_order", "Your Barnstar order is confirmed", {
      preheader: "Thanks for your order. We will email tracking details when it ships.",
      eyebrow: "Order confirmed",
      heading: "Thanks for your order",
      blocks: [
        {
          kind: "p",
          parts: ["Your hardware is confirmed. We will email tracking details when it ships."],
        },
        {
          kind: "facts",
          rows: [
            ["Barnstar box", `${boxes}`],
            ["Cameras", `${cameras}`],
          ],
        },
        { kind: "p", parts: ["While you wait, get the farm PC ready:"] },
        {
          kind: "steps",
          items: [
            ["Install Orbit on the farm PC: ", download(links)],
            [
              `Create your account with ${to} at `,
              {
                text: `${siteRoot(links).replace(/^https?:\/\//, "")}/account`,
                href: accountLink(links, {}),
              },
              ".",
            ],
          ],
        },
      ],
    });
  },
  orderNotice(
    to: string,
    sessionId: string,
    boxes: number,
    cameras: number,
    buyer: string | null,
  ): EmailMessage {
    return {
      to,
      template: "order_notice",
      subject: `New hardware order ${sessionId}`,
      text: `Paid hardware order ${sessionId}: ${boxes} box(es), ${cameras} camera(s), buyer ${buyer ?? "unknown"}. Shipping details are in Stripe and the hardware_orders table.`,
    };
  },
};
