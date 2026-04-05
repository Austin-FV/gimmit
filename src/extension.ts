import * as vscode from "vscode";
import { execSync, execFileSync } from "child_process";
import * as path from "path";
import * as fs from "fs";
import {
  AiProvider,
  AiConfig,
  AiGenerateRequest,
  PROVIDER_MODELS,
  getAllModels,
  getDefaultModel,
  generateWithAi,
} from "./ai-service";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChangedFile {
  status: string;
  filepath: string;
  suggestedType: CommitType;
}

type CommitType = "feat" | "fix" | "docs" | "chore" | "refactor" | "style" | "test";

// ─── Detection ────────────────────────────────────────────────────────────────

const TEST_PATTERNS    = [/\.test\./i, /\.spec\./i, /__tests__/i, /test\//i];
const DOC_PATTERNS     = [/readme/i, /\.md$/i, /docs?\//i, /changelog/i, /license/i, /\.txt$/i];
const STYLE_PATTERNS   = [/\.css$/i, /\.scss$/i, /\.less$/i, /\.styled\./i, /theme/i];
const CONFIG_PATTERNS  = [/\.json$/i, /\.yaml$/i, /\.yml$/i, /\.env/i, /config/i, /\.toml$/i, /\.ini$/i, /Dockerfile/i, /\.sh$/i];
const FIX_PATTERNS     = [/bug/i, /fix/i, /patch/i, /hotfix/i, /error/i, /issue/i, /crash/i, /fail/i];

function detectChangeType(filepath: string, status: string): CommitType {
  if (status === "D") return "chore";
  const name = filepath.toLowerCase();
  if (TEST_PATTERNS.some((p) => p.test(name)))   return "test";
  if (DOC_PATTERNS.some((p) => p.test(name)))    return "docs";
  if (STYLE_PATTERNS.some((p) => p.test(name)))  return "style";
  if (CONFIG_PATTERNS.some((p) => p.test(name))) return "chore";
  if (FIX_PATTERNS.some((p) => p.test(name)))    return "fix";
  return "feat";
}

function getChangedFiles(repoRoot: string): ChangedFile[] {
  try {
    console.log("repoRoot:", repoRoot);
    const output = execSync("git status --porcelain -uall", { cwd: repoRoot }).toString();
    console.log("git output:", JSON.stringify(output));
    return output
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const status = line.substring(0, 2).trim();
        const filepath = line.substring(3).trim().replace(/^"(.*)"$/, "$1");
        return { status, filepath, suggestedType: detectChangeType(filepath, status) };
      });
  } catch (e) {
    console.error("getChangedFiles error:", e);
    return [];
  }
}

// ─── Git Diff ────────────────────────────────────────────────────────────────

function getGitDiff(repoRoot: string, filePaths: string[]): string {
  if (!filePaths.length) return "";
  try {
    // Get diff for tracked files (staged + unstaged)
    const tracked = filePaths.filter((f) => {
      try {
        execSync(`git ls-files --error-unmatch "${f}"`, {
          cwd: repoRoot,
          stdio: "pipe",
        });
        return true;
      } catch {
        return false;
      }
    });
    const untracked = filePaths.filter((f) => !tracked.includes(f));

    let diff = "";
    if (tracked.length) {
      try {
        // Staged changes
        const stagedDiff = execSync(
          `git diff --cached -- ${tracked.map((f) => `"${f}"`).join(" ")}`,
          { cwd: repoRoot, maxBuffer: 1024 * 1024 }
        ).toString();
        diff += stagedDiff;
      } catch { /* ignore */ }
      try {
        // Unstaged changes
        const unstagedDiff = execSync(
          `git diff -- ${tracked.map((f) => `"${f}"`).join(" ")}`,
          { cwd: repoRoot, maxBuffer: 1024 * 1024 }
        ).toString();
        diff += unstagedDiff;
      } catch { /* ignore */ }
    }

    // For untracked files, show their content as "new file"
    for (const f of untracked) {
      try {
        const content = fs.readFileSync(path.join(repoRoot, f), "utf-8");
        const truncated = content.slice(0, 2000);
        diff += `\n--- /dev/null\n+++ b/${f}\n@@ -0,0 +1 @@\n${truncated
          .split("\n")
          .map((l) => `+${l}`)
          .join("\n")}\n`;
      } catch { /* ignore */ }
    }

    return diff;
  } catch (e) {
    console.error("getGitDiff error:", e);
    return "";
  }
}

// ─── Webview HTML ─────────────────────────────────────────────────────────────

interface AiState {
  provider: AiProvider | "none";
  modelId: string;
  hasKey: Record<AiProvider, boolean>;
}

