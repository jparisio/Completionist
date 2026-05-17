import {
  ButtonItem,
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

// Python backend RPCs (see main.py)
const getPlatinums = callable<[], number[]>("get_platinums");
const setPlatinums = callable<[appids: number[]], boolean>("set_platinums");

// ---------- Module-level shared scan state ----------
// One source of truth that both the auto-scan-on-init and the Refresh button
// read from. Any subscriber (the Content panel) is notified on every change.

interface ScanState {
  scanning: boolean;
  progress: { scanned: number; total: number; found: number } | null;
  results: SteamApp[];
  error: string | null;
}

const state: ScanState = {
  scanning: false,
  progress: null,
  results: [],
  error: null,
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

// Single in-flight scan promise — a second caller joins instead of duplicating.
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
      installOverlayStyle(results.map((a) => a.appid));
      setPlatinums(results.map((a) => a.appid)).catch((e) =>
        console.error("Completionist: setPlatinums failed:", e)
      );
      console.log(`Completionist: scan saved ${results.length} platinum(s) to disk`);
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

// ---------- Scanner ----------

async function scanPlatinums(
  onProgress: (scanned: number, total: number, found: number) => void
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

  await Promise.all(Array.from({ length: CONCURRENT_REQUESTS }, () => worker()));
  return platinums.sort((a, b) => a.display_name.localeCompare(b.display_name));
}

// ---------- CSS overlay ----------

function installOverlayStyle(platinumAppIds: number[] = []) {
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

  // For each platinum game, target the .Panel that's a direct parent of
  // a role=link containing the matching img. On home this matches the inner
  // tilting Panel (so the trophy tilts with the card). On library it matches
  // the outer tile wrapper. Single selector pattern covers both surfaces.
  // Four img-src patterns observed in the wild:
  //   /apps/<appid>/...           — Steam CDN URL
  //   /assets/<appid>/...         — steamloopback.host local cache
  //   /customimages/<appid>p.png  — SteamGridDB portrait custom art
  //   /customimages/<appid>l.png  — SteamGridDB landscape custom art
  const baseSelectors = platinumAppIds.flatMap((id) => [
    `.Panel:has(> [role="link"] img[src*="/apps/${id}/"])`,
    `.Panel:has(> [role="link"] img[src*="/assets/${id}/"])`,
    `.Panel:has(> [role="link"] img[src*="/customimages/${id}p"])`,
    `.Panel:has(> [role="link"] img[src*="/customimages/${id}l"])`,
  ]);
  const positionSel = baseSelectors.join(",\n");
  const afterSel = baseSelectors.map((s) => `${s}::after`).join(",\n");

  el.textContent = `
    ${positionSel} {
      position: relative;
    }
    ${afterSel} {
      content: "";
      position: absolute;
      top: 4px;
      right: 4px;
      width: 32px;
      height: 40px;
      background: url("${trophyImage}") center / contain no-repeat;
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

// ---------- React panel ----------

function Content() {
  // useReducer forces a re-render whenever the module state notifies us.
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribe(force), []);

  const visible = state.results.slice(0, 20);
  const hidden = state.results.length - visible.length;

  return (
    <PanelSection title="Completionist">
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
          <div style={{ fontWeight: "bold" }}>
            {state.results.length} platinum game{state.results.length === 1 ? "" : "s"}:
          </div>
        </PanelSectionRow>
      )}

      {!state.scanning &&
        visible.map((app) => (
          <PanelSectionRow key={app.appid}>
            <div>{app.display_name}</div>
          </PanelSectionRow>
        ))}

      {!state.scanning && hidden > 0 && (
        <PanelSectionRow>
          <div style={{ opacity: 0.6 }}>… and {hidden} more</div>
        </PanelSectionRow>
      )}
    </PanelSection>
  );
}

// ---------- Plugin entry ----------

export default definePlugin(() => {
  console.log("Completionist initializing");

  // 1. Apply cached platinums from disk immediately (instant trophies on boot).
  // 2. Then kick off a background scan to catch any new platinums.
  // Both share the module-level lock + state, so the Content panel shows
  // progress regardless of which path triggered the work.
  getPlatinums()
    .then((cached) => {
      if (cached.length > 0) {
        installOverlayStyle(cached);
        console.log(`Completionist: applied ${cached.length} cached platinum(s) instantly`);
      }
    })
    .catch((e) => console.error("Completionist: getPlatinums failed:", e))
    .finally(() => {
      runScan().catch((e) =>
        console.error("Completionist: background scan failed:", e)
      );
    });

  return {
    name: "Completionist",
    titleView: <div className={staticClasses.Title}>Completionist</div>,
    content: <Content />,
    icon: <FaTrophy />,
    onDismount() {
      console.log("Completionist unloading");
      removeOverlayStyle();
    },
  };
});
