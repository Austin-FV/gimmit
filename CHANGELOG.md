# Changelog

## [1.0.0] - 2026-04-10

### Added
- Conventional commit message builder with type detection (feat, fix, docs, chore, refactor, style, test, perf, build, ci, none)
- Live file tracking with auto-updates from git status
- AI-powered commit message and body generation using Anthropic, OpenAI, or Google
- Secure API key management via OS keychain (VS Code SecretStorage)
- Run commits directly from the sidebar
- 15-second undo window after committing
- Commit body, footers, and breaking change support
- Scope input for conventional commit scopes
- Copy-ready git command preview with syntax highlighting
- Multi-repo and multi-workspace support
- Auto-refresh on editor tab switch and window focus
- Content Security Policy with nonce-based script execution
- Error boundary on webview render with retry/refresh fallback

### Security
- All git commands use `execFileSync` to prevent shell injection
- HTML output escaped for `"` and `'` to prevent XSS via attribute breakout
- CSP-safe event delegation — no inline `onclick`/`oninput`/`onchange` handlers
- Git diff `maxBuffer` set to 5 MB to handle large repositories