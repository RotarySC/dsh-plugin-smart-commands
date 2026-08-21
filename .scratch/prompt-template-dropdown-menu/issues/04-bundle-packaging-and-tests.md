# 04 — Client Bundle Packaging & Automated Verification Suite

**What to build:**
Comprehensive unit/integration test suite covering prompt menu interactions, search filtering, draft setting, and focus lifecycle, alongside verified client build bundle packaging (`dist/client.js`) and typechecking.

**Blocked by:** 03 — Draft Insertion, Combobox Keyboard Navigation & Focus Restoration

**Status:** ready-for-agent

- [x] Write Vitest test suite (`tests/prompt-menu.spec.ts`) testing search queries, keyboard combobox selection, click selection, draft insertion with newline joins, and focus handling.
- [x] Run `npm run typecheck` across root and client configurations with zero errors.
- [x] Run `npm test` to ensure all existing and new tests pass.
- [x] Build production client bundle via `npm run build` and verify output in `dist/client.js` with no external bundle leakage.
