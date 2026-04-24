# pi-tool-visibility

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

The extension registers `Ctrl+Shift+O` to cycle modes by default.

## Persistence

Mode changes are persisted into the current session via a custom session entry (`pi-tool-visibility/state`).
That means your last mode is restored after `/reload` and when reopening that session.

> Older versions used `Ctrl+O`, which can conflict with Pi's built-in `app.tools.expand` binding.
> The default is now `Ctrl+Shift+O` to avoid that conflict.

If you previously remapped keybindings for this extension, you may want to remove the override and `/reload`.

## Install as a Pi package

You can install this repo directly as a Pi package:

```bash
pi install https://github.com/jwharington/pi-tool-visibility
```

Or add it to your Pi settings:

`~/.pi/agent/settings.json` (global) or `.pi/settings.json` (project)

```json
{
  "packages": [
    "https://github.com/jwharington/pi-tool-visibility"
  ]
}
```

Then restart Pi or run `/reload`.

## Load extension directly

If you prefer to load the raw extension file instead of using Pi packages:

```json
{
  "extensions": [
    "/home/jmw/opt/AI/pi-tool-visibility/index.ts"
  ]
}
```

## Scope

This extension wraps the built-in tools: `read`, `grep`, `find`, `ls`, `bash`, `edit`, `write`.
