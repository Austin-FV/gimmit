# Changelog

All notable changes to this project will be documented in this file.

## [1.0.1] - 2026-04-10

### Changed
- Updated README with links to install extension
- Removed unnecessary media files

## [1.0.0] - 2026-04-10

### 🚀 Highlights
- Full conventional commit workflow directly inside VS Code
- AI-powered commit generation across Anthropic, OpenAI, and Google
- Secure API key storage and safe Git execution

### Core Features
- Conventional commit message builder with type detection (feat, fix, docs, chore, refactor, style, test, perf, build, ci, none)
- Run commits directly from the sidebar
- Commit body, footers, and breaking change support
- Scope input for conventional commit scopes
- Copy-ready git command preview with syntax highlighting
- 15-second undo window after committing

### AI Features
- AI-powered commit message and body generation using Anthropic, OpenAI, or Google
- Secure API key management via OS keychain (VS Code SecretStorage)

### Developer Experience
- Live file tracking with auto-updates from git status
- Auto-refresh on editor tab switch and window focus
- Multi-repo and multi-workspace support

### Webview & UI
- Content Security Policy with nonce-based script execution
- Error boundary on webview render with retry/refresh fallback

### Security
- Git commands executed using `execFileSync` to prevent shell injection
- HTML output escaped to prevent XSS via attribute injection
- CSP-compliant webview with no inline event handlers
- Git diff buffer capped at 5 MB for safe large-repo handling

### Notes
- Initial public release