# 03 — Draft Insertion, Combobox Keyboard Navigation & Focus Restoration

**What to build:**
Full interactive flow where picking a template inserts `/<slashName> ` (or template body) into the active composer draft (joining with newline `\n` if existing draft text exists), dismisses the popover, and returns DOM focus to the chat textarea. Includes full keyboard accessibility (ArrowDown, ArrowUp, Enter, Escape).

**Blocked by:** 02 — Template Inventory Fetching & Popover Searchable List

**Status:** ready-for-agent

- [x] Implement WAI-ARIA combobox keyboard navigation: `ArrowDown`/`ArrowUp` to cycle active highlight, `Enter` to select and insert, and `Escape` to dismiss.
- [x] Auto-focus the search input element when popover opens.
- [x] Implement draft composition: invoke `inputActions.setDraft` with `/<slashName> ` when draft is empty, or `<templateCommand>\n<existingDraft>` when non-empty.
- [x] Restore focus to composer `<textarea>` upon template insertion or popover dismissal.
- [x] Wire outside click listener to close popover when clicking outside trigger and popover elements.
