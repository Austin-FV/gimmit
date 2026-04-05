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
`;
}