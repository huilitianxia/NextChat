"use client";

require("../polyfill");

import { useEffect, useState } from "react";
import styles from "./home.module.scss";

import BotIcon from "../icons/nextchat-bot.svg";
import LoadingIcon from "../icons/three-dots.svg";

import { useMobileScreen } from "../utils";

import dynamic from "next/dynamic";
import { Path, SlotID, ServiceProvider } from "../constant";
import { ErrorBoundary } from "./error";

import { getISOLang, getLang } from "../locales";

import {
  HashRouter as Router,
  Route,
  Routes,
  useLocation,
  Navigate,
} from "react-router-dom";
import { SideBar } from "./sidebar";
import { useWorkspacePreferences } from "../store/workspace-preferences";
import { useAppConfig } from "../store/config";
import { AuthPage } from "./auth";
import { getClientConfig } from "../config/client";
import { type ClientApi, getClientApi } from "../client/api";
import { useAccessStore } from "../store";
import clsx from "clsx";
import { useFinale } from "../store/finale";

export function Loading(props: { noLogo?: boolean }) {
  return (
    <div className={clsx("no-dark", styles["loading-content"])}>
      {!props.noLogo && <BotIcon />}
      <LoadingIcon />
    </div>
  );
}

const Artifacts = dynamic(async () => (await import("./artifacts")).Artifacts, {
  loading: () => <Loading noLogo />,
});

const Settings = dynamic(async () => (await import("./settings")).Settings, {
  loading: () => <Loading noLogo />,
});

const Chat = dynamic(async () => (await import("./chat")).Chat, {
  loading: () => <Loading noLogo />,
});

const NewChat = dynamic(async () => (await import("./new-chat")).NewChat, {
  loading: () => <Loading noLogo />,
});
const WorkspaceCommands = dynamic(() => import("./workspace-commands"), {
  ssr: false,
});
const ArtifactPreview = dynamic(() => import("./artifact-preview"), {
  ssr: false,
});
const FinaleHub = dynamic(() => import("./finale-hub"), { ssr: false });
const PdfSplitViewer = dynamic(() => import("./pdf-split-viewer"), {
  ssr: false,
});
const SharedPreview = dynamic(() => import("./shared-preview"), { ssr: false });

export function useSwitchTheme() {
  const { mode, palette } = useWorkspacePreferences();
  const verified = useAccessStore((state) => state.identityVerified);
  const identity = useAccessStore((state) => state.friendProfile?.identityId);
  useEffect(() => {
    if (!verified || !identity) return;
    try {
      if (
        !localStorage.getItem(`nextchat:user:${identity}:workspace-preferences`)
      ) {
        useWorkspacePreferences
          .getState()
          .setPreferences({ mode: useAppConfig.getState().theme });
      }
    } catch {
      /* Preferences remain usable when storage is denied. */
    }
  }, [verified, identity]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = mode === "dark" || (mode === "auto" && media.matches);
      const root = document.documentElement;
      root.dataset.theme = dark ? "dark" : "light";
      root.dataset.palette = palette;
      root.style.colorScheme = dark ? "dark" : "light";
      document.body.classList.remove("light", "dark");
      const color = getComputedStyle(root).getPropertyValue("--gray").trim();
      document
        .querySelectorAll('meta[name="theme-color"]')
        .forEach((meta) => meta.setAttribute("content", color));
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [mode, palette]);
}

function useHtmlLang() {
  useEffect(() => {
    const lang = getISOLang();
    const htmlLang = document.documentElement.lang;

    if (lang !== htmlLang) {
      document.documentElement.lang = lang;
    }
  }, []);
}

