import * as vscode from "vscode";
import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";

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
    const output = execSync("git status --porcelain", { cwd: repoRoot }).toString();
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

// ─── Webview HTML ─────────────────────────────────────────────────────────────

function getWebviewContent(files: ChangedFile[]): string {
  const filesJson = JSON.stringify(files);

  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Git Commit Helper</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

  body{
    background:var(--vscode-sideBar-background);
    color:var(--vscode-foreground);
    font-family:var(--vscode-font-family);
    font-size:var(--vscode-font-size);
    padding:12px;
    overflow-x:hidden;
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
  }
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

  .char-counter{
    text-align:right;
    font-size:10px;
    color:var(--vscode-descriptionForeground);
    margin-top:3px;
    transition:color 0.1s;
  }
  .char-counter.over{color:var(--vscode-errorForeground);font-weight:600}

  .regen-btn{
    position:absolute;
    top:5px;right:5px;
    font-size:10px;
    background:transparent;
    border:1px solid var(--vscode-button-secondaryBorder, var(--vscode-input-border));
    border-radius:3px;
    color:var(--vscode-descriptionForeground);
    padding:2px 6px;
    cursor:pointer;
    font-family:var(--vscode-font-family);
    transition:background 0.1s;
  }
  .regen-btn:hover{background:var(--vscode-toolbar-hoverBackground);color:var(--vscode-foreground)}

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
    background:transparent;
    border:none;
    color:var(--vscode-input-foreground);
    font-family:var(--vscode-font-family);
    font-size:11px;
    outline:none;
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
    flex-shrink:0;
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
  .footer-value-wrap{position:relative;flex:1;min-width:0}
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

  .cmd-section{margin-bottom:10px}
  .cmd-box{
    position:relative;
    background:var(--vscode-textCodeBlock-background, var(--vscode-input-background));
    border:1px solid var(--vscode-input-border, transparent);
    border-radius:3px;
    padding:8px 10px;
    font-size:11px;
    font-family:var(--vscode-editor-font-family);
    line-height:2;
    white-space:pre;
    overflow-x:auto;
  }
  .cmd-line{display:block}
  .ck{color:var(--vscode-symbolIcon-keywordForeground, #569cd6)}
  .cf{color:var(--vscode-symbolIcon-variableForeground, #9cdcfe)}
  .cs{color:var(--vscode-symbolIcon-stringForeground, #ce9178)}
  .cp{color:var(--vscode-foreground)}

  .copy-btn{
    position:absolute;
    top:6px;right:6px;
    font-size:10px;
    background:var(--vscode-button-secondaryBackground, transparent);
    border:1px solid var(--vscode-button-secondaryBorder, var(--vscode-input-border));
    border-radius:3px;
    color:var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    padding:2px 8px;
    cursor:pointer;
    font-family:var(--vscode-font-family);
    transition:background 0.1s;
  }
  .copy-btn:hover{background:var(--vscode-button-secondaryHoverBackground)}
  .copy-btn.ok{
    color:var(--vscode-terminal-ansiGreen, #4ade80);
    border-color:var(--vscode-terminal-ansiGreen, #4ade80);
  }

  .empty{
    text-align:center;
    padding:24px 0;
    color:var(--vscode-descriptionForeground);
    font-size:12px;
    line-height:1.8;
  }

</style>
</head>
<body>
<div class="header">
  <h1>gimmit</h1>
  <p>Select files · pick type · copy command</p>
</div>
<div id="root"></div>

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
let showFiles = true;
let commitBody = '';
let breakingChange = false;
let breakingMsg = '';
let footers = []; // [{id, token, customToken, value}]
let customScope = '';
let commitMsg  = buildMsg(files.filter(f => selectedPaths.has(f.filepath)), commitType);

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

  const dirs = [...new Set(selected.map(f => { const p=f.filepath.split('/'); return p.length>1?p[0]:''; }).filter(Boolean))];
  const scope = customScope || (dirs.length === 1 ? dirs[0] : '');
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
    return '- ' + f.filepath + ' [' + st + ', ' + f.suggestedType + ']';
  }).join(String.fromCharCode(10));
}

function buildCmd(selected, msg, body, breaking, brkMsg, footers) {
  if (!selected.length) return '';
  const paths = selected.map(f => f.filepath).join(' ');
  const safe = msg.replace(/"/g, String.fromCharCode(92) + '"');
  const NL = String.fromCharCode(10);
  let cmd = 'git add ' + paths + NL + NL + 'git commit -m "' + safe + '"';
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
    root.innerHTML = '<div class="empty"><span>✓</span>No changed files.<br>Edits appear here automatically.</div>';
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

  const bodySection =
    '<div class="msg-section">'+
      '<div class="section-label-row">'+
        '<span class="section-label">Commit Body</span>'+
        '<button class="toggle-btn" onclick="toggleBody()">'+(showBody ? '▾ hide' : '▸ add body')+'</button>'+
      '</div>'+
      (showBody ? (()=>{
        const longest = commitBody.split(String.fromCharCode(10)).reduce((max,l)=>Math.max(max,l.length),0);
        return '<div class="msg-wrap">'+
          '<textarea class="msg-edit" rows="4" id="bodyEdit" oninput="onBodyEdit(this.value)">'+esc(commitBody)+'</textarea>'+
          '<button class="regen-btn" onclick="regenBody()">↺ regen</button>'+
        '</div>'+
        '<div class="body-counter '+(longest>72?'over':'')+'" id="bodyCounter">longest line: '+longest+' / 72</div>';
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

  root.innerHTML =
    '<div class="type-bar">'+
      '<label>TYPE</label>'+
      '<div class="type-chips">'+chips+'</div>'+
    '</div>'+
    '<div class="scope-bar">'+
      '<span class="scope-label">SCOPE</span>'+
      '<input class="scope-input" type="text" placeholder="override scope..." maxlength="20"'+
        'value="'+esc(customScope)+'" oninput="onScopeEdit(this.value)"/>'+
      (customScope ? '<button class="scope-clear" onclick="clearScope()" title="Clear scope">×</button>' : '')+
    '</div>'+
    '<div class="list-header">'+
      '<div style="display:flex;align-items:center;gap:4px;cursor:pointer" onclick="toggleFiles()">'+
        '<span style="font-size:10px;color:var(--vscode-descriptionForeground)">'+(showFiles?'▾':'▸')+'</span>'+
        '<span class="list-label">Changed Files ('+files.length+')</span>'+
        (!showFiles ? '<span style="font-size:10px;color:var(--vscode-descriptionForeground);opacity:0.7">&nbsp;'+selected.length+'/'+files.length+' selected</span>' : '')+
      '</div>'+
      (showFiles ?
        '<div class="quick-links">'+
          '<a onclick="event.stopPropagation();selectAll()">all</a>'+
          '<a onclick="event.stopPropagation();selectNone()">none</a>'+
        '</div>'
      : '')+
    '</div>'+
    (showFiles ? '<div class="file-list">'+rows+'</div>' : '')+
    '<div class="msg-section">'+
      '<div class="section-label">Commit Message</div>'+
      '<div class="msg-wrap">'+
        '<textarea class="msg-edit" rows="2" id="msgEdit" oninput="onMsgEdit(this.value)">'+esc(commitMsg)+'</textarea>'+
        '<button class="regen-btn" onclick="regenMsg()">↺ regen</button>'+
      '</div>'+
      '<div class="char-counter '+(commitMsg.length > 72 ? 'over' : '')+'" id="charCounter">'+
        commitMsg.length+' / 72'+
      '</div>'+
    '</div>'+
    bodySection+
    footerSection+
    breakingSection+
    '<div class="cmd-section">'+
      '<div class="section-label">Git Command</div>'+
      '<div class="cmd-box" id="cmdBox">'+
        '<button class="copy-btn" id="copyBtn" onclick="copyCmd()">COPY</button>'+cmdHtml+
      '</div>'+
    '</div>';
}

function setType(t) {
  commitType = t;
  if (!userEditedMsg) {
    commitMsg = buildMsg(files.filter(f => selectedPaths.has(f.filepath)), commitType);
  }
  if (showBody) commitBody = buildBody(files.filter(f => selectedPaths.has(f.filepath)));
  render();
}

function toggleFile(fp) {
  if (selectedPaths.has(fp)) selectedPaths.delete(fp);
  else selectedPaths.add(fp);
  if (!userEditedMsg) {
    commitMsg = buildMsg(files.filter(f => selectedPaths.has(f.filepath)), commitType);
  }
  if (showBody) commitBody = buildBody(files.filter(f => selectedPaths.has(f.filepath)));
  render();
}

function selectAll() {
  selectedPaths = new Set(files.map(f=>f.filepath));
  if (showBody) commitBody = buildBody(files.filter(f => selectedPaths.has(f.filepath)));
  regenMsg();
}
function selectNone() {
  selectedPaths = new Set();
  commitMsg='';
  commitBody='';
  customScope='';
  render();
}

function regenMsg() {
  userEditedMsg = false;
  commitMsg = buildMsg(files.filter(f => selectedPaths.has(f.filepath)), commitType);
  render();
}

function onMsgEdit(val) {
  userEditedMsg = true;
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
    box.innerHTML = '<button class="copy-btn" id="copyBtn" onclick="copyCmd()">COPY</button>'+
      (cmd ? highlightCmd(cmd) : '<span class="cp" style="opacity:0.4">select files above</span>');
  }
}

function copyCmd() {
  const sel = files.filter(f => selectedPaths.has(f.filepath));
  const cmd = buildCmd(sel, commitMsg, showBody ? commitBody : '', breakingChange, breakingMsg, footers);
  if (!cmd) return;
  navigator.clipboard.writeText(cmd).then(() => {
    const btn = document.getElementById('copyBtn');
    if (btn) {
      btn.textContent='COPIED!'; btn.classList.add('ok');
      setTimeout(()=>{ btn.textContent='COPY'; btn.classList.remove('ok'); }, 1800);
    }
  });
}

window.addEventListener('message', e => {
  if (e.data.command === 'updateFiles') {
    const newPaths = new Set(e.data.files.map(f => f.filepath));
    selectedPaths = new Set([...selectedPaths].filter(p => newPaths.has(p)));
    e.data.files.forEach(f => {
      if (!files.find(x => x.filepath === f.filepath)) selectedPaths.add(f.filepath);
    });
    files = e.data.files;
    if (!userEditedMsg) {
      commitMsg = buildMsg(files.filter(f => selectedPaths.has(f.filepath)), commitType);
    }
    if (showBody) commitBody = buildBody(files.filter(f => selectedPaths.has(f.filepath)));
    render();
  }
});

function toggleFiles() {
  showFiles = !showFiles;
  render();
}

function toggleBody() {
  showBody = !showBody;
  if (showBody && !commitBody) {
    commitBody = buildBody(files.filter(f => selectedPaths.has(f.filepath)));
  }
  if (!showBody) commitBody = '';  // ← add this line
  render();
}

function regenBody() {
  commitBody = buildBody(files.filter(f => selectedPaths.has(f.filepath)));
  render();
}

function onBodyEdit(val) {
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
    box.innerHTML = '<button class="copy-btn" id="copyBtn" onclick="copyCmd()">COPY</button>'+
      (cmd ? highlightCmd(cmd) : '<span class="cp" style="opacity:0.4">select files above</span>');
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
    box.innerHTML = '<button class="copy-btn" id="copyBtn" onclick="copyCmd()">COPY</button>'+
      (cmd ? highlightCmd(cmd) : '<span class="cp" style="opacity:0.4">select files above</span>');
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
    box.innerHTML = '<button class="copy-btn" id="copyBtn" onclick="copyCmd()">COPY</button>'+
      (cmd ? highlightCmd(cmd) : '<span class="cp" style="opacity:0.4">select files above</span>');
  }
}

render();
</script>
</body>
</html>`;
}

// ─── Sidebar Provider ─────────────────────────────────────────────────────────

class GitCommitViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "gimmit.sidebar";
  private _view?: vscode.WebviewView;
  private _watcher?: fs.FSWatcher;
  private _disposables: vscode.Disposable[] = [];

  constructor(private readonly _repoRoot: string) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = getWebviewContent(getChangedFiles(this._repoRoot));

    webviewView.webview.onDidReceiveMessage((msg) => {
      if (msg.command === "refresh") this._refresh();
    });

    this._startWatcher();
    webviewView.onDidDispose(() => this._stopWatcher());
  }

  private _refresh() {
    if (!this._view) return;
    const files = getChangedFiles(this._repoRoot);
    this._view.webview.postMessage({ command: "updateFiles", files });
  }

  private _startWatcher() {
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
  if (!workspaceFolders || workspaceFolders.length === 0) return;

  const repoRoot = workspaceFolders[0].uri.fsPath;
  const provider = new GitCommitViewProvider(repoRoot);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      GitCommitViewProvider.viewType,
      provider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("gimmit.open", () => {
      vscode.commands.executeCommand("gimmit.sidebar.focus");
    })
  );
}

export function deactivate() {}