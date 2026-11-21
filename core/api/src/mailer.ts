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
  /** Where replies go, e.g. kristian@agrointel.no, so a no-reply sender still reaches a person. */
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
  /** Public website origin, e.g. https://agrointel.no; links land on its /account/ page. */
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

const SUPPORT = "kristian@agrointel.no";
// The agrointel.no light palette (apps/liv/src/design/tokens.css): navy ink, lime from the bull mark
// for the button (navy text on it), and a darker green for links and accents on white.
const INK = "#0b1020";
const BODY = "#3e4656";
const MUTED = "#636c7e";
const FAINT = "#7c8596";
const LIME = "#86de28";
const GREEN = "#3f7f0c";
const LINE = "#d8dfd0";
const PAGE = "#ebefe6";
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
        : `<a href="${escapeHtml(part.href)}" style="color:${GREEN};text-decoration:underline;">${escapeHtml(part.text)}</a>`,
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
  return [content.heading, ...body, `--\nAgrointel · ${siteRoot(links)} · ${SUPPORT}`].join("\n\n");
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
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 28px;"><tr><td bgcolor="${LIME}" style="border-radius:10px;background:${LIME};"><a href="${href}" target="_blank" style="display:inline-block;padding:15px 30px;font-family:${FONT};font-size:16px;font-weight:600;line-height:20px;color:${INK};text-decoration:none;border-radius:10px;">${escapeHtml(block.label)}&nbsp;&rarr;</a></td></tr></table>
<p style="margin:0 0 24px;font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED};">Button not working? Paste this link into your browser:<br><a href="${href}" style="color:${MUTED};word-break:break-all;">${href}</a></p>`;
    }
    case "code":
      return `<p style="margin:0 0 8px;font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${MUTED};">${escapeHtml(block.label)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;"><tr><td align="center" style="padding:20px 16px;background:#f5f7f2;border:1px dashed #b2bcaa;border-radius:12px;font-family:${MONO};font-size:24px;font-weight:600;letter-spacing:3px;color:${INK};word-break:break-all;">${escapeHtml(block.value)}</td></tr></table>`;
    case "steps":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">${block.items
        .map(
          (item, i) =>
            `<tr><td valign="top" width="40" style="padding:0 0 16px;"><div style="width:28px;height:28px;border-radius:14px;background:#effbe3;border:1px solid #d1f2ad;font-family:${FONT};font-size:13px;font-weight:700;line-height:28px;text-align:center;color:${GREEN};">${i + 1}</div></td><td valign="top" style="padding:3px 0 16px;font-family:${FONT};font-size:15px;line-height:23px;color:${BODY};">${inlineHtml(item)}</td></tr>`,
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
  a { color:${GREEN}; }
  @media (max-width:620px) {
    .shell { padding:20px 12px !important; }
    .card { padding:32px 24px 28px !important; border-radius:16px !important; }
    .heading { font-size:26px !important; line-height:32px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${PAGE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(content.preheader)}${"&#8199;&#65279;&#847; ".repeat(30)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE}" style="background:${PAGE};">
<tr><td align="center" class="shell" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:0 4px 24px;"><a href="${escapeHtml(site)}" target="_blank" style="text-decoration:none;"><img src="${escapeHtml(site)}/shared/logo/agrointel-wordmark-light.png" width="156" height="34" alt="Agrointel" style="display:block;width:156px;height:auto;border:0;outline:none;"></a></td></tr>
<tr><td class="card" bgcolor="#ffffff" style="background:#ffffff;border-radius:20px;padding:44px 44px 36px;border:1px solid ${LINE};box-shadow:0 1px 2px rgba(11,16,32,0.04),0 12px 32px rgba(11,16,32,0.06);">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:0 0 24px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="28" height="3" bgcolor="${LIME}" style="font-size:0;line-height:0;background:${LIME};border-radius:2px;">&nbsp;</td><td width="6" style="font-size:0;">&nbsp;</td><td width="14" height="3" bgcolor="${INK}" style="font-size:0;line-height:0;background:${INK};border-radius:2px;">&nbsp;</td></tr></table></td></tr></table>
<p style="margin:0 0 10px;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${GREEN};">${escapeHtml(content.eyebrow)}</p>
<h1 class="heading" style="margin:0 0 20px;font-family:${FONT};font-size:30px;font-weight:700;line-height:36px;letter-spacing:-0.6px;color:${INK};">${escapeHtml(content.heading)}</h1>
${content.blocks.map(renderBlock).join("\n")}
</td></tr>
<tr><td style="padding:28px 8px 0;font-family:${FONT};font-size:13px;line-height:21px;color:${MUTED};">
Cameras that know every animal. An open app that builds what you ask.<br>
Questions? Reply to this email or write to <a href="mailto:${SUPPORT}" style="color:${BODY};text-decoration:underline;">${SUPPORT}</a>.
</td></tr>
<tr><td style="padding:16px 8px 0;font-family:${FONT};font-size:12px;line-height:19px;color:${FAINT};">
Agrointel AS &middot; Finn&oslash;y, Norway &middot; <a href="${escapeHtml(site)}" style="color:${FAINT};text-decoration:underline;">${host}</a>
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
  text: "Download Liv",
  href: links.downloadUrl,
});

export const emails = {
  verify(links: EmailLinks, to: string, token: string): EmailMessage {
    return compose(links, to, "verify_email", "Confirm your Agrointel email address", {
      preheader: "One click and your Agrointel account is ready.",
      eyebrow: "Welcome to Agrointel",
      heading: "Confirm your email address",
      blocks: [
        { kind: "p", parts: [`Confirm ${to} to finish setting up your Agrointel account.`] },
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
    return compose(links, to, "password_reset", "Reset your Agrointel password", {
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
    return compose(links, to, "password_changed", "Your Agrointel password was changed", {
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
    return compose(links, to, "farm_invite", `You are invited to ${farmName} on Agrointel`, {
      preheader: `Join ${farmName} as ${role}. The invite works for 7 days.`,
      eyebrow: "Farm invite",
      heading: `Join ${farmName}`,
      blocks: [
        { kind: "p", parts: [`You have been invited to join ${farmName} as ${role}.`] },
        {
          kind: "steps",
          items: [
            ["Install Liv: ", download(links)],
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
    return compose(links, to, "plan_active", `Your Agrointel ${name} plan is active`, {
      preheader: `Thanks! Your ${name} plan is active and Liv is ready.`,
      eyebrow: "Plan active",
      heading: "Thanks! Your plan is active.",
      blocks: [
        {
          kind: "p",
          parts: ["Liv is ready on Agrointel's cloud. Here is how to get started on the farm."],
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
            ["Install Liv on the farm PC: ", download(links)],
            [`Open Settings > Account and sign in with ${to}.`],
            [
              "Ask Liv anything about your herd. Your monthly Liv allowance is included in the plan.",
            ],
          ],
        },
        { kind: "button", label: "Manage your plan", href: accountLink(links, {}) },
        { kind: "note", parts: ["You can change or cancel your plan any time."] },
      ],
    });
  },
  hardwareOrder(links: EmailLinks, to: string, boxes: number, cameras: number): EmailMessage {
    return compose(links, to, "hardware_order", "Your Agrointel order is confirmed", {
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
            ["Agrointel box", `${boxes}`],
            ["Cameras", `${cameras}`],
          ],
        },
        { kind: "p", parts: ["While you wait, get the farm PC ready:"] },
        {
          kind: "steps",
          items: [
            ["Install Liv on the farm PC: ", download(links)],
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
