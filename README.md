# Emacs-like Kill And Yank

Obsidian plugin that supports:

- `Ctrl + K`: kill from cursor to end of line
- `Ctrl + Y`: yank from the clipboard
- `Ctrl + Space`: set mark and keep the editor's native selection in sync while the cursor moves

The visible selection created by `Ctrl + Space` is a normal editor selection, so plugins that rely on `editor.getSelection()` such as `obsidian-select-area-translater` can consume it directly.
