import os
import json
import base64
import shutil

import decky

CACHE_FILENAME = "platinums.json"
SETTINGS_FILENAME = "settings.json"
CUSTOM_ICON_BASENAME = "custom_icon"
MAX_ICON_BYTES = 2 * 1024 * 1024
ICON_MIME_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
}

DEFAULT_SETTINGS = {
    "corner": "bottom-left",
    "size": "small",
    "icon": "steam",
}


def _custom_icon_path():
    for ext in ICON_MIME_TYPES:
        path = os.path.join(
            decky.DECKY_PLUGIN_SETTINGS_DIR, CUSTOM_ICON_BASENAME + ext
        )
        if os.path.isfile(path):
            return path
    return None


def _data_url(path: str) -> str:
    mime = ICON_MIME_TYPES[os.path.splitext(path)[1].lower()]
    with open(path, "rb") as f:
        encoded = base64.b64encode(f.read()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


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

    async def get_custom_icon(self) -> str:
        try:
            path = _custom_icon_path()
            return _data_url(path) if path else ""
        except Exception as e:
            decky.logger.error(f"get_custom_icon failed: {e}")
            return ""

    async def set_custom_icon(self, source: str) -> str:
        try:
            ext = os.path.splitext(source)[1].lower()
            if ext not in ICON_MIME_TYPES:
                decky.logger.error(f"set_custom_icon: unsupported type {ext}")
                return ""
            if os.path.getsize(source) > MAX_ICON_BYTES:
                decky.logger.error("set_custom_icon: file too large")
                return ""
            os.makedirs(decky.DECKY_PLUGIN_SETTINGS_DIR, exist_ok=True)
            existing = _custom_icon_path()
            while existing:
                os.remove(existing)
                existing = _custom_icon_path()
            dest = os.path.join(
                decky.DECKY_PLUGIN_SETTINGS_DIR, CUSTOM_ICON_BASENAME + ext
            )
            shutil.copyfile(source, dest)
            return _data_url(dest)
        except Exception as e:
            decky.logger.error(f"set_custom_icon failed: {e}")
            return ""
