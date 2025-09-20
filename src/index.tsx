import {
  ButtonItem,
  PanelSection,
  PanelSectionRow,
  staticClasses,
} from "@decky/ui";
import {
  addEventListener,
  removeEventListener,
  callable,
  definePlugin,
  toaster,
} from "@decky/api";
import { useState } from "react";
import { FaTrophy } from "react-icons/fa";
import trophyImage from "../assets/trophy.png";

// Backend API calls
const getCompletedGames = callable<[], string[]>("get_completed_games");
const scanLibraryForCompletions = callable<[], Record<string, boolean>>(
  "scan_library_for_completions"
);

function Content() {
  const [completedGames, setCompletedGames] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadCompletedGames = async () => {
    setIsLoading(true);
    try {
      const completed = await getCompletedGames();
      setCompletedGames(completed);
      toaster.toast({
        title: "Completionist",
        body: `Found ${completed.length} 100% completed games`,
      });
    } catch (error) {
      toaster.toast({
        title: "Error",
        body: "Failed to load completed games",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const scanLibrary = async () => {
    setIsLoading(true);
    try {
      const completionData = await scanLibraryForCompletions();

      const completed = Object.entries(completionData)
        .filter(([_, isCompleted]) => isCompleted)
        .map(([appId, _]) => appId);

      setCompletedGames(completed);

      toaster.toast({
        title: "Completionist",
        body: `Scanned library and found ${completed.length} completed games`,
      });
    } catch (error) {
      toaster.toast({
        title: "Error",
        body: "Failed to scan library for completions",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PanelSection title="Completionist Settings">
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={loadCompletedGames}
          disabled={isLoading}
        >
          {isLoading ? "Loading..." : "Load Completed Games"}
        </ButtonItem>
      </PanelSectionRow>

      <PanelSectionRow>
        <ButtonItem layout="below" onClick={scanLibrary} disabled={isLoading}>
          {isLoading ? "Scanning..." : "Scan Library for Completions"}
        </ButtonItem>
      </PanelSectionRow>

      <PanelSectionRow>
        <div style={{ padding: "8px 0" }}>
          <strong>Completed Games: {completedGames.length}</strong>
          {completedGames.length > 0 && (
            <div style={{ marginTop: "8px", fontSize: "12px" }}>
              {completedGames.map((appId) => (
                <div key={appId}>App ID: {appId}</div>
              ))}
            </div>
          )}
        </div>
      </PanelSectionRow>
    </PanelSection>
  );
}

export default definePlugin(() => {
  console.log(
    "Completionist plugin initializing, this is called once on frontend startup"
  );

  let patches: any[] = [];
  let completedGames: Set<string> = new Set();

  // Function to update completed games from backend
  const updateCompletedGames = async () => {
    try {
      // First try to scan the library for fresh data
      const completionData = await scanLibraryForCompletions();
      const completed = Object.entries(completionData)
        .filter(([_, isCompleted]) => isCompleted)
        .map(([appId, _]) => appId);

      completedGames = new Set(completed);
      console.log("Updated completed games:", completed);
    } catch (error) {
      console.error("Failed to update completed games:", error);
      // Fall back to cached data
      try {
        const completed = await getCompletedGames();
        completedGames = new Set(completed);
        console.log("Using cached completed games:", completed);
      } catch (fallbackError) {
        console.error("Failed to get cached completed games:", fallbackError);
      }
    }
  };

  // Function to inject trophy overlays into game tiles
  const injectTrophyOverlays = () => {
    try {
      // This is a simplified approach - in a real implementation,
      // we'd need to find the specific library modules and patch them
      const gameElements = document.querySelectorAll("[data-appid]");

      gameElements.forEach((element) => {
        const appId = element.getAttribute("data-appid");
        if (appId && completedGames.has(appId)) {
          // Check if trophy overlay already exists
          if (!element.querySelector(".completionist-trophy")) {
            const trophyDiv = document.createElement("div");
            trophyDiv.className = "completionist-trophy";
            trophyDiv.style.cssText = `
              position: absolute;
              bottom: 8px;
              left: 8px;
              width: 28px;
              height: 28px;
              z-index: 1000;
              display: flex;
              align-items: center;
              justify-content: center;
            `;

            const trophyImg = document.createElement("img");
            trophyImg.src = trophyImage;
            trophyImg.style.cssText = `
              width: 100%;
              height: 100%;
              object-fit: contain;
              filter: drop-shadow(0 2px 4px rgba(0,0,0,0.8));
            `;
            trophyImg.alt = "100% Complete";

            trophyDiv.appendChild(trophyImg);

            // Make sure the parent has relative positioning
            if (element instanceof HTMLElement) {
              element.style.position = "relative";
              element.appendChild(trophyDiv);
            }
          }
        }
      });
    } catch (error) {
      console.error("Error injecting trophy overlays:", error);
    }
  };

  // Periodically check for new game elements and inject trophies
  let intervalId: NodeJS.Timeout;

  // Initialize the plugin
  const initialize = async () => {
    await updateCompletedGames();

    // Set up periodic checking for game elements
    intervalId = setInterval(() => {
      injectTrophyOverlays();
    }, 2000);

    // Initial injection
    setTimeout(injectTrophyOverlays, 1000);
  };

  // Start initialization
  initialize();

  // Add an event listener to the "timer_event" event from the backend
  const listener = addEventListener<
    [test1: string, test2: boolean, test3: number]
  >("timer_event", (test1, test2, test3) => {
    console.log("Completionist got timer_event with:", test1, test2, test3);
    toaster.toast({
      title: "completionist got timer_event",
      body: `${test1}, ${test2}, ${test3}`,
    });
  });

  return {
    // The name shown in various decky menus
    name: "Completionist",
    // The element displayed at the top of your plugin's menu
    titleView: <div className={staticClasses.Title}>Completionist</div>,
    // The content of your plugin's menu
    content: <Content />,
    // The icon displayed in the plugin list
    icon: <FaTrophy />,
    // The function triggered when your plugin unloads
    onDismount() {
      console.log("Unloading Completionist plugin");

      // Clear interval
      if (intervalId) {
        clearInterval(intervalId);
      }

      // Remove all trophy overlays
      document
        .querySelectorAll(".completionist-trophy")
        .forEach((el) => el.remove());

      // Unpatch any patches
      patches.forEach((patch) => {
        if (patch && typeof patch.unpatch === "function") {
          patch.unpatch();
        }
      });

      removeEventListener("timer_event", listener);
    },
  };
});
