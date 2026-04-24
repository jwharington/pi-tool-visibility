# custom-tool-visibility

Pi extension that adds a 4-state tool visibility cycle:

1. `expanded`
2. `collapsed`
3. `hide-older` (show latest tool call only)
4. `hide-all`

## Commands

- `/tool-visibility cycle`
- `/tool-visibility expanded`
- `/tool-visibility collapsed`
- `/tool-visibility hide-older`
- `/tool-visibility hide-all`
- `/tool-visibility-status`

## Shortcut

The extension registers `Ctrl+O` to cycle modes.

## Persistence

Mode changes are persisted into the current session via a custom session entry (`custom-tool-visibility/state`).
That means your last mode is restored after `/reload` and when reopening that session.

> Note: if `Ctrl+O` is still bound to built-in `app.tools.expand`, Pi may reserve that key and skip the extension shortcut.
> In that case, remap `app.tools.expand` in `~/.pi/agent/keybindings.json`.

Example remap:

```json
{
  "app.tools.expand": "ctrl+shift+o"
}
```

Then `/reload`.

## Load extension

Add to your Pi settings:

`~/.pi/agent/settings.json` (global) or `.pi/settings.json` (project)

```json
{
  "extensions": [
    "/home/jmw/opt/AI/custom-tool-visibility/index.ts"
  ]
}
```

Then restart Pi or run `/reload`.

## Scope

This extension wraps the built-in tools: `read`, `grep`, `find`, `ls`, `bash`, `edit`, `write`.
