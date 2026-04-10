export function getScript(filesJson: string, modelsJson: string, aiStateJson: string): string {
  return `
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
let commitMsg  = buildDesc(files.filter(f => selectedPaths.has(f.filepath)), commitType);

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

function buildDesc(selected, type) {
  if (!selected.length) return '';
  const names = selected.map(f => f.filepath.split('/').pop().replace(/\.[^.]+$/, ''));

  // None mode — plain description
  if (type === 'none') {
    if (names.length === 1) return 'update ' + names[0];
    if (names.length <= 3)  return 'update ' + names.join(', ');
    return 'update ' + names.slice(0, 2).join(', ') + ' and ' + (names.length - 2) + ' more files';
  }

  if (names.length === 1) {
    const n = names[0];
    if (type==='fix')           return 'fix issue in '+n;
    if (type==='docs')          return 'update '+n+' documentation';
    if (type==='test')          return 'add tests for '+n;
    if (type==='chore')         return 'update '+n+' config';
    if (type==='style')         return 'update '+n+' styles';
    if (type==='refactor')      return 'refactor '+n;
    if (type==='perf')          return 'improve performance of '+n;
    if (type==='build')         return 'update '+n+' build config';
    if (type==='ci')            return 'update '+n+' CI config';
    return 'add '+n;
  }
  if (type==='fix')           return 'fix issues across '+names.length+' files';
  if (type==='docs')          return 'update documentation';
  if (type==='test')          return 'add/update tests';
  if (type==='chore')         return 'update config files';
  if (type==='style')         return 'update styles';
  if (type==='refactor')      return 'refactor '+names.length+' files';
  if (type==='perf')          return 'improve performance across '+names.length+' files';
  if (type==='build')         return 'update build configuration';
  if (type==='ci')            return 'update CI configuration';
  return 'update '+names.length+' files';
}

// Compute the conventional commit prefix from current state.
// Returns '' for none mode, otherwise "type(scope): " or "type(scope)!: ".
function getPrefix() {
  if (commitType === 'none') return '';
  const base = commitType + (customScope ? '(' + customScope + ')' : '');
  return (breakingChange ? base + '!' : base) + ': ';
}

// Full commit message string for display and commands.
function getFullMsg() {
  return getPrefix() + commitMsg;
}

// Regenerate the description from the current file selection,
// but only if the user hasn't manually edited it.
function regenIfNeeded() {
  if (!userEditedMsg) {
    commitMsg = buildDesc(files.filter(f => selectedPaths.has(f.filepath)), commitType);
  }
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
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
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
  try {
  const root = document.getElementById('root');
  const selected = files.filter(f => selectedPaths.has(f.filepath));

  if (!files.length) {
    root.innerHTML = '<div class="empty"><div>No changed files.<br>Edits appear here automatically.<br><a style="color:var(--vscode-textLink-foreground);cursor:pointer;font-size:11px;margin-top:6px;display:inline-block" data-action="refreshFiles">↻ refresh</a></div></div>';
    const footer = document.getElementById('cmd-footer');
    if (footer) {
      if (undoActive) {
        footer.innerHTML =
          '<div class="cmd-section">'+
            '<div id="undoContainer">'+
              '<div class="undo-bar">'+
                '<span class="undo-check">✓</span>'+
                '<span>Committed</span>'+
                '<button class="undo-link" data-action="undoCommit">undo</button>'+
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
    return '<button class="chip '+active+'" style="'+style+'" data-type="'+t+'" data-action="setType">'+t+'</button>';
  }).join('');

  const rows = files.map(f => {
    const sel = selectedPaths.has(f.filepath);
    const parts = f.filepath.split('/');
    const fname = parts.pop();
    const fdir  = parts.join('/');
    const hint  = f.suggestedType !== commitType ? f.suggestedType : '';
    const fp = esc(f.filepath);
  return '<div class="file-row '+(sel?'selected':'')+'" data-path="'+fp+'" data-action="toggleFile">'+
      '<input type="checkbox" '+(sel?'checked':'')+' data-path="'+fp+'" data-action="toggleFile"/>'+
      '<div class="custom-check"></div>'+
      '<span class="file-status" style="color:'+statusColor(f.status)+'">'+esc(f.status||'?')+'</span>'+
      '<div class="file-info">'+
        '<div class="file-name" title="'+fp+'">'+esc(fname)+'</div>'+
        (fdir ? '<div class="file-dir">'+esc(fdir)+'</div>' : '')+
      '</div>'+
      (hint ? '<span class="file-hint">'+esc(hint)+'</span>' : '')+
    '</div>';
  }).join('');

  const fullMsg = getFullMsg();
  const cmd = buildCmd(selected, fullMsg, showBody ? commitBody : '', breakingChange, breakingMsg, footers);
  const cmdHtml = cmd ? highlightCmd(cmd) : '<span class="cp" style="opacity:0.4">select files above</span>';

  const FOOTER_TOKENS = ['Refs', 'Closes', 'Fixes', 'Co-authored-by', 'Reviewed-by', 'See-also', 'Custom'];

  const aiBodyInline = isAiReady()
    ? '<button class="ai-inline-btn body-ai-inline" id="aiBodyBtn" title="Generate with AI" data-action="aiGenerateBody"'+(aiGeneratingBody?' disabled':'')+'>'+
        (aiGeneratingBody ? '<span class="ai-loading"></span>' : '<span class="ai-gen-spark">✦</span>')+
      '</button>'
    : '';

  const bodySection =
    '<div class="msg-section">'+
      '<div class="section-label-row">'+
        '<div class="collapsible-header" data-action="toggleBody">'+
          '<span class="collapsible-arrow">'+(showBody?'▾':'▸')+'</span>'+
          '<span class="section-label">Commit Body</span>'+
        '</div>'+
        (showBody ?
          '<div class="section-label-row-right" id="bodyLabelRight">'+
            (userEditedBody ? '<button class="reset-link" id="bodyResetBtn" data-action="regenBody">↺ reset</button>' : '')+
          '</div>'
        : '')+
      '</div>'+
      (showBody ? (()=>{
        const longest = commitBody.split(String.fromCharCode(10)).reduce((max,l)=>Math.max(max,l.length),0);
        return '<div class="msg-wrap">'+
          '<textarea class="msg-edit" rows="4" id="bodyEdit" data-input="onBodyEdit">'+esc(commitBody)+'</textarea>'+
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
      '<select class="footer-select" data-idx="'+i+'" data-change="updateFooterToken">'+tokenOpts+'</select>'+
      (f.token === 'Custom' ?
        '<input class="footer-token-input" placeholder="token" value="'+esc(f.customToken)+'" data-idx="'+i+'" data-input="updateFooterCustomToken"/>'
      : '')+
      '<div class="footer-value-wrap">'+
        '<input class="footer-value-input" placeholder="value" maxlength="'+MAX_FOOTER_VAL+'" value="'+esc(f.value)+'" data-idx="'+i+'" data-input="updateFooterValue"/>'+
        '<span class="footer-val-counter '+(f.value.length>90?'over':'')+'" id="fvc'+i+'">'+f.value.length+'/'+MAX_FOOTER_VAL+'</span>'+
      '</div>'+
      '<button class="footer-remove" data-idx="'+i+'" data-action="removeFooter" title="Remove">×</button>'+
    '</div>';
  }).join('');

  const breakingSection =
    '<div class="msg-section">'+
      '<div class="section-label-row">'+
        '<span class="section-label" style="color:var(--vscode-errorForeground)">⚠ Breaking Change</span>'+
        '<button class="toggle-btn" data-action="toggleBreaking">'+(breakingChange ? '▾ remove' : '▸ add')+'</button>'+
      '</div>'+
      (breakingChange ?
        '<div class="msg-wrap">'+
          '<textarea class="msg-edit" rows="2" id="breakingEdit" placeholder="describe what breaks and how to migrate..." data-input="onBreakingEdit">'+esc(breakingMsg)+'</textarea>'+
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
          '<button class="toggle-btn" style="color:var(--vscode-descriptionForeground)" data-action="clearFooters">clear all</button>'
        : '')+
        (footers.length < MAX_FOOTERS ?
          '<button class="toggle-btn" data-action="addFooter">▸ add footer</button>'
        :
          '<span style="font-size:10px;color:var(--vscode-descriptionForeground);opacity:0.6">max '+MAX_FOOTERS+'</span>'
        )+
      '</div>'+
    '</div>'+
    footerRows+
  '</div>';

  // ── AI settings panel ──
  const providerOpts = ['none','anthropic','openai','google'].map(p =>
    '<option value="'+p+'"'+(aiState.provider===p?' selected':'')+'>'+
      (p==='none' ? 'Disabled' : ({ anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google' }[p] || p))+
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
      '<div class="ai-header" data-action="toggleAiSettings">'+
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
            '<select class="ai-select" data-change="onAiProviderChange">'+providerOpts+'</select>'+
          '</div>'+
          (aiState.provider !== 'none' ?
            '<div class="ai-row">'+
              '<span class="ai-row-label">Model</span>'+
              '<select class="ai-select" data-change="onAiModelChange">'+modelOpts+'</select>'+
            '</div>'+
            '<div class="ai-key-row">'+
              '<span class="ai-row-label">API Key</span>'+
              (hasCurrentKey ?
                '<span class="ai-key-status saved">● saved</span>'
              :
                '<span class="ai-key-status missing">● not set</span>'
              )+
              '<button class="ai-key-manage" data-action="manageAiKey">manage</button>'+
            '</div>'
          : '')+
        '</div>'
      : '')+
    '</div>';

  // ── AI inline button for commit message ──
  const aiMsgInline = isAiReady()
    ? '<button class="ai-inline-btn" id="aiMsgBtn" title="Generate with AI" data-action="aiGenerateMsg"'+(aiGeneratingMsg?' disabled':'')+'>'+
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
        'value="'+esc(customScope)+'" data-input="onScopeEdit"/>'+
      (customScope ? '<button class="scope-clear" data-action="clearScope" title="Clear scope">×</button>' : '')+
    '</div>'+
    '<div class="list-header"'+(showFiles?'':' style="margin-bottom:12px"')+'>'+
      '<div style="display:flex;align-items:center;gap:4px;cursor:pointer" data-action="toggleFiles">'+
        '<span style="font-size:10px;color:var(--vscode-descriptionForeground)">'+(showFiles?'▾':'▸')+'</span>'+
        '<span class="list-label">Changed Files ('+files.length+')</span>'+
        (!showFiles ? '<span style="font-size:10px;color:var(--vscode-descriptionForeground);opacity:0.7">&nbsp;'+selected.length+'/'+files.length+' selected</span>' : '')+
      '</div>'+
      (showFiles ?
        '<div class="quick-links">'+
          '<a data-action="selectAll">all</a>'+
          '<a data-action="selectNone">none</a>'+
          '<a data-action="refreshFiles" title="Refresh file list">↻</a>'+
        '</div>'
      : '')+
    '</div>'+
    (showFiles ? '<div class="file-list">'+rows+'</div>' : '')+
    '<div class="msg-section">'+
      '<div class="section-label-row" id="msgLabelRow">'+
        '<span class="section-label">Commit Message</span>'+
        (userEditedMsg ? '<button class="reset-link" id="msgResetBtn" data-action="regenMsg">↺ reset</button>' : '')+
      '</div>'+
      (commitType !== 'none' ? (()=>{
        const prefixDisplay = getPrefix().slice(0, -1); // "type(scope):" without trailing space
        return '<div class="msg-input-row" id="msgInputRow">'+
          '<span class="msg-prefix" id="msgPrefix">'+esc(prefixDisplay)+'</span>'+
          '<input class="msg-desc-input" id="msgDesc" type="text" value="'+esc(commitMsg)+'" data-input="onDescEdit"/>'+
          aiMsgInline+
        '</div>';
      })() :
        '<div class="msg-input-row" id="msgInputRow">'+
          '<input class="msg-desc-input" id="msgEdit" type="text" value="'+esc(commitMsg)+'" data-input="onMsgEdit"/>'+
          aiMsgInline+
        '</div>'
      )+
      '<div class="char-counter '+(fullMsg.length > 72 ? 'over' : '')+'" id="charCounter">'+
        fullMsg.length+' / 72'+
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
          '<button class="copy-btn" id="copyBtn" data-action="copyCmd">Copy</button>'+
          '<button class="run-btn" id="runBtn" data-action="runCmd"'+(cmd?'':' disabled')+'>Run</button>'+
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
            '<button class="undo-link" data-action="undoCommit">undo</button>'+
            '<span class="undo-timer" id="undoTimerText">'+undoSeconds+'s</span>'+
          '</div>'
        : '')+
      '</div>'+
    '</div>';
  } catch (e) {
    console.error('render error:', e);
    const root = document.getElementById('root');
    if (root) root.innerHTML = '<div class="empty"><div>Something went wrong.<br><a style="color:var(--vscode-textLink-foreground);cursor:pointer;font-size:11px" data-action="render">retry</a> · <a style="color:var(--vscode-textLink-foreground);cursor:pointer;font-size:11px" data-action="refreshFiles">↻ refresh</a></div></div>';
  }
}

function setType(t) {
  commitType = t;
  regenIfNeeded();

  if (showBody && !userEditedBody) {
    commitBody = buildBody(files.filter(f => selectedPaths.has(f.filepath)));
  }
  render();
}

function toggleFile(fp) {
  if (selectedPaths.has(fp)) selectedPaths.delete(fp);
  else selectedPaths.add(fp);
  regenIfNeeded();
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
  commitMsg = buildDesc(files.filter(f => selectedPaths.has(f.filepath)), commitType);
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
  commitMsg = val;
  const full = getFullMsg();
  const counter = document.getElementById('charCounter');
  if (counter) {
    counter.textContent = full.length + ' / 72';
    counter.className = 'char-counter' + (full.length > 72 ? ' over' : '');
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
  const full = getFullMsg();
  const counter = document.getElementById('charCounter');
  if (counter) {
    counter.textContent = full.length + ' / 72';
    counter.className = 'char-counter' + (full.length > 72 ? ' over' : '');
  }
  const sel = files.filter(f => selectedPaths.has(f.filepath));
  const cmd = buildCmd(sel, full, showBody ? commitBody : '', breakingChange, breakingMsg, footers);
  const box = document.getElementById('cmdBox');
  if (box) {
    box.innerHTML = (cmd ? highlightCmd(cmd) : '<span class="cp" style="opacity:0.4">select files above</span>');
  }
}

function copyCmd() {
  const sel = files.filter(f => selectedPaths.has(f.filepath));
  const cmd = buildCmd(sel, getFullMsg(), showBody ? commitBody : '', breakingChange, breakingMsg, footers);
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
  const cmd = buildCmd(sel, getFullMsg(), showBody ? commitBody : '', breakingChange, breakingMsg, footers);
  if (!cmd) return;

  const btn = document.getElementById('runBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Running…'; }
  const errBox = document.getElementById('cmdError');
  if (errBox) errBox.innerHTML = '';
  clearUndo();

  vscode.postMessage({
    command: 'runGitCommand',
    filePaths: sel.map(f => f.filepath),
    commitMsg: getFullMsg(),
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
      '<button class="undo-link" data-action="undoCommit">undo</button>'+
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
  const cmd = buildCmd(sel, getFullMsg(), val, breakingChange, breakingMsg, footers);
  const box = document.getElementById('cmdBox');
  if (box) {
    box.innerHTML = (cmd ? highlightCmd(cmd) : '<span class="cp" style="opacity:0.4">select files above</span>');
  }
}

function toggleBreaking() {
  breakingChange = !breakingChange;
  if (!breakingChange) breakingMsg = '';
  regenIfNeeded();
  render();
}

function onBreakingEdit(val) {
  breakingMsg = val;
  const sel = files.filter(f => selectedPaths.has(f.filepath));
  const cmd = buildCmd(sel, getFullMsg(), showBody ? commitBody : '', true, val, footers);
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
    // Update prefix span without losing focus on desc input
    const prefixEl = document.getElementById('msgPrefix');
    if (prefixEl) {
      prefixEl.textContent = getPrefix().slice(0, -1); // "type(scope):" without trailing space
    }
    const full = getFullMsg();
    const counter = document.getElementById('charCounter');
    if (counter) {
      counter.textContent = full.length + ' / 72';
      counter.className = 'char-counter' + (full.length > 72 ? ' over' : '');
    }
  } else {
    const full = getFullMsg();
    const counter = document.getElementById('charCounter');
    if (counter) {
      counter.textContent = full.length + ' / 72';
      counter.className = 'char-counter' + (full.length > 72 ? ' over' : '');
    }
  }
  refreshCmd();
}

function clearScope() {
  customScope = '';
  render();
}

function refreshCmd() {
  const sel = files.filter(f => selectedPaths.has(f.filepath));
  const cmd = buildCmd(sel, getFullMsg(), showBody ? commitBody : '', breakingChange, breakingMsg, footers);
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
    regenIfNeeded();
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
        commitMsg = data.text;
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

// ── Delegated Event Listeners (CSP-safe — no inline handlers) ──

const clickActions = {
  refreshFiles, undoCommit, toggleBody, regenBody, toggleBreaking,
  clearFooters, addFooter, toggleAiSettings, manageAiKey,
  aiGenerateMsg, aiGenerateBody, clearScope, toggleFiles,
  selectAll, selectNone, regenMsg, copyCmd, runCmd, render,
  setType: function(el) { setType(el.dataset.type); },
  toggleFile: function(el) {
    const row = el.closest('[data-path]');
    if (row) toggleFile(row.dataset.path);
  },
  removeFooter: function(el) { removeFooter(+el.dataset.idx); },
};

document.body.addEventListener('click', function(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  e.stopPropagation();
  const action = el.dataset.action;
  const handler = clickActions[action];
  if (handler) {
    if (handler.length > 0) handler(el);
    else handler();
  }
});

const inputActions = {
  onDescEdit: function(el) { onDescEdit(el.value); },
  onMsgEdit: function(el) { onMsgEdit(el.value); },
  onBodyEdit: function(el) { onBodyEdit(el.value); },
  onBreakingEdit: function(el) { onBreakingEdit(el.value); },
  onScopeEdit: function(el) { onScopeEdit(el.value); },
  updateFooterCustomToken: function(el) { updateFooterCustomToken(+el.dataset.idx, el.value); },
  updateFooterValue: function(el) { updateFooterValue(+el.dataset.idx, el.value); },
};

document.body.addEventListener('input', function(e) {
  const action = e.target.dataset.input;
  if (!action) return;
  const handler = inputActions[action];
  if (handler) handler(e.target);
});

const changeActions = {
  onAiProviderChange: function(el) { onAiProviderChange(el.value); },
  onAiModelChange: function(el) { onAiModelChange(el.value); },
  updateFooterToken: function(el) { updateFooterToken(+el.dataset.idx, el.value); },
};

document.body.addEventListener('change', function(e) {
  const action = e.target.dataset.change;
  if (!action) return;
  const handler = changeActions[action];
  if (handler) handler(e.target);
});

render();
`;
}