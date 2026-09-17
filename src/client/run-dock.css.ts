export const RUN_DOCK_CSS = `
.sc-run-dock {
  box-sizing: border-box;
  width: 100%;
  background: var(--dsw-specific-input-major, rgba(127, 127, 127, 0.08));
  border: 0.5px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.24));
  border-radius: 12px;
  padding: 6px 8px 8px;
  font-size: 12px;
  line-height: 18px;
  font-family: inherit;
  color: var(--dsw-alias-label-primary, inherit);
}

.sc-run-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0 2px;
  color: var(--dsw-alias-label-secondary, inherit);
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  width: 100%;
  text-align: left;
}

.sc-run-head:focus-visible {
  outline: 2px solid var(--dsw-alias-label-tertiary, #8b949e);
  outline-offset: -2px;
  border-radius: 6px;
}

.sc-run-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--dsw-alias-state-business-tertiary, rgba(74, 125, 255, 0.16));
  color: var(--dsw-alias-label-primary-bluish, #4a7dff);
  font-size: 11px;
  font-weight: 600;
}

.sc-run-chevron {
  margin-left: auto;
  transition: transform 0.12s ease;
}

.sc-run-chevron[data-collapsed='true'] {
  transform: rotate(-90deg);
}

.sc-run-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}

.sc-run-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-base, rgba(127, 127, 127, 0.06));
  box-shadow: inset 0 0 0 0.5px var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.2));
}

.sc-run-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.sc-run-name {
  font-weight: 600;
  font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);
  color: var(--dsw-alias-label-primary, inherit);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 40%;
}

.sc-run-phase {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary, #8b949e);
}

.sc-run-time {
  margin-left: auto;
  flex: none;
  color: var(--dsw-alias-label-tertiary, #8b949e);
  font-variant-numeric: tabular-nums;
}

.sc-run-status {
  flex: none;
  padding: 0 6px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.12));
  color: var(--dsw-alias-label-secondary, #8b949e);
}

.sc-run-row[data-status='running'] .sc-run-status {
  background: var(--dsw-alias-state-business-tertiary, rgba(74, 125, 255, 0.16));
  color: var(--dsw-alias-label-primary-bluish, #4a7dff);
}

.sc-run-row[data-status='succeeded'] .sc-run-status {
  background: var(--dsw-alias-state-success-tertiary, rgba(46, 160, 67, 0.16));
  color: var(--dsw-alias-state-success-primary, #2ea043);
}

.sc-run-row[data-status='failed'] .sc-run-status {
  background: var(--dsw-alias-state-error-tertiary, rgba(217, 83, 79, 0.16));
  color: var(--dsw-alias-state-error-primary, #d9534f);
}

.sc-run-bar {
  height: 3px;
  border-radius: 2px;
  overflow: hidden;
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.16));
}

.sc-run-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--dsw-alias-label-primary-bluish, #4a7dff);
  transition: width 0.25s ease;
}

.sc-run-row[data-status='succeeded'] .sc-run-fill {
  background: var(--dsw-alias-state-success-primary, #2ea043);
}

.sc-run-row[data-status='failed'] .sc-run-fill {
  background: var(--dsw-alias-state-error-primary, #d9534f);
}

.sc-run-button {
  flex: none;
  height: 22px;
  padding: 0 10px;
  border-radius: 11px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.28));
  background: transparent;
  color: var(--dsw-alias-label-secondary, inherit);
  cursor: pointer;
  font-size: 11px;
  font-family: inherit;
}

.sc-run-button:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.12));
  color: var(--dsw-alias-label-primary, inherit);
}

.sc-run-button:focus-visible {
  outline: 2px solid var(--dsw-alias-label-tertiary, #8b949e);
  outline-offset: 1px;
}

.sc-run-detail {
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-top: 0.5px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.2));
  padding-top: 6px;
}

.sc-run-error {
  margin: 0;
  color: var(--dsw-alias-state-error-primary, #d9534f);
  white-space: pre-wrap;
  word-break: break-word;
}

.sc-run-text {
  margin: 0;
  max-height: 160px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  color: var(--dsw-alias-label-secondary, #8b949e);
}

.sc-run-files {
  margin: 0;
  color: var(--dsw-alias-label-tertiary, #8b949e);
  word-break: break-word;
}
`
