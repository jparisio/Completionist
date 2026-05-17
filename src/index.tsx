import {
  ButtonItem,
  DropdownItem,
  PanelSection,
  PanelSectionRow,
  staticClasses,
  findSP,
} from "@decky/ui";
import { definePlugin, callable } from "@decky/api";
import { useEffect, useReducer } from "react";
import { FaTrophy } from "react-icons/fa";
import trophyImage from "../assets/platinum.png";

const CONCURRENT_REQUESTS = 5;
const STYLE_ID = "completionist-overlay-style";

// ---------- Settings types & constants ----------

type Corner = "top-right" | "top-left" | "bottom-right" | "bottom-left";
type Size = "small" | "medium" | "large";

interface Settings {
  corner: Corner;
  size: Size;
}

const DEFAULT_SETTINGS: Settings = {
  corner: "top-right",
  size: "medium",
};

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

const CORNER_TRANSFORM_ORIGIN: Record<Corner, string> = {
  "top-right": "top right",
  "top-left": "top left",
  "bottom-right": "bottom right",
  "bottom-left": "bottom left",
};

// ---------- Python RPCs ----------

const getPlatinums = callable<[], number[]>("get_platinums");
const setPlatinums = callable<[appids: number[]], boolean>("set_platinums");
const getSettings = callable<[], Settings>("get_settings");
const setSettings = callable<[settings: Settings], boolean>("set_settings");

// ---------- Module-level shared state ----------

interface ScanState {
  scanning: boolean;
  progress: { scanned: number; total: number; found: number } | null;
  results: SteamApp[];
  error: string | null;
  settings: Settings;
}

const state: ScanState = {
  scanning: false,
  progress: null,
  results: [],
  error: null,
  settings: { ...DEFAULT_SETTINGS },
};

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

// Authoritative copy of the current platinum appid set, separate from the
// React state's `results` (which carries display data from the latest scan
// but stays empty on cold start where we only have a cached id list).
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

// ---------- Scanner ----------

async function scanPlatinums(
  onProgress: (scanned: number, total: number, found: number) => void,
): Promise<SteamApp[]> {
  const cache = window.appAchievementProgressCache;
  const apps = [...window.appStore.allApps];
  const total = apps.length;
  const platinums: SteamApp[] = [];

  let idx = 0;
  let scanned = 0;

  async function worker() {
    while (idx < total) {
      const myIdx = idx++;
      const app = apps[myIdx];
      try {
        if (cache.BGameHasAchievements(app.appid)) {
          if (!cache.m_achievementProgress.mapCache.has(app.appid)) {
            await cache.RequestCacheUpdate(app.appid);
          }
          const entry = cache.m_achievementProgress.mapCache.get(app.appid);
          if (entry?.all_unlocked) platinums.push(app);
        }
      } catch {
        // per-app failures shouldn't abort the scan
      }
      scanned++;
      onProgress(scanned, total, platinums.length);
    }
  }

  await Promise.all(
    Array.from({ length: CONCURRENT_REQUESTS }, () => worker()),
  );
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
  const origin = CORNER_TRANSFORM_ORIGIN[settings.corner];

  // For each platinum game, target the .Panel that's a direct parent of
  // a role=link containing the matching img. On home this matches the inner
  // tilting Panel; on library it matches the outer tile wrapper. Single
  // pattern covers both surfaces.
  const baseSelectors = platinumAppIds.flatMap((id) => [
    `.Panel:has(> [role="link"] img[src*="/apps/${id}/"])`,
    `.Panel:has(> [role="link"] img[src*="/assets/${id}/"])`,
    `.Panel:has(> [role="link"] img[src*="/customimages/${id}p"])`,
    `.Panel:has(> [role="link"] img[src*="/customimages/${id}l"])`,
  ]);
  const positionSel = baseSelectors.join(",\n");
  const afterSel = baseSelectors.map((s) => `${s}::after`).join(",\n");
  const focusSel = baseSelectors
    .map((s) => `${s}:focus-within::after`)
    .join(",\n");

  el.textContent = `
    ${positionSel} {
      position: relative;
    }
    ${afterSel} {
      content: "";
      position: absolute;
      ${positionCSS}
      width: ${w}px;
      height: ${h}px;
      background: url("${trophyImage}") center / contain no-repeat;
      z-index: 50;
      pointer-events: none;
      transform-origin: ${origin};
      transition: transform 0.4s cubic-bezier(0, 0.73, 0.48, 1);
    }
    ${focusSel} {
      transform: scale(1.15);
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

// ---------- Live updates ----------
// Subscribe to Steam's "achievement state changed" event so newly platinummed
// games get a trophy without the user clicking Refresh. We debounce because a
// game can fire several changes in a burst (e.g. boot-time sync), and our
// runScan is heavy enough that we don't want to run it 10 times back to back.

let achievementSub: SteamRegistrationHandle | null = null;
let achievementDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const ACHIEVEMENT_DEBOUNCE_MS = 5000;

function startAchievementListener() {
  try {
    const reg = window.SteamClient?.Apps?.RegisterForAchievementChanges;
    if (typeof reg !== "function") {
      console.warn("Completionist: RegisterForAchievementChanges not available");
      return;
    }
    achievementSub = reg(() => {
      if (achievementDebounceTimer) clearTimeout(achievementDebounceTimer);
      achievementDebounceTimer = setTimeout(() => {
        achievementDebounceTimer = null;
        console.log("Completionist: achievement change detected — rescanning");
        runScan().catch((e) =>
          console.error("Completionist: triggered scan failed:", e)
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

function Content() {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribe(force), []);

  return (
    <>
      <PanelSection title="Display">
        <PanelSectionRow>
          <DropdownItem
            label="Position"
            rgOptions={CORNER_OPTIONS}
            selectedOption={state.settings.corner}
            onChange={(opt) => updateSettings({ corner: opt.data as Corner })}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <DropdownItem
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
              {state.progress.found} platinum
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
              {state.results.length} platinum game
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

  // 1. Load settings + cached platinums in parallel.
  // 2. Apply CSS immediately so trophies appear instantly on boot.
  // 3. Kick off a background scan to catch new platinums.
  Promise.all([getSettings(), getPlatinums()])
    .then(([settings, cached]) => {
      state.settings = { ...DEFAULT_SETTINGS, ...settings };
      notify();
      if (cached.length > 0) {
        currentPlatinumAppIds = cached;
        installOverlayStyle(cached, state.settings);
        console.log(
          `Completionist: applied ${cached.length} cached platinum(s) instantly`,
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
    titleView: <div className={staticClasses.Title}>Completionist</div>,
    content: <Content />,
    icon: <FaTrophy />,
    onDismount() {
      console.log("Completionist unloading");
      stopAchievementListener();
      removeOverlayStyle();
    },
  };
});
