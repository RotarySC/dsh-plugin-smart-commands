# 0002: Draft Composition and Menu Data Lifecycle

## Context & Decision
For the prompt dropdown menu in the conversation composer:
1. **Draft Text Merging**: When inserting a template into an existing non-empty draft, the template command/prompt is inserted separated by a newline (`\n`), preserving the user's existing draft content rather than overwriting it destructively.
2. **Data Lifecycle & Caching**: Templates are fetched asynchronously via `remote.list({ workspaceRoot })` upon menu trigger open, using a fast in-memory cache with stale-while-revalidate to ensure instant rendering with fresh updates.
3. **List Presentation**: The menu displays a unified flat list sorted by relevance/name, with keyword search and distinctive badges for Origin (User/Project), Subagents, and Chains.
