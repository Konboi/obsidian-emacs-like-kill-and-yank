# Emacs-like Kill And Yank

Obsidian plugin that supports:

- `Ctrl + K`: kill from cursor to end of line
- `Ctrl + W`: kill selected region
- `Ctrl + Y`: yank from the clipboard
- `Alt + W`: copy selected region without deleting it
- `Ctrl + Space`: set mark and keep the editor's native selection in sync while the cursor moves
- `Ctrl + G` / `Esc`: cancel mark
- `Ctrl + A` / `Ctrl + E` / `Ctrl + B` / `Ctrl + F` / `Ctrl + P` / `Ctrl + N`: extend selection while mark is active

The visible selection created by `Ctrl + Space` is a normal editor selection, so plugins that rely on `editor.getSelection()` such as `obsidian-select-area-translater` can consume it directly.

## Install with BRAT

1. Install the BRAT plugin in Obsidian.
2. Open the BRAT commands palette and run `BRAT: Add a beta plugin for testing`.
3. Paste this repository URL: `https://github.com/Konboi/obsidian-emacs-like-kill-and-yank`
4. Enable `Emacs-like Kill And Yank` in Obsidian's community plugins settings.

If BRAT is already installed, updating the plugin from BRAT will pull the latest published `main.js`, `manifest.json`, and `versions.json` from GitHub Releases.
