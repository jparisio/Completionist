import decky


class Plugin:
    async def _main(self):
        decky.logger.info("Completionist loaded")

    async def _unload(self):
        decky.logger.info("Completionist unloading")

    async def _uninstall(self):
        decky.logger.info("Completionist uninstalled")
