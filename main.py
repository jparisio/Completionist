import os
import json

import decky

CACHE_FILENAME = "platinums.json"
SETTINGS_FILENAME = "settings.json"

DEFAULT_SETTINGS = {
    "corner": "top-right",
    "size": "large",
}


class Plugin:
    async def _main(self):
        decky.logger.info("Completionist loaded")

    async def _unload(self):
        decky.logger.info("Completionist unloading")

    async def _uninstall(self):
        decky.logger.info("Completionist uninstalled")

    async def get_platinums(self) -> list[int]:
        path = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, CACHE_FILENAME)
        try:
            with open(path) as f:
                data = json.load(f)
            ids = data.get("appids", [])
            return [int(x) for x in ids]
        except FileNotFoundError:
            return []
        except Exception as e:
            decky.logger.error(f"get_platinums failed: {e}")
            return []

    async def set_platinums(self, appids: list[int]) -> bool:
        path = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, CACHE_FILENAME)
        try:
            with open(path, "w") as f:
                json.dump({"appids": list(appids)}, f)
            return True
        except Exception as e:
            decky.logger.error(f"set_platinums failed: {e}")
            return False

    async def get_settings(self) -> dict:
        path = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, SETTINGS_FILENAME)
        try:
            with open(path) as f:
                data = json.load(f)
            return {**DEFAULT_SETTINGS, **data}
        except FileNotFoundError:
            return dict(DEFAULT_SETTINGS)
        except Exception as e:
            decky.logger.error(f"get_settings failed: {e}")
            return dict(DEFAULT_SETTINGS)

    async def set_settings(self, settings: dict) -> bool:
        path = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, SETTINGS_FILENAME)
        try:
            with open(path, "w") as f:
                json.dump(settings, f)
            return True
        except Exception as e:
            decky.logger.error(f"set_settings failed: {e}")
            return False
