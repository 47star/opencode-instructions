# OpenCode Instructions

Edit your global `AGENTS.md` from OpenCode Desktop settings.

## Features

- Settings page with the Desktop layout and controls
- Save with the button, `Cmd+S` on macOS or `Ctrl+S` on Linux
- Confirmation before reloading unsaved edits
- Detection of file changes made by another editor or Desktop window
- Atomic replacement with existing permission bits preserved
- Missing-file creation with owner-only permissions
- Symbolic links retained, with writes sent to their resolved targets
- English and Korean controls

## Requirements

- OpenCode Desktop with the experimental GUI plugin API
- macOS or Linux
- Node.js 24 and pnpm 11.17.0 to build from source

Built against `@opencode/plugin` 2.3.0. The GUI API is experimental; a compatible
Desktop build is required. The settings components come from the host SDK. The
multiline field uses the host's `textarea-v2` styling.

## Installation

### From source

```sh
git clone https://github.com/47star/opencode-instructions.git
cd opencode-instructions
pnpm install --frozen-lockfile
pnpm run build
```

Add the absolute directory to `plugins` in your global
`~/.config/opencode/opencode.json` or `opencode.jsonc`. Keep your other settings
and plugin entries.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/absolute/path/to/opencode-instructions"]
}
```

Open Settings > Instructions. Local builds reload automatically in Desktop.
This plugin does not add a terminal or browser settings page.

### From a CI package

The Check workflow attaches an `opencode-instructions` artifact to successful
Linux runs. Download it from GitHub Actions, unzip it, and extract the `.tgz`:

```sh
mkdir opencode-instructions
tar -xzf opencode-instructions-1.0.0.tgz -C opencode-instructions --strip-components=1
```

Use that directory in the same `plugins` configuration. The archive includes a
prebuilt bundle; no dependency installation or build is needed.

## File and editing behavior

The plugin edits `~/.config/opencode/AGENTS.md` on the Desktop computer.
When `XDG_CONFIG_HOME` is set, it uses `$XDG_CONFIG_HOME/opencode/AGENTS.md`.
It does not edit project instructions or a remote server's instructions.

Opening the page creates the file if it is missing, with mode `0600`.
A broken symbolic link reports an error instead of being replaced.

Unsaved edits survive navigation between settings pages in the same window.
Closing the window or reloading the plugin discards them. Reload asks before
discarding a draft. Failed saves retain the draft.

Save compares the current content with the last loaded version and checks it
again before replacement. External editors are not locked: avoid editing the
same file simultaneously. Replacement preserves POSIX permission bits, but not
extended attributes, ACLs or hard-link relationships.

To uninstall, remove the plugin entry from your global configuration. Your
`AGENTS.md` is retained.

## Development

```sh
pnpm install --frozen-lockfile
pnpm run check
```

| Command              | Purpose                                           |
| -------------------- | ------------------------------------------------- |
| `pnpm run build`     | Build `dist/gui-experimental.cjs`                 |
| `pnpm run test`      | Rebuild and run filesystem and rendered GUI tests |
| `pnpm run typecheck` | Check TypeScript                                  |
| `pnpm run format`    | Format source, tests and configuration            |
| `pnpm run check`     | Check formatting, types, build and tests          |
| `pnpm pack`          | Run checks and create the distribution archive    |

Source files have separate responsibilities:

| File             | Responsibility                                  |
| ---------------- | ----------------------------------------------- |
| `src/gui.tsx`    | Plugin registration and main-process save queue |
| `src/file.ts`    | Filesystem operations                           |
| `src/ipc.ts`     | Request and response schemas                    |
| `src/editor.tsx` | Window state and settings view                  |
| `src/i18n.ts`    | Translations                                    |

Do not edit `dist/gui-experimental.cjs` directly. It is generated from the source
files, excluded from Git and included in the distribution archive. Runtime
dependencies are provided by Desktop; development dependencies are not bundled.

## Validation and distribution

CI runs on macOS and Linux. It installs from the lockfile, checks and packages
the plugin, then runs the tests against the extracted distribution bundle.
Rendered GUI tests use Solid with host component adapters. Actual Desktop
rendering has been checked on macOS; Linux Desktop rendering has not been checked.

Every push runs CI and produces a downloadable package on success. It does not
publish to npm or create a GitHub release. No registry token is required.

## Contributions

Use pnpm, keep source files focused on their existing responsibilities, and run
`pnpm run check` before submitting a pull request. Include a regression test for
behavior changes. Report the Desktop version, operating system, reproduction
steps and error text in issues. Do not include the contents of your instructions
file unless they are necessary and safe to share.

## License

MIT. See [LICENSE](LICENSE).
