# gimmit

A VS Code extension for generating conventional commit commands from your changed files. Select files, pick a commit type, optionally add a body, footers, or breaking change — then copy the ready-to-paste git command.

## Features

- **Live file list** — reads `git status` automatically, updates as you save, create, rename, or delete files. No manual refresh needed.
- **Smart type detection** — auto-detects the commit type for each file based on its name and path. Override per-commit with a single click.
- **Conventional commits** — generates properly formatted `type(scope): description` messages with a 72-character subject line counter.
- **Commit body** — optional expandable section with per-line character tracking (72 char limit).
- **Footers** — add `Refs`, `Closes`, `Fixes`, `Co-authored-by`, `Reviewed-by`, `See-also`, or custom footer tokens. Up to 8 footers, each with a 100-character value limit.
- **Breaking changes** — toggle a `BREAKING CHANGE` footer with a 200-character description. Automatically appends `!` to the commit prefix.
- **None mode** — skip conventional commits formatting entirely and generate a plain commit message.
- **Multi-repo workspaces** — automatically switches to the correct git repo based on the active file.


## Usage

1. Open a git repository in VS Code
2. Make some changes to files
3. Open the **gimmit** panel from the activity bar
4. Select which files to include in the commit
5. Choose a commit type — gimmit suggests one automatically
6. Edit the commit message if needed
7. Optionally add a body, footers, or mark as a breaking change
8. Click **Copy** and paste the command into your terminal

The generated command looks like:

```
git add src/auth.ts src/api/users.ts
git commit -m "feat(src): add JWT refresh token logic"
```

With body and footers:

```
git add src/auth.ts
git commit -m "feat(src)!: update auth endpoint" -m "- src/auth.ts [Modified, feat]" -m "BREAKING CHANGE: JWT tokens are now required
Refs: #42
Co-authored-by: Jane <jane@example.com>"
```

## Commit Types

| Type       | Description                          | Auto-detected from                                        |
|------------|--------------------------------------|-----------------------------------------------------------|
| `feat`     | New feature                          | Everything else                                           |
| `fix`      | Bug fix                              | `bug`, `fix`, `patch`, `hotfix`, `error`, `crash`        |
| `docs`     | Documentation                        | `README`, `.md`, `docs/`, `changelog`, `LICENSE`, `.txt` |
| `chore`    | Config or tooling                    | `.json`, `.yaml`, `.yml`, `.env`, `config`, `Dockerfile`   |
| `style`    | Formatting, CSS                      | `.css`, `.scss`, `.less`, `.styled.`, `theme`            |
| `test`     | Tests                                | `.test.`, `.spec.`, `__tests__/`, `test/`                |
| `refactor` | Code restructure, no behaviour change| —                                                         |
| `perf`     | Performance improvement              | —                                                         |
| `build`    | Build system changes                 | —                                                         |
| `ci`       | CI/CD configuration                  | —                                                         |
| `none`     | No conventional commits prefix       | —                                                         |

## Footer Tokens

The following tokens are available in the footer section:

- `Refs` — link to an issue or ticket number
- `Closes` — auto-closes a GitHub issue on merge
- `Fixes` — alias for Closes
- `Co-authored-by` — pair programming credit
- `Reviewed-by` — code review attribution
- `See-also` — related PRs or documentation
- `Custom` — any token you define

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [VS Code](https://code.visualstudio.com/)

### Run locally

```bash
npm install
npm run compile
```

Press **F5** in VS Code to launch an Extension Development Host with gimmit loaded.

### Watch mode

```bash
npm run watch
```

Recompiles automatically on every save.

## Packaging & Publishing

```bash
npm install -g @vscode/vsce
vsce package
# produces gimmit-0.1.0.vsix
```

Install a `.vsix` locally:

```bash
code --install-extension gimmit-0.1.0.vsix
```

Publish to the marketplace:

```bash
vsce publish
```

You will need a Personal Access Token from [Azure DevOps](https://dev.azure.com) with Marketplace publish permissions, and a publisher ID registered at [marketplace.visualstudio.com](https://marketplace.visualstudio.com).

## Requirements

- Git must be installed and available in your system PATH
- A workspace folder containing a git repository must be open

## License

MIT