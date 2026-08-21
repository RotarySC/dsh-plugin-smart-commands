# 0001: Prompt Menu Dropdown in Composer Tool Row

## Context & Decision
To allow users to rapidly discover and invoke prompt templates directly from the DSH chat composer, we inject a prompt dropdown button into `conversation.input.left`.

When a template is selected:
1. The dropdown inserts `/<slashName> ` (or raw prompt content if unmapped) into the draft using `inputActions.setDraft`.
2. The menu popover is portaled to `document.body` with fixed/absolute positioning calculated from the trigger button's viewport bounding rect to avoid CSS clipping by composer overflow containers.
3. The popover provides combobox keyboard navigation (`ArrowDown`/`ArrowUp` to cycle, `Enter` to insert, `Escape` to dismiss).
4. Item rows render a clean, non-interactive visual indicator/pill for slash command names and origins on the right.
