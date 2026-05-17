interface SteamApp {
  appid: number;
  display_name: string;
}

interface AchievementCacheEntry {
  appid: number;
  unlocked: number;
  total: number;
  percentage: number;
  all_unlocked: boolean;
  cache_time: number;
  vetted: boolean;
}

interface Window {
  appStore: {
    allApps: SteamApp[];
  };
  appAchievementProgressCache: {
    BGameHasAchievements(appid: number): boolean;
    GetAchievementProgress(appid: number): number;
    RequestCacheUpdate(appid: number): Promise<unknown>;
    m_achievementProgress: {
      mapCache: Map<number, AchievementCacheEntry>;
    };
  };
}
