import {
  ButtonItem,
  DropdownItem,
  PanelSection,
  PanelSectionRow,
  findSP,
} from "@decky/ui";
import {
  definePlugin,
  callable,
  openFilePicker,
  FileSelectionType,
} from "@decky/api";
import { useEffect, useReducer } from "react";
import { FaTrophy } from "react-icons/fa";
import trophyImage from "../assets/platinum.png";
import steamCompletedImage from "../assets/steam-completed.svg";

const REQUEST_BATCH_SIZE = 100;
const STYLE_ID = "completionist-overlay-style";

// ---------- Settings types & constants ----------

type Corner = "top-right" | "top-left" | "bottom-right" | "bottom-left";
type Size = "small" | "medium" | "large";
type IconChoice = "platinum" | "steam" | "custom";

interface Settings {
  corner: Corner;
  size: Size;
  icon: IconChoice;
}

const DEFAULT_SETTINGS: Settings = {
  corner: "bottom-left",
  size: "small",
  icon: "steam",
};

const CUSTOM_ICON_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg"];

const SIZE_DIMENSIONS: Record<Size, { w: number; h: number }> = {
  small: { w: 22, h: 28 },
  medium: { w: 28, h: 35 },
  large: { w: 32, h: 40 },
};

const CORNER_POSITION_CSS: Record<Corner, string> = {
  "top-right": "top: 4px; right: 4px;",
  "top-left": "top: 4px; left: 4px;",
  "bottom-right": "bottom: 4px; right: 4px;",
  "bottom-left": "bottom: 4px; left: 4px;",
};

// ---------- Python RPCs ----------

const getPlatinums = callable<[], number[]>("get_platinums");
const setPlatinums = callable<[appids: number[]], boolean>("set_platinums");
const getSettings = callable<[], Settings>("get_settings");
const setSettings = callable<[settings: Settings], boolean>("set_settings");
const getCustomIcon = callable<[], string>("get_custom_icon");
const setCustomIcon = callable<[source: string], string>("set_custom_icon");

// ---------- Module-level shared state ----------

interface ScanState {
  scanning: boolean;
  progress: { scanned: number; total: number; found: number } | null;
  results: SteamApp[];
  error: string | null;
  settings: Settings;
  customIconUrl: string;
  iconError: string | null;
}

const state: ScanState = {
  scanning: false,
  progress: null,
  results: [],
  error: null,
  settings: { ...DEFAULT_SETTINGS },
  customIconUrl: "",
  iconError: null,
};

function resolveIconUrl(settings: Settings): string {
  if (settings.icon === "custom" && state.customIconUrl) {
    return state.customIconUrl;
  }
  if (settings.icon === "platinum") return trophyImage;
  return steamCompletedImage;
}

const listeners = new Set<() => void>();
function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
function notify() {
  for (const l of listeners) l();
}

let currentPlatinumAppIds: number[] = [];

let activeScan: Promise<SteamApp[]> | null = null;

function runScan(): Promise<SteamApp[]> {
  if (activeScan) return activeScan;
  state.scanning = true;
  state.error = null;
  state.progress = null;
  notify();

  activeScan = scanPlatinums((scanned, total, found) => {
    state.progress = { scanned, total, found };
    notify();
  })
    .then((results) => {
      state.results = results;
      state.progress = null;
      currentPlatinumAppIds = results.map((a) => a.appid);
      installOverlayStyle(currentPlatinumAppIds, state.settings);
      setPlatinums(currentPlatinumAppIds).catch((e) =>
        console.error("Completionist: setPlatinums failed:", e),
      );
      return results;
    })
    .catch((e) => {
      state.error = String(e);
      throw e;
    })
    .finally(() => {
      state.scanning = false;
      activeScan = null;
      notify();
    });

  return activeScan;
}

function updateSettings(partial: Partial<Settings>) {
  state.settings = { ...state.settings, ...partial };
  notify();
  setSettings(state.settings).catch((e) =>
    console.error("Completionist: setSettings failed:", e),
  );
  installOverlayStyle(currentPlatinumAppIds, state.settings);
}

