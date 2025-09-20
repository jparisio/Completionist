from typing import Dict, List, Set

# The decky plugin module is located at decky-loader/plugin
# For easy intellisense checkout the decky-loader code repo
# and add the `decky-loader/plugin/imports` path to `python.analysis.extraPaths` in `.vscode/settings.json`
import decky

class Plugin:
    def __init__(self):
        self.completed_games: Set[str] = set()
        self.achievement_cache: Dict[str, Dict] = {}
        
    async def get_user_achievements(self, app_id: str) -> Dict:
        """Get achievement data for a specific app"""
        try:
            # Try to get from cache first
            if app_id in self.achievement_cache:
                return self.achievement_cache[app_id]
                
            # For the initial implementation, we'll use a simulation approach
            # In a production version, this would interface with Steam's achievement system
            decky.logger.info(f"Checking achievements for app {app_id}")
            
            # Simulate some games having 100% completion for demonstration
            # In real implementation, this would query Steam's achievement API
            simulated_completions = {
                "440": {"total_achievements": 34, "unlocked_achievements": 34},  # TF2 (simulated complete)
                "730": {"total_achievements": 167, "unlocked_achievements": 120}, # CS2 (simulated incomplete)
                "570": {"total_achievements": 81, "unlocked_achievements": 81},   # Dota 2 (simulated complete)
                "620": {"total_achievements": 15, "unlocked_achievements": 15},   # Portal 2 (simulated complete)
                "1089980": {"total_achievements": 12, "unlocked_achievements": 12}, # Steamworks Demo (simulated complete)
            }
            
            achievement_data = simulated_completions.get(app_id, {
                "total_achievements": 10, 
                "unlocked_achievements": 5  # Default to incomplete
            })
            
            achievement_data["app_id"] = app_id
            
            # Cache the result
            self.achievement_cache[app_id] = achievement_data
            
            return achievement_data
            
        except Exception as e:
            decky.logger.error(f"Error getting achievements for app {app_id}: {e}")
            return {"app_id": app_id, "total_achievements": 0, "unlocked_achievements": 0}
    
    async def check_completion_status(self, app_id: str) -> bool:
        """Check if a game has 100% achievement completion"""
        try:
            achievement_data = await self.get_user_achievements(app_id)
            
            total = achievement_data.get("total_achievements", 0)
            unlocked = achievement_data.get("unlocked_achievements", 0)
            
            # A game is 100% complete if it has achievements and all are unlocked
            if total > 0 and unlocked == total:
                self.completed_games.add(app_id)
                return True
            else:
                self.completed_games.discard(app_id)
                return False
                
        except Exception as e:
            decky.logger.error(f"Error checking completion for app {app_id}: {e}")
            return False
    
    async def get_completed_games(self) -> List[str]:
        """Get list of all 100% completed games"""
        return list(self.completed_games)
    
    async def get_sample_library_games(self) -> List[str]:
        """Get a sample list of library games for testing"""
        # In a real implementation, this would query Steam's library API
        # For now, return some common game app IDs for testing
        sample_games = [
            "607080",   # psychonauts 2
            "730",      # Counter-Strike 2
            "620",      # Portal 2
            "1030300", # silksong
        ]
        return sample_games
    
    async def scan_library_for_completions(self) -> Dict[str, bool]:
        """Scan the user's library for 100% completed games"""
        try:
            library_games = await self.get_sample_library_games()
            decky.logger.info(f"Scanning {len(library_games)} games for completions")
            
            completion_data = {}
            
            # Check completion status for each game
            for app_id in library_games:
                try:
                    is_completed = await self.check_completion_status(app_id)
                    completion_data[app_id] = is_completed
                    decky.logger.info(f"App {app_id} completion status: {is_completed}")
                except Exception as e:
                    decky.logger.error(f"Error checking completion for app {app_id}: {e}")
                    completion_data[app_id] = False
            
            decky.logger.info(f"Found {len(self.completed_games)} completed games")
            return completion_data
            
        except Exception as e:
            decky.logger.error(f"Error scanning library: {e}")
            return {}

    # Asyncio-compatible long-running code, executed in a task when the plugin is loaded
    async def _main(self):
        decky.logger.info("Completionist plugin loaded!")

    # Function called first during the unload process, utilize this to handle your plugin being stopped, but not
    # completely removed
    async def _unload(self):
        decky.logger.info("Completionist plugin unloading!")
        pass

    # Function called after `_unload` during uninstall, utilize this to clean up processes and other remnants of your
    # plugin that may remain on the system
    async def _uninstall(self):
        decky.logger.info("Completionist plugin uninstalled!")
        pass
