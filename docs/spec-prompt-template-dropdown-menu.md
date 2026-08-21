# Feature Specification: Prompt Template Dropdown Menu in Chat Composer

## Problem Statement

When using DeepSeek Harness (DSH) in conversational sessions, users frequently need to recall and invoke prompt templates, subagent directives, and multi-step chain workflows. Currently, users must either memorize and manually type slash command identifiers (e.g. `/<name>`), navigate away to the settings panel to look up available templates, or manually copy and paste prompts. This creates friction, slows down repetitive tasks, and hampers discoverability of available project-level and user-level templates.

## Solution

A dedicated, accessible **Prompt Menu** dropdown button is integrated directly into the conversation input toolbar (`conversation.input.left`). 

When clicked, it opens a portal-mounted popover containing a live-filtering search box and a keyboard-navigable list of templates with real-time metadata indicators (origin badges, slash commands, subagent/chain tags). Selecting an item automatically executes a **Draft Insertion** into the composer textarea (joining with a newline if the draft already contains user input) and returns focus immediately to the composer, streamlining the prompt invocation flow.

## User Stories

1. As a conversation user, I want a visible "Prompt" button in the composer toolbar, so that I can discover available templates without leaving the chat view.
2. As a keyboard-first power user, I want to navigate the prompt dropdown using `ArrowUp`, `ArrowDown`, `Enter`, and `Escape`, so that I can quickly insert a template without touching the mouse.
3. As a developer with dozens of prompt templates, I want to type keywords in the prompt menu search box to filter by title, tag, command name, and description, so that I can locate the exact template within milliseconds.
4. As a user who has already typed part of my prompt/question into the composer, I want selecting a template to append or prepend intelligently using a newline separator, so that my existing draft text is preserved and not accidentally lost or overwritten.
5. As a user working in a multi-directory workspace, I want the prompt menu to show both project-level templates and user-global templates with clear visual origin badges, so that I understand where each command comes from.
6. As a user selecting a subagent or chain workflow template, I want the prompt menu to display subagent and chain indicators on the item row, so that I can distinguish autonomous workflows from plain prompt expansions before selecting.
7. As a user on a compact or narrow screen, I want the dropdown popover to be portaled above all other UI elements and not be clipped by scroll containers or input borders, so that the entire template list remains legible and interactive.
8. As a user in dark mode or high-contrast mode, I want the dropdown menu and trigger button to use the standard platform CSS design tokens (`--dsw-alias-*`), so that the interface looks native and visually coherent.
9. As a user who clicks outside the dropdown or presses `Escape`, I want the popover to dismiss cleanly and restore DOM focus to the chat textarea, so that I can continue typing uninterrupted.
10. As a user selecting a template, I want the menu to close and focus to return to the textarea immediately with the command ready to submit, so that I can press `Enter` to dispatch the prompt in one fluid sequence.
11. As a user when no templates are configured, I want to see a clear and friendly empty state message, so that I understand why the list is empty.
12. As a user opening the prompt menu after adding a new template file on disk, I want the menu to fetch the updated template inventory seamlessly, so that newly added templates appear without requiring a full browser refresh.

## Implementation Decisions

- **Slot Registration Seam**: Register the prompt menu component as a list entry in the `conversation.input.left` slot (with order 20, immediately adjacent to existing resident controls like Access Mode and Plan Mode) during client plugin activation.
- **Draft Insertion Behavior**: Draft updates are committed exclusively through the official `inputActions.setDraft(text)` method provided by the session kit. If the current draft is empty, it sets `/<slashName> ` (or raw template prompt if unmapped); if existing draft content is present, the template command is joined with `\n` to preserve user input.
- **Popover Positioning & Stacking**: Render the popover via `createPortal` anchored to `document.body` using runtime viewport coordinates derived from the trigger button's bounding rectangle (`getBoundingClientRect()`), with `z-index: 1050` to guarantee visibility above all composer layers and prevent overflow clipping.
- **Inventory Data Lifecycle & In-Memory Cache**: The template list is loaded via the Remote Client (`remote.smartCommands.list({ workspaceRoot })`) upon opening the dropdown, utilizing a lightweight in-memory cache with stale-while-revalidate to ensure instant rendering on subsequent openings while staying fresh.
- **Keyboard Combobox Standard**: Implement WAI-ARIA combobox navigation inside the popover: search `<input>` receives focus on open, `ArrowDown`/`ArrowUp` cycles active item highlighting, `Enter` inserts the highlighted template, and `Escape` dismisses the popover.
- **Focus Restoration**: Ensure seamless focus handoff back to the chat `<textarea>` DOM node upon template selection or popover dismissal.
- **Design System Tokens**: Style the trigger button, popover container, search bar, list items, and metadata badges using platform CSS custom properties (`--dsw-alias-bg-*`, `--dsw-alias-border-*`, `--dsw-alias-text-*`) with resilient color fallbacks.
- **Internationalization**: Register all user-facing strings (button text, search placeholder, empty state, loading state) under the `settings.smartCommands` namespace for English (`en`) and Simplified Chinese (`zh`).

## Testing Decisions

- **Testing Seams**: Test at the highest component and hook boundary using Vitest and DOM testing utilities:
  - **Prompt Menu Interaction & Draft Setter Unit Tests**: Verify that triggering the dropdown, filtering by search keywords, navigating via keyboard arrow keys/Enter, and clicking an item dispatches the expected string to `inputActions.setDraft` (both for empty drafts and non-empty drafts).
  - **Popover Dismissal & Focus Restoration Tests**: Verify `Escape` and outside click listeners correctly close the popover and invoke focus callbacks.
  - **Query Matching & Sorting Integration**: Test that `matchesCatalogQuery` and `filterInventory` accurately filter templates by name, slash command, description, and tags in the context of the dropdown.
  - **Typecheck & Bundle Integrity**: Ensure `npm run typecheck` passes cleanly across host and client tsconfig files, and client bundling produces zero-leakage, browser-ready CJS/ESM artifacts.
- **Prior Art**: Follows patterns established in `tests/catalog-query.spec.ts`, `tests/client-remote.spec.ts`, and `tests/cordis-apply.spec.ts`.

## Out of Scope

- Multi-select or batch insertion of multiple templates at once.
- Inline prompt editing or YAML frontmatter modification inside the dropdown (editing remains in the dedicated Settings section).
- Global keyboard shortcut configuration to trigger the dropdown without clicking the toolbar button (can be considered in future iterations).
- Custom template creation directly from within the popover.

## Further Notes

- Architecture Decision Records **ADR 0001**, **ADR 0002**, and **ADR 0003** document the underlying technical trade-offs and rationale.
- Domain terminology is maintained in `CONTEXT.md`.