function getWebviewContent(files: ChangedFile[], aiState: AiState): string {
  const filesJson = JSON.stringify(files);
  const aiStateJson = JSON.stringify(aiState);
  const modelsJson = JSON.stringify(PROVIDER_MODELS);

  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Git Commit Helper</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

  html,body{height:100%;margin:0}

  body{
    background:var(--vscode-sideBar-background);
    color:var(--vscode-foreground);
    font-family:var(--vscode-font-family);
    font-size:var(--vscode-font-size);
    overflow:hidden;
    display:flex;
    flex-direction:column;
  }

  .header{margin-bottom:14px}
  .header h1{
    font-size:13px;
    font-weight:600;
    color:var(--vscode-foreground);
    margin-bottom:2px;
  }
  .header p{color:var(--vscode-descriptionForeground);font-size:11px}

  .type-bar{
    display:flex;
    align-items:center;
    gap:6px;
    margin-bottom:10px;
    background:var(--vscode-input-background);
    border:1px solid var(--vscode-input-border, transparent);
    border-radius:4px;
    padding:6px 8px;
  }
  .type-bar label{
    font-size:10px;
    color:var(--vscode-descriptionForeground);
    font-weight:600;
    letter-spacing:0.08em;
    text-transform:uppercase;
    white-space:nowrap;
  }
  .type-chips{display:flex;flex-wrap:wrap;gap:3px;flex:1}
  .chip{
    font-size:10px;
    padding:2px 8px;
    border-radius:3px;
    border:1px solid var(--vscode-button-secondaryBorder, transparent);
    cursor:pointer;
    transition:all 0.1s;
    background:transparent;
    color:var(--vscode-descriptionForeground);
    font-family:var(--vscode-font-family);
  }
  .chip:hover{
    background:var(--vscode-toolbar-hoverBackground);
    color:var(--vscode-foreground);
  }
  .chip.active{
    background:var(--vscode-button-background);
    color:var(--vscode-button-foreground);
    border-color:transparent;
  }

  .list-header{
    display:flex;
    align-items:center;
    justify-content:space-between;
    margin-bottom:5px;
  }
  .list-label{
    font-size:10px;
    font-weight:600;
    letter-spacing:0.08em;
    text-transform:uppercase;
    color:var(--vscode-descriptionForeground);
  }
  .quick-links{display:flex;gap:8px}
  .quick-links a{
    font-size:11px;
    color:var(--vscode-textLink-foreground);
    cursor:pointer;
    text-decoration:none;
  }
  .quick-links a:hover{text-decoration:underline}

  .file-list{display:flex;flex-direction:column;gap:2px;margin-bottom:12px}

  .file-row{
    display:flex;
    align-items:center;
    gap:6px;
    border-radius:3px;
    padding:5px 8px;
    cursor:pointer;
    transition:background 0.1s;
    user-select:none;
    border:1px solid transparent;
  }
  .file-row:hover{background:var(--vscode-list-hoverBackground)}
  .file-row.selected{
    background:var(--vscode-list-activeSelectionBackground);
    color:var(--vscode-list-activeSelectionForeground);
  }

  .file-row input[type="checkbox"]{display:none}

  .custom-check{
    width:14px;height:14px;
    border:1px solid var(--vscode-checkbox-border, var(--vscode-foreground));
    border-radius:2px;
    flex-shrink:0;
    display:flex;
    align-items:center;
    justify-content:center;
    background:var(--vscode-checkbox-background, transparent);
    transition:background 0.1s, border-color 0.1s;
  }
  .file-row.selected .custom-check{
    background:var(--vscode-checkbox-selectBackground, var(--vscode-button-background));
    border-color:var(--vscode-checkbox-selectBorder, var(--vscode-button-background));
  }
  .file-row.selected .custom-check::after{
    content:'';
    width:4px;height:7px;
    border:1.5px solid var(--vscode-button-foreground, #fff);
    border-top:none;
    border-left:none;
    transform:rotate(45deg) translateY(-1px);
    display:block;
  }

  .file-status{
    font-size:10px;
    font-weight:700;
    width:14px;
    text-align:center;
    flex-shrink:0;
  }

  .file-info{flex:1;min-width:0}
  .file-name{
    font-size:12px;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
  }
  .file-row.selected .file-name{color:var(--vscode-list-activeSelectionForeground)}
  .file-dir{
    font-size:10px;
    color:var(--vscode-descriptionForeground);
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
    margin-top:1px;
  }
  .file-row.selected .file-dir{opacity:0.8}

  .file-hint{
    font-size:10px;
    color:var(--vscode-descriptionForeground);
    flex-shrink:0;
    opacity:0.6;
  }

  .msg-section{margin-bottom:10px}
  .section-label-row{
    display:flex;
    align-items:center;
    justify-content:space-between;
    margin-bottom:4px;
    flex-wrap:wrap;
    gap:4px;
  }
  .section-label-row-right{display:flex;align-items:center;gap:8px}
  .toggle-btn{
    font-size:10px;
    background:transparent;
    border:none;
    color:var(--vscode-textLink-foreground);
    cursor:pointer;
    font-family:var(--vscode-font-family);
    padding:0;
  }
  .toggle-btn:hover{text-decoration:underline}
  .collapsible-header{
    display:flex;
    align-items:center;
    gap:4px;
    cursor:pointer;
    user-select:none;
  }
  .collapsible-header:hover .section-label{color:var(--vscode-foreground)}
  .collapsible-header .section-label{margin-bottom:0}
  .collapsible-arrow{
    font-size:10px;
    color:var(--vscode-descriptionForeground);
  }
  .section-label{
    font-size:10px;
    font-weight:600;
    letter-spacing:0.08em;
    text-transform:uppercase;
    color:var(--vscode-descriptionForeground);
    margin-bottom:4px;
  }
  .msg-wrap{position:relative}
  .msg-edit{
    width:100%;
    background:var(--vscode-input-background);
    border:1px solid var(--vscode-input-border, transparent);
    border-radius:3px;
    color:var(--vscode-input-foreground);
    font-family:var(--vscode-font-family);
    font-size:12px;
    padding:6px 8px;
    padding-right:58px;
    resize:none;
    outline:none;
    line-height:1.5;
  }
  .msg-edit:focus{border-color:var(--vscode-focusBorder)}

  .msg-input-row{
    display:flex;
    align-items:stretch;
    background:var(--vscode-input-background);
    border:1px solid var(--vscode-input-border, transparent);
    border-radius:3px;
    overflow:hidden;
    position:relative;
  }
  .msg-input-row:focus-within{border-color:var(--vscode-focusBorder)}
  .msg-prefix{
    color:var(--vscode-input-foreground);
    opacity:0.55;
    font-family:var(--vscode-font-family);
    font-size:12px;
    padding:6px 0 6px 8px;
    white-space:nowrap;
    flex-shrink:0;
    user-select:none;
    display:flex;
    align-items:center;
    line-height:1.5;
  }
  .msg-desc-input{
    flex:1;
    background:transparent;
    border:none;
    color:var(--vscode-input-foreground);
    font-family:var(--vscode-font-family);
    font-size:12px;
    padding:6px 32px 6px 8px;
    outline:none;
    min-width:0;
    line-height:1.5;
  }

  .char-counter{
    text-align:right;
    font-size:10px;
    color:var(--vscode-descriptionForeground);
    margin-top:3px;
    transition:color 0.1s;
  }
  .char-counter.over{color:var(--vscode-errorForeground);font-weight:600}

  .reset-link{
    font-size:10px;
    background:transparent;
    border:none;
    color:var(--vscode-descriptionForeground);
    cursor:pointer;
    font-family:var(--vscode-font-family);
    padding:0;
    opacity:0.7;
    flex-shrink:0;
  }
  .reset-link:hover{color:var(--vscode-foreground);opacity:1}

  .ai-inline-btn{
    position:absolute;
    right:5px;
    top:50%;
    transform:translateY(-50%);
    background:var(--vscode-input-background);
    border:1px solid var(--vscode-input-border, transparent);
    border-radius:3px;
    color:var(--vscode-descriptionForeground);
    font-size:11px;
    padding:1px 5px;
    cursor:pointer;
    font-family:var(--vscode-font-family);
    transition:all 0.15s;
    display:inline-flex;
    align-items:center;
    gap:2px;
    line-height:1.4;
    z-index:1;
  }
  .ai-inline-btn:hover{
    color:var(--vscode-foreground);
    border-color:var(--vscode-button-background);
  }
  .ai-inline-btn:disabled{opacity:0.35;cursor:default;pointer-events:none}
  .ai-inline-btn .ai-gen-spark{font-size:10px}

  .body-ai-inline{top:6px;transform:none}

  .scope-bar{
    display:flex;
    align-items:center;
    gap:6px;
    margin-bottom:10px;
    background:var(--vscode-input-background);
    border:1px solid var(--vscode-input-border, transparent);
    border-radius:4px;
    padding:5px 8px;
  }
  .scope-label{
    font-size:10px;
    color:var(--vscode-descriptionForeground);
    font-weight:600;
    letter-spacing:0.08em;
    text-transform:uppercase;
    white-space:nowrap;
  }
  .scope-input{
    flex:1;
    min-width:0;
    background:transparent;
    border:none;
    color:var(--vscode-input-foreground);
    font-family:var(--vscode-font-family);
    font-size:11px;
    outline:none;
    overflow:hidden;
    text-overflow:ellipsis;
  }
  .scope-input::placeholder{color:var(--vscode-input-placeholderForeground)}
  .scope-clear{
    background:transparent;
    border:none;
    color:var(--vscode-descriptionForeground);
    cursor:pointer;
    font-size:14px;
    padding:0 2px;
    opacity:0.6;
    line-height:1;
    flex-shrink:0;
  }
  .scope-clear:hover{color:var(--vscode-errorForeground);opacity:1}

  .footer-row{
    display:flex;
    align-items:center;
    gap:4px;
    margin-bottom:4px;
    flex-wrap:wrap;
  }
  .footer-select{
    background:var(--vscode-input-background);
    border:1px solid var(--vscode-input-border, transparent);
    border-radius:3px;
    color:var(--vscode-input-foreground);
    font-family:var(--vscode-font-family);
    font-size:11px;
    padding:4px 6px;
    cursor:pointer;
    outline:none;
    flex-shrink:0;
  }
  .footer-select:focus{border-color:var(--vscode-focusBorder)}
  .footer-token-input{
    background:var(--vscode-input-background);
    border:1px solid var(--vscode-input-border, transparent);
    border-radius:3px;
    color:var(--vscode-input-foreground);
    font-family:var(--vscode-font-family);
    font-size:11px;
    padding:4px 6px;
    outline:none;
    width:90px;
    flex-shrink:1;
    min-width:50px;
  }
  .footer-token-input:focus{border-color:var(--vscode-focusBorder)}
  .footer-value-input{
    background:var(--vscode-input-background);
    border:1px solid var(--vscode-input-border, transparent);
    border-radius:3px;
    color:var(--vscode-input-foreground);
    font-family:var(--vscode-font-family);
    font-size:11px;
    padding:4px 38px 4px 6px;
    outline:none;
    width:100%;
  }
  .footer-value-input:focus{border-color:var(--vscode-focusBorder)}
  .footer-value-wrap{position:relative;flex:1;min-width:0;flex-basis:100px}
  .footer-val-counter{
    position:absolute;
    right:5px;top:50%;
    transform:translateY(-50%);
    font-size:9px;
    color:var(--vscode-descriptionForeground);
    opacity:0.5;
    pointer-events:none;
  }
  .footer-val-counter.over{color:var(--vscode-errorForeground);opacity:1;font-weight:600}

  .body-counter{
    text-align:right;
    font-size:10px;
    color:var(--vscode-descriptionForeground);
    margin-top:3px;
    transition:color 0.1s;
  }
  .body-counter.over{color:var(--vscode-errorForeground);font-weight:600}
  .footer-remove{
    background:transparent;
    border:none;
    color:var(--vscode-descriptionForeground);
    cursor:pointer;
    font-size:14px;
    padding:0 2px;
    line-height:1;
    flex-shrink:0;
    opacity:0.6;
  }
  .footer-remove:hover{color:var(--vscode-errorForeground);opacity:1}
  .add-footer-btn{
    font-size:10px;
    background:transparent;
    border:none;
    color:var(--vscode-textLink-foreground);
    cursor:pointer;
    font-family:var(--vscode-font-family);
    padding:0;
    margin-top:2px;
    display:block;
  }
  .add-footer-btn:hover{text-decoration:underline}

  .cmd-section{
    flex-shrink:0;
    padding:10px 12px;
    background:var(--vscode-sideBar-background);
    border-top:1px solid var(--vscode-input-border, transparent);
  }
  .cmd-box{
    position:relative;
    background:var(--vscode-textCodeBlock-background, var(--vscode-input-background));
    border:1px solid var(--vscode-input-border, transparent);
    border-radius:3px;
    padding:8px 10px;
    font-size:11px;
    font-family:var(--vscode-editor-font-family);
    line-height:2;
    white-space:pre-wrap; /* was pre — this enables wrapping */
    word-break:break-all;
    overflow-x:hidden; /* no more horizontal scroll */
  }
  .cmd-line{display:block}
  .ck{color:var(--vscode-symbolIcon-keywordForeground, #569cd6)}
  .cf{color:var(--vscode-symbolIcon-variableForeground, #9cdcfe)}
  .cs{color:var(--vscode-symbolIcon-stringForeground, #ce9178)}
  .cp{color:var(--vscode-foreground)}

  .copy-btn{
    font-size:11px;
    font-family:var(--vscode-font-family);
    font-weight:600;
    letter-spacing:0.04em;
    background:var(--vscode-button-secondaryBackground, var(--vscode-input-background));
    border:1px solid var(--vscode-button-secondaryBorder, var(--vscode-input-border));
    border-radius:3px;
    color:var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    padding:3px 10px;
    cursor:pointer;
    transition:background 0.1s, color 0.15s, border-color 0.15s;
  }
  .copy-btn:hover{background:var(--vscode-button-secondaryHoverBackground);color:var(--vscode-foreground)}
  .copy-btn.ok{
    color:var(--vscode-terminal-ansiGreen, #4ade80);
    border-color:var(--vscode-terminal-ansiGreen, #4ade80);
  }

  .run-btn{
    font-size:11px;
    font-family:var(--vscode-font-family);
    font-weight:600;
    letter-spacing:0.04em;
    background:var(--vscode-button-background);
    border:1px solid transparent;
    border-radius:3px;
    color:var(--vscode-button-foreground);
    padding:3px 10px;
    cursor:pointer;
    transition:background 0.1s, color 0.15s, border-color 0.15s;
  }
  .run-btn:hover{opacity:0.9}
  .run-btn:disabled{opacity:0.4;cursor:default}
  .run-btn.ok{
    background:var(--vscode-terminal-ansiGreen, #4ade80);
    color:#000;
  }
  .run-btn.fail{
    background:var(--vscode-errorForeground);
    color:#fff;
  }

  .cmd-btns{display:flex;gap:6px;align-items:center}

  .cmd-error{
    font-size:10px;
    color:var(--vscode-errorForeground);
    margin-top:6px;
    word-break:break-word;
    line-height:1.4;
  }

  .undo-bar{
    display:flex;
    align-items:center;
    gap:4px;
    margin-top:6px;
    font-size:10px;
    color:var(--vscode-descriptionForeground);
  }
  .undo-check{color:var(--vscode-terminal-ansiGreen, #4ade80)}
  .undo-link{
    color:var(--vscode-textLink-foreground);
    cursor:pointer;
    background:none;
    border:none;
    font-family:var(--vscode-font-family);
    font-size:10px;
    padding:0;
  }
  .undo-link:hover{text-decoration:underline}
  .undo-link:disabled{opacity:0.4;cursor:default;text-decoration:none}
  .undo-timer{
    color:var(--vscode-descriptionForeground);
    opacity:0.5;
  }

  .empty{
    display:flex;
    align-items:center;
    justify-content:center;
    height:100%;
    text-align:center;
    padding:24px;
    color:var(--vscode-descriptionForeground);
    font-size:12px;
    line-height:1.6;
    box-sizing:border-box;
  }

  /* ── AI Section ─────────────────────────────────────── */
  .ai-section{
    margin-bottom:10px;
    border:1px solid var(--vscode-input-border, transparent);
    border-radius:4px;
    overflow:hidden;
  }
  .ai-header{
    display:flex;
    align-items:center;
    justify-content:space-between;
    padding:6px 8px;
    background:var(--vscode-input-background);
    cursor:pointer;
    user-select:none;
  }
  .ai-header:hover{background:var(--vscode-list-hoverBackground)}
  .ai-header-left{display:flex;align-items:center;gap:6px}
  .ai-spark{font-size:12px;line-height:1}
  .ai-title{
    font-size:10px;
    font-weight:600;
    letter-spacing:0.08em;
    text-transform:uppercase;
    color:var(--vscode-descriptionForeground);
  }
  .ai-status-dot{
    width:6px;height:6px;
    border-radius:50%;
    flex-shrink:0;
  }
  .ai-status-dot.active{background:#4ade80}
  .ai-status-dot.inactive{background:var(--vscode-descriptionForeground);opacity:0.3}
  .ai-toggle-arrow{
    font-size:10px;
    color:var(--vscode-descriptionForeground);
  }

  .ai-body{padding:8px;display:flex;flex-direction:column;gap:8px}

  .ai-row{display:flex;align-items:center;gap:6px}
  .ai-row-label{
    font-size:10px;
    color:var(--vscode-descriptionForeground);
    font-weight:600;
    white-space:nowrap;
    min-width:52px;
  }
  .ai-select{
    flex:1;
    background:var(--vscode-input-background);
    border:1px solid var(--vscode-input-border, transparent);
    border-radius:3px;
    color:var(--vscode-input-foreground);
    font-family:var(--vscode-font-family);
    font-size:11px;
    padding:4px 6px;
    cursor:pointer;
    outline:none;
    min-width:0;
  }
  .ai-select:focus{border-color:var(--vscode-focusBorder)}

  .ai-key-row{display:flex;align-items:center;gap:6px}
  .ai-key-status{
    font-size:10px;
    flex-shrink:0;
  }
  .ai-key-status.saved{color:#4ade80}
  .ai-key-status.missing{color:var(--vscode-errorForeground);opacity:0.7}
  .ai-key-manage{
    font-size:10px;
    background:transparent;
    border:none;
    color:var(--vscode-textLink-foreground);
    cursor:pointer;
    font-family:var(--vscode-font-family);
    padding:0;
    flex-shrink:0;
  }
  .ai-key-manage:hover{text-decoration:underline}

  @keyframes ai-spin{to{transform:rotate(360deg)}}
  .ai-loading{
    display:inline-block;
    width:10px;height:10px;
    border:1.5px solid var(--vscode-descriptionForeground);
    border-top-color:transparent;
    border-radius:50%;
    animation:ai-spin 0.6s linear infinite;
  }

  .ai-err{
    font-size:10px;
    color:var(--vscode-errorForeground);
    margin-top:2px;
    word-break:break-word;
  }

</style>
</head>
<body>
<div id="scrollable" style="flex:1;overflow-y:auto;padding:12px;overflow-x:hidden;display:flex;flex-direction:column">
<div class="header">
  <h1>gimmit</h1>
  <p>Select files · pick type · copy command</p>
</div>
<div id="root" style="flex:1;display:flex;flex-direction:column"></div>
</div>
<div id="cmd-footer"></div>

<script>
const vscode = acquireVsCodeApi();

const TYPE_META = {
  feat:     '#4ade80',
  fix:      '#f87171',
  docs:     '#60a5fa',
  chore:    '#a78bfa',
  refactor: '#fb923c',
  style:    '#f472b6',
  test:     '#facc15',
  perf:     '#38bdf8',
  build:    '#e879f9',
  ci:       '#f59e0b',
  none:     '#94a3b8',
};
const ALL_TYPES = Object.keys(TYPE_META);

let files = ${filesJson};
let selectedPaths = new Set(files.map(f => f.filepath));
let commitType = inferDominantType(files);
let userEditedMsg = false;
let showBody = false;
let userEditedBody = false;
let showFiles = true;
let commitBody = '';
let breakingChange = false;
let breakingMsg = '';
let footers = []; // [{id, token, customToken, value}]
let customScope = '';
let commitMsg  = buildMsg(files.filter(f => selectedPaths.has(f.filepath)), commitType);

// ── AI state ──
const AI_MODELS = ${modelsJson};
let aiState = ${aiStateJson};
let showAiSettings = false;
let aiGeneratingMsg = false;
let aiGeneratingBody = false;
let aiMsgError = '';
let aiBodyError = '';

function isAiReady() {
  return aiState.provider !== 'none' && aiState.hasKey[aiState.provider];
}

function inferDominantType(fs) {
  if (!fs.length) return 'feat';
  const c = {};
  fs.forEach(f => { c[f.suggestedType] = (c[f.suggestedType]||0)+1; });
  return Object.entries(c).sort((a,b)=>b[1]-a[1])[0][0];
}

function buildMsg(selected, type) {
  if (!selected.length) return '';

  // None mode — no conventional commits prefix
  if (type === 'none') {
    const names = selected.map(f => f.filepath.split('/').pop().replace(/\.[^.]+$/, ''));
    if (names.length === 1) return 'update ' + names[0];
    if (names.length <= 3)  return 'update ' + names.join(', ');
    return 'update ' + names.slice(0, 2).join(', ') + ' and ' + (names.length - 2) + ' more files';
  }

  const scope = customScope;
  const names = selected.map(f => f.filepath.split('/').pop().replace(/\.[^.]+$/, ''));
  let desc;
  if (names.length === 1) {
    const n = names[0];
    if (type==='fix')           desc='fix issue in '+n;
    else if (type==='docs')     desc='update '+n+' documentation';
    else if (type==='test')     desc='add tests for '+n;
    else if (type==='chore')    desc='update '+n+' config';
    else if (type==='style')    desc='update '+n+' styles';
    else if (type==='refactor') desc='refactor '+n;
    else if (type==='perf')     desc='improve performance of '+n;
    else if (type==='build')    desc='update '+n+' build config';
    else if (type==='ci')       desc='update '+n+' CI config';
    else                        desc='add '+n;
  } else {
    if (type==='fix')           desc='fix issues across '+names.length+' files';
    else if (type==='docs')     desc='update documentation';
    else if (type==='test')     desc='add/update tests';
    else if (type==='chore')    desc='update config files';
    else if (type==='style')    desc='update styles';
    else if (type==='refactor') desc='refactor '+names.length+' files';
    else if (type==='perf')     desc='improve performance across '+names.length+' files';
    else if (type==='build')    desc='update build configuration';
    else if (type==='ci')       desc='update CI configuration';
    else                        desc='update '+names.length+' files';
  }
  const prefix = type + (scope ? '('+scope+')' : '');
  return (breakingChange ? prefix + '!' : prefix) + ': ' + desc;
}

function buildBody(selected) {
  if (!selected.length) return '';
  const statusLabel = { M:'Modified', A:'Added', D:'Deleted', R:'Renamed', '?':'Untracked' };
  return selected.map(f => {
    const st = statusLabel[f.status] || 'Changed';
    return '- ' + f.filepath + ' [' + st + ']';
  }).join(String.fromCharCode(10));
}

function buildCmd(selected, msg, body, breaking, brkMsg, footers) {
  if (!selected.length) return '';
  const paths = selected.map(f => f.filepath).join(' ');
  const safe = msg.replace(/"/g, String.fromCharCode(92) + '"');
  const NL = String.fromCharCode(10);
  let cmd = 'git add ' + paths + NL + 'git commit -m "' + safe + '"';
  if (body && body.trim()) {
    const safeBody = body.replace(/"/g, String.fromCharCode(92) + '"');
    cmd += ' -m "' + safeBody + '"';
  }
  // Collect all footer lines into one -m block (spec-compliant)
  const footerLines = [];
  if (breaking && brkMsg.trim()) {
    footerLines.push('BREAKING CHANGE: ' + brkMsg.replace(/"/g, String.fromCharCode(92) + '"'));
  }
  footers.forEach(f => {
    const token = f.token === 'Custom' ? f.customToken : f.token;
    if (token && token.trim() && f.value.trim()) {
      footerLines.push(token + ': ' + f.value.replace(/"/g, String.fromCharCode(92) + '"'));
    }
  });
  if (footerLines.length) {
    cmd += ' -m "' + footerLines.join(NL) + '"';
  }
  return cmd;
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function statusColor(s) {
  if (s==='M') return '#fb923c';
  if (s==='A'||s==='?') return '#4ade80';
  if (s==='D') return '#f87171';
  if (s==='R') return '#60a5fa';
  return '#94a3b8';
}

function highlightCmd(cmd) {
  return cmd.split(String.fromCharCode(10)).map(line => {
    if (!line.trim()) return '<span class="cmd-line"> </span>';
    const toks = line.split(' ');
    const html = toks.map((t,i) => {
      if (i===0) return '<span class="ck">'+esc(t)+'</span>';
      if (t.startsWith('-')) return '<span class="cf">'+esc(t)+'</span>';
      if (t.startsWith('"')) return '<span class="cs">'+esc(t)+'</span>';
      return '<span class="cp">'+esc(t)+'</span>';
    }).join(' ');
    return '<span class="cmd-line">'+html+'</span>';
  }).join('');
}

function render() {
  const root = document.getElementById('root');
  const selected = files.filter(f => selectedPaths.has(f.filepath));

  if (!files.length) {
    root.innerHTML = '<div class="empty"><div>No changed files.<br>Edits appear here automatically.<br><a style="color:var(--vscode-textLink-foreground);cursor:pointer;font-size:11px;margin-top:6px;display:inline-block" onclick="refreshFiles()">↻ refresh</a></div></div>';
    const footer = document.getElementById('cmd-footer');
    if (footer) {
      if (undoActive) {
        footer.innerHTML =
          '<div class="cmd-section">'+
            '<div id="undoContainer">'+
              '<div class="undo-bar">'+
                '<span class="undo-check">✓</span>'+
                '<span>Committed</span>'+
                '<button class="undo-link" onclick="undoCommit()">undo</button>'+
                '<span class="undo-timer" id="undoTimerText">'+undoSeconds+'s</span>'+
              '</div>'+
            '</div>'+
          '</div>';
      } else {
        footer.innerHTML = '';
      }
    }
    return;
  }

  const chips = ALL_TYPES.map(t => {
    const color = TYPE_META[t];
    const active = t === commitType ? 'active' : '';
    const style = t === commitType ? 'background:'+color+';color:#000' : '';
    return '<button class="chip '+active+'" style="'+style+'" data-type="'+t+'" onclick="setType(this.dataset.type)">'+t+'</button>';
  }).join('');

  const rows = files.map(f => {
    const sel = selectedPaths.has(f.filepath);
    const parts = f.filepath.split('/');
    const fname = parts.pop();
    const fdir  = parts.join('/');
    const hint  = f.suggestedType !== commitType ? f.suggestedType : '';
    const fp = esc(f.filepath);
  return '<div class="file-row '+(sel?'selected':'')+'" data-path="'+fp+'" onclick="toggleFile(this.dataset.path)">'+
      '<input type="checkbox" '+(sel?'checked':'')+' data-path="'+fp+'" onclick="event.stopPropagation();toggleFile(this.dataset.path)"/>'+
      '<div class="custom-check"></div>'+
      '<span class="file-status" style="color:'+statusColor(f.status)+'">'+esc(f.status||'?')+'</span>'+
      '<div class="file-info">'+
        '<div class="file-name" title="'+fp+'">'+esc(fname)+'</div>'+
        (fdir ? '<div class="file-dir">'+esc(fdir)+'</div>' : '')+
      '</div>'+
      (hint ? '<span class="file-hint">'+esc(hint)+'</span>' : '')+
    '</div>';
  }).join('');

  const cmd = buildCmd(selected, commitMsg, showBody ? commitBody : '', breakingChange, breakingMsg, footers);
  const cmdHtml = cmd ? highlightCmd(cmd) : '<span class="cp" style="opacity:0.4">select files above</span>';

  const FOOTER_TOKENS = ['Refs', 'Closes', 'Fixes', 'Co-authored-by', 'Reviewed-by', 'See-also', 'Custom'];

  const aiBodyInline = isAiReady()
    ? '<button class="ai-inline-btn body-ai-inline" id="aiBodyBtn" title="Generate with AI" onclick="event.stopPropagation();aiGenerateBody()"'+(aiGeneratingBody?' disabled':'')+'>'+
        (aiGeneratingBody ? '<span class="ai-loading"></span>' : '<span class="ai-gen-spark">✦</span>')+
      '</button>'
    : '';

  const bodySection =
    '<div class="msg-section">'+
      '<div class="section-label-row">'+
        '<div class="collapsible-header" onclick="toggleBody()">'+
          '<span class="collapsible-arrow">'+(showBody?'▾':'▸')+'</span>'+
          '<span class="section-label">Commit Body</span>'+
        '</div>'+
        (showBody ?
          '<div class="section-label-row-right" id="bodyLabelRight">'+
            (userEditedBody ? '<button class="reset-link" id="bodyResetBtn" onclick="regenBody()">↺ reset</button>' : '')+
          '</div>'
        : '')+
      '</div>'+
      (showBody ? (()=>{
        const longest = commitBody.split(String.fromCharCode(10)).reduce((max,l)=>Math.max(max,l.length),0);
        return '<div class="msg-wrap">'+
          '<textarea class="msg-edit" rows="4" id="bodyEdit" oninput="onBodyEdit(this.value)">'+esc(commitBody)+'</textarea>'+
          aiBodyInline+
        '</div>'+
        '<div class="body-counter '+(longest>72?'over':'')+'" id="bodyCounter">longest line: '+longest+' / 72</div>'+
        (aiBodyError ? '<div class="ai-err" id="aiBodyErr">'+esc(aiBodyError)+'</div>' : '');
      })() : '')+
    '</div>';

  const MAX_FOOTER_VAL = 100;
  const footerRows = footers.map((f, i) => {
    const tokenOpts = FOOTER_TOKENS.map(t =>
      '<option value="'+t+'"'+(f.token===t?' selected':'')+'>'+t+'</option>'
    ).join('');
    return '<div class="footer-row">'+
      '<select class="footer-select" data-idx="'+i+'" onchange="updateFooterToken(+this.dataset.idx,this.value)">'+tokenOpts+'</select>'+
      (f.token === 'Custom' ?
        '<input class="footer-token-input" placeholder="token" value="'+esc(f.customToken)+'" data-idx="'+i+'" oninput="updateFooterCustomToken(+this.dataset.idx,this.value)"/>'
      : '')+
      '<div class="footer-value-wrap">'+
        '<input class="footer-value-input" placeholder="value" maxlength="'+MAX_FOOTER_VAL+'" value="'+esc(f.value)+'" data-idx="'+i+'" oninput="updateFooterValue(+this.dataset.idx,this.value)"/>'+
        '<span class="footer-val-counter '+(f.value.length>90?'over':'')+'" id="fvc'+i+'">'+f.value.length+'/'+MAX_FOOTER_VAL+'</span>'+
      '</div>'+
      '<button class="footer-remove" data-idx="'+i+'" onclick="removeFooter(+this.dataset.idx)" title="Remove">×</button>'+
    '</div>';
  }).join('');

  const breakingSection =
    '<div class="msg-section">'+
      '<div class="section-label-row">'+
        '<span class="section-label" style="color:var(--vscode-errorForeground)">⚠ Breaking Change</span>'+
        '<button class="toggle-btn" onclick="toggleBreaking()">'+(breakingChange ? '▾ remove' : '▸ add')+'</button>'+
      '</div>'+
      (breakingChange ?
        '<div class="msg-wrap">'+
          '<textarea class="msg-edit" rows="2" id="breakingEdit" placeholder="describe what breaks and how to migrate..." oninput="onBreakingEdit(this.value)">'+esc(breakingMsg)+'</textarea>'+
        '</div>'
      : '')+
    '</div>';

  const MAX_FOOTERS = 8;
  const footerSection =
  '<div class="msg-section">'+
    '<div class="section-label-row">'+
      '<span class="section-label">Footers</span>'+
      '<div style="display:flex;gap:8px;align-items:center">'+
        (footers.length ?
          '<button class="toggle-btn" style="color:var(--vscode-descriptionForeground)" onclick="clearFooters()">clear all</button>'
        : '')+
        (footers.length < MAX_FOOTERS ?
          '<button class="toggle-btn" onclick="addFooter()">▸ add footer</button>'
        :
          '<span style="font-size:10px;color:var(--vscode-descriptionForeground);opacity:0.6">max '+MAX_FOOTERS+'</span>'
        )+
      '</div>'+
    '</div>'+
    footerRows+
  '</div>';

  // ── AI settings panel ──
  const providerOpts = ['none','claude','openai','gemini'].map(p =>
    '<option value="'+p+'"'+(aiState.provider===p?' selected':'')+'>'+
      (p==='none' ? 'Disabled' : p.charAt(0).toUpperCase()+p.slice(1))+
    '</option>'
  ).join('');

  const modelOpts = aiState.provider !== 'none'
    ? (AI_MODELS[aiState.provider]||[]).map(m =>
        '<option value="'+m.id+'"'+(aiState.modelId===m.id?' selected':'')+'>'+esc(m.label)+'</option>'
      ).join('')
    : '';

  const hasCurrentKey = aiState.provider !== 'none' && aiState.hasKey[aiState.provider];

  const aiSection =
    '<div class="ai-section">'+
      '<div class="ai-header" onclick="toggleAiSettings()">'+
        '<div class="ai-header-left">'+
          '<span class="ai-spark">✦</span>'+
          '<span class="ai-title">AI Assist</span>'+
          '<span class="ai-status-dot '+(isAiReady()?'active':'inactive')+'"></span>'+
        '</div>'+
        '<span class="ai-toggle-arrow">'+(showAiSettings?'▾':'▸')+'</span>'+
      '</div>'+
      (showAiSettings ?
        '<div class="ai-body">'+
          '<div class="ai-row">'+
            '<span class="ai-row-label">Provider</span>'+
            '<select class="ai-select" onchange="onAiProviderChange(this.value)">'+providerOpts+'</select>'+
          '</div>'+
          (aiState.provider !== 'none' ?
            '<div class="ai-row">'+
              '<span class="ai-row-label">Model</span>'+
              '<select class="ai-select" onchange="onAiModelChange(this.value)">'+modelOpts+'</select>'+
            '</div>'+
            '<div class="ai-key-row">'+
              '<span class="ai-row-label">API Key</span>'+
              (hasCurrentKey ?
                '<span class="ai-key-status saved">● saved</span>'
              :
                '<span class="ai-key-status missing">● not set</span>'
              )+
              '<button class="ai-key-manage" onclick="manageAiKey()">manage</button>'+
            '</div>'
          : '')+
        '</div>'
      : '')+
    '</div>';

  // ── AI inline button for commit message ──
  const aiMsgInline = isAiReady()
    ? '<button class="ai-inline-btn" id="aiMsgBtn" title="Generate with AI" onclick="event.stopPropagation();aiGenerateMsg()"'+(aiGeneratingMsg?' disabled':'')+'>'+
        (aiGeneratingMsg ? '<span class="ai-loading"></span>' : '<span class="ai-gen-spark">✦</span>')+
      '</button>'
    : '';

  root.innerHTML =
    aiSection+
    '<div class="type-bar">'+
      '<label>TYPE</label>'+
      '<div class="type-chips">'+chips+'</div>'+
    '</div>'+
    '<div class="scope-bar">'+
      '<span class="scope-label">SCOPE</span>'+
      '<input class="scope-input" type="text" placeholder="specify scope (optional)" maxlength="20"'+
        'value="'+esc(customScope)+'" oninput="onScopeEdit(this.value)"/>'+
      (customScope ? '<button class="scope-clear" onclick="clearScope()" title="Clear scope">×</button>' : '')+
    '</div>'+
    '<div class="list-header"'+(showFiles?'':' style="margin-bottom:12px"')+'>'+
      '<div style="display:flex;align-items:center;gap:4px;cursor:pointer" onclick="toggleFiles()">'+
        '<span style="font-size:10px;color:var(--vscode-descriptionForeground)">'+(showFiles?'▾':'▸')+'</span>'+
        '<span class="list-label">Changed Files ('+files.length+')</span>'+
        (!showFiles ? '<span style="font-size:10px;color:var(--vscode-descriptionForeground);opacity:0.7">&nbsp;'+selected.length+'/'+files.length+' selected</span>' : '')+
      '</div>'+
      (showFiles ?
        '<div class="quick-links">'+
          '<a onclick="event.stopPropagation();selectAll()">all</a>'+
          '<a onclick="event.stopPropagation();selectNone()">none</a>'+
          '<a onclick="event.stopPropagation();refreshFiles()" title="Refresh file list">↻</a>'+
        '</div>'
      : '')+
    '</div>'+
    (showFiles ? '<div class="file-list">'+rows+'</div>' : '')+
    '<div class="msg-section">'+
      '<div class="section-label-row" id="msgLabelRow">'+
        '<span class="section-label">Commit Message</span>'+
        (userEditedMsg ? '<button class="reset-link" id="msgResetBtn" onclick="regenMsg()">↺ reset</button>' : '')+
      '</div>'+
      (commitType !== 'none' ? (()=>{
        const colonIdx = commitMsg.indexOf(': ');
        const msgPrefix = colonIdx >= 0 ? commitMsg.slice(0, colonIdx + 1) : commitMsg;
        const msgDesc   = colonIdx >= 0 ? commitMsg.slice(colonIdx + 2) : '';
        return '<div class="msg-input-row" id="msgInputRow">'+
          '<span class="msg-prefix" id="msgPrefix">'+esc(msgPrefix)+'</span>'+
          '<input class="msg-desc-input" id="msgDesc" type="text" value="'+esc(msgDesc)+'" oninput="onDescEdit(this.value)"/>'+
          aiMsgInline+
        '</div>';
      })() :
        '<div class="msg-input-row" id="msgInputRow">'+
          '<input class="msg-desc-input" id="msgEdit" type="text" value="'+esc(commitMsg)+'" oninput="onMsgEdit(this.value)"/>'+
          aiMsgInline+
        '</div>'
      )+
      '<div class="char-counter '+(commitMsg.length > 72 ? 'over' : '')+'" id="charCounter">'+
        commitMsg.length+' / 72'+
      '</div>'+
      (aiMsgError ? '<div class="ai-err" id="aiMsgErr">'+esc(aiMsgError)+'</div>' : '')+
    '</div>'+
    bodySection+
    footerSection+
    breakingSection;

  document.getElementById('cmd-footer').innerHTML =
    '<div class="cmd-section">'+
      '<div class="section-label-row">'+
        '<span class="section-label">Git Command</span>'+
        '<div class="cmd-btns">'+
          '<button class="copy-btn" id="copyBtn" onclick="copyCmd()">Copy</button>'+
          '<button class="run-btn" id="runBtn" onclick="runCmd()"'+(cmd?'':' disabled')+'>Run</button>'+
        '</div>'+
      '</div>'+
      '<div class="cmd-box" id="cmdBox">'+
        cmdHtml+
      '</div>'+
      '<div id="cmdError"></div>'+
      '<div id="undoContainer">'+
        (undoActive ?
          '<div class="undo-bar">'+
            '<span class="undo-check">✓</span>'+
            '<span>Committed</span>'+
            '<button class="undo-link" onclick="undoCommit()">undo</button>'+
            '<span class="undo-timer" id="undoTimerText">'+undoSeconds+'s</span>'+
          '</div>'
        : '')+
      '</div>'+
    '</div>';
}

function setType(t) {
  const prevType = commitType;
  commitType = t;

  if (t === 'none') {
    if (userEditedMsg) {
      // Strip the conventional prefix — keep only the description
      const colonIdx = commitMsg.indexOf(': ');
      if (colonIdx >= 0) commitMsg = commitMsg.slice(colonIdx + 2);
    } else {
      // No custom edit — regenerate as plain message
      commitMsg = buildMsg(files.filter(f => selectedPaths.has(f.filepath)), commitType);
    }
  } else if (prevType === 'none' && userEditedMsg) {
    // Carry the none message as the description under the new prefix
    const newMsg = buildMsg(files.filter(f => selectedPaths.has(f.filepath)), commitType);
    const newColonIdx = newMsg.indexOf(': ');
    const newPrefix = newColonIdx >= 0 ? newMsg.slice(0, newColonIdx + 2) : '';
    commitMsg = newPrefix + commitMsg;
  } else if (prevType === 'none' && !userEditedMsg) {
    // No custom edit — regenerate fully
    commitMsg = buildMsg(files.filter(f => selectedPaths.has(f.filepath)), commitType);
  } else {
    // Switching between conventional types — keep user's description, update prefix only
    const colonIdx = commitMsg.indexOf(': ');
    const currentDesc = userEditedMsg && colonIdx >= 0 ? commitMsg.slice(colonIdx + 2) : null;
    commitMsg = buildMsg(files.filter(f => selectedPaths.has(f.filepath)), commitType);
    if (currentDesc !== null) {
      const newColonIdx = commitMsg.indexOf(': ');
      const newPrefix = newColonIdx >= 0 ? commitMsg.slice(0, newColonIdx + 2) : '';
      commitMsg = newPrefix + currentDesc;
    }
  }

  if (showBody && !userEditedBody) {
    commitBody = buildBody(files.filter(f => selectedPaths.has(f.filepath)));
  }
  render();
}

function toggleFile(fp) {
  if (selectedPaths.has(fp)) selectedPaths.delete(fp);
  else selectedPaths.add(fp);
  if (commitType !== 'none') {
    const colonIdx = commitMsg.indexOf(': ');
    const currentDesc = userEditedMsg && colonIdx >= 0 ? commitMsg.slice(colonIdx + 2) : null;
    commitMsg = buildMsg(files.filter(f => selectedPaths.has(f.filepath)), commitType);
    if (currentDesc !== null) {
      const newColonIdx = commitMsg.indexOf(': ');
      const newPrefix = newColonIdx >= 0 ? commitMsg.slice(0, newColonIdx + 2) : '';
      commitMsg = newPrefix + currentDesc;
    }
  } else if (!userEditedMsg) {
    commitMsg = buildMsg(files.filter(f => selectedPaths.has(f.filepath)), commitType);
  }
  if (showBody && !userEditedBody) commitBody = buildBody(files.filter(f => selectedPaths.has(f.filepath)));
  render();
}

function selectAll() {
  selectedPaths = new Set(files.map(f=>f.filepath));
  if (showBody && !userEditedBody) commitBody = buildBody(files.filter(f => selectedPaths.has(f.filepath)));
  regenMsg();
}
function selectNone() {
  selectedPaths = new Set();
  commitMsg='';
  commitBody='';
  customScope='';
  userEditedMsg = false;
  userEditedBody = false;
  render();
}

function refreshFiles() {
  vscode.postMessage({ command: 'refresh' });
}

function regenMsg() {
  userEditedMsg = false;
  aiMsgError = '';
  commitMsg = buildMsg(files.filter(f => selectedPaths.has(f.filepath)), commitType);
  render();
}

function onDescEdit(val) {
  const wasEdited = userEditedMsg;
  userEditedMsg = true;
  aiMsgError = '';
  const errEl = document.getElementById('aiMsgErr');
  if (errEl) errEl.remove();
  if (!wasEdited) {
    const row = document.getElementById('msgLabelRow');
    if (row && !document.getElementById('msgResetBtn')) {
      const btn = document.createElement('button');
      btn.className = 'reset-link';
      btn.id = 'msgResetBtn';
      btn.onclick = function(){ regenMsg(); };
      btn.textContent = '↺ reset';
      row.appendChild(btn);
    }
  }
  const colonIdx = commitMsg.indexOf(': ');
  const prefix = colonIdx >= 0 ? commitMsg.slice(0, colonIdx + 2) : '';
  commitMsg = prefix + val;
  const counter = document.getElementById('charCounter');
  if (counter) {
    counter.textContent = commitMsg.length + ' / 72';
    counter.className = 'char-counter' + (commitMsg.length > 72 ? ' over' : '');
  }
  refreshCmd();
}

function onMsgEdit(val) {
  if (commitType !== 'none') return;
  const wasEdited = userEditedMsg;
  userEditedMsg = true;
  aiMsgError = '';
  const errEl = document.getElementById('aiMsgErr');
  if (errEl) errEl.remove();
  if (!wasEdited) {
    const row = document.getElementById('msgLabelRow');
    if (row && !document.getElementById('msgResetBtn')) {
      const btn = document.createElement('button');
      btn.className = 'reset-link';
      btn.id = 'msgResetBtn';
      btn.onclick = function(){ regenMsg(); };
      btn.textContent = '↺ reset';
      row.appendChild(btn);
    }
  }
  commitMsg = val;
  const counter = document.getElementById('charCounter');
  if (counter) {
    counter.textContent = val.length + ' / 72';
    counter.className = 'char-counter' + (val.length > 72 ? ' over' : '');
  }
  const sel = files.filter(f => selectedPaths.has(f.filepath));
  const cmd = buildCmd(sel, val, showBody ? commitBody : '', breakingChange, breakingMsg, footers);
  const box = document.getElementById('cmdBox');
  if (box) {
    box.innerHTML = (cmd ? highlightCmd(cmd) : '<span class="cp" style="opacity:0.4">select files above</span>');
  }
}

function copyCmd() {
  const sel = files.filter(f => selectedPaths.has(f.filepath));
  const cmd = buildCmd(sel, commitMsg, showBody ? commitBody : '', breakingChange, breakingMsg, footers);
  if (!cmd) return;
  navigator.clipboard.writeText(cmd).then(() => {
    const btn = document.getElementById('copyBtn');
    if (btn) {
      btn.textContent='Copied!'; btn.classList.add('ok');
      setTimeout(()=>{ btn.textContent='Copy'; btn.classList.remove('ok'); }, 1800);
    }
  });
}

function runCmd() {
  const sel = files.filter(f => selectedPaths.has(f.filepath));
  const cmd = buildCmd(sel, commitMsg, showBody ? commitBody : '', breakingChange, breakingMsg, footers);
  if (!cmd) return;

  const btn = document.getElementById('runBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Running…'; }
  const errBox = document.getElementById('cmdError');
  if (errBox) errBox.innerHTML = '';
  clearUndo();

  vscode.postMessage({
    command: 'runGitCommand',
    filePaths: sel.map(f => f.filepath),
    commitMsg: commitMsg,
    commitBody: showBody ? commitBody : '',
    breakingChange: breakingChange,
    breakingMsg: breakingMsg,
    footers: footers,
  });
}

// ── Undo ──
let undoTimer = null;
let undoCountdown = null;
let undoSeconds = 15;
let undoActive = false;

function renderUndoBar() {
  const container = document.getElementById('undoContainer');
  if (!container || !undoActive) return;
  container.innerHTML =
    '<div class="undo-bar">'+
      '<span class="undo-check">✓</span>'+
      '<span>Committed</span>'+
      '<button class="undo-link" onclick="undoCommit()">undo</button>'+
      '<span class="undo-timer" id="undoTimerText">'+undoSeconds+'s</span>'+
    '</div>';
}

function showUndo() {
  clearUndo();
  undoSeconds = 15;
  undoActive = true;

  renderUndoBar();
  undoCountdown = setInterval(function(){
    undoSeconds--;
    if (undoSeconds <= 0) {
      clearUndo();
    } else {
      const timer = document.getElementById('undoTimerText');
      if (timer) timer.textContent = undoSeconds+'s';
    }
  }, 1000);

  undoTimer = setTimeout(function(){ clearUndo(); }, 15000);
}

function clearUndo() {
  undoActive = false;
  if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; }
  if (undoCountdown) { clearInterval(undoCountdown); undoCountdown = null; }
  const container = document.getElementById('undoContainer');
  if (container) container.innerHTML = '';
}

function undoCommit() {
  const container = document.getElementById('undoContainer');
  const link = container ? container.querySelector('.undo-link') : null;
  if (link) { link.disabled = true; link.textContent = 'undoing…'; }
  vscode.postMessage({ command: 'undoCommit' });
}

function toggleFiles() {
  showFiles = !showFiles;
  render();
}

function toggleBody() {
  showBody = !showBody;
  if (showBody && !commitBody) {
    commitBody = buildBody(files.filter(f => selectedPaths.has(f.filepath)));
    userEditedBody = false;
  }
  if (!showBody) {
    commitBody = '';
    userEditedBody = false;
  }
  render();
}

function regenBody() {
  userEditedBody = false;
  aiBodyError = '';
  commitBody = buildBody(files.filter(f => selectedPaths.has(f.filepath)));
  render();
}

function onBodyEdit(val) {
  const wasEdited = userEditedBody;
  userEditedBody = true;
  aiBodyError = '';
  const errEl = document.getElementById('aiBodyErr');
  if (errEl) errEl.remove();
  if (!wasEdited) {
    const row = document.getElementById('bodyLabelRight');
    if (row && !document.getElementById('bodyResetBtn')) {
      const btn = document.createElement('button');
      btn.className = 'reset-link';
      btn.id = 'bodyResetBtn';
      btn.onclick = function(){ regenBody(); };
      btn.textContent = '↺ reset';
      row.appendChild(btn);
    }
  }
  commitBody = val;
  const counter = document.getElementById('bodyCounter');
  if (counter) {
    const longest = val.split(String.fromCharCode(10)).reduce((max,l)=>Math.max(max,l.length),0);
    counter.textContent = 'longest line: ' + longest + ' / 72';
    counter.className = 'body-counter' + (longest > 72 ? ' over' : '');
  }
  const sel = files.filter(f => selectedPaths.has(f.filepath));
  const cmd = buildCmd(sel, commitMsg, val, breakingChange, breakingMsg, footers);
  const box = document.getElementById('cmdBox');
  if (box) {
    box.innerHTML = (cmd ? highlightCmd(cmd) : '<span class="cp" style="opacity:0.4">select files above</span>');
  }
}

function toggleBreaking() {
  breakingChange = !breakingChange;
  if (!breakingChange) breakingMsg = '';
  if (!userEditedMsg) {
    commitMsg = buildMsg(files.filter(f => selectedPaths.has(f.filepath)), commitType);
  }
  render();
}

function onBreakingEdit(val) {
  breakingMsg = val;
  const sel = files.filter(f => selectedPaths.has(f.filepath));
  const cmd = buildCmd(sel, commitMsg, showBody ? commitBody : '', true, val, footers);
  const box = document.getElementById('cmdBox');
  if (box) {
    box.innerHTML = (cmd ? highlightCmd(cmd) : '<span class="cp" style="opacity:0.4">select files above</span>');
  }
}

let _footerId = 0;
function addFooter() {
  footers.push({ id: _footerId++, token: 'Refs', customToken: '', value: '' });
  render();
}

function removeFooter(idx) {
  footers.splice(idx, 1);
  render();
}

function clearFooters() {
  footers = [];
  render();
}

function updateFooterToken(idx, token) {
  footers[idx].token = token;
  render();
}

function updateFooterCustomToken(idx, val) {
  footers[idx].customToken = val;
  refreshCmd();
}

function updateFooterValue(idx, val) {
  footers[idx].value = val;
  const counter = document.getElementById('fvc'+idx);
  if (counter) {
    counter.textContent = val.length+'/100';
    counter.className = 'footer-val-counter'+(val.length>90?' over':'');
  }
  refreshCmd();
}

function onScopeEdit(val) {
  customScope = val;
  if (commitType !== 'none') {
    // Keep user's description if they edited it, only rebuild prefix
    const colonIdx = commitMsg.indexOf(': ');
    const currentDesc = userEditedMsg && colonIdx >= 0 ? commitMsg.slice(colonIdx + 2) : null;
    commitMsg = buildMsg(files.filter(f => selectedPaths.has(f.filepath)), commitType);
    if (currentDesc !== null) {
      const newColonIdx = commitMsg.indexOf(': ');
      const newPrefix = newColonIdx >= 0 ? commitMsg.slice(0, newColonIdx + 2) : '';
      commitMsg = newPrefix + currentDesc;
    }
    // Update prefix span without losing focus on desc input
    const prefixEl = document.getElementById('msgPrefix');
    if (prefixEl) {
      const ci = commitMsg.indexOf(': ');
      prefixEl.textContent = ci >= 0 ? commitMsg.slice(0, ci + 1) : commitMsg;
    }
    const counter = document.getElementById('charCounter');
    if (counter) {
      counter.textContent = commitMsg.length + ' / 72';
      counter.className = 'char-counter' + (commitMsg.length > 72 ? ' over' : '');
    }
  } else {
    if (!userEditedMsg) {
      commitMsg = buildMsg(files.filter(f => selectedPaths.has(f.filepath)), commitType);
      const msgEl = document.getElementById('msgEdit');
      if (msgEl) msgEl.value = commitMsg;
      const counter = document.getElementById('charCounter');
      if (counter) {
        counter.textContent = commitMsg.length + ' / 72';
        counter.className = 'char-counter' + (commitMsg.length > 72 ? ' over' : '');
      }
    }
  }
  refreshCmd();
}

function clearScope() {
  customScope = '';
  if (!userEditedMsg) {
    commitMsg = buildMsg(files.filter(f => selectedPaths.has(f.filepath)), commitType);
  }
  render();
}

function refreshCmd() {
  const sel = files.filter(f => selectedPaths.has(f.filepath));
  const cmd = buildCmd(sel, commitMsg, showBody ? commitBody : '', breakingChange, breakingMsg, footers);
  const box = document.getElementById('cmdBox');
  if (box) {
    box.innerHTML = (cmd ? highlightCmd(cmd) : '<span class="cp" style="opacity:0.4">select files above</span>');
  }
}

// ── AI Functions ──

function toggleAiSettings() {
  showAiSettings = !showAiSettings;
  render();
}

function onAiProviderChange(provider) {
  aiMsgError = '';
  aiBodyError = '';
  vscode.postMessage({ command: 'setAiProvider', provider });
}

function onAiModelChange(modelId) {
  aiMsgError = '';
  aiBodyError = '';
  vscode.postMessage({ command: 'setAiModel', modelId });
}

function manageAiKey() {
  vscode.postMessage({ command: 'manageApiKey', provider: aiState.provider });
}

function aiGenerateMsg() {
  if (aiGeneratingMsg || !isAiReady()) return;
  aiGeneratingMsg = true;
  aiMsgError = '';
  render();
  const sel = files.filter(f => selectedPaths.has(f.filepath));
  vscode.postMessage({
    command: 'aiGenerate',
    mode: 'message',
    filePaths: sel.map(f => f.filepath),
    commitType: commitType,
    scope: customScope,
  });
}

function aiGenerateBody() {
  if (aiGeneratingBody || !isAiReady()) return;
  aiGeneratingBody = true;
  aiBodyError = '';
  render();
  const sel = files.filter(f => selectedPaths.has(f.filepath));
  vscode.postMessage({
    command: 'aiGenerate',
    mode: 'body',
    filePaths: sel.map(f => f.filepath),
    commitType: commitType,
    scope: customScope,
  });
}

// Handle messages from extension
window.addEventListener('message', e => {
  const data = e.data;
  if (data.command === 'updateFiles') {
    const newPaths = new Set(data.files.map(f => f.filepath));
    selectedPaths = new Set([...selectedPaths].filter(p => newPaths.has(p)));
    data.files.forEach(f => {
      if (!files.find(x => x.filepath === f.filepath)) selectedPaths.add(f.filepath);
    });
    files = data.files;
    if (commitType !== 'none') {
      const colonIdx = commitMsg.indexOf(': ');
      const currentDesc = userEditedMsg && colonIdx >= 0 ? commitMsg.slice(colonIdx + 2) : null;
      commitMsg = buildMsg(files.filter(f => selectedPaths.has(f.filepath)), commitType);
      if (currentDesc !== null) {
        const newColonIdx = commitMsg.indexOf(': ');
        const newPrefix = newColonIdx >= 0 ? commitMsg.slice(0, newColonIdx + 2) : '';
        commitMsg = newPrefix + currentDesc;
      }
    } else if (!userEditedMsg) {
      commitMsg = buildMsg(files.filter(f => selectedPaths.has(f.filepath)), commitType);
    }
    if (showBody && !userEditedBody) commitBody = buildBody(files.filter(f => selectedPaths.has(f.filepath)));
    render();
  } else if (data.command === 'aiStateUpdate') {
    aiState = data.aiState;
    render();
  } else if (data.command === 'aiResult') {
    if (data.mode === 'message') {
      aiGeneratingMsg = false;
      if (data.error) {
        aiMsgError = data.error;
      } else {
        aiMsgError = '';
        userEditedMsg = true;
        if (commitType !== 'none') {
          const colonIdx = commitMsg.indexOf(': ');
          const prefix = colonIdx >= 0 ? commitMsg.slice(0, colonIdx + 2) : '';
          commitMsg = prefix + data.text;
        } else {
          commitMsg = data.text;
        }
      }
    } else if (data.mode === 'body') {
      aiGeneratingBody = false;
      if (data.error) {
        aiBodyError = data.error;
      } else {
        aiBodyError = '';
        userEditedBody = true;
        commitBody = data.text;
        if (!showBody) showBody = true;
      }
    }
    render();
  } else if (data.command === 'runResult') {
    const btn = document.getElementById('runBtn');
    const errBox = document.getElementById('cmdError');
    if (data.error) {
      if (btn) {
        btn.textContent = 'Failed'; btn.classList.add('fail'); btn.disabled = false;
        setTimeout(()=>{ btn.textContent='Run'; btn.classList.remove('fail'); }, 2500);
      }
      if (errBox) errBox.innerHTML = '<div class="cmd-error">'+esc(data.error)+'</div>';
    } else {
      if (btn) {
        btn.textContent = 'Committed!'; btn.classList.add('ok');
        setTimeout(()=>{ btn.textContent='Run'; btn.classList.remove('ok'); }, 2500);
      }
      if (errBox) errBox.innerHTML = '';
      // Show undo bar
      showUndo();
      // Reset state after successful commit
      userEditedMsg = false;
      userEditedBody = false;
      commitBody = '';
      showBody = false;
      breakingChange = false;
      breakingMsg = '';
      footers = [];
      customScope = '';
      // File list will update via the backend refresh and watcher
    }
  } else if (data.command === 'undoResult') {
    clearUndo();
    const errBox = document.getElementById('cmdError');
    if (data.error) {
      if (errBox) errBox.innerHTML = '<div class="cmd-error">'+esc(data.error)+'</div>';
    } else {
      const btn = document.getElementById('runBtn');
      if (btn) {
        btn.textContent = 'Undone'; btn.classList.add('ok');
        setTimeout(()=>{ btn.textContent='Run'; btn.classList.remove('ok'); }, 2000);
      }
      if (errBox) errBox.innerHTML = '';
      // File list will update via the backend refresh and watcher
    }
  }
});

render();
</script>
</body>
</html>`;
}

// ─── No Workspace Content ─────────────────────────────────────────────────────

function getNoWorkspaceContent(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
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

// ─── Repo Root Detection ──────────────────────────────────────────────────────

function getRepoRoot(filePath: string): string | undefined {
  try {
    let cwd: string;
    try {
      cwd = fs.statSync(filePath).isDirectory() ? filePath : path.dirname(filePath);
    } catch {
      cwd = path.dirname(filePath);
    }
    return execSync("git rev-parse --show-toplevel", { cwd }).toString().trim();
  } catch {
    return undefined;
  }
}

// Scan all workspace folders and their immediate children to find a git repo.
// Handles the case where the workspace root is a parent folder containing the repo.
function findRepoFromWorkspace(folders: readonly vscode.WorkspaceFolder[]): string | undefined {
  for (const folder of folders) {
    const root = getRepoRoot(folder.uri.fsPath);
    if (root) return root;

    // Try immediate subdirectories
    try {
      const entries = fs.readdirSync(folder.uri.fsPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const subRoot = getRepoRoot(path.join(folder.uri.fsPath, entry.name));
        if (subRoot) return subRoot;
      }
    } catch { /* can't read directory */ }
  }
  return undefined;
}

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