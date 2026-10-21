# Smart Commands & Chains

DeepSeek Harness 智能指令与链式工作流模板插件。

把一份 Markdown 文件放进目录，它就变成一个可复用的命令 —— **人和模型都能调用**。frontmatter 声明执行策略（模型、子代理、工具权限、多阶段 Chain），正文就是发给模型的提示词。

```
~/.dsh/commands/*.md            用户级
‹workspace›/.dsh/commands/*.md  项目级（同名覆盖用户级）
        │
        ▼
  TemplateLoader ──▶ CommandRunner ──┬──▶ /<name>            人类斜杠命令
                                     ├──▶ smart_command_run  模型工具调用
                                     └──▶ Web 设置面板 / 输入框菜单
```

---

## 核心特性

| 能力 | 说明 |
|---|---|
| **双调用路径** | 人类用 `/<name>` 直接跑；模型用 `smart_command_run` 工具调用。两者共用同一份模板，互不干扰 |
| **模型路由** | `model:` 声明候选模型列表，跨 provider 解析；全部不存在时回退到当前会话模型 |
| **条件渲染** | `<if-model is="...">` 按实际命中的模型切换提示词分支 |
| **子代理委托** | 一次性子代理、可续聊子代理（`send_message` 续接）、或借用 Persona |
| **Chain 工作流** | DAG 式多阶段流水线，支持并行步骤、并发上限、`{outputs.name}` 数据传递 |
| **Git worktree 隔离** | 并行改动在独立 worktree 中进行，避免互相踩踏 |
| **Web 界面** | 设置面板管理模板与关键词，输入框旁下拉菜单一键注入提示词 |

---

## 安装

```sh
# 从 npm 安装到指定 profile
dsh plugin --profile <name> add @deepseek-ai/dsh-plugin-smart-commands

# 从本地源码安装
dsh plugin --profile <name> add .
```

安装后重启该 profile 的 `dsh web` 进程，斜杠命令与 Web 界面即生效。

---

## 快速上手

创建 `~/.dsh/commands/review.md`：

```markdown
---
description: 代码审查
model: deepseek-reasoner, deepseek-chat
---

请审查以下变更范围: $@
```

重启后在会话里输入：

```
/review src/engine
```

或让模型直接调用 `smart_command_run`（`command: "review"`, `args: ["src/engine"]`）。

---

## 模板语法

### 目录与优先级

| 层级 | 路径 |
|---|---|
| 用户级 | `~/.dsh/commands/**/*.md` |
| 项目级 | `<workspace>/.dsh/commands/**/*.md` |

**项目级覆盖用户级**（按相对路径同名判断）。若两级目录解析到同一路径（工作区就是 `$HOME`、目录联接、或 Windows 大小写不敏感匹配），只扫描一次并拒绝项目级写入，避免自身覆盖自身。

解析失败的文件**不会**进入目录表，但会在 `smart_command_list` 的 `errors` 字段中报告，便于定位。

