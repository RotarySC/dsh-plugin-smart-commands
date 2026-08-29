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
  color: var(--dsw-alias-label-secondary, var(--dsw-alias-text-secondary, #6b7280));
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
  background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-module-platform, rgba(0, 0, 0, 0.05)));
  color: var(--dsw-alias-label-primary, var(--dsw-alias-text-primary, #111827));
}

.sc-prompt-trigger:focus-visible {
  box-shadow: 0 0 0 2px var(--dsw-alias-border-l3, #3b82f6);
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
  color: var(--dsw-alias-label-caption, #9ca3af);
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
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  border: 1px solid var(--dsw-alias-border-l1, var(--dsw-alias-border-subtle, rgba(0, 0, 0, 0.12)));
  border-radius: 10px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.15), 0 2px 6px rgba(0, 0, 0, 0.06);
  z-index: 1050;
  overflow: hidden;
  font-family: inherit;
  color: var(--dsw-alias-text-primary, #111827);
  box-sizing: border-box;
}

.sc-prompt-search-wrapper {
  padding: 8px 10px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, var(--dsw-alias-border-subtle, rgba(0, 0, 0, 0.08)));
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
  border: 1px solid var(--dsw-alias-border-l1, var(--dsw-alias-border-subtle, rgba(0, 0, 0, 0.15)));
  background: var(--dsw-alias-bg-canvas, #ffffff);
  color: var(--dsw-alias-text-primary, #111827);
  font-size: 12px;
  font-family: inherit;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.sc-prompt-search-input:focus {
  border-color: var(--dsw-alias-color-primary, #2563eb);
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
}

.sc-prompt-tabs-switch {
  display: inline-flex;
  align-items: center;
  background: var(--dsw-alias-bg-module-platform, rgba(0, 0, 0, 0.05));
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
  color: var(--dsw-alias-text-secondary, #6b7280);
  cursor: pointer;
  transition: all 0.15s ease;
  position: relative;
}

.sc-prompt-tab-icon-btn:hover {
  color: var(--dsw-alias-text-primary, #111827);
  background: var(--dsw-alias-bg-layer-hover, rgba(0, 0, 0, 0.06));
}

.sc-prompt-tab-icon-btn[data-active="true"] {
  background: var(--dsw-alias-bg-canvas, #ffffff);
  color: var(--dsw-alias-color-primary, #2563eb);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.sc-prompt-category-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--dsw-alias-bg-canvas-subtle, rgba(0, 0, 0, 0.02));
  border-bottom: 1px solid var(--dsw-alias-border-l1, var(--dsw-alias-border-subtle, rgba(0, 0, 0, 0.06)));
  overflow-x: auto;
  flex-shrink: 0;
  scrollbar-width: thin;
}

.sc-prompt-category-bar::-webkit-scrollbar {
  height: 4px;
}

.sc-prompt-category-bar::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 2px;
}

.sc-prompt-category-tab {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  background: transparent;
  color: var(--dsw-alias-text-secondary, #6b7280);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.12s ease;
  user-select: none;
}

.sc-prompt-category-tab:hover {
  background: var(--dsw-alias-bg-module-platform, rgba(0, 0, 0, 0.05));
  color: var(--dsw-alias-text-primary, #111827);
}

.sc-prompt-category-tab[data-active="true"] {
  background: var(--dsw-alias-color-primary, #2563eb);
  color: #ffffff;
  border-color: var(--dsw-alias-color-primary, #2563eb);
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
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  background: var(--dsw-alias-bg-module-platform, rgba(0, 0, 0, 0.05));
  color: var(--dsw-alias-text-primary, #111827);
  border: 1px solid var(--dsw-alias-border-l1, var(--dsw-alias-border-subtle, rgba(0, 0, 0, 0.08)));
  cursor: pointer;
  user-select: none;
  transition: all 0.12s ease;
  line-height: 1.4;
}

.sc-prompt-keyword-pill:hover {
  background: var(--dsw-alias-color-primary, #2563eb);
  color: #ffffff;
  border-color: var(--dsw-alias-color-primary, #2563eb);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);
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
  background: var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-layer-hover, rgba(0, 0, 0, 0.05)));
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
  color: var(--dsw-alias-text-primary, #111827);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sc-prompt-item-desc {
  font-size: 11px;
  color: var(--dsw-alias-text-secondary, #6b7280);
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
  background: var(--dsw-alias-bg-tag, rgba(0, 0, 0, 0.06));
  color: var(--dsw-alias-text-secondary, #4b5563);
}

.sc-prompt-badge-project {
  background: rgba(37, 99, 235, 0.1);
  color: var(--dsw-alias-color-primary, #2563eb);
}

.sc-prompt-badge-subagent {
  background: rgba(147, 51, 234, 0.1);
  color: #9333ea;
}

.sc-prompt-badge-chain {
  background: rgba(13, 148, 136, 0.1);
  color: #0d9488;
}

.sc-prompt-slash-pill {
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: var(--dsw-alias-text-tertiary, #9ca3af);
  background: var(--dsw-alias-bg-module-platform, rgba(0, 0, 0, 0.04));
  padding: 1px 5px;
  border-radius: 4px;
}

.sc-prompt-status-view {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  color: var(--dsw-alias-text-secondary, #6b7280);
  font-size: 12px;
  text-align: center;
}
`
