import { AiProvider, PROVIDER_MODELS } from "../ai-service";
import { ChangedFile } from "../detection";
import { getStyles } from "./styles";
import { getScript } from "./script";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AiState {
  provider: AiProvider | "none";
  modelId: string;
  hasKey: Record<AiProvider, boolean>;
}

// ─── Nonce ────────────────────────────────────────────────────────────────────

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

// ─── Main Webview Content ─────────────────────────────────────────────────────

export function getWebviewContent(files: ChangedFile[], aiState: AiState): string {
  const filesJson = JSON.stringify(files);
  const aiStateJson = JSON.stringify(aiState);
  const modelsJson = JSON.stringify(PROVIDER_MODELS);
  const nonce = getNonce();

  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<title>Git Commit Helper</title>
<style>
${getStyles()}
</style>
</head>
<body>
<div id="scrollable" style="flex:1;overflow-y:auto;padding:12px;overflow-x:hidden;display:flex;flex-direction:column">
<div class="header">
  <h1>gimmit</h1>
  <p>Select files · generate commit</p>
</div>
<div id="root" style="flex:1;display:flex;flex-direction:column"></div>
</div>
<div id="cmd-footer"></div>

<script nonce="${nonce}">
${getScript(filesJson, modelsJson, aiStateJson)}
</script>
</body>
</html>`;
}

// ─── No Workspace Content ─────────────────────────────────────────────────────

export function getNoWorkspaceContent(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>
  body{
    background:var(--vscode-sideBar-background);
    color:var(--vscode-descriptionForeground);
    font-family:var(--vscode-font-family);
    font-size:var(--vscode-font-size);
    display:flex;
    align-items:center;
    justify-content:center;
    height:100vh;
    margin:0;
    text-align:center;
    padding:24px;
    box-sizing:border-box;
  }
  p{line-height:1.6;margin:0}
</style>
</head>
<body>
  <p>No folder open.<br/>Open a git repository to use Gimmit.</p>
</body>
</html>`;
}