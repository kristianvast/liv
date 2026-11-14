import { useEffect } from "react";
import { Link } from "react-router";
import { BrandMark } from "../../design";
import { useT } from "../../i18n";
import { useAccount } from "../../lib/account";
import { setFirstRun } from "../../lib/tour";
import { AccountAuthForm } from "../settings/AccountAuthForm";
import { useAccountRun } from "../settings/AccountCard";

/** The first thing a new farmer sees: Orbit's promise and the account form, nothing else. */
export function WelcomeScreen() {
  const t = useT();
  const { setStatus } = useAccount();
  const { busy, run } = useAccountRun();

  useEffect(() => setFirstRun("pending"), []);

  return (
    <main className="orbit-welcome" data-testid="welcome-screen">
      <div className="orbit-welcome__intro">
        <div className="orbit-brand">
          <BrandMark />
          <span className="orbit-brand__name">Orbit</span>
        </div>
        <h1 className="orbit-welcome__headline" data-testid="welcome-headline">
          {t("home.minimal.headline")}
        </h1>
      </div>
      <div className="orbit-welcome__panel">
        <AccountAuthForm busy={busy} run={run} onStatus={setStatus} initialMode="register" />
        <Link to="/settings#providers" className="orbit-welcome__alt" data-testid="welcome-own-key">
          {t("home.setup.ownKey")}
        </Link>
      </div>
    </main>
  );
}
