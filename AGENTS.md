# AGENTS.md — dsh-plugin-smart-commands

Standalone Cordis plugin. Entry is `src/index.ts` with named `name` / `inject` / `apply` and no default export.

## Commands

```sh
npm install
npm run typecheck
npm test
npm run build
```

`npm test` / Vitest may need host process spawn (esbuild). Do not treat a sandbox `EPERM` spawn as a product failure.

## Layout

- `src/loader/` — YAML frontmatter + dual-directory catalog
- `src/engine/` — args/`<if-model>`, model fallback+restore, chain DAG, runner
- `src/host/dsh-adapter.ts` — wraps DSH `ctx.subagents.start(name, request)`
- `src/tools/` — three model-facing tools
- `examples/` — template samples, not loaded automatically

Project templates override user templates of the same relative name. Invalid files are omitted from the catalog and reported on `smart_command_list.errors`; `smart_command_manage` still fails the write.

## Invariants

- Delegation deeper than `maxDelegationDepth` (default 3) is rejected.
- `{outputs.name}` must refer to an earlier unique `as`.
- Manage tools write only `<workspace>/.dsh/commands`.
