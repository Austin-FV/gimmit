# Gimmit - Git Commit Helper

A VS Code extension that reads your modified files, lets you pick which ones to commit, auto-detects the change type, and generates a ready-to-paste conventional commit command.

## Features

- 📋 Lists all modified, added, deleted, and untracked files from `git status`
- 🏷️ Auto-detects commit type (`feat`, `fix`, `docs`, `chore`, `refactor`, `style`, `test`) based on file name/path patterns
- ✅ Checkbox file picker — select exactly what goes into this commit
- ✏️ Editable commit message before copying
- 📋 Copies two-line git command to clipboard:
  ```
  git add <files>

  git commit -m "feat(auth): update login handler"
  ```
- 🔁 Refresh button to re-read the working tree

## Setup & Development

### Prerequisites
- [Node.js](https://nodejs.org/) v18+
- [VS Code](https://code.visualstudio.com/)
- The [vsce](https://github.com/microsoft/vscode-vsce) CLI (optional, for packaging)

### Run in development

```bash
npm install
npm run compile
```

Then press **F5** in VS Code to open an Extension Development Host with the extension loaded.

### Open the panel

- Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
- Run: **Git Commit Helper: Open Panel**

Or click the button in the Source Control (`Ctrl+Shift+G`) panel title bar.

## Commit Type Detection Rules

| Type       | Triggered by                                              |
|------------|-----------------------------------------------------------|
| `test`     | `.test.`, `.spec.`, `__tests__/`, `test/`                |
| `docs`     | `README`, `.md`, `docs/`, `changelog`, `LICENSE`, `.txt` |
| `style`    | `.css`, `.scss`, `.less`, `.styled.`, `theme`            |
| `chore`    | `.json`, `.yaml`, `.yml`, `.env`, `config`, Dockerfile   |
| `fix`      | `bug`, `fix`, `patch`, `hotfix`, `error`, `issue`        |
| `feat`     | everything else                                           |

You can override the detected type per file using the dropdown in the UI.

## Packaging

```bash
npm install -g @vscode/vsce
vsce package
# produces git-commit-helper-0.0.1.vsix
```

Install the `.vsix`:
```
code --install-extension git-commit-helper-0.0.1.vsix
```
