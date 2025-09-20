# Completionist

[![Chat](https://img.shields.io/badge/chat-on%20discord-7289da.svg)](https://deckbrew.xyz/discord)

A plugin for [decky-loader](https://github.com/SteamDeckHomebrew/decky-loader) that displays trophy icons on Steam games you've 100% completed.

## Features

- 🏆 Displays trophy overlays on games with 100% achievement completion
- 📊 Scans your Steam library for completion status
- ⚡ Real-time updates as you complete games
- 🎮 Seamlessly integrates with Steam Deck's library UI

## How it works

The Completionist plugin:

1. Scans your Steam library for games with achievements
2. Checks the completion status of each game
3. Displays a golden trophy icon in the bottom-left corner of completed games
4. Updates automatically when you achieve 100% completion

## Installation

### Using Decky Loader

1. Ensure you have [decky-loader](https://github.com/SteamDeckHomebrew/decky-loader) installed on your Steam Deck
2. Copy the plugin folder to your decky plugins directory
3. Restart decky-loader or reload plugins
4. The Completionist plugin should appear in your plugin list

### Development Installation

In the `Completionist` directory, run:

1. `pnpm i`
2. `pnpm run build`

## Usage

1. Open the Decky Loader plugin menu (power button + A)
2. Navigate to the Completionist plugin
3. Click "Scan Library for Completions" to check your games
4. Trophy icons will appear on completed games in your library

## Current Implementation Status

**Note**: This is currently a proof-of-concept implementation with simulated data. The plugin demonstrates the UI injection system and shows trophy icons on sample games (Team Fortress 2, Dota 2, Portal 2, etc.).

### To make this fully functional, you would need to:

1. **Steam Web API Integration**: Implement proper Steam Web API calls to get real achievement data
2. **User Authentication**: Add Steam user authentication to access personal achievement data
3. **Library Integration**: Hook into Steam's library system to get the actual owned games list
4. **Real-time Updates**: Connect to Steam's achievement notification system

## Technical Details

### Backend (`main.py`)

- Manages achievement data caching
- Provides API endpoints for completion status checking
- Simulates achievement data for demonstration

### Frontend (`src/index.tsx`)

- Injects trophy overlays into the Steam library UI
- Provides a settings panel for manual scanning
- Handles real-time UI updates

### UI Patching System

The plugin uses DOM manipulation to inject trophy icons directly into Steam's library interface, ensuring compatibility with the existing UI.

## Files Overview

- `src/index.tsx`: Frontend React components and UI injection logic
- `main.py`: Backend Python achievement processing logic
- `plugin.json`: Plugin metadata and configuration
- `package.json`: Node.js dependencies and build scripts

## Next Steps for Production

To make this a fully functional plugin, you'll need to:

1. **Implement Steam Web API calls**:

   ```python
   # In main.py, replace the simulated data with real API calls
   async def get_user_achievements(self, app_id: str):
       # Use Steam Web API to get real achievement data
       # API endpoint: ISteamUserStats/GetPlayerAchievements/v0001/
   ```

2. **Add proper game library detection**:

   ```typescript
   // In index.tsx, find Steam's library components and patch them
   const libraryModule = findModule((m) => m.LibraryGameView);
   afterPatch(libraryModule, "render", injectTrophyOverlay);
   ```

3. **Implement real-time achievement notifications**:
   ```python
   # Connect to Steam's achievement notification system
   # Listen for achievement unlock events and update UI
   ```

## Contributing

Feel free to submit issues, fork the repository, and create pull requests for any improvements.

## License

This project is licensed under the BSD-3-Clause License - see the LICENSE file for details.
