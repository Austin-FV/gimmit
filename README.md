# gimmit
Generate clean, conventional commit messages directly from your changed files — without leaving VS Code.

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
## Demo

<!-- Replace this GIF with a real demo -->
<!-- ![gimmit demo](./media/demo.gif) -->
🚧 Demo coming soon
> Select files → pick a commit type → copy a ready-to-run git command

## Why gimmit?

Writing conventional commits manually is slow and inconsistent.

Gimmit automates it by:
- reading your changed files
- suggesting the correct commit type
- generating a ready-to-use command

> Think of gimmit as a smart layer on top of `git add` + `git commit`.

## Features

- **Clean conventional commits** — properly formatted every time
- **AI-powered messages** — optional AI generation for commit messages using Anthropic, OpenAI, or Google
- **Live file tracking** — auto-updates from `git status`
- **Smart commit suggestions** — based on file names and paths
- **Run or copy commands** — execute `git add` + `git commit` directly from the sidebar, or copy to clipboard

## Usage

1. Open a git repository in VS Code
2. Make some changes to files
3. Open the **Gimmit** panel (activity bar)
4. Select which files to include in the commit
5. Choose a commit type — gimmit suggests one automatically
6. Adjust the message if needed, or use '**✦**' to generate one with AI
7. Optionally add a body, footers, or mark as a breaking change
8. Click '**Run**' to commit directly, or '**Copy**' to paste into your terminal

Basic example:

```
git add src/auth.ts src/api/users.ts
git commit -m "feat(src): add JWT refresh token logic"
```

Advanced example (with body + footers):

```
git add src/auth.ts
git commit -m "feat(src)!: update auth endpoint" -m "- src/auth.ts [Modified]" -m "BREAKING CHANGE: JWT tokens are now required
Refs: #42
Co-authored-by: Jane <jane@example.com>"
```

## Commands
 
| Command | Description |
|---------|-------------|
| `Gimmit: Open` | Focus the gimmit sidebar panel |
| `Gimmit: Set API Key` | Open the API key manager (provider picker → secure input) |
| `Gimmit: Manage API Key` | Manage a specific provider's API key (replace or delete) |

## AI Assist
 
Gimmit can use AI to generate commit messages and bodies based on your actual code changes (git diff). This is entirely optional — the extension works without it.
 
### Supported providers
 
| Provider | Models |
|----------|--------|
| Anthropic | Claude Haiku 4.5, Claude Sonnet 4.6, Claude Opus 4.6 |
| OpenAI | GPT-5 Nano, GPT-5.4 Nano |
| Google | Gemini 2.5 Flash Lite, Gemini 3.1 Flash Lite Preview |
 
### Setup
 
1. Open the **AI Assist** section in the gimmit sidebar
2. Select a provider and model
3. Click **manage** to set your API key (or run `Gimmit: Set API Key` from the command palette)
4. API keys are stored securely in your OS keychain via VS Code's SecretStorage — never in settings files

### Usage
 
Once configured, a **✦** button appears inside the commit message and body input fields. Click it to generate content based on your selected files and their diffs. The AI writes only the description — the conventional commit prefix, scope, and type remain under your control.


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
| `none`     | no conventional commits!       | —                                                         |

## Footer Tokens

Supported tokens:
- Issue tracking: `Refs`, `Closes`, `Fixes`
- Attribution: `Co-authored-by`, `Reviewed-by`
- References: `See-also`
- Custom: define your own

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [VS Code](https://code.visualstudio.com/)

### Project structure
 
```
src/
├── extension.ts        # activate(), GitCommitViewProvider class
├── ai-service.ts       # AI provider integrations (Anthropic, OpenAI, Google)
├── git-utils.ts        # getChangedFiles(), getGitDiff(), getRepoRoot(), findRepoFromWorkspace()
├── detection.ts        # CommitType, ChangedFile, detectChangeType(), patterns
└── webview/
    ├── content.ts      # getWebviewContent(), getNoWorkspaceContent()
    ├── styles.ts       # CSS string export
    └── script.ts       # Webview JS logic string export
```


### Run locally

```bash
npm install
npm run compile
```

Press **F5** in VS Code to launch an Extension Development Host with 'gimmit' loaded.

### Watch mode

```bash
npm run watch
```

Recompiles automatically on every save.

## Packaging & Publishing

```bash
npm install -g @vscode/vsce
vsce package
# produces gimmit-1.0.0.vsix
```

Install a `.vsix` locally:

```bash
code --install-extension gimmit-1.0.0.vsix
```

Publish to the marketplace:

```bash
vsce publish
```

You will need a Personal Access Token from [Azure DevOps](https://dev.azure.com) with Marketplace publish permissions, and a publisher ID registered at [marketplace.visualstudio.com](https://marketplace.visualstudio.com).

## Requirements

- Git must be installed and available in your system PATH
- A workspace folder containing a git repository must be open
- For AI features: an API key from at least one supported provider

## License

This project is licensed under the **MIT License**.

See the [LICENSE](LICENSE) file for details.