const useHasHydrated = () => {
  const [hasHydrated, setHasHydrated] = useState<boolean>(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  return hasHydrated;
};

export function WindowContent(props: { children: React.ReactNode }) {
  return (
    <div className={styles["window-content"]} id={SlotID.AppBody}>
      {props?.children}
    </div>
  );
}

function Screen() {
  const config = useAppConfig();
  const zen = useFinale((state) => state.zen);
  const pdf = useFinale((state) => state.pdf);
  const location = useLocation();
  const isArtifact = location.pathname.includes(Path.Artifacts);
  const isHome = location.pathname === Path.Home;
  const isAuth = location.pathname === Path.Auth;
  const isShare = /^\/?share=/.test(location.pathname);
  const access = useAccessStore();
  useEffect(() => {
    if (isShare) window.dispatchEvent(new Event("campus:share"));
  }, [isShare, location.pathname]);

  const isMobileScreen = useMobileScreen();
  const shouldTightBorder =
    getClientConfig()?.isApp || (config.tightBorder && !isMobileScreen);
  if (isShare) return null;

  if (
    !config._hasHydrated ||
    !access._hasHydrated ||
    (!access.configReady && !isAuth)
  ) {
    return <Loading />;
  }
  if (!isAuth && !access.isAuthorized()) {
    return <Navigate to={Path.Auth} replace />;
  }

  if (isArtifact) {
    return (
      <Routes>
        <Route path="/artifacts/:id" element={<Artifacts />} />
      </Routes>
    );
  }
  const renderContent = () => {
    if (isAuth) return <AuthPage />;
    return (
      <>
        {!zen && (
          <SideBar
            className={clsx({
              [styles["sidebar-show"]]: isHome,
            })}
          />
        )}
        <WindowContent
          key={`workspace-${access.friendProfile?.identityId || "public"}`}
        >
          <Routes>
            <Route path={Path.Home} element={<Chat />} />
            <Route path={Path.NewChat} element={<NewChat />} />
            <Route path={Path.Chat} element={<Chat />} />
            <Route path={Path.Settings} element={<Settings />} />
            <Route path="*" element={<Navigate to={Path.Chat} replace />} />
          </Routes>
        </WindowContent>
        {!zen &&
          (pdf ? (
            <PdfSplitViewer
              key={`pdf-${access.friendProfile?.identityId || "public"}`}
            />
          ) : (
            <ArtifactPreview
              key={`artifact-${access.friendProfile?.identityId || "public"}`}
            />
          ))}
        <WorkspaceCommands
          key={`commands-${access.friendProfile?.identityId || "public"}`}
        />
        <FinaleHub
          key={`finale-${access.friendProfile?.identityId || "public"}`}
        />
      </>
    );
  };

  return (
    <div
      className={clsx(styles.container, {
        [styles["tight-container"]]: shouldTightBorder,
        [styles["rtl-screen"]]: getLang() === "ar",
      })}
    >
      {renderContent()}
    </div>
  );
}

export function useLoadData() {
  const access = useAccessStore();
  const authorized =
    access.configReady && (!access.needCode || access.identityVerified);
  useEffect(() => {
    if (!authorized) return;
    let active = true;
    const api: ClientApi = getClientApi(ServiceProvider.OpenAI);
    api.llm
      .models()
      .then((models) => {
        if (active) useAppConfig.getState().mergeModels(models);
      })
      .catch(() => {
        // The configured list remains available if model discovery is unavailable.
      });
    return () => {
      active = false;
    };
  }, [authorized]);
}

export function Home() {
  useSwitchTheme();
  useLoadData();
  useHtmlLang();
  const accessHydrated = useAccessStore((state) => state._hasHydrated);
  const configHydrated = useAppConfig((state) => state._hasHydrated);

  useEffect(() => {
    if (accessHydrated && configHydrated) useAccessStore.getState().fetch();
  }, [accessHydrated, configHydrated]);

  if (!useHasHydrated()) {
    return <Loading />;
  }

  return (
    <ErrorBoundary>
      <SharedPreview>
        <Router>
          <Screen />
        </Router>
      </SharedPreview>
    </ErrorBoundary>
  );
}
