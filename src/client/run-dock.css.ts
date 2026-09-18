/**
 * Run panel skin.
 *
 * Deliberately not an invented style: every number here is copied from the
 * docks DSH itself puts in this slot — `TodoPanel.module.css` for the bordered
 * panel with a header and a scrollable list, and the queue dock's row for a
 * list entry carrying text, status, and 28px round actions. Widths use the same
 * composer variables, so the panel lines up with the 任务/goal bars instead of
 * spanning wider than them.
 */
export const RUN_DOCK_CSS = `
.sc-run-dock {
  box-sizing: border-box;
  width: calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));
  max-width: calc(var(--dsh-composer-card-max-width) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));
  border: 0.5px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.24));
  background: var(--dsw-specific-tip, rgba(127, 127, 127, 0.08));
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
  border-radius: 12px;
  flex: none;
  margin: 0 auto;
  overflow: hidden;
  font-size: 13px;
  line-height: 20px;
  font-family: inherit;
  color: var(--dsw-alias-label-secondary, inherit);
}

.sc-run-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 6px 12px;
}

.sc-run-head {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 0;
  background: 0 0;
  border: none;
  text-align: left;
  cursor: pointer;
  color: inherit;
  font-family: inherit;
}

.sc-run-head:focus-visible {
  outline: 2px solid var(--dsw-alias-label-tertiary, #8b949e);
  outline-offset: -2px;
  border-radius: 6px;
}

.sc-run-lead {
  flex: none;
  display: grid;
  place-items: center;
  color: var(--dsw-alias-label-tertiary, #8b949e);
}

.sc-run-title {
  flex: none;
  color: var(--dsw-alias-label-primary, inherit);
  font-size: 13px;
  font-weight: 500;
  line-height: 24px;
}

.sc-run-summary {
  min-width: 0;
  flex: auto;
  color: var(--dsw-alias-label-tertiary, #8b949e);
  font-size: 13px;
  font-weight: 400;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}

.sc-run-chevron {
  flex: none;
  display: grid;
  place-items: center;
  color: var(--dsw-alias-label-tertiary, #8b949e);
  transition: transform 0.12s ease;
}

.sc-run-chevron[data-collapsed='true'] {
  transform: rotate(180deg);
}

.sc-run-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 180px;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
}

.sc-run-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.sc-run-row {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
  height: 36px;
  padding: 4px 5px 4px 12px;
  border-radius: 8px;
}

.sc-run-glyph {
  flex: none;
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  color: var(--dsw-alias-label-caption, #8b949e);
}

.sc-run-spin {
  animation: sc-run-rotate 1s linear infinite;
}

.sc-run-row[data-status='running'] .sc-run-glyph {
  color: var(--dsw-alias-state-business-primary, #4a7dff);
}

.sc-run-row[data-status='succeeded'] .sc-run-glyph {
  color: var(--dsw-alias-state-success-primary, #2ea043);
}

.sc-run-row[data-status='failed'] .sc-run-glyph {
  color: var(--dsw-alias-state-error-primary, #d9534f);
}

.sc-run-name {
  flex: none;
  max-width: 40%;
  color: var(--dsw-alias-label-primary-dimmed, inherit);
  font-size: 13px;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}

.sc-run-phase {
  min-width: 0;
  flex: auto;
  color: var(--dsw-alias-label-tertiary, #8b949e);
  font-size: 13px;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}

.sc-run-time {
  flex: none;
  color: var(--dsw-alias-label-tertiary, #8b949e);
  font-size: 13px;
  line-height: 20px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.sc-run-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
}

.sc-run-action {
  box-sizing: border-box;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  padding: 0 8px;
  background: 0 0;
  border: none;
  border-radius: 999px;
  color: var(--dsw-alias-label-tertiary, #8b949e);
  font-size: 13px;
  line-height: 20px;
  font-family: inherit;
  cursor: pointer;
}

.sc-run-action[data-icon='true'] {
  width: 28px;
  padding: 0;
}

.sc-run-action:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.12));
  color: var(--dsw-alias-label-secondary, inherit);
}

.sc-run-action:focus-visible {
  outline: 2px solid var(--dsw-alias-label-tertiary, #8b949e);
  outline-offset: -2px;
}

.sc-run-detail {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 0 2px 26px;
  padding-top: 6px;
  border-top: 0.5px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.2));
}

.sc-run-error,
.sc-run-text,
.sc-run-files {
  margin: 0;
  font-size: 13px;
  line-height: 20px;
  white-space: pre-wrap;
  word-break: break-word;
}

.sc-run-error {
  color: var(--dsw-alias-state-error-primary, #d9534f);
}

.sc-run-text {
  max-height: 160px;
  overflow: auto;
  color: var(--dsw-alias-label-secondary, inherit);
}

.sc-run-files {
  color: var(--dsw-alias-label-tertiary, #8b949e);
}

@keyframes sc-run-rotate {
  to { transform: rotate(360deg); }
}
`
