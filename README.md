# @deepseek-ai/dsh-plugin-smart-commands

DeepSeek Harness 智能指令与链式工作流模板插件。Markdown 模板既是提示词，也是执行策略：模型回退、会话还原、一次性 / 可续聊子代理、工具裁剪、顺序/并行 Chain 与 Git worktree 隔离。

人类斜杠命令由宿主直接触发，**不经过**主会话模型的 Tool Call。

## 安装

本包是 DSH profile bundle：`package.json` 声明 `dsh.bundle.patch`，`cordis.patch.yml` 把插件插入组合树。官方安装走 `dsh plugin`（在目标 profile 目录里转发给 pnpm，成功后按 `dsh.bundle` 写入 `dsh.profile.bundles`）。

本地路径（开发机）：

```bash
npm install
npm run build
dsh plugin --profile web add .
# 或绝对路径
dsh plugin --profile web add /path/to/dsh-plugin-smart-commands
```

已发布到 registry 后：

```bash
dsh plugin --profile web add @deepseek-ai/dsh-plugin-smart-commands
```

`add .` / 相对路径会按调用时的当前目录锚定，不要在 profile 目录里用裸 `.`。源码安装依赖 `prepare` 构建 `dist/`；若 pnpm 拦截生命周期脚本，把包名加进该 profile 的 `pnpm-workspace.yaml` `allowBuilds` 后重跑。

已通过 GUI / `link:` 装上但显示「未声明 dsh.bundle」时，先确认仓库里已有 `dsh.bundle.patch`，再在插件目录重跑一次：

```bash
dsh plugin --profile web add .
```

成功后 `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles` 应包含 `@deepseek-ai/dsh-plugin-smart-commands`，然后重启 web。`cordis.patch.yml` 必须是纯 `insert`（只有 `id` / `name`）；`inject` / `config` 会让 dshmarket 热挂载失败，并把插件误报成普通依赖。卸载：`dsh plugin --profile web remove @deepseek-ai/dsh-plugin-smart-commands`。

手工挂载（不走 `dsh plugin`）时，在组合里插入：

```yaml
- name: '@deepseek-ai/dsh-plugin-smart-commands'
```

入口是 Cordis 函数插件：`name` / `inject` / `apply`，没有 default export。真实 DSH 运行时是 `apply(ctx)`，不是过时指南里的 `activate(ExtensionContext)`。

## 模板位置

| 层 | 默认路径 | 优先级 |
| --- | --- | --- |
| 用户 | `~/.dsh/commands/**/*.md` | 低 |
| 项目 | `<workspace>/.dsh/commands/**/*.md` | 高，同名覆盖用户模板 |

目录变更通过 `fs.watch` 热重载。非法 YAML 在编译期报错，不会静默降级。

## 人类命令

| 输入 | 行为 |
| --- | --- |
| `/smart` | 列出已加载模板，并显示**可输入的斜杠名** |
| `/<name> [args]` | 宿主直接执行，不经过主模型 Tool Call |

DSH 宿主只接受 `/[a-z][a-z0-9_-]*`。模板文件名会先映射再注册：

| 模板文件 | 可输入命令 |
| --- | --- |
| `tel.md` | `/tel` |
| `001-research.md` | `/research`（去掉前导数字） |
| `002-code-review.md` | `/code-review` |
| `review/code.md` | `/review-code` |

`/smart` 只做目录，不执行模板；带参数时会提示改用 `/<name>`。列表里显示的是可输入的斜杠名。模板增删后斜杠命令会同步注册或注销。`/smart` 和 `/help` 是保留名，不会被同名模板覆盖。

## Frontmatter

| 字段 | 默认 | 语义 |
| --- | --- | --- |
| `description` | 必填 | 列表与模型可见说明 |
| `model` | 当前会话模型 | 逗号分隔回退链 |
| `restore` | `true` | 无子代理且切换了父会话模型时，执行后还原 |
| `subagent` | `false` | 见下方「谁来执行」 |
| `continuable` | `false` | `true` 时走可续聊子代理 |
| `context` | `fresh` | `fresh` → `spawn`，`fork` → `fork` |
| `tools` | 全部允许 | `{ allow?, deny? }` |
| `skills` | — | 注入到委托提示 |
| `chain` | — | 多步骤流水线；正文可作为 `{task}` |
| `loop` | — | 1–99 轮 |
| `converge` | `true` | 一轮未改文件则提前结束 |
| `worktree` | `false` | 并行步使用临时 Git worktree |

参数：`$1`、`$@` / `$ARGUMENTS`、`${@:N}` / `${@:N:L}`。条件块：`<if-model is="id, provider/*">…<else>…</if-model>`。

Chain 占位符：`{task}`、`{previous}`、`{outputs.name}`。`as` 必须全局唯一，且只能引用更早步骤的输出。

示例见 `examples/`。把文件复制到 `.dsh/commands/` 或 `~/.dsh/commands/` 即可使用。

### 谁来执行

| `subagent` / `continuable` | 谁跑 | 后续消息 |
| --- | --- | --- |
| 不写 / `false` | 当前这次对话 | — |
| `true` 或 persona 字符串 | 一次性子代理（`ctx.subagents.start()`，跑完 dispose） | 不支持 |
| `subagent: continuable` 或 `continuable: true` | 可续聊子代理（`startContinuable()`） | 用宿主 `send_message` 发给返回的 `subagentId` |

可续聊示例：`examples/continuable-chat.md`。`/command` 只负责**启动**子代理，返回类似：

```text
started continuable subagent <subagentId>
```

之后不要再跑一遍 `/command`。用 DSH 自带的 `send_message` 把后续内容发给这个 id。宿主若没有 `startContinuable`，命令会明确报错，不会静默退化成一次性。

`context` 只决定 spawn / fork，不决定一次性还是可续聊。

### 模型怎么选

`model:` 按从左到右匹配**所有已注册 provider**（`listProviders` + 各 provider 的 `listModels`），不限于当前会话正在用的那一家。

1. 模板没写 `model` → 用当前会话模型（`agent-default-model.provider/model`）。
2. 写了候选链 → 匹配 `provider/id`、裸 id、当前会话模型。
3. 跨 provider 都找不到 → **回退当前会话模型**，不再把模板里的无效 id 硬塞给 LLM。

子代理启动时会同时传 `provider` 和 `model`。有 `subagent` 时，模型给子代理用，默认不改父会话正在聊的模型。

## 工具

- `smart_command_run` `{ command, args?, overrides? }`
- `smart_command_list`
- `smart_command_manage` `{ action: create|update|delete, name, content? }`（只写项目目录）

这三个是给主模型用的 Tool Call。人类命令走上一节的斜杠入口，两者独立。

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

公开 seam：模板加载、模板编译、Chain 校验/执行、子代理桥接（一次性 `start` 与可续聊 `startContinuable`、模型回退）。

## 已知限制

- 工具裁剪依赖宿主 `ctx.subagents` 的 `toolFilter` 能力；本插件不自行调用 `tools.restrict()`。
- `delegationDepth` 由宿主子代理 seam 在 `start(..., { maxDepth })` 上强制；本插件拒绝超过配置上限的本层再委托。
- `fork` 只选择 fork provider，父会话快照由该 provider 读取。
- 模型清单来自宿主 `listProviders` / `listModels`，不做在线鉴权探测。
- 可续聊子代理的后续消息由宿主 `send_message` 投递，本插件不提供自己的 follow-up 命令。
- 尚无挂到真实 DSH 组合上的 E2E。
