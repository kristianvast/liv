import { Link } from "react-router";
import { useT } from "../../i18n";
import { useAccount } from "../../lib/account";
import { AccountAuthForm } from "../settings/AccountAuthForm";
import { useAccountRun } from "../settings/AccountCard";

/** Home's place for Orion while Orion cannot answer yet: the account form instead of the ask box. */
export function HomeSetup() {
  const t = useT();
  const { setStatus } = useAccount();
  const { busy, run } = useAccountRun();

  return (
    <section className="orbit-home-setup" data-testid="home-setup">
      <div className="orbit-home-setup__card">
        <AccountAuthForm busy={busy} run={run} onStatus={setStatus} initialMode="register" />
      </div>
      <Link
        to="/settings#providers"
        className="orbit-home-setup__alt"
        data-testid="home-setup-own-key"
      >
        {t("home.setup.ownKey")}
      </Link>
    </section>
  );
}