async function chooseCustomIcon() {
  let picked: string;
  try {
    const res = await openFilePicker(
      FileSelectionType.FILE,
      "/home/deck",
      true,
      false,
      undefined,
      CUSTOM_ICON_EXTENSIONS,
    );
    picked = res.realpath || res.path;
  } catch {
    return;
  }
  const url = await setCustomIcon(picked).catch((e) => {
    console.error("Completionist: setCustomIcon failed:", e);
    return "";
  });
  if (!url) {
    state.iconError =
      "Couldn't use that image. Pick a PNG, JPG, GIF, WEBP or SVG under 2 MB.";
    notify();
    return;
  }
  state.customIconUrl = url;
  state.iconError = null;
  updateSettings({ icon: "custom" });
}

// ---------- Scanner ----------

async function scanPlatinums(
  onProgress: (scanned: number, total: number, found: number) => void,
): Promise<SteamApp[]> {
  const cache = window.appAchievementProgressCache;
  const apps = [...window.appStore.allApps];
  const total = apps.length;
  const platinums: SteamApp[] = [];
  const progressMap = () => cache.m_achievementProgress?.mapCache;

  for (let start = 0; start < total; start += REQUEST_BATCH_SIZE) {
    const batch = apps.slice(start, start + REQUEST_BATCH_SIZE);
    const missing = batch.filter((app) => !progressMap()?.has(app.appid));
    if (missing.length > 0) {
      for (const app of missing) {
        cache.m_mapQueuedCacheMisses.set(app.appid, true);
      }
      try {
        await cache.RequestCacheUpdate();
      } catch (e) {
        console.error("Completionist: RequestCacheUpdate failed:", e);
      }
    }
    for (const app of batch) {
      if (progressMap()?.get(app.appid)?.all_unlocked) platinums.push(app);
    }
    onProgress(start + batch.length, total, platinums.length);
  }

  return platinums.sort((a, b) => a.display_name.localeCompare(b.display_name));
}

// ---------- CSS overlay ----------

function installOverlayStyle(platinumAppIds: number[], settings: Settings) {
  const doc = findSP().window.document;
  let el = doc.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = doc.createElement("style");
    el.id = STYLE_ID;
    doc.head.appendChild(el);
  }

  if (platinumAppIds.length === 0) {
    el.textContent = "";
    return;
  }

  const { w, h } = SIZE_DIMENSIONS[settings.size];
  const positionCSS = CORNER_POSITION_CSS[settings.corner];

  const afterSel = platinumAppIds
    .flatMap((id) => [
      `[role="link"] > :has(img[src*="/apps/${id}/"])::after`,
      `[role="link"] > :has(img[src*="/assets/${id}/"])::after`,
      `[role="link"] > :has(img[src*="/customimages/${id}p"])::after`,
      `[role="link"] > :has(img[src*="/customimages/${id}l"])::after`,
    ])
    .join(",\n");

  el.textContent = `
    ${afterSel} {
      content: "";
      position: absolute;
      ${positionCSS}
      width: ${w}px;
      height: ${h}px;
      background: url("${resolveIconUrl(settings)}") center / contain no-repeat;
      z-index: 50;
      pointer-events: none;
    }
  `;
}

function removeOverlayStyle() {
  try {
    findSP().window.document.getElementById(STYLE_ID)?.remove();
  } catch (e) {
    console.error("Completionist: removeOverlayStyle failed:", e);
  }
}

let achievementSub: SteamRegistrationHandle | null = null;
let achievementDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const ACHIEVEMENT_DEBOUNCE_MS = 5000;

function startAchievementListener() {
  try {
    const reg = window.SteamClient?.Apps?.RegisterForAchievementChanges;
    if (typeof reg !== "function") {
      console.warn(
        "Completionist: RegisterForAchievementChanges not available",
      );
      return;
    }
    achievementSub = reg(() => {
      if (achievementDebounceTimer) clearTimeout(achievementDebounceTimer);
      achievementDebounceTimer = setTimeout(() => {
        achievementDebounceTimer = null;
        console.log("Completionist: achievement change detected — rescanning");
        runScan().catch((e) =>
          console.error("Completionist: triggered scan failed:", e),
        );
      }, ACHIEVEMENT_DEBOUNCE_MS);
    });
    console.log("Completionist: subscribed to achievement changes");
  } catch (e) {
    console.error("Completionist: startAchievementListener failed:", e);
  }
}

