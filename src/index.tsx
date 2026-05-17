import {
  ButtonItem,
  PanelSection,
  PanelSectionRow,
  staticClasses,
  findSP,
} from "@decky/ui";
import { definePlugin } from "@decky/api";
import { useState } from "react";
import { FaTrophy } from "react-icons/fa";
import trophyImage from "../assets/platinum.png";

const CONCURRENT_REQUESTS = 5;

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

  await Promise.all(
    Array.from({ length: CONCURRENT_REQUESTS }, () => worker())
  );
  return platinums.sort((a, b) => a.display_name.localeCompare(b.display_name));
}

function Content() {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<{ scanned: number; total: number; found: number } | null>(null);
  const [platinums, setPlatinums] = useState<SteamApp[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function runScan() {
    setScanning(true);
    setError(null);
    setPlatinums([]);
    setProgress(null);
    try {
      const results = await scanPlatinums((scanned, total, found) =>
        setProgress({ scanned, total, found })
      );
      setPlatinums(results);
      installOverlayStyle(results.map((a) => a.appid));
    } catch (e) {
      setError(String(e));
    } finally {
      setScanning(false);
    }
  }

  const visible = platinums.slice(0, 20);
  const hidden = platinums.length - visible.length;

  return (
    <PanelSection title="Completionist">
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={runScan} disabled={scanning}>
          {scanning ? "Scanning..." : "Scan for platinum games"}
        </ButtonItem>
      </PanelSectionRow>

      {progress && (
        <PanelSectionRow>
          <div>
            {progress.scanned} / {progress.total} checked · {progress.found} platinum
          </div>
        </PanelSectionRow>
      )}

      {error && (
        <PanelSectionRow>
          <div style={{ color: "tomato" }}>Error: {error}</div>
        </PanelSectionRow>
      )}

      {!scanning && platinums.length > 0 && (
        <PanelSectionRow>
          <div style={{ fontWeight: "bold" }}>
            {platinums.length} platinum game{platinums.length === 1 ? "" : "s"}:
          </div>
        </PanelSectionRow>
      )}

      {!scanning &&
        visible.map((app) => (
          <PanelSectionRow key={app.appid}>
            <div>
              {app.display_name}{" "}
              <span style={{ opacity: 0.5 }}>({app.appid})</span>
            </div>
          </PanelSectionRow>
        ))}

      {!scanning && hidden > 0 && (
        <PanelSectionRow>
          <div style={{ opacity: 0.6 }}>… and {hidden} more</div>
        </PanelSectionRow>
      )}
    </PanelSection>
  );
}

// ====================================================================
// Phase 3: CSS-injected overlay on every game tile.
// We locate Steam's library-asset CSS class via findModule and append a
// pseudo-element via CSS. No React patching means no re-render risk.
// Phase 4 will scope this to platinum-only via [data-appid] attribute
// selectors, with one CSS rule per platinum appid.
// ====================================================================

const STYLE_ID = "completionist-overlay-style";

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
    console.log("Completionist: no platinums to render yet");
    return;
  }

  // Steam exposes the appid on the outer tile container as `data-id`. That
  // container already has `position: absolute` so ::after positions relative
  // to it. The outer tile is OUTSIDE the asset image (no splash mirror) and
  // a sibling layer of the badge area (won't cover Steam Deck verified).
  const selectorList = platinumAppIds
    .map((appid) => `[data-id="${appid}"]::after`)
    .join(", ");

  el.textContent = `
    ${selectorList} {
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
  console.log(
    `Completionist: overlay installed via data-id for ${platinumAppIds.length} platinum game(s)`
  );
}

function removeOverlayStyle() {
  try {
    const doc = findSP().window.document;
    doc.getElementById(STYLE_ID)?.remove();
  } catch (e) {
    console.error("Completionist: removeOverlayStyle failed:", e);
  }
}

export default definePlugin(() => {
  console.log("Completionist initializing");
  // Install just the position:relative on tiles. The platinum-targeted
  // overlay rules get added when the user clicks "Scan" — auto-scan on
  // load was competing with the manual scan over Steam IPC.
  installOverlayStyle();

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
