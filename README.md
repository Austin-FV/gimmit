# gimmit

Generate clean, conventional commit messages directly from your changed files — without leaving VS Code.

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

<!-- ![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/YOUR_PUBLISHER.gimmit) -->
<!-- ![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/YOUR_PUBLISHER.gimmit) -->

## Demo

<!-- Replace with a real recording -->
<!-- ![gimmit demo](./media/demo.gif) -->

🚧 Demo coming soon

> Select files → pick a commit type → generate a ready-to-run git command

## Why gimmit?

Writing conventional commits manually is slow and inconsistent. Gimmit automates it by reading your changed files, suggesting the correct commit type, and generating a ready-to-use command — with optional AI-powered descriptions from your actual diffs.

## Features

- **Conventional commits** — properly formatted every time, with all standard types
- **AI-powered messages** — optional generation using Anthropic, OpenAI, or Google
- **Live file tracking** — auto-refreshes from `git status` on save, tab switch, and window focus
- **Smart type detection** — suggests commit type based on file names and paths
- **Run or copy** — execute `git add` + `git commit` from the sidebar, or copy to clipboard
- **Undo support** — 15-second undo window after every commit
- **Full spec support** — scope, body, footers, and breaking changes
- **Multi-repo aware** — detects and switches between git repositories across workspaces
- **Secure key storage** — API keys in your OS keychain via VS Code SecretStorage
- **Zero dependencies** — all AI calls use Node.js built-in `https`

## Commands

| Command                  | Description                                              |
| ------------------------ | -------------------------------------------------------- |
| `Gimmit: Open`           | Focus the gimmit sidebar panel                           |
| `Gimmit: Set API Key`    | Open the API key manager (provider picker → secure input) |
| `Gimmit: Manage API Key` | Manage a specific provider's API key (replace or delete) |

## Usage

1. Open a git repository in VS Code
2. Make some changes to files
3. Open the **Gimmit** panel in the activity bar
4. Select which files to include in the commit
5. Choose a commit type — gimmit suggests one automatically
6. Adjust the message if needed, or click **✦** to generate one with AI
7. Optionally add a body, footers, or mark as a breaking change
8. Click **Run** to commit directly, or **Copy** to paste into your terminal

**Basic example:**

```
git add src/auth.ts src/api/users.ts
git commit -m "feat(src): add JWT refresh token logic"
```

**With body + footers:**

```
git add src/auth.ts
git commit -m "feat(src)!: update auth endpoint" -m "- src/auth.ts [Modified]" -m "BREAKING CHANGE: JWT tokens are now required
Refs: #42
Co-authored-by: Jane <jane@example.com>"
```

## AI Assist

Gimmit can generate commit messages and bodies from your actual code changes (git diff). This is entirely optional — the extension works fully without it.

### Supported providers

| Provider  | Models                                                |
| --------- | ----------------------------------------------------- |
| Anthropic | Claude Haiku 4.5, Claude Sonnet 4.6, Claude Opus 4.6 |
| OpenAI    | GPT-5 Nano, GPT-5.4 Nano                             |
| Google    | Gemini 2.5 Flash Lite, Gemini 3.1 Flash Lite Preview  |

### Setup

1. Open the **AI Assist** section in the gimmit sidebar
2. Select a provider and model
3. Click **manage** to set your API key (or run `Gimmit: Set API Key` from the command palette)

API keys are stored securely in your OS keychain via VS Code's SecretStorage — never in settings files.

### How it works

Once configured, a **✦** button appears inside the commit message and body input fields. Click it to generate content based on your selected files and their diffs. The AI writes only the description — the conventional commit prefix, scope, and type remain under your control.

## Commit Types

| Type       | Description                           | Auto-detected from                                                               |
| ---------- | ------------------------------------- | -------------------------------------------------------------------------------- |
| `feat`     | New feature                           | Default for unmatched files                                                      |
| `fix`      | Bug fix                               | `bug`, `fix`, `patch`, `hotfix`, `error`, `issue`, `crash`, `fail`               |
| `docs`     | Documentation                         | `README`, `.md`, `docs/`, `changelog`, `LICENSE`, `.txt`                         |
| `chore`    | Config or tooling                     | `.json`, `.yaml`, `.yml`, `.env`, `config`, `.toml`, `.ini`, `Dockerfile`, `.sh` |
| `style`    | Formatting, CSS                       | `.css`, `.scss`, `.less`, `.styled.`, `theme`                                    |
| `test`     | Tests                                 | `.test.`, `.spec.`, `__tests__/`, `test/`                                        |
| `refactor` | Code restructure, no behavior change  | —                                                                                |
| `perf`     | Performance improvement               | —                                                                                |
| `build`    | Build system changes                  | —                                                                                |
| `ci`       | CI/CD configuration                   | —                                                                                |
| `none`     | No conventional commit prefix         | —                                                                                |

Deleted files are automatically detected as `chore`.

## Requirements

- VS Code 1.85+
- Git installed and available in your system PATH
- For AI features: an API key from at least one supported provider

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [VS Code](https://code.visualstudio.com/)

### Project structure

```
src/
├── extension.ts        # activate(), GitCommitViewProvider, command registration
├── ai-service.ts       # AI provider integrations (Anthropic, OpenAI, Google)
├── git-utils.ts        # git status, diff, repo detection
├── detection.ts        # commit type detection from file paths
└── webview/
    ├── content.ts      # HTML generation with CSP
    ├── styles.ts       # CSS
    └── script.ts       # Webview UI logic
```

### Run locally

```bash
npm install
npm run compile
```

Press **F5** to launch an Extension Development Host with gimmit loaded.

### Watch mode

```bash
npm run watch
```

### Packaging

```bash
npm install -g @vscode/vsce
vsce package        # produces gimmit-1.0.0.vsix
```

Install locally:

```bash
code --install-extension gimmit-1.0.0.vsix
```

Publish:

```bash
vsce publish
```

Requires a [Personal Access Token](https://dev.azure.com) with Marketplace publish permissions and a publisher ID from [marketplace.visualstudio.com](https://marketplace.visualstudio.com).

## License

MIT — see [LICENSE](LICENSE) for details.