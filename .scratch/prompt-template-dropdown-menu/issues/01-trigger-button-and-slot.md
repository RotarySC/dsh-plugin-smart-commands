# 01 — Prompt Menu Trigger Button & Slot Registration

**What to build:**
A visible prompt template dropdown button (`[💬 提示词 ⌄]`) registered into the conversation composer toolbar (`conversation.input.left` slot) that seamlessly matches the host theme and toggles the open/closed state of the menu container.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] Add i18n localization entries (`promptButton`, `searchPlaceholder`, `noMatchingTemplates`, `loadingTemplates`) for `zh` and `en` in the locales definition.
- [x] Implement the prompt trigger button component and register it in `src/client/index.ts` under the `conversation.input.left` slot with order 20.
- [x] Style the trigger button using standard platform CSS custom properties (`--dsw-alias-bg-*`, `--dsw-alias-text-*`, `--dsw-alias-border-*`) for light and dark modes.
- [x] Wire open/closed toggle state on trigger click with appropriate chevron flip and active background state.
