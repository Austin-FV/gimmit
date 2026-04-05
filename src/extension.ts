import * as vscode from "vscode";
import { execSync, execFileSync } from "child_process";
import * as path from "path";
import * as fs from "fs";
import {
  AiProvider,
  AiConfig,
  AiGenerateRequest,
  getDefaultModel,
  generateWithAi,
} from "./ai-service";
import { getChangedFiles, getGitDiff, getRepoRoot, findRepoFromWorkspace } from "./git-utils";
import { AiState, getWebviewContent, getNoWorkspaceContent } from "./webview/content";

// ─── Sidebar Provider ─────────────────────────────────────────────────────────

class GitCommitViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "gimmit.sidebar";
  private _view?: vscode.WebviewView;
  private _watcher?: fs.FSWatcher;
  private _disposables: vscode.Disposable[] = [];
  private _context: vscode.ExtensionContext;

  constructor(
    private _repoRoot: string | undefined,
    context: vscode.ExtensionContext
  ) {
    this._context = context;
  }

  // ── AI State Helpers ──

  private _getAiProvider(): AiProvider | "none" {
    return this._context.globalState.get<AiProvider | "none">("gimmit.aiProvider", "none");
  }

  private _getAiModel(): string {
    const provider = this._getAiProvider();
    if (provider === "none") return "";
    return this._context.globalState.get<string>(
      `gimmit.aiModel.${provider}`,
      getDefaultModel(provider)
    );
  }

  private async _getAiKeyStatus(): Promise<Record<AiProvider, boolean>> {
    const providers: AiProvider[] = ["claude", "openai", "gemini"];
    const result: Record<string, boolean> = {};
    for (const p of providers) {
      const key = await this._context.secrets.get(`gimmit.apiKey.${p}`);
      result[p] = !!key;
    }
    return result as Record<AiProvider, boolean>;
  }

  private async _buildAiState(): Promise<AiState> {
    return {
      provider: this._getAiProvider(),
      modelId: this._getAiModel(),
      hasKey: await this._getAiKeyStatus(),
    };
  }

  private async _sendAiState() {
    if (!this._view) return;
    const aiState = await this._buildAiState();
    this._view.webview.postMessage({ command: "aiStateUpdate", aiState });
  }

  public async notifyAiStateChanged() {
    await this._sendAiState();
  }

  // ── Webview ──

  public async setRepoRoot(root: string | undefined) {
    if (root === this._repoRoot) return;
    this._repoRoot = root;
    this._stopWatcher();
    if (this._view) {
      const aiState = await this._buildAiState();
      this._view.webview.html = root
        ? getWebviewContent(getChangedFiles(root), aiState)
        : getNoWorkspaceContent();
      if (root) this._startWatcher();
    }
  }

  async resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };

    const aiState = await this._buildAiState();
    webviewView.webview.html = this._repoRoot
      ? getWebviewContent(getChangedFiles(this._repoRoot), aiState)
      : getNoWorkspaceContent();

    webviewView.webview.onDidReceiveMessage((msg) => this._handleMessage(msg));

    if (this._repoRoot) this._startWatcher();
    webviewView.onDidDispose(() => this._stopWatcher());
  }

  // ── Message Handling ──

  private async _handleMessage(msg: any) {
    switch (msg.command) {
      case "refresh":
        this._refresh();
        break;

      case "setAiProvider":
        await this._context.globalState.update("gimmit.aiProvider", msg.provider);
        await this._sendAiState();
        break;

      case "setAiModel": {
        const provider = this._getAiProvider();
        if (provider !== "none") {
          await this._context.globalState.update(`gimmit.aiModel.${provider}`, msg.modelId);
          await this._sendAiState();
        }
        break;
      }

      case "manageApiKey":
        if (msg.provider && msg.provider !== "none") {
          await vscode.commands.executeCommand("gimmit.manageApiKey", msg.provider);
        }
        break;

      case "aiGenerate":
        await this._handleAiGenerate(msg);
        break;

      case "runGitCommand":
        this._handleRunGitCommand(msg);
        break;

      case "undoCommit":
        this._handleUndoCommit();
        break;
    }
  }

  // ── AI Generation ──

  private async _handleAiGenerate(msg: any) {
    if (!this._view || !this._repoRoot) return;
    const provider = this._getAiProvider();
    if (provider === "none") {
      this._view.webview.postMessage({
        command: "aiResult",
        mode: msg.mode,
        error: "No AI provider selected",
      });
      return;
    }

    const apiKey = await this._context.secrets.get(`gimmit.apiKey.${provider}`);
    if (!apiKey) {
      this._view.webview.postMessage({
        command: "aiResult",
        mode: msg.mode,
        error: "No API key saved for " + provider,
      });
      return;
    }

    const modelId = this._getAiModel();
    const filePaths: string[] = msg.filePaths || [];
    const diff = getGitDiff(this._repoRoot, filePaths);

    if (!diff && filePaths.length === 0) {
      this._view.webview.postMessage({
        command: "aiResult",
        mode: msg.mode,
        error: "No files selected",
      });
      return;
    }

    try {
      const config: AiConfig = { provider, modelId, apiKey };
      const request: AiGenerateRequest = {
        diff,
        fileList: filePaths,
        commitType: msg.commitType || "feat",
        scope: msg.scope || "",
        mode: msg.mode,
      };

      const text = await generateWithAi(config, request);
      this._view.webview.postMessage({
        command: "aiResult",
        mode: msg.mode,
        text,
      });
    } catch (err: any) {
      this._view.webview.postMessage({
        command: "aiResult",
        mode: msg.mode,
        error: err.message || "AI generation failed",
      });
    }
  }

  // ── Git Command Execution ──

  private _handleRunGitCommand(msg: any) {
    if (!this._view || !this._repoRoot) return;

    const filePaths: string[] = msg.filePaths || [];
    if (!filePaths.length) {
      this._view.webview.postMessage({
        command: "runResult",
        error: "No files selected",
      });
      return;
    }

    try {
      // Stage files — pass as array to avoid shell escaping issues
      execFileSync("git", ["add", ...filePaths], {
        cwd: this._repoRoot,
        stdio: "pipe",
      });

      // Build commit args as array — execFileSync passes them directly,
      // so newlines in body/footers are preserved correctly
      const commitArgs: string[] = ["-m", msg.commitMsg];

      if (msg.commitBody && msg.commitBody.trim()) {
        commitArgs.push("-m", msg.commitBody);
      }

      // Build footer block
      const footerLines: string[] = [];
      if (msg.breakingChange && msg.breakingMsg && msg.breakingMsg.trim()) {
        footerLines.push("BREAKING CHANGE: " + msg.breakingMsg);
      }
      if (msg.footers && msg.footers.length) {
        for (const f of msg.footers) {
          const token = f.token === "Custom" ? f.customToken : f.token;
          if (token && token.trim() && f.value && f.value.trim()) {
            footerLines.push(token + ": " + f.value);
          }
        }
      }
      if (footerLines.length) {
        commitArgs.push("-m", footerLines.join("\n"));
      }

      execFileSync("git", ["commit", ...commitArgs], {
        cwd: this._repoRoot,
        stdio: "pipe",
      });

      this._view.webview.postMessage({ command: "runResult", success: true });

      // Refresh file list after successful commit
      setTimeout(() => this._refresh(), 300);

    } catch (err: any) {
      let errorMsg = "Git command failed";
      if (err.stderr) {
        errorMsg = err.stderr.toString().trim();
      } else if (err.message) {
        errorMsg = err.message;
      }
      this._view.webview.postMessage({
        command: "runResult",
        error: errorMsg,
      });
    }
  }

  private _handleUndoCommit() {
    if (!this._view || !this._repoRoot) return;

    try {
      execSync("git reset HEAD~1", {
        cwd: this._repoRoot,
        stdio: "pipe",
      });

      this._view.webview.postMessage({ command: "undoResult", success: true });

      // Refresh file list
      setTimeout(() => this._refresh(), 300);
    } catch (err: any) {
      let errorMsg = "Undo failed";
      if (err.stderr) {
        errorMsg = err.stderr.toString().trim();
      } else if (err.message) {
        errorMsg = err.message;
      }
      this._view.webview.postMessage({
        command: "undoResult",
        error: errorMsg,
      });
    }
  }

  // ── File Watching & Refresh ──

  private _refresh() {
    if (!this._view || !this._repoRoot) return;
    const files = getChangedFiles(this._repoRoot);
    this._view.webview.postMessage({ command: "updateFiles", files });
  }

  public refresh() {
    this._refresh();
  }

  private _startWatcher() {
    if (!this._repoRoot) return;
    this._stopWatcher();
    const gitDir = path.join(this._repoRoot, ".git");
    if (!fs.existsSync(gitDir)) return;

    let debounce: ReturnType<typeof setTimeout> | undefined;
    const trigger = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => this._refresh(), 300);
    };

    try {
      this._watcher = fs.watch(gitDir, { recursive: false }, (_, filename) => {
        if (filename === "index" || filename === "HEAD" || filename === "MERGE_HEAD") trigger();
      });
    } catch { /* fs.watch not available on all platforms */ }

    this._disposables.push(
      vscode.workspace.onDidSaveTextDocument(() => trigger()),
      vscode.workspace.onDidCreateFiles(() => trigger()),
      vscode.workspace.onDidDeleteFiles(() => trigger()),
      vscode.workspace.onDidRenameFiles(() => trigger())
    );
  }

  private _stopWatcher() {
    this._watcher?.close();
    this._watcher = undefined;
    this._disposables.forEach(d => d.dispose());
    this._disposables = [];
  }
}

