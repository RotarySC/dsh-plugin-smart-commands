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

`graphify-out/` is a generated knowledge graph (`graph.html`, `GRAPH_REPORT.md`, `graph.json`). On Windows, AST extract must use `extract(..., parallel=False)`: ProcessPool re-imports the driver script and empties the graph.

## Layout

- `src/loader/` — YAML frontmatter + dual-directory catalog (execution overlay + uncollapsed inventory). If user/project dirs resolve to the same path (cwd/`workspaceRoot` is `$HOME`, junction, or case-insensitive Windows match), scan once as `user` and refuse project writes. Settings mutations send the GUI's current workspace path (`ctx.workspaces` + current session); `TemplateLoader.retargetProject` then points project templates at `<workspace>/.dsh/commands`.
- `src/engine/` — args/`<if-model>`, model fallback+restore, chain DAG, runner
- `src/host/dsh-adapter.ts` — wraps DSH `ctx.subagents.start(name, request)`
- `src/tools/` — three model-facing tools
- `src/plugin.ts` — `/smart` lists templates; each template also registers `/<name>`
- `src/remote/` — settings UI catalog API + optional Cordis `smartCommands` Typert gateway. Endpoint ids/methods/`typeSymbol`s live in `contract.ts`; host/`./remote` bind Zod from `schemas.ts`, the client `$mount` contribution binds hand-rolled parsers so the browser bundle stays Zod-free. `smartCommands/list` always takes `CatalogScope` (`workspaceRoot?`).
- `src/client/` — Web UI components (`settings.section` id `smart-commands` and `conversation.input.left` id `smart-commands.prompt-trigger`); bundled to `dist/client.js`. Editor/copy/import dialogs and prompt dropdown popovers must `createPortal` onto `document.body` with z-index above overlays (1000/1050); the settings panel uses `overflow: hidden`. The catalog is a selectable list, not a card grid. Project-origin tags show the workspace folder name (`sourceLabel`), not the generic「项目」label. Toolbar Export packs checked rows as a store-only zip (`user|project/<name>.md`). Import opens a drop-zone dialog (click or drag `.md` / zip / JSON), then a layer select and confirm; writes use the chosen origin. Prompt menu inserts slash commands into composer draft with `\n` join when draft exists.
- `examples/` — template samples, not loaded automatically
- `cordis.patch.yml` — profile bundle insert for `dsh plugin --profile <name> add`

Project templates override user templates of the same relative name. Invalid files are omitted from the catalog and reported on `smart_command_list.errors`; `smart_command_manage` still fails the write.

## Invariants

- Delegation deeper than `maxDelegationDepth` (default 3) is rejected.
- `{outputs.name}` must refer to an earlier unique `as`.
- Manage tools write only `<workspace>/.dsh/commands`. The settings page Remote (`smartCommands.write` / `copy` / `remove`) may write user or project when the UI sends `origin`.
- Settings UI is a `dsh.client` lazy-CJS factory at `exports["./client"]`. Host Typert artifacts live at `./typert` and `./remote`. `exports["./typert"]` must include a string `default` (typert-loader ignores `import`-only conditionals). Client `$mount`s `TYPERT_REMOTE` then reads Cordis service `remote.smartCommands` via `ctx.get` / `ctx.inject` — never `ctx.remote.smartCommands`. Host `inject` stays `['tools']`; `apply` constructs `SmartCommandsGateway` on the plugin root `ctx` and `ctx.inject(['typert'])` to `register(TYPERT)` so Gateway claims `/api/smartCommands/*`. Do not probe `ctx.reflect`. Do not add inject/config to `cordis.patch.yml`. Host/`./remote`/client `$mount` descriptors share `src/remote/contract.ts`; `list` includes `CatalogScope.workspaceRoot` so settings mutations retarget `<workspace>/.dsh/commands`. Host `deleteTemplate` keeps `implementation: 'remove'`; client descriptors omit that alias.
- Changing `src/client/` requires `npm run build` (or `build:client`) and a refresh of the existing `dsh web` URL; starting another Vite server does not update this GUI. Host `src/` (loader, engine, remote gateway) is loaded from `dist/*.js` into the `dsh web` Node process at boot — `npm run build` alone is not enough; restart that process. A browser refresh only reloads `dist/client.js`.
- User slash commands `/<name>` are registered from the catalog and disposed on delete/reload. `/smart` and `/help` are reserved and are not overwritten by a template of the same name.
- Host command names must match `^[a-z][a-z0-9_-]*$`. Numbered/nested templates are mapped (`001-research` → `/research`, `review/code` → `/review-code`). `/smart` lists those mapped names and does not run templates. Catalog identities (`assertTemplateName`) must accept those file stems — `^[A-Za-z0-9][A-Za-z0-9_/-]*$` — so settings `read`/`copy`/`export` work on numbered templates the loader already listed.
- Template `model:` is resolved against every registered LLM provider (`listProviders` + `listModels`), not only the current session provider. If none of the listed specs exist, the command falls back to the current session model (`agent-default-model.provider/model`). Subagent runs pass both `provider` and `model`. `subagent` / `chain` paths do not `withModelOverride` the parent session; only in-session runs snapshot and restore.
- Official install is `dsh plugin --profile <name> add <package-or-path>`. The package must keep `dsh.bundle.patch` pointing at `cordis.patch.yml`; without it, add only installs a plain dependency.
- `cordis.patch.yml` must stay a plain `- insert:` of `id` + `name`. Extra `inject`/`config` rows make dshmarket treat the install as a non-bundle dependency even when `dsh.bundle` exists. Re-run `dsh plugin --profile <name> add .` from this checkout after adding the bundle declaration so an existing `link:` install is reconciled into `dsh.profile.bundles`.
- Cordis `ctx` is a proxy: reading an undeclared service (`ctx.workspace`, `ctx.commands`, …) throws `cannot get property "…" without inject` and aborts boot. Use `ctx.get(name, false)` for optional services. `inject` stays `['tools']`; `commands` is still late-bound through `ctx.inject(['commands'], …)`. DSH `workspace` entities expose `path`, not `cwd`; `workspaceRootOf` also accepts `sandboxPolicy.workspaceRoot` before `process.cwd()`.
- Host `ctx.tools.register` requires `output: { schema, render, presentationMeta? }`. Forward that field from the adapter; omitting it aborts boot.
- `subagent: true` uses one-shot `ctx.subagents.start()` and disposes the run. `subagent: continuable` or `continuable: true` uses `startContinuable()` and returns `subagentId`; follow-ups are host `send_message`, not another `/command`.
