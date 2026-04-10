# gimmit
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code%20Marketplace-gimmit-0098FF?logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=austinfv.gimmit)

**Gimmit** generates clean, conventional commits directly from your changed files — with optional AI-powered descriptions from your actual diffs.

![gimmit demo](./media/demo.gif)

### Stop writing commit messages manually.

⚡ Select files → pick a type → commit in seconds

## Features

- ⚡ **Instant commits** — generate and run commits in seconds  
- 🤖 **AI-powered descriptions** — optional, based on real diffs  
- 🎯 **Smart type detection** — auto-suggests commit type  
- 🧠 **Full conventional commit support** — scope, body, footers, breaking changes  
- 🔄 **Live file tracking** — always synced with git status  
- 🔁 **Undo commits** — 15-second rollback window  
- 🔐 **Secure API keys** — stored in OS keychain  
- 🧩 **Multi-repo support** — works across workspaces  

## Install

1. Open **VS Code**
2. Go to **Extensions**
3. Search for **gimmit**
4. Click **Install**

Or install from the Marketplace:
👉 [Install gimmit](https://marketplace.visualstudio.com/items?itemName=austinfv.gimmit)

## Commands

| Command                  | Description                                              |
| ------------------------ | -------------------------------------------------------- |
| `Gimmit: Open`           | Focus the gimmit sidebar panel                           |
| `Gimmit: Set API Key`    | Open the API key manager (provider picker → secure input) |
| `Gimmit: Manage API Key` | Manage a specific provider's API key (replace or delete) |

## Quick Start

1. Open the **Gimmit** sidebar
2. Select changed files
3. Choose a commit type (auto-suggested)
4. Click **Run**

Done — your commit is created.

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

## Release Notes
Detailed Release Notes are available [here](CHANGELOG.md).

## License

MIT — see [LICENSE](LICENSE) for details.