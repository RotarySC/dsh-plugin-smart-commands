export const PROMPT_MENU_CSS = `
.sc-prompt-menu-container {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.sc-prompt-trigger {
  min-width: 0;
  max-width: 220px;
  height: 28px;
  color: var(--dsw-alias-label-secondary, var(--dsw-alias-text-secondary, #8b949e));
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 24px;
  outline: none;
  align-items: center;
  gap: 4px;
  padding: 0 4px 0 8px;
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  display: inline-flex;
  user-select: none;
  transition: all 0.12s ease;
  font-family: inherit;
}

.sc-prompt-trigger:hover:not(:disabled),
.sc-prompt-trigger[data-active="true"] {
  background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-module-platform, rgba(255, 255, 255, 0.08)));
  color: var(--dsw-alias-label-primary, var(--dsw-alias-text-primary, #e6edf3));
}

.sc-prompt-trigger:focus-visible {
  box-shadow: 0 0 0 2px var(--dsw-alias-state-business-primary, #3b82f6);
}

.sc-prompt-trigger-icon {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.sc-prompt-trigger-icon svg {
  width: 14px;
  height: 14px;
}

.sc-prompt-trigger-label {
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  overflow: hidden;
}

.sc-prompt-trigger-arrow {
  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-caption, #6e7681));
  flex: none;
  transition: transform 0.12s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.sc-prompt-trigger-arrow svg {
  width: 14px;
  height: 14px;
}

.sc-prompt-trigger[data-active="true"] .sc-prompt-trigger-arrow {
  transform: rotate(180deg);
}

.sc-prompt-popover {
  position: fixed;
  width: 360px;
  max-width: calc(100vw - 24px);
  max-height: 380px;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-layer-1, #1e2228);
  border: 1px solid var(--dsw-alias-border-l1, var(--dsw-alias-border-subtle, rgba(255, 255, 255, 0.14)));
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35), 0 2px 6px rgba(0, 0, 0, 0.15);
  z-index: 1050;
  overflow: hidden;
  font-family: inherit;
  color: var(--dsw-alias-label-primary, var(--dsw-alias-text-primary, #e6edf3));
  box-sizing: border-box;
}

.sc-prompt-search-wrapper {
  padding: 8px 10px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, var(--dsw-alias-border-subtle, rgba(255, 255, 255, 0.08)));
  background: var(--dsw-alias-bg-canvas-subtle, transparent);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.sc-prompt-search-input {
  flex: 1 1 auto;
  min-width: 0;
  height: 30px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2, var(--dsw-alias-border-subtle, rgba(255, 255, 255, 0.15)));
  background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-canvas, rgba(255, 255, 255, 0.05)));
  color: var(--dsw-alias-label-primary, var(--dsw-alias-text-primary, #e6edf3));
  font-size: 12px;
  font-family: inherit;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.sc-prompt-search-input::placeholder {
  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-text-secondary, #6e7681));
}

.sc-prompt-search-input:focus {
  border-color: var(--dsw-alias-state-business-primary, var(--dsw-alias-color-primary, #3b82f6));
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25);
}

.sc-prompt-tabs-switch {
  display: inline-flex;
  align-items: center;
  background: var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-layer-3, rgba(255, 255, 255, 0.06)));
  border-radius: 6px;
  padding: 2px;
  gap: 2px;
  flex-shrink: 0;
}

.sc-prompt-tab-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, var(--dsw-alias-text-secondary, #8b949e));
  cursor: pointer;
  transition: all 0.15s ease;
  position: relative;
}

.sc-prompt-tab-icon-btn:hover {
  color: var(--dsw-alias-label-primary, var(--dsw-alias-text-primary, #e6edf3));
  background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-hover, rgba(255, 255, 255, 0.08)));
}

.sc-prompt-tab-icon-btn[data-active="true"] {
  background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-canvas, rgba(255, 255, 255, 0.12)));
  color: var(--dsw-alias-state-business-primary, var(--dsw-alias-color-primary, #3b82f6));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.sc-prompt-category-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--dsw-alias-bg-canvas-subtle, rgba(255, 255, 255, 0.02));
  border-bottom: 1px solid var(--dsw-alias-border-l1, var(--dsw-alias-border-subtle, rgba(255, 255, 255, 0.06)));
  overflow-x: auto;
  flex-shrink: 0;
  scrollbar-width: thin;
}

.sc-prompt-category-bar::-webkit-scrollbar {
  height: 4px;
}

.sc-prompt-category-bar::-webkit-scrollbar-thumb {
  background: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.2));
  border-radius: 2px;
}

.sc-prompt-category-tab {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  background: transparent;
  color: var(--dsw-alias-label-secondary, var(--dsw-alias-text-secondary, #8b949e));
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.12s ease;
  user-select: none;
}

.sc-prompt-category-tab:hover {
  background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-module-platform, rgba(255, 255, 255, 0.08)));
  color: var(--dsw-alias-label-primary, var(--dsw-alias-text-primary, #e6edf3));
}

.sc-prompt-category-tab[data-active="true"] {
  background: var(--dsw-alias-state-business-primary, var(--dsw-alias-color-primary, #2563eb));
  color: #ffffff;
  border-color: var(--dsw-alias-state-business-primary, var(--dsw-alias-color-primary, #2563eb));
}

.sc-prompt-keywords-grid {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 6px;
  padding: 10px;
  overflow-y: auto;
  flex: 1 1 auto;
  box-sizing: border-box;
}

.sc-prompt-keyword-pill {
  display: inline-flex;
  align-items: center;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-family: inherit;
  background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-module-platform, rgba(255, 255, 255, 0.06)));
  color: var(--dsw-alias-label-primary, var(--dsw-alias-text-primary, #e6edf3));
  border: 1px solid var(--dsw-alias-border-l2, var(--dsw-alias-border-subtle, rgba(255, 255, 255, 0.12)));
  cursor: pointer;
  user-select: none;
  transition: all 0.12s ease;
  line-height: 1.4;
}

.sc-prompt-keyword-pill:hover {
  background: var(--dsw-alias-state-business-primary, var(--dsw-alias-color-primary, #2563eb));
  color: #ffffff;
  border-color: var(--dsw-alias-state-business-primary, var(--dsw-alias-color-primary, #2563eb));
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(37, 99, 235, 0.35);
}

.sc-prompt-keyword-pill:active {
  transform: translateY(0);
}

.sc-prompt-list {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 4px;
  margin: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  box-sizing: border-box;
}

.sc-prompt-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  transition: background 0.1s ease;
}

.sc-prompt-item:hover,
.sc-prompt-item[data-highlighted="true"] {
  background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-module-platform, rgba(255, 255, 255, 0.08)));
}

.sc-prompt-item-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1 1 auto;
}

.sc-prompt-item-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sc-prompt-item-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, var(--dsw-alias-text-primary, #e6edf3));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sc-prompt-item-desc {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, var(--dsw-alias-text-secondary, #8b949e));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.3;
}

.sc-prompt-item-aside {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.sc-prompt-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
  background: var(--dsw-alias-bg-tag, rgba(255, 255, 255, 0.08));
  color: var(--dsw-alias-label-secondary, var(--dsw-alias-text-secondary, #8b949e));
}

.sc-prompt-badge-project {
  background: rgba(59, 130, 246, 0.18);
  color: var(--dsw-alias-state-business-primary, #60a5fa);
}

.sc-prompt-badge-subagent {
  background: rgba(168, 85, 247, 0.18);
  color: #c084fc;
}

.sc-prompt-badge-chain {
  background: rgba(20, 184, 166, 0.18);
  color: #2dd4bf;
}

.sc-prompt-slash-pill {
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-text-tertiary, #6e7681));
  background: var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-layer-3, rgba(255, 255, 255, 0.06)));
  padding: 1px 5px;
  border-radius: 4px;
}

.sc-prompt-status-view {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  color: var(--dsw-alias-label-secondary, var(--dsw-alias-text-secondary, #8b949e));
  font-size: 12px;
  text-align: center;
}

/* Fallback for light theme when DSH light tokens are active */
@media (prefers-color-scheme: light) {
  .sc-prompt-popover {
    background: var(--dsw-alias-bg-layer-1, #ffffff);
    border-color: var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12));
    color: var(--dsw-alias-label-primary, #111827);
  }
  .sc-prompt-keyword-pill {
    background: var(--dsw-alias-bg-layer-3, rgba(0, 0, 0, 0.04));
    color: var(--dsw-alias-label-primary, #111827);
    border-color: var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08));
  }
  .sc-prompt-search-input {
    background: var(--dsw-alias-bg-layer-3, #ffffff);
    color: var(--dsw-alias-label-primary, #111827);
    border-color: var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.15));
  }
}
`
