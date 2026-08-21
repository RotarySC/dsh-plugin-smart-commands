# 0003: Popover Presentation, Design Tokens, and Focus Management

## Context & Decision
To maintain interface polish, accessibility, and ergonomic keyboard navigation:
1. **Empty & Loading States**: Clean visual feedback for initial loading (`正在读取模板…`), empty inventory (`还没有模板`), and zero search matches (`无匹配模板`).
2. **Design Tokens & Theming**: Strict alignment with DSH CSS variables (`--dsw-alias-bg-*`, `--dsw-alias-border-*`, `--dsw-alias-text-*`) with resilient hex/rgb fallbacks for light and dark modes.
3. **Focus Lifecycle**: Search input is auto-focused on menu open; selecting a template or dismissing with Escape closes the popover and restores focus to the active chat composer textarea for immediate typing or dispatch.