// ─── Activate ─────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  // Scan workspace folders (and their children) for an actual git repo
  const initialRoot = workspaceFolders ? findRepoFromWorkspace(workspaceFolders) : undefined;

  // If workspace scan didn't find anything, try the currently active editor
  const activeEditorRoot = !initialRoot && vscode.window.activeTextEditor?.document.uri.scheme === "file"
    ? getRepoRoot(vscode.window.activeTextEditor.document.uri.fsPath)
    : undefined;

  const provider = new GitCommitViewProvider(initialRoot ?? activeEditorRoot, context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      GitCommitViewProvider.viewType,
      provider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // Switch repo when the user opens a file in a different git repo, and refresh file list
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (!editor || editor.document.uri.scheme !== "file") return;
      const root = getRepoRoot(editor.document.uri.fsPath);
      if (root) provider.setRepoRoot(root);
      provider.refresh();
    })
  );

  // Refresh file list when VS Code window regains focus
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState(state => {
      if (state.focused) provider.refresh();
    })
  );

  // Handle workspace folders being added or removed
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(e => {
      if (e.added.length > 0) {
        const root = findRepoFromWorkspace(e.added);
        if (root) { provider.setRepoRoot(root); return; }
      }
      if (e.removed.length > 0) {
        const remaining = vscode.workspace.workspaceFolders;
        if (!remaining || remaining.length === 0) {
          provider.setRepoRoot(undefined);
        } else {
          const root = findRepoFromWorkspace(remaining);
          if (root) provider.setRepoRoot(root);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("gimmit.open", () => {
      vscode.commands.executeCommand("gimmit.sidebar.focus");
    })
  );

  // ── AI Key Management Commands ──

  context.subscriptions.push(
    vscode.commands.registerCommand("gimmit.manageApiKey", async (preselectedProvider?: string) => {
      const providers: { label: string; id: AiProvider }[] = [
        { label: "Claude (Anthropic)", id: "claude" },
        { label: "OpenAI", id: "openai" },
        { label: "Gemini (Google)", id: "gemini" },
      ];

      let selectedProvider: AiProvider;

      if (preselectedProvider && ["claude", "openai", "gemini"].includes(preselectedProvider)) {
        selectedProvider = preselectedProvider as AiProvider;
      } else {
        const picked = await vscode.window.showQuickPick(
          providers.map((p) => p.label),
          { placeHolder: "Select AI provider to manage API key for" }
        );
        if (!picked) return;
        selectedProvider = providers.find((p) => p.label === picked)!.id;
      }

      const existingKey = await context.secrets.get(`gimmit.apiKey.${selectedProvider}`);
      const providerLabel = providers.find((p) => p.id === selectedProvider)!.label;

      if (existingKey) {
        const action = await vscode.window.showQuickPick(
          ["Replace key", "Delete key", "Cancel"],
          { placeHolder: `${providerLabel} — API key is saved. What would you like to do?` }
        );
        if (!action || action === "Cancel") return;

        if (action === "Delete key") {
          await context.secrets.delete(`gimmit.apiKey.${selectedProvider}`);
          vscode.window.showInformationMessage(`Gimmit: ${providerLabel} API key deleted.`);
          provider.notifyAiStateChanged();
          return;
        }
      }

      const key = await vscode.window.showInputBox({
        prompt: `Enter your ${providerLabel} API key`,
        placeHolder: "sk-...",
        password: true,
        ignoreFocusOut: true,
        validateInput: (value) => {
          if (!value || !value.trim()) return "API key cannot be empty";
          return null;
        },
      });

      if (key) {
        await context.secrets.store(`gimmit.apiKey.${selectedProvider}`, key.trim());
        vscode.window.showInformationMessage(`Gimmit: ${providerLabel} API key saved securely.`);
        provider.notifyAiStateChanged();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("gimmit.setApiKey", () => {
      vscode.commands.executeCommand("gimmit.manageApiKey");
    })
  );
}

export function deactivate() {}