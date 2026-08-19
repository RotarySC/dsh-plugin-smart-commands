# @deepseek-ai/dsh-plugin-smart-commands

DeepSeek Harness 智能指令与链式工作流模板插件。Markdown 模板既是提示词，也是执行策略：模型回退、会话还原、fresh/fork 子代理、工具裁剪、顺序/并行 Chain 与 Git worktree 隔离。

## 安装

```bash
npm install
npm run build
```

在 DSH / Cordis 组合中挂载：

```yaml
- name: '@deepseek-ai/dsh-plugin-smart-commands'
```

或本地开发：

```bash
dsh plugin link /path/to/dsh-plugin-smart-commands
```

入口是 Cordis 函数插件：`name` / `inject` / `apply`，没有 default export。真实 DSH 运行时是 `apply(ctx)`，不是过时指南里的 `activate(ExtensionContext)`。

## 模板位置

| 层 | 默认路径 | 优先级 |
| --- | --- | --- |
| 用户 | `~/.dsh/commands/**/*.md` | 低 |
| 项目 | `<workspace>/.dsh/commands/**/*.md` | 高，同名覆盖用户模板 |

目录变更通过 `fs.watch` 热重载。非法 YAML 在编译期报错，不会静默降级。

## Frontmatter

| 字段 | 默认 | 语义 |
| --- | --- | --- |
| `description` | 必填 | 列表与模型可见说明 |
| `model` | 当前会话模型 | 逗号分隔回退链 |
| `restore` | `true` | 执行后还原父会话模型 |
| `subagent` | `false` | `true` 或 persona 字符串则委托子代理 |
| `context` | `fresh` | `fresh` → `spawn`，`fork` → `fork` |
| `tools` | 全部允许 | `{ allow?, deny? }` |
| `skills` | — | 注入到委托提示 |
| `chain` | — | 多步骤流水线；正文可作为 `{task}` |
| `loop` | — | 1–99 轮 |
| `converge` | `true` | 一轮未改文件则提前结束 |
| `worktree` | `false` | 并行步使用临时 Git worktree |

参数：`$1`、`$@` / `$ARGUMENTS`、`${@:N}` / `${@:N:L}`。条件块：`<if-model is="id, provider/*">…<else>…</if-model>`。

Chain 占位符：`{task}`、`{previous}`、`{outputs.name}`。`as` 必须全局唯一，且只能引用更早步骤的输出。

示例见 `examples/`。把文件复制到 `.dsh/commands/` 即可使用。

## 工具

- `smart_command_run` `{ command, args?, overrides? }`
- `smart_command_list`
- `smart_command_manage` `{ action: create|update|delete, name, content? }`（只写项目目录）

人类命令：`/smart` 列出模板，`/smart <name> [args]` 执行。

## 配置

| 键 | 默认 |
| --- | --- |
| `smartCommands.userTemplatesDir` | `~/.dsh/commands` |
| `smartCommands.projectTemplatesDir` | `.dsh/commands` |
| `smartCommands.maxChainSteps` | `10` |
| `smartCommands.maxConcurrency` | `5` |

插件 `Config` 还可设 `maxDelegationDepth`（默认 3）、`spawnProvider`、`forkProvider`。

## 开发

```bash
npm test
npm run typecheck
```

公开 seam：模板加载、模板编译、Chain 校验/执行、子代理桥接（含模型回退与 restore）。

## 已知限制

- 工具裁剪依赖宿主 `ctx.subagents` 的 `toolFilter` 能力；本插件不自行调用 `tools.restrict()`。
- `delegationDepth` 由宿主子代理 seam 在 `start(..., { maxDepth })` 上强制；本插件拒绝超过配置上限的本层再委托。
- `fork` 只选择 fork provider，父会话快照由该 provider 读取。
- 模型回退匹配已注册/当前模型 id，不做在线鉴权探测。
- 尚无挂到真实 DSH 组合上的 E2E。
