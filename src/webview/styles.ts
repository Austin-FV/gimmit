export function getStyles(): string {
  return `
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
`;
}