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
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Syne:wght@700;800&display=swap');

  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

  :root{
    --bg:#0d0f14;
    --surface:#13151c;
    --surface2:#1a1d27;
    --border:#22263a;
    --border-bright:#363b52;
    --text:#e2e8f0;
    --muted:#5a6380;
    --accent:#7c3aed;
    --accent-soft:rgba(124,58,237,0.15);
    --green:#4ade80;
    --red:#f87171;
    --blue:#60a5fa;
    --orange:#fb923c;
    --r:6px;
    --mono:'JetBrains Mono',monospace;
    --display:'Syne',sans-serif;
  }

  body{
    background:var(--bg);
    color:var(--text);
    font-family:var(--mono);
    font-size:12px;
    padding:12px;
    overflow-x:hidden;
  }

  .header{margin-bottom:14px}
  .header h1{
    font-family:var(--display);
    font-size:15px;
    font-weight:800;
    background:linear-gradient(120deg,#e2e8f0 30%,#7c3aed);
    -webkit-background-clip:text;
    -webkit-text-fill-color:transparent;
    background-clip:text;
    margin-bottom:2px;
  }
  .header p{color:var(--muted);font-size:10px}

  .type-bar{
    display:flex;
    align-items:center;
    gap:8px;
    margin-bottom:12px;
    background:var(--surface);
    border:1px solid var(--border);
    border-radius:var(--r);
    padding:8px 10px;
  }
  .type-bar label{
    font-size:10px;
    color:var(--muted);
    font-family:var(--display);
    font-weight:700;
    letter-spacing:0.1em;
    text-transform:uppercase;
    white-space:nowrap;
  }
  .type-chips{display:flex;flex-wrap:wrap;gap:4px;flex:1}
  .chip{
    font-size:9px;
    font-family:var(--display);
    font-weight:700;
    letter-spacing:0.06em;
    padding:3px 8px;
    border-radius:20px;
    border:1px solid transparent;
    cursor:pointer;
    transition:all 0.15s;
    background:var(--surface2);
    color:var(--muted);
  }
  .chip:hover{color:var(--text);border-color:var(--border-bright)}
  .chip.active{color:#000;border-color:transparent}

  .list-header{
    display:flex;
    align-items:center;
    justify-content:space-between;
    margin-bottom:6px;
  }
  .list-label{
    font-family:var(--display);
    font-size:10px;
    font-weight:700;
    letter-spacing:0.1em;
    text-transform:uppercase;
    color:var(--muted);
  }
  .quick-links{display:flex;gap:8px}
  .quick-links a{
    font-size:10px;
    color:var(--muted);
    cursor:pointer;
    text-decoration:underline;
    text-underline-offset:2px;
  }
  .quick-links a:hover{color:var(--text)}

  .file-list{display:flex;flex-direction:column;gap:3px;margin-bottom:14px}

  .file-row{
    display:flex;
    align-items:center;
    gap:8px;
    background:var(--surface);
    border:1px solid var(--border);
    border-radius:var(--r);
    padding:7px 10px;
    cursor:pointer;
    transition:border-color 0.12s,background 0.12s;
    user-select:none;
  }
  .file-row:hover{border-color:var(--border-bright);background:var(--surface2)}
  .file-row.selected{border-color:var(--accent);background:var(--accent-soft)}

  .file-row input[type="checkbox"]{ display:none; }

  .custom-check{
    width:14px;height:14px;
    border:1.5px solid var(--border-bright);
    border-radius:3px;
    flex-shrink:0;
    display:flex;
    align-items:center;
    justify-content:center;
    transition:border-color 0.12s, background 0.12s;
    background:var(--surface2);
  }
  .file-row.selected .custom-check{
    background:var(--accent);
    border-color:var(--accent);
  }
  .file-row.selected .custom-check::after{
    content:'';
    width:4px;height:7px;
    border:1.5px solid #fff;
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
    font-size:11px;
    color:var(--text);
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
  }
  .file-dir{
    font-size:9px;
    color:var(--muted);
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
    margin-top:1px;
  }

  .file-hint{
    font-size:9px;
    font-family:var(--display);
    font-weight:700;
    color:var(--muted);
    flex-shrink:0;
    opacity:0.55;
  }

  .msg-section{margin-bottom:12px}
  .section-label{
    font-family:var(--display);
    font-size:10px;
    font-weight:700;
    letter-spacing:0.1em;
    text-transform:uppercase;
    color:var(--muted);
    margin-bottom:5px;
  }
  .msg-wrap{position:relative}
  .msg-edit{
    width:100%;
    background:var(--surface);
    border:1px solid var(--border);
    border-radius:var(--r);
    color:var(--text);
    font-family:var(--mono);
    font-size:11px;
    padding:8px 10px;
    padding-right:60px;
    resize:none;
    outline:none;
    line-height:1.5;
    transition:border-color 0.12s;
  }
  .msg-edit:focus{border-color:var(--accent)}

  .regen-btn{
    position:absolute;
    top:6px;right:6px;
    font-size:9px;
    font-family:var(--display);
    font-weight:700;
    letter-spacing:0.06em;
    background:var(--surface2);
    border:1px solid var(--border);
    border-radius:4px;
    color:var(--muted);
    padding:3px 7px;
    cursor:pointer;
    text-transform:uppercase;
    transition:color 0.12s,border-color 0.12s;
  }
  .regen-btn:hover{color:var(--text);border-color:var(--accent)}

  .cmd-section{margin-bottom:12px}
  .cmd-box{
    position:relative;
    background:#090b10;
    border:1px solid var(--border);
    border-radius:var(--r);
    padding:10px 12px;
    font-size:11px;
    line-height:2;
    white-space:pre;
    overflow-x:auto;
  }
  .cmd-line{display:block}
  .ck{color:#7c3aed}.cf{color:#60a5fa}.cs{color:#4ade80}.cp{color:#e2e8f0}

  .copy-btn{
    position:absolute;
    top:7px;right:7px;
    font-family:var(--display);
    font-size:9px;
    font-weight:700;
    letter-spacing:0.08em;
    text-transform:uppercase;
    background:var(--surface2);
    border:1px solid var(--border);
    border-radius:4px;
    color:var(--muted);
    padding:3px 8px;
    cursor:pointer;
    transition:color 0.12s,border-color 0.12s;
  }
  .copy-btn:hover{color:var(--text);border-color:var(--accent)}
  .copy-btn.ok{color:var(--green);border-color:var(--green)}

  .empty{text-align:center;padding:28px 0;color:var(--muted);font-size:11px;line-height:1.8}
  .empty span{font-size:20px;display:block;margin-bottom:8px}

  .live-badge{
    font-size:9px;font-family:var(--display);font-weight:700;
    letter-spacing:0.06em;color:var(--green);opacity:0.7;
  }
  .pulse{
    display:inline-block;width:5px;height:5px;border-radius:50%;
    background:var(--green);margin-right:4px;vertical-align:middle;
    animation:pulse 2s ease-in-out infinite;
  }
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
</style>
</head>
<body>
<div class="header">
  <h1>Git Commit Helper</h1>
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
};
const ALL_TYPES = Object.keys(TYPE_META);

let files = ${filesJson};
let selectedPaths = new Set(files.map(f => f.filepath));
let commitType = inferDominantType(files);
let commitMsg  = buildMsg(files.filter(f => selectedPaths.has(f.filepath)), commitType);
let userEditedMsg = false;

function inferDominantType(fs) {
  if (!fs.length) return 'feat';
  const c = {};
  fs.forEach(f => { c[f.suggestedType] = (c[f.suggestedType]||0)+1; });
  return Object.entries(c).sort((a,b)=>b[1]-a[1])[0][0];
}

function buildMsg(selected, type) {
  if (!selected.length) return '';
  const dirs = selected.map(f => { const p=f.filepath.split('/'); return p.length>1?p[0]:''; }).filter(Boolean);
  const freqD = {};
  dirs.forEach(d => freqD[d]=(freqD[d]||0)+1);
  const topDir = Object.entries(freqD).sort((a,b)=>b[1]-a[1])[0];
  const scope = topDir ? topDir[0] : '';
  const names = selected.map(f => f.filepath.split('/').pop().replace(/\.[^.]+$/, ''));
  let desc;
  if (names.length === 1) {
    const n = names[0];
    if (type==='fix')      desc='fix issue in '+n;
    else if (type==='docs')     desc='update '+n+' documentation';
    else if (type==='test')     desc='add tests for '+n;
    else if (type==='chore')    desc='update '+n+' config';
    else if (type==='style')    desc='update '+n+' styles';
    else if (type==='refactor') desc='refactor '+n;
    else                        desc='add '+n;
  } else {
    if (type==='fix')      desc='fix issues across '+names.length+' files';
    else if (type==='docs')     desc='update documentation';
    else if (type==='test')     desc='add/update tests';
    else if (type==='chore')    desc='update config files';
    else if (type==='style')    desc='update styles';
    else if (type==='refactor') desc='refactor '+names.length+' files';
    else                        desc='update '+names.length+' files';
  }
  return type+(scope?'('+scope+')':'')+': '+desc;
}

function buildCmd(selected, msg) {
  if (!selected.length) return '';
  const paths = selected.map(f => f.filepath).join(' ');
  const safe = msg.replace(/"/g, String.fromCharCode(92) + '"');
  const NL = String.fromCharCode(10);
  return 'git add ' + paths + NL + NL + 'git commit -m "' + safe + '"';
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

  const cmd = buildCmd(selected, commitMsg);
  const cmdHtml = cmd ? highlightCmd(cmd) : '<span class="cp" style="opacity:0.4">select files above</span>';

  root.innerHTML =
    '<div class="type-bar">'+
      '<label>TYPE</label>'+
      '<div class="type-chips">'+chips+'</div>'+
      '<span class="live-badge"><span class="pulse"></span>LIVE</span>'+
    '</div>'+
    '<div class="list-header">'+
      '<span class="list-label">Changed Files</span>'+
      '<div class="quick-links"><a onclick="selectAll()">all</a><a onclick="selectNone()">none</a></div>'+
    '</div>'+
    '<div class="file-list">'+rows+'</div>'+
    '<div class="msg-section">'+
      '<div class="section-label">Commit Message</div>'+
      '<div class="msg-wrap">'+
        '<textarea class="msg-edit" rows="2" id="msgEdit" oninput="onMsgEdit(this.value)">'+esc(commitMsg)+'</textarea>'+
        '<button class="regen-btn" onclick="regenMsg()">↺ regen</button>'+
      '</div>'+
    '</div>'+
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
  render();
}

function toggleFile(fp) {
  if (selectedPaths.has(fp)) selectedPaths.delete(fp);
  else selectedPaths.add(fp);
  if (!userEditedMsg) {
    commitMsg = buildMsg(files.filter(f => selectedPaths.has(f.filepath)), commitType);
  }
  render();
}

function selectAll()  { selectedPaths = new Set(files.map(f=>f.filepath)); regenMsg(); }
function selectNone() { selectedPaths = new Set(); commitMsg=''; render(); }

function regenMsg() {
  userEditedMsg = false;
  commitMsg = buildMsg(files.filter(f => selectedPaths.has(f.filepath)), commitType);
  render();
}

function onMsgEdit(val) {
  userEditedMsg = true;
  commitMsg = val;
  const sel = files.filter(f => selectedPaths.has(f.filepath));
  const cmd = buildCmd(sel, val);
  const box = document.getElementById('cmdBox');
  if (box) {
    box.innerHTML = '<button class="copy-btn" id="copyBtn" onclick="copyCmd()">COPY</button>'+
      (cmd ? highlightCmd(cmd) : '<span class="cp" style="opacity:0.4">select files above</span>');
  }
}

function copyCmd() {
  const sel = files.filter(f => selectedPaths.has(f.filepath));
  const cmd = buildCmd(sel, commitMsg);
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
    render();
  }
});

render();
</script>
</body>
</html>`;
}

// ─── Sidebar Provider ─────────────────────────────────────────────────────────

class GitCommitViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "gitCommitHelper.sidebar";
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
    vscode.commands.registerCommand("gitCommitHelper.open", () => {
      vscode.commands.executeCommand("gitCommitHelper.sidebar.focus");
    })
  );
}

export function deactivate() {}
