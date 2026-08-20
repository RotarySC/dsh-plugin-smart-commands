export const SECTION_CSS = `
.sc-root,.sc-root *,.sc-backdrop,.sc-backdrop *{box-sizing:border-box}
.sc-root{width:100%;max-width:860px;color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;gap:16px}
.sc-header h2{margin:0;font-size:16px;font-weight:650;line-height:24px}
.sc-header p{margin:4px 0 0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}
.sc-toolbar{display:flex;flex-direction:column;gap:8px;align-items:stretch}
.sc-toolbar-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.sc-search{flex:1 1 12rem;min-width:0}
.sc-search input{display:block;width:100%;min-width:0;height:36px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font:inherit;font-size:13px;outline:none}
.sc-toolbar-actions{display:flex;flex:none;flex-wrap:wrap;gap:8px;align-items:center}
.sc-search input:focus-visible,.sc-field input:focus-visible,.sc-field textarea:focus-visible,.sc-field select:focus-visible,.sc-check input:focus-visible{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary) 18%,transparent);outline:none}
.sc-seg{display:inline-flex;flex:none;align-items:stretch;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;overflow:hidden}
.sc-seg-divider{flex:none;align-self:stretch;width:1px;margin:6px 0;background:var(--dsw-alias-border-l2)}
.sc-seg button,.sc-btn{height:36px;border:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;padding:0 12px;cursor:pointer;flex:none;transition-property:background-color,border-color,color,transform;transition-duration:.12s}
.sc-seg button:hover:not(:disabled):not([data-on=true]){background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent))}
.sc-seg button[data-on=true],.sc-seg button[aria-pressed=true]{background:var(--dsw-alias-state-business-primary);color:#fff}
.sc-seg button[data-on=true]:hover:not(:disabled),.sc-seg button[aria-pressed=true]:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 86%,#000);color:#fff}
.sc-btn{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
.sc-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent));border-color:color-mix(in srgb,var(--dsw-alias-label-primary) 18%,var(--dsw-alias-border-l2))}
.sc-btn:focus-visible,.sc-seg button:focus-visible,.sc-link:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.sc-btn:disabled,.sc-link:disabled{opacity:.5;cursor:not-allowed}
.sc-btn-primary{background:var(--dsw-alias-state-business-primary);color:#fff;border-color:transparent}
.sc-btn-primary:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 86%,#000);color:#fff;border-color:transparent}
.sc-btn-primary:active:not(:disabled),.sc-btn:active:not(:disabled){transform:scale(.96)}
.sc-status,.sc-empty{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}
.sc-error{color:var(--dsw-alias-state-error-primary);display:flex;gap:10px;align-items:center;font-size:13px}
.sc-section-label{margin:8px 0 0;font-size:12px;font-weight:600;color:var(--dsw-alias-label-tertiary)}
.sc-select-tools{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-inline-start:auto}
.sc-selected-count{color:var(--dsw-alias-label-tertiary);font-size:12px;padding-inline-start:8px}
.sc-list{display:flex;flex-direction:column;gap:10px;margin:0;padding:0;list-style:none}
.sc-row{display:flex;gap:12px;align-items:flex-start;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:12px;padding:14px 16px;min-width:0}
.sc-check{flex:none;display:flex;align-items:center;justify-content:center;width:40px;height:40px;margin:-8px;cursor:pointer}
.sc-check input{width:16px;height:16px;margin:0;accent-color:var(--dsw-alias-state-business-primary)}
.sc-row-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
.sc-row-head{display:flex;align-items:flex-start;gap:12px}
.sc-row-head h3{margin:0;flex:1;min-width:0;font-size:14px;font-weight:650;line-height:22px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sc-row-actions{display:flex;flex:none;align-items:center;gap:2px}
.sc-link{height:32px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:20px;padding:0 8px;border-radius:6px;cursor:pointer}
.sc-link:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent));color:var(--dsw-alias-label-primary)}
.sc-link-danger{color:var(--dsw-alias-state-error-primary)}
.sc-link-danger:hover:not(:disabled){color:var(--dsw-alias-state-error-primary)}
.sc-desc{margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sc-meta{display:flex;flex-wrap:wrap;gap:6px}
.sc-tag{font-size:11px;line-height:16px;border-radius:999px;padding:1px 7px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary)}
.sc-tag-warn{color:var(--dsw-alias-state-warning-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-warning-primary) 40%,transparent)}
.sc-backdrop{position:fixed;inset:0;background:color-mix(in srgb,#000 35%,transparent);display:flex;align-items:center;justify-content:center;z-index:1100}
.sc-modal{width:min(640px,92vw);max-height:86vh;overflow:auto;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:10px}
.sc-modal h2{margin:0;font-size:15px}
.sc-field{display:flex;flex-direction:column;gap:4px;font-size:12px}
.sc-field input,.sc-field textarea,.sc-field select{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:8px;padding:8px 10px;font:inherit}
.sc-field textarea{min-height:220px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;resize:vertical}
.sc-modal-actions{display:flex;justify-content:flex-end;gap:8px}
.sc-drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:132px;padding:20px 16px;border:1.5px dashed var(--dsw-alias-border-l2);border-radius:12px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:20px;text-align:center;cursor:pointer}
.sc-drop:hover,.sc-drop[data-over=true]{border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 6%,transparent);color:var(--dsw-alias-label-primary)}
.sc-drop:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.sc-drop-sub{font-size:12px;color:var(--dsw-alias-label-tertiary)}
.sc-file-list{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}
.sc-file-item{display:flex;align-items:center;gap:8px;min-width:0;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-3)}
.sc-file-name{flex:1;min-width:0;font-size:13px;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sc-file-size{flex:none;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.sc-visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media (max-width:640px){
  .sc-row-head{flex-wrap:wrap}
  .sc-row-actions{width:100%;justify-content:flex-end}
}
@media (prefers-reduced-motion: reduce){
  .sc-btn,.sc-seg button{transition:none}
  .sc-btn-primary:active:not(:disabled),.sc-btn:active:not(:disabled){transform:none}
}
`
