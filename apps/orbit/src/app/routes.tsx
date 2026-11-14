import { Camera, MessageSquare, Plug, Plus, Tag } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router";
import { BrandMark, Button, EmptyState, Skeleton } from "../design";
import CamerasPage from "../features/cameras";
import ChatPage from "../features/chat";
import DevicesPage from "../features/devices";
import HerdPage from "../features/herd";
import CustomPageView from "../features/pages";
import SettingsPage from "../features/settings";
import { Tour, WelcomeScreen } from "../features/welcome";
import { type MessageKey, useT } from "../i18n";
import { type ModuleId, useModules } from "../lib/modules";
import { useOrion } from "../lib/orion";
import { useNeedsSetup } from "../lib/setup";
import { useFarmSpecies } from "../lib/species";
import { setFirstRun, useFirstRun } from "../lib/tour";
import { HomePage } from "./HomePage";
import { useTheme } from "./providers";
import { AppShell } from "./shell";

const MODULE_META: Record<
  ModuleId,
  {
    titleKey: MessageKey;
    promptKey: MessageKey;
    icon: typeof Tag;
  }
> = {
  herd: {
    titleKey: "shell.module.disabled.herd.title",
    promptKey: "shell.module.disabled.herd.prompt",
    icon: Tag,
  },
  devices: {
    titleKey: "shell.module.disabled.devices.title",
    promptKey: "shell.module.disabled.devices.prompt",
    icon: Plug,
  },
  cameras: {
    titleKey: "shell.module.disabled.cameras.title",
    promptKey: "shell.module.disabled.cameras.prompt",
    icon: Camera,
  },
};

export interface ModuleRouteProps {
  moduleId: ModuleId;
  children: ReactNode;
}

export function ModuleRoute({ moduleId, children }: ModuleRouteProps) {
  const { loading, isEnabled, enableModule } = useModules();
  const { species } = useFarmSpecies();
  const navigate = useNavigate();
  const t = useT();
  const [enabling, setEnabling] = useState(false);

  if (loading) {
    return (
      <div className="orbit-container" data-testid={`module-loading-${moduleId}`}>
        <Skeleton height="2.5rem" width="16rem" />
        <Skeleton height="12rem" />
      </div>
    );
  }

  if (isEnabled(moduleId)) {
    return <>{children}</>;
  }

  const meta = MODULE_META[moduleId];
  const Icon = meta.icon;
  const titleKey: MessageKey =
    moduleId === "herd"
      ? species === "horse"
        ? "shell.module.disabled.herd.title.horse"
        : "shell.module.disabled.herd.title.cattle"
      : meta.titleKey;
  const promptKey: MessageKey =
    moduleId === "herd"
      ? species === "horse"
        ? "shell.module.disabled.herd.prompt.horse"
        : "shell.module.disabled.herd.prompt.cattle"
      : moduleId === "devices" && species === "horse"
        ? "shell.module.disabled.devices.prompt.horse"
        : meta.promptKey;
  const prompt = t(promptKey);

  const handleAskOrion = () => {
    navigate(`/chat?prompt=${encodeURIComponent(prompt)}&send=1`, {
      state: { prefill: prompt },
    });
  };

  const handleEnableNow = async () => {
    setEnabling(true);
    try {
      await enableModule(moduleId);
    } finally {
      setEnabling(false);
    }
  };

  return (
    <div className="orbit-container" data-testid={`module-disabled-${moduleId}`}>
      <EmptyState
        icon={<Icon size={24} />}
        title={t(titleKey)}
        action={
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexWrap: "wrap",
              gap: "var(--space-3)",
            }}
          >
            <Button
              variant="primary"
              icon={<MessageSquare size={16} />}
              onClick={handleAskOrion}
              data-testid={`module-disabled-ask-${moduleId}`}
            >
              {t("shell.module.disabled.askOrion")}
            </Button>
            {moduleId !== "devices" && (
              <Button
                variant="secondary"
                loading={enabling}
                icon={<Plus size={16} />}
                onClick={() => void handleEnableNow()}
                data-testid={`module-disabled-enable-${moduleId}`}
              >
                {t("shell.module.disabled.addNow")}
              </Button>
            )}
          </div>
        }
      />
    </div>
  );
}

/**
 * A new install opens on the welcome screen instead of the app, until someone signs in or adds
 * their own AI key in Settings. After that first sign-in, Home is shown once with the tour.
 */
function FirstRunGate() {
  const needsSetup = useNeedsSetup();
  const firstRun = useFirstRun();
  const { state, stopped } = useOrion();
  const { pathname } = useLocation();

  useEffect(() => {
    if (needsSetup === false && firstRun === null) setFirstRun("done");
  }, [needsSetup, firstRun]);

  if (!pathname.startsWith("/settings")) {
    if (needsSetup) return <WelcomeScreen />;
    // Until Orion has answered on an install that was never set up, show the mark alone, so the
    // app does not flash by before the welcome screen. A failed start still gets the app and
    // its restart button.
    if (needsSetup === null && firstRun === null && !stopped && state === "connecting") {
      return (
        <div className="orbit-splash" data-testid="first-run-splash">
          <BrandMark />
        </div>
      );
    }
  }
  return (
    <>
      <AppShell />
      {firstRun === "pending" && needsSetup === false && pathname === "/" && <Tour />}
    </>
  );
}

export function AppRoutes() {
  const { theme } = useTheme();
  return (
    <Routes>
      <Route element={<FirstRunGate />}>
        <Route index element={<HomePage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route
          path="herd"
          element={
            <ModuleRoute moduleId="herd">
              <HerdPage />
            </ModuleRoute>
          }
        />
        <Route
          path="devices"
          element={
            <ModuleRoute moduleId="devices">
              <DevicesPage />
            </ModuleRoute>
          }
        />
        <Route
          path="cameras"
          element={
            <ModuleRoute moduleId="cameras">
              <CamerasPage />
            </ModuleRoute>
          }
        />
        <Route path="settings/*" element={<SettingsPage />} />
        <Route path="pages/:id" element={<CustomPageView theme={theme} />} />
      </Route>
    </Routes>
  );
}