function stopAchievementListener() {
  try {
    achievementSub?.unregister?.();
  } catch (e) {
    console.error("Completionist: stopAchievementListener failed:", e);
  }
  achievementSub = null;
  if (achievementDebounceTimer) {
    clearTimeout(achievementDebounceTimer);
    achievementDebounceTimer = null;
  }
}

// ---------- React panel ----------

const CORNER_OPTIONS = [
  { data: "top-right", label: "Top Right" },
  { data: "top-left", label: "Top Left" },
  { data: "bottom-right", label: "Bottom Right" },
  { data: "bottom-left", label: "Bottom Left" },
];

const SIZE_OPTIONS = [
  { data: "small", label: "Small" },
  { data: "medium", label: "Medium" },
  { data: "large", label: "Large" },
];

const ICON_OPTIONS = [
  { data: "steam", label: "Steam Completed" },
  { data: "platinum", label: "Platinum Trophy" },
  { data: "custom", label: "Custom Image" },
];

function Content() {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribe(force), []);

  return (
    <>
      <PanelSection title="Display">
        <PanelSectionRow>
          <DropdownItem
            layout="below"
            label="Icon"
            rgOptions={ICON_OPTIONS}
            selectedOption={state.settings.icon}
            onChange={(opt) => {
              const icon = opt.data as IconChoice;
              if (icon === "custom" && !state.customIconUrl) {
                chooseCustomIcon();
                return;
              }
              updateSettings({ icon });
            }}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "4px 0",
            }}
          >
            <img
              src={resolveIconUrl(state.settings)}
              style={{ height: "48px", maxWidth: "96px", objectFit: "contain" }}
            />
          </div>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => chooseCustomIcon()}>
            {state.customIconUrl
              ? "Change Custom Image"
              : "Choose Custom Image"}
          </ButtonItem>
        </PanelSectionRow>
        {state.iconError && (
          <PanelSectionRow>
            <div style={{ color: "tomato" }}>{state.iconError}</div>
          </PanelSectionRow>
        )}
        <PanelSectionRow>
          <DropdownItem
            layout="below"
            label="Position"
            rgOptions={CORNER_OPTIONS}
            selectedOption={state.settings.corner}
            onChange={(opt) => updateSettings({ corner: opt.data as Corner })}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <DropdownItem
            layout="below"
            label="Size"
            rgOptions={SIZE_OPTIONS}
            selectedOption={state.settings.size}
            onChange={(opt) => updateSettings({ size: opt.data as Size })}
          />
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="Scan">
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={() => runScan()}
            disabled={state.scanning}
          >
            {state.scanning ? "Scanning..." : "Refresh"}
          </ButtonItem>
        </PanelSectionRow>

        {state.progress && (
          <PanelSectionRow>
            <div>
              {state.progress.scanned} / {state.progress.total} checked ·{" "}
              {state.progress.found} perfect
            </div>
          </PanelSectionRow>
        )}

        {state.error && (
          <PanelSectionRow>
            <div style={{ color: "tomato" }}>Error: {state.error}</div>
          </PanelSectionRow>
        )}

        {!state.scanning && state.results.length > 0 && (
          <PanelSectionRow>
            <div>
              {state.results.length} perfect game
              {state.results.length === 1 ? "" : "s"} detected
            </div>
          </PanelSectionRow>
        )}
      </PanelSection>
    </>
  );
}

// ---------- Plugin entry ----------

export default definePlugin(() => {
  console.log("Completionist initializing");

  Promise.all([getSettings(), getPlatinums(), getCustomIcon().catch(() => "")])
    .then(([settings, cached, customIconUrl]) => {
      state.settings = { ...DEFAULT_SETTINGS, ...settings };
      state.customIconUrl = customIconUrl;
      notify();
      if (cached.length > 0) {
        currentPlatinumAppIds = cached;
        installOverlayStyle(cached, state.settings);
        console.log(
          `Completionist: applied ${cached.length} cached perfect game(s) instantly`,
        );
      }
    })
    .catch((e) => console.error("Completionist: init load failed:", e))
    .finally(() => {
      runScan().catch((e) =>
        console.error("Completionist: background scan failed:", e),
      );
      startAchievementListener();
    });

  return {
    name: "Completionist",
    titleView: <div>Completionist</div>,
    content: <Content />,
    icon: <FaTrophy />,
    onDismount() {
      console.log("Completionist unloading");
      stopAchievementListener();
      removeOverlayStyle();
    },
  };
});