### frontmatter 字段

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `description` | string | *必填* | 命令描述，展示在 `/smart` 与工具清单中 |
| `model` | string | — | 逗号分隔的候选模型列表，见[模型路由](#模型路由) |
| `restore` | boolean | `true` | 仅会话内运行时：结束后恢复原会话模型 |
| `subagent` | boolean \| string | `false` | 委托模式，见[子代理](#子代理与上下文) |
| `continuable` | boolean | `false` | 等价于 `subagent: continuable` |
| `context` | `fresh` \| `fork` | `fresh` | 子代理是否继承当前对话上下文 |
| `tools` | `{allow, deny}` | — | 子代理工具白/黑名单 |
| `skills` | string[] | — | 注入的子代理技能 |
| `chain` | ChainStep[] | — | 多阶段流水线，见 [Chain 工作流](#chain-工作流) |
| `loop` | integer | `1` | 重复执行轮数，取值 1–99 |
| `converge` | boolean | `true` | 某一轮无文件改动时提前结束循环 |
| `worktree` | boolean | `false` | 在独立 git worktree 中执行 |

未知字段会**直接报错**而不是静默忽略，拼写错误不会被埋掉。

### 参数替换

调用时传入的参数按位置替换：

| 语法 | 含义 |
|---|---|
| `$1` `$2` … | 第 N 个参数 |
| `${@:2}` | 从第 2 个开始到末尾 |
| `${@:2:3}` | 从第 2 个开始取 3 个 |
| `$@` / `$ARGUMENTS` / `@$` | 全部参数（空格连接） |

参数解析支持单双引号，含空格的参数用引号包裹即可。

### 条件渲染

按**实际命中的模型**切换提示词分支，用于让同一份模板适配不同模型的能力差异：

```markdown
---
description: 跨模型代码审查
model: deepseek-reasoner, deepseek-chat
---
请审查以下变更范围: $@

<if-model is="deepseek-reasoner">
重点关注深层并发隐患、内存泄漏与算法时间复杂度。
<else>
重点关注代码规范、变量命名与常见边界缺陷。
</if-model>
```

- `is` 属性接受逗号分隔的多个 spec，命中任一即可
- 必须使用双引号；未知属性、重复属性、空 spec 列表都会报错

### 模型路由

`model:` 是**候选列表**，按顺序在**所有已注册的 provider** 中查找（不限于当前会话 provider），支持三种 spec：

| Spec 形式 | 示例 | 含义 |
|---|---|---|
| `id` | `deepseek-chat` | 任意 provider 下的该模型 |
| `provider/id` | `deepseek/deepseek-chat` | 限定 provider |
| `provider/*` | `deepseek/*` | 该 provider 下任意模型 |

若列表中的 spec **全部不存在**，命令**回退到当前会话模型**（有意设计，不是解析失败）。

### 子代理与上下文

`subagent` 决定由谁执行：

| 取值 | 行为 |
|---|---|
| `false`（默认） | **会话内**运行：渲染后的提示词作为用户消息注入当前会话 |
| `true` | 一次性子代理，持有独立上下文，完成后释放 |
| `continuable` | 可续聊子代理，返回 `subagentId`，后续用 `send_message` 续接 |
| 其他字符串 | 视为 DSH **Persona**（如 `reviewer`），一次性子代理并以该人格运行 |

`context: fork` 让子代理继承当前对话上下文；`fresh`（默认）从零开始。

```markdown
---
description: 开一个可续聊的子代理
subagent: continuable
context: fresh
---
请作为独立助手继续处理：$@
```

> `subagent` 的字符串取值是 **Persona**，不是 agent-preset。进程内子代理仍沿用父会话的 agent-preset，Persona 只覆盖 `deployment:persona`。

### 工具权限

限制子代理可用的工具，降低越权风险：

```yaml
tools:
  allow: ["read", "write", "edit", "grep", "glob", "lsp"]
```

### Chain 工作流

`chain` 把任务拆成多阶段 DAG。**顺序步骤**与**并行步骤**可混用：

```markdown
---
description: 先扫描漏洞，再并行修复，最后汇总验证
chain:
  - name: security_scan
    agent: scout
    model: deepseek-chat
    task: "全面扫描项目中与 $1 相关的安全漏洞与边界问题"
    as: "vulnerabilities"
  - name: parallel_fixes
    parallel:
      - agent: backend_fixer
        task: "根据漏洞清单修复后端 API 缺陷: {outputs.vulnerabilities}"
      - agent: test_writer
        task: "为暴露的漏洞编写针对性回归测试用例: {outputs.vulnerabilities}"
    concurrency: 2
    worktree: true
  - name: final_verification
    agent: reviewer
    model: deepseek-reasoner
    task: "汇总评估所有修复方案，输出最终补丁报告。\n前序综合产出:\n{previous}"
---
```

**顺序步骤字段**：`name` · `agent` · `model` · `task` · `as` · `outputMode`(`inline`\|`file-only`) · `reads` · `tools` · `context`

**并行步骤字段**：`name` · `parallel[]` · `concurrency` · `failFast` · `worktree`

**并行子任务字段**：`agent` · `model` · `task` · `as` · `tools` · `context`

**数据传递**：

- `{outputs.<as>}` — 引用前序步骤中 `as` 命名的产出，**必须指向更早且唯一**的 `as`
- `{previous}` — 引用前一步骤的综合产出

Chain 步骤的 `model:` 是**单个字符串**（不做 `provider/id` 拆分），直接作为该步骤的模型转发。

### 分离执行与运行面板

用斜杠命令执行 Chain 时，命令会**立即结算**，把链交给「分离运行」在后台执行 —— 输入框不会陪着整条流水线一起等待（DSH 的斜杠命令事务在 handler 结算前会锁定输入框）。进度与取消集中在**输入框上方的运行面板**：

- 面板**默认折叠**为一行（`链式运行` + 状态计数，如 `1 进行中 · 2 已完成`），点这一行展开步骤列表；展开状态在本次挂载期间保持。**折叠时看不到步骤与耗时** —— 这是刻意的：结算后的运行只占一行，需要细节就展开（DSH 自带的「任务」条同理）
- 展开后显示当前会话的运行：`轮次 x/y` · `步骤 i/N · 当前步骤名` · 耗时；运行中可直接**取消**（面板外观与 DSH 自带的「任务」「目标」条一致：同样的宽度、圆角、底色与操作按钮尺寸）
- 运行结束后可展开查看结果文本与变更文件；**打开过的运行会保留到你点「关闭」**，未打开的 90 秒后自动消失（宿主侧最多保留 20 条 / 10 分钟）。点「关闭」是**真的移除**：宿主随即从运行表删掉该行，切换会话、刷新页面、其它标签页都不会再出现。运行中的行**没有**关闭入口 —— 它承载着唯一的取消按钮，必须先取消。请注意：分离运行后链的**最终产出也显示在面板里**，命令卡片只记录「已启动」
- 取消只对本会话的运行生效；插件卸载时会中止全部未完成运行
- 非 Chain 模板保持同步语义；模型工具 `smart_command_run` 也始终同步返回，不进入面板

**运行结束回投汇总**：运行结算（成功 / 失败 / 取消）后，插件会向**发起该运行的会话**回投一条汇总消息（链名、状态、耗时、步骤账本、变更文件、最终产出），来源标记为 `smart-commands` 插件的 `notice` 上下文行。它同时解决两件事：链的产出**持久进入会话记录**（不再只存在于面板的保留窗口），以及会话获得一次 `turn/start`。代价是每次运行**多一轮主代理对话**，用 `smartCommands.notifyOnRunSettle: false` 可关闭（关闭后面板仍是唯一产出位置）。插件卸载时的批量中止**不回投**。

> **已知限制（DSH 侧行为，非本插件引入）**：**任何**会话只要首条输入是斜杠命令，就不会产生 `turn/start`，而侧栏对「空白会话」只在它是当前会话时才显示 —— 于是切走或刷新后该会话可能从列表消失，聊一句才稳定留存。回投汇总在**机制上必然**为该会话产生一次 `turn/start`，因此 Chain 场景应当不再落入该情形；但**这一点尚未做过端到端现场验证**（内部记录 §2.6 与待办 T6），`/smart`、`/compact` 等其它命令则确定仍会。该限制的完整调查与后续待办记录在维护者的内部笔记中，未随仓库分发。

---

## 斜杠命令

| 命令 | 作用 |
|---|---|
| `/smart` | 列出全部可用模板（不执行模板） |
| `/<name>` | 执行对应模板 |

`/smart` 与 `/help` 为**保留命令**，同名模板不会覆盖它们。

**名称映射**：宿主命令名必须匹配 `^[a-z][a-z0-9_-]*$`，编号/嵌套模板会被自动映射：

| 文件名 | 斜杠命令 |
|---|---|
| `001-research.md` | `/research` |
| `review/code.md` | `/review-code` |

模板增删或热重载时，斜杠命令会同步注册与注销。

---

## 模型工具

| 工具 | 用途 |
|---|---|
| `smart_command_run` | 执行模板或 Chain，支持 `overrides` 临时覆盖（model / context / subagent / loop …） |
| `smart_command_list` | 查询可用模板清单、参数与描述，含解析错误 |
| `smart_command_manage` | 动态创建 / 更新 / 删除模板 |

`smart_command_manage` **只写** `<workspace>/.dsh/commands`；用户级目录的写入仅通过设置界面进行。

---

## Web 界面

插件向宿主注册三个 UI 插槽：

| 插槽 | 位置 | 功能 |
|---|---|---|
| `settings.section` (`smart-commands`) | 设置页 | 模板目录管理：查看、编辑、复制、导入/导出、删除；关键词分类管理 |
| `conversation.input.left` (`smart-commands.prompt-trigger`) | 输入框工具栏 | 下拉菜单浏览模板、搜索、注入提示词到草稿，关键词一键追加 |
| `conversation.input.dock` (`smart-commands.runs`) | 输入框上方 | Chain 分离运行面板：进度、耗时、取消、结果展开 |

**导入/导出**：导出把勾选行打包为 zip（`user|project/<name>.md`）；导入支持点击或拖拽 `.md` / zip / JSON，选择目标层级后确认写入。

**关键词**：可复用片段（常用参数、模块路径等），点击即追加到输入框草稿末尾。存储在 `~/.dsh/keywords.json` 与 `<workspace>/.dsh/keywords.json`。

---

## 配置项

在宿主配置中覆盖（均为可选）：

| 配置 | 默认 | 说明 |
|---|---|---|
| `smartCommands.userTemplatesDir` | `~/.dsh/commands` | 用户级模板目录 |
| `smartCommands.projectTemplatesDir` | `.dsh/commands` | 项目级模板目录（相对工作区） |
| `smartCommands.maxChainSteps` | `10` | 单次 Chain 最大步骤数（防死循环） |
| `smartCommands.maxConcurrency` | `5` | 并行步骤最大并发数 |
| `smartCommands.notifyOnRunSettle` | `true` | 分离运行结束后向发起会话回投汇总（会附带一轮主代理回复，关闭可省下该轮） |

**委派深度**上限为 `maxDelegationDepth`（默认 `3`），超出的嵌套委派会被拒绝。

---

## 开发

```sh
npm install
npm run typecheck   # 同时检查宿主与 client 两套 tsconfig
npm test            # vitest
npm run build       # tsc + 打包 client bundle
```

### 目录结构

```
src/
├── index.ts        Cordis 插件入口（name / inject / apply）
├── plugin.ts       生命周期：loader + runner + 工具 + 斜杠命令
├── loader/         双目录目录表、YAML frontmatter 解析、关键词加载
├── engine/         模板渲染、模型路由、Chain 执行器、子代理桥接、runner
├── host/           DSH 适配层（subagents / invocation.agent）
├── tools/          三个模型工具
├── remote/         契约定义、Typert 网关、设置页目录 API
└── client/         Web UI 组件（打包为 dist/client.js）
```

`src/remote/contract.ts` 是端点契约的**唯一来源**，宿主、`./remote` 与 client `$mount` 三处绑定都从它派生。

### 修改后如何生效

| 改动范围 | 生效方式 |
|---|---|
| `src/client/` | `npm run build` 后**刷新**已打开的 `dsh web` 页面（另起 Vite 服务无效） |
| 其他 `src/` | `npm run build` 后**重启** `dsh web` 进程（宿主从 `dist/*.js` 加载） |

仅刷新浏览器只会重新加载 `dist/client.js`，不会更新宿主侧代码。

---

## 许可

MIT
