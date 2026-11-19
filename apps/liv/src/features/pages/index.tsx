import type { CustomPage } from "@liv/protocol";
import { LayoutDashboard } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";
import { EmptyState } from "../../design";
import { useI18n } from "../../i18n";
import { useLiv, useLivEvent } from "../../lib/liv";
import { customPageUrl, type PageTheme } from "./url";

export { PageCards } from "./PageCards";
export { customPageUrl, type PageTheme } from "./url";

export function useCustomPages(): CustomPage[] {
  const { client, state } = useLiv();
  const [pages, setPages] = useState<CustomPage[]>([]);

  const refresh = useCallback(async () => {
    if (!client) return;
    try {
      setPages((await client.request("pages.list", {})).pages);
    } catch {
      setPages([]);
    }
  }, [client]);

  useEffect(() => {
    if (state === "open") void refresh();
  }, [state, refresh]);

  // Liv builds pages during a run; pick them up once it finishes.
  useLivEvent("agent.settled", () => void refresh());
  // Undoing a change can remove or bring back a page without any run.
  useLivEvent("db.changed", (event) => {
    if (event.table === "workspace") void refresh();
  });

  return pages;
}

export const CUSTOM_PAGE_ICON = LayoutDashboard;

export default function CustomPageView({ theme }: { theme: PageTheme }) {
  const { t, intlLocale } = useI18n();
  const { id } = useParams();
  const { endpoint } = useLiv();
  const pages = useCustomPages();
  const page = pages.find((p) => p.id === id);
  // A page that is open while its files change (another PC's edit arriving, an undo, Liv
  // working) loads again; the frame otherwise keeps showing the version it opened with.
  const [version, setVersion] = useState(0);
  useLivEvent("db.changed", (event) => {
    if (event.table === "workspace" && event.ids.some((file) => file.startsWith(`pages/${id}/`)))
      setVersion((v) => v + 1);
  });
  useLivEvent("agent.settled", () => setVersion((v) => v + 1));

  if (!page) {
    return (
      <div className="liv-container" data-testid="custom-page-missing">
        <EmptyState title={t("pages.missing.title")} icon={<LayoutDashboard size={28} />} />
      </div>
    );
  }

  return (
    <div className="liv-custom-page" data-testid={`custom-page-${page.id}`}>
      <iframe
        key={`${page.id}:${version}`}
        title={page.title}
        src={customPageUrl(endpoint, page.path, { theme, lang: intlLocale })}
        sandbox="allow-scripts allow-forms"
        className="liv-custom-page__frame"
        data-testid="custom-page-frame"
      />
    </div>
  );
}
