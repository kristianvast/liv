import { describe, expect, test } from "bun:test";
import { createMailer, type EmailLinks, emails } from "../src/mailer";
import type { FetchLike } from "../src/shape";

const links: EmailLinks = {
  siteUrl: "https://barnstar.dev/",
  downloadUrl: "https://github.com/kristianvast/orbit/releases/latest",
};

function capture() {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetch: FetchLike = async (input, init) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return new Response("{}", { status: 200 });
  };
  return { calls, fetch };
}

describe("emails", () => {
  test("customer emails carry a branded HTML part with the same link as the text part", () => {
    const mail = emails.verify(links, "farmer@example.test", "tok-123");
    const link = "https://barnstar.dev/account/?verify=tok-123";
    expect(mail.text).toContain(link);
    expect(mail.html).toContain(`href="${link}"`);
    expect(mail.html).toContain(
      'src="https://barnstar.dev/shared/logo/barnstar-wordmark-light.png"',
    );
  });

  test("user-supplied farm names are escaped in HTML and kept verbatim in text", () => {
    const mail = emails.invite(
      links,
      "a@example.test",
      `<img src=x onerror="hack()">`,
      "worker",
      "ABCD-1234",
    );
    expect(mail.html).not.toContain("<img src=x");
    expect(mail.html).toContain("&lt;img src=x onerror=&quot;hack()&quot;&gt;");
    expect(mail.text).toContain(`<img src=x onerror="hack()">`);
    expect(mail.text).toContain("ABCD-1234");
  });

  test("every style attribute stays one well-formed attribute", () => {
    const all = [
      emails.verify(links, "a@example.test", "t"),
      emails.reset(links, "a@example.test", "t"),
      emails.passwordChanged(links, "a@example.test"),
      emails.invite(links, "a@example.test", "Farm", "worker", "CODE"),
      emails.planActive(links, "a@example.test", "cam4", "year"),
      emails.hardwareOrder(links, "a@example.test", 1, 4),
    ];
    for (const mail of all) {
      // A double quote inside a style value ends the attribute early and drops the rest of the styling.
      expect(mail.html?.match(/style="[^"]*"[^\s>]/)).toBeNull();
    }
  });

  test("internal notices stay plain text", () => {
    expect(emails.orderNotice("ops@example.test", "cs_1", 1, 4, null).html).toBeUndefined();
  });
});

describe("providers", () => {
  const mail = emails.reset(links, "farmer@example.test", "tok-9");

  test("resend sends html and reply_to", async () => {
    const { calls, fetch } = capture();
    const from = "Barnstar <no-reply@barnstar.dev>";
    await createMailer({
      provider: "resend",
      apiKey: "k",
      from,
      replyTo: "hello@barnstar.dev",
      fetch,
    }).send(mail);
    expect(calls[0]?.body).toMatchObject({
      from,
      reply_to: "hello@barnstar.dev",
      html: mail.html,
      text: mail.text,
    });
  });

  test("postmark sends HtmlBody and ReplyTo", async () => {
    const { calls, fetch } = capture();
    await createMailer({
      provider: "postmark",
      apiKey: "k",
      from: "x@barnstar.dev",
      replyTo: "hello@barnstar.dev",
      fetch,
    }).send(mail);
    expect(calls[0]?.body).toMatchObject({
      ReplyTo: "hello@barnstar.dev",
      HtmlBody: mail.html,
      TextBody: mail.text,
    });
  });

  test("a sender without reply-to omits the field", async () => {
    const { calls, fetch } = capture();
    await createMailer({ provider: "resend", apiKey: "k", from: "x@barnstar.dev", fetch }).send(
      mail,
    );
    expect(calls[0]?.body).not.toHaveProperty("reply_to");
  });
});
