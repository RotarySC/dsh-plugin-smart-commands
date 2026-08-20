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
- `src/plugin.ts` — `/smart` lists templates; each template also registers `/<name>`
- `examples/` — template samples, not loaded automatically
- `cordis.patch.yml` — profile bundle insert for `dsh plugin --profile <name> add`

Project templates override user templates of the same relative name. Invalid files are omitted from the catalog and reported on `smart_command_list.errors`; `smart_command_manage` still fails the write.

## Invariants

- Delegation deeper than `maxDelegationDepth` (default 3) is rejected.
- `{outputs.name}` must refer to an earlier unique `as`.
- Manage tools write only `<workspace>/.dsh/commands`.
- User slash commands `/<name>` are registered from the catalog and disposed on delete/reload. `/smart` and `/help` are reserved and are not overwritten by a template of the same name.
- Host command names must match `^[a-z][a-z0-9_-]*$`. Numbered/nested templates are mapped (`001-research` → `/research`, `review/code` → `/review-code`). `/smart` lists those mapped names and does not run templates.
- Template `model:` is resolved against every registered LLM provider (`listProviders` + `listModels`), not only the current session provider. If none of the listed specs exist, the command falls back to the current session model (`agent-default-model.provider/model`). Subagent runs pass both `provider` and `model`. `subagent` / `chain` paths do not `withModelOverride` the parent session; only in-session runs snapshot and restore.
- Official install is `dsh plugin --profile <name> add <package-or-path>`. The package must keep `dsh.bundle.patch` pointing at `cordis.patch.yml`; without it, add only installs a plain dependency.
- `cordis.patch.yml` must stay a plain `- insert:` of `id` + `name`. Extra `inject`/`config` rows make dshmarket treat the install as a non-bundle dependency even when `dsh.bundle` exists. Re-run `dsh plugin --profile <name> add .` from this checkout after adding the bundle declaration so an existing `link:` install is reconciled into `dsh.profile.bundles`.
- Cordis `ctx` is a proxy: reading an undeclared service (`ctx.workspace`, `ctx.commands`, …) throws `cannot get property "…" without inject` and aborts boot. Use `ctx.get(name, false)` for optional services. `inject` stays `['tools']`; `commands` is still late-bound through `ctx.inject(['commands'], …)`.
- Host `ctx.tools.register` requires `output: { schema, render, presentationMeta? }`. Forward that field from the adapter; omitting it aborts boot.
- `subagent: true` uses one-shot `ctx.subagents.start()` and disposes the run. `subagent: continuable` or `continuable: true` uses `startContinuable()` and returns `subagentId`; follow-ups are host `send_message`, not another `/command`.
