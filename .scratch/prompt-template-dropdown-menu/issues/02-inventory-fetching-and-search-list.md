# 02 — Template Inventory Fetching & Popover Searchable List

**What to build:**
A portal-mounted floating popover that asynchronously loads user and project templates via the remote client, displays them in a clean vertical list with metadata badges (origin, subagent, chain), and filters items in real-time as the user types in the search box.

**Blocked by:** 01 — Prompt Menu Trigger Button & Slot Registration

**Status:** ready-for-agent

- [x] Anchor popover via `createPortal` to `document.body` with fixed positioning calculated from trigger button viewport bounds to prevent overflow clipping.
- [x] Implement asynchronous template fetching on popover open via `remote.smartCommands.list({ workspaceRoot })` with in-memory caching.
- [x] Render template items with title, description, and metadata pills/badges (e.g. `/<slashName>`, project origin name, subagent/chain flags).
- [x] Add real-time search filtering across template names, slash commands, descriptions, and tags.
- [x] Handle loading state, zero search results state, and empty template directory state cleanly.
