import type { AccountStatus } from "@liv/protocol";
import { Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useLocation } from "react-router";
import { Button, Input, useToast } from "../../design";
import { useT } from "../../i18n";
import { useLiv } from "../../lib/liv";
import { openExternalUrl } from "./BillingSection";

const column = { display: "flex", flexDirection: "column", gap: "var(--space-3)" } as const;
const row = {
  display: "flex",
  gap: "var(--space-2)",
  flexWrap: "wrap",
  alignItems: "center",
} as const;
const muted = { margin: 0, color: "var(--text-secondary)" } as const;
const check = {
  display: "flex",
  gap: "var(--space-2)",
  alignItems: "flex-start",
  fontSize: "var(--text-sm)",
} as const;

/** Google's four-colour "G", as on Google's own sign-in button. */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export interface AccountAuthFormProps {
  readonly busy: boolean;
  readonly run: (action: () => Promise<void>) => Promise<void>;
  readonly onStatus: (next: AccountStatus) => void;
}

export function AccountAuthForm({ busy, run, onStatus }: AccountAuthFormProps) {
  const t = useT();
  const { client } = useLiv();
  const { pushToast } = useToast();
  const wantsRegister = (useLocation().state as { accountMode?: string } | null)?.accountMode;
  const [mode, setMode] = useState<"login" | "register">(
    wantsRegister === "register" ? "register" : "login",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [googleUrl, setGoogleUrl] = useState<string | null>(null);

  const google = () =>
    void run(async () => {
      if (!client) return;
      const { url, opened } = await client.request("account.googleStart", {});
      if (!opened) await openExternalUrl(url);
      setGoogleUrl(url);
    });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (!client) return;
      const next =
        mode === "login"
          ? await client.request("account.login", { email, password })
          : await client.request("account.register", {
              email,
              password,
              acceptTerms: true,
              ...(name.trim() ? { name: name.trim() } : {}),
            });
      setPassword("");
      onStatus(next);
    });
  };

  const forgot = () =>
    void run(async () => {
      if (!client) return;
      if (!email.trim()) throw new Error(t("account.forgot.needEmail"));
      await client.request("account.requestPasswordReset", { email: email.trim() });
      pushToast({ title: t("account.forgot.sent"), tone: "ok" });
    });

  return (
    <>
      <div className="liv-google" data-testid="account-google">
        {!googleUrl && <p className="liv-google__terms">{t("account.google.terms")}</p>}
        <button
          type="button"
          className="liv-google__button"
          disabled={busy}
          aria-busy={busy || undefined}
          onClick={google}
          data-testid="account-google-button"
        >
          <span className="liv-google__logo">
            {busy ? <Loader2 size={18} className="liv-spin" aria-hidden="true" /> : <GoogleLogo />}
          </span>
          <span>{t("account.google.continue")}</span>
        </button>
        {googleUrl && (
          <div role="status" style={column} data-testid="account-google-waiting">
            <p style={muted}>{t("account.google.waiting")}</p>
            <div style={row}>
              <Button
                type="button"
                variant="subtle"
                size="sm"
                onClick={() => void run(() => openExternalUrl(googleUrl))}
                data-testid="account-google-reopen"
              >
                {t("account.google.reopen")}
              </Button>
            </div>
          </div>
        )}
        <p className="liv-google__divider">
          <span>{t("account.google.or")}</span>
        </p>
      </div>
      <form style={column} onSubmit={submit} data-testid="account-form">
        <div style={row} role="tablist">
          {(["login", "register"] as const).map((m) => (
            <Button
              key={m}
              type="button"
              size="sm"
              variant={mode === m ? "primary" : "subtle"}
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              data-testid={`account-mode-${m}`}
            >
              {t(`account.mode.${m}`)}
            </Button>
          ))}
        </div>
        {mode === "register" && (
          <Input
            label={t("account.field.name")}
            value={name}
            autoComplete="name"
            onChange={(e) => setName(e.target.value)}
            data-testid="account-name"
          />
        )}
        <Input
          label={t("account.field.email")}
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          data-testid="account-email"
        />
        <Input
          label={t("account.field.password")}
          type="password"
          required
          minLength={mode === "register" ? 10 : 1}
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          hint={mode === "register" ? t("account.field.passwordHint") : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          data-testid="account-password"
        />
        {mode === "register" && (
          <label style={check}>
            <input
              type="checkbox"
              required
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              data-testid="account-terms"
            />
            <span>{t("account.field.terms")}</span>
          </label>
        )}
        <div style={row}>
          <Button
            type="submit"
            variant="primary"
            loading={busy}
            disabled={mode === "register" && !acceptTerms}
            data-testid="account-submit"
          >
            {t(`account.submit.${mode}`)}
          </Button>
          {mode === "login" && (
            <Button
              type="button"
              variant="subtle"
              size="sm"
              onClick={forgot}
              data-testid="account-forgot"
            >
              {t("account.forgot.link")}
            </Button>
          )}
        </div>
      </form>
    </>
  );
}
