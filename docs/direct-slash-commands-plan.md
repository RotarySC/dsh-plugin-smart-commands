# 智能指令直接斜杠调用功能（`/<templateName>`）实现计划

## 1. 核心设计原则与背景

### 1.1 关键设计要点：用户直接触发 vs 模型间接调用
在当前的体系中，存在两种截然不同的触发途径：
1. **模型间接调用（Model Tool Call）**：
   - 依赖大模型（LLM）通过 Tool Calling 自行决定何时调用 `smart_command_run` 工具。
   - 流程中包含模型的推理判断和参数组装，容易受模型指令遵循能力影响。
2. **用户直接调用（Direct User Slash Command - 本次核心）**：
   - **完全绕过大模型的 Tool Calling 意图判断**。
   - 用户在 UI/CLI 聊天输入框输入 `/<templateName> [args]`（如 `/code-review src/`）后，直接由宿主命令路由捕获并分发执行。
   - 触发时直接执行模板解析、参数替换（`$1`、`$@`）、模型路由与子代理/流水线调度，确保**确定性执行**和**零延迟响应**。

---

## 2. 交互流转架构对比

```
[模式 A: 模型间接调用]
用户输入自然语言 ──> 主会话 LLM 推理 ──> 决定调用 smart_command_run ──> 插件执行模板

[模式 B: 用户直接调用 (本功能核心)]
用户输入 /<templateName> [args] ──> 宿主 Slash Command 系统拦截 ──> 插件 CommandRunner 直接执行 ──> 结果返回给用户
```

---

## 3. 架构设计与实现方案

### 3.1 斜杠命令动态生命周期同步 (Lifecycle Sync)
由于模板存放在用户目录 (`~/.dsh/commands`) 与工作区目录 (`.dsh/commands`) 中，且可能随时被新增、修改或删除，每个模板的直接斜杠命令需要与文件系统保持实时双向同步：

1. **注册表追踪 (`activeRegistrations: Map<string, () => void>`)**：
   维护当前已注册的 `templateName -> disposer` 映射表。
2. **Catalog 监听机制 (`loader.onChange`)**：
   当 `TemplateLoader` 触发重载或目录变动时：
   - **比对差异 (Diff)**：
     - **新增模板**：调用 `commands.register(...)` 动态挂载新的直接命令，并将其 disposer 存入 Map。
     - **删除/失效模板**：调用此前缓存的 disposer 从宿主命令系统中注销。
     - **更新模板**：重新注销旧命令并使用最新 frontmatter 中的 `description` 与参数提示重新注册。
3. **插件卸载清理 (`dispose`)**：
   当插件被销毁（或 Cordis 上下文 reload）时，统一注销所有已注册的直接模板命令以及目录监听器。

---

### 3.2 命名规范与冲突规避 (Naming & Sanitization)

1. **命名有效性**：
   - 模板支持子目录（如 `review/code.md` 对应的名称为 `review/code`）。
   - 宿主斜杠命令注册规则：若宿主命令系统支持含斜杠的命令名则直接注册；同时确保顶层命令标识符符合安全命名字符集 `^[A-Za-z0-9_/-]+$`。
2. **保留名防冲突**：
   - 保留关键字（如 `smart`、`help` 等）不覆盖原有核心指令。若存在同名模板 `smart.md`，保留根 `/smart` 路由调度，避免冲突。

---

### 3.3 命令注册元数据与 Handler 执行逻辑

每个动态注册的用户直接命令包含以下定义：
```typescript
commands.register({
  name: template.name,
  description: template.description,
  input: {
    // 根据模板正文中抽取的参数插槽生成提示，如 "$1 $2" 或 "[args]"
    hint: extractParameterSlots(template.body).join(' ') || '[args]'
  },
  handler: async invocation => {
    await runner.ready()
    // 解析用户在命令行直接输入的参数 tokens
    const tokens = parseCommandArgs(invocation.rawInput)
    // 直接启动 CommandRunner 执行，无需大模型 Tool Call 中转
    const result = await runner.run({
      command: template.name,
      args: tokens,
    }, invocation.signal, invocation.agent)

    return result.ok
      ? { kind: 'success', text: result.text }
      : { kind: 'error', text: result.error }
  }
})
```

---

### 3.4 Cordis 依赖注入适配 (`src/index.ts`)

兼容 Cordis 框架的延迟依赖注入：
- 当 `ctx.commands` 在启动时即就绪：直接在 `startSmartCommands(host)` 中完成初始化与注册。
- 当 `ctx.commands` 是通过 `ctx.inject(['commands'], ...)` 延迟注入时：在注入回调中挂载动态命令管理器，并将返回的 dispose 方法挂接至 `scoped.effect` 中，确保热插拔安全。

---

## 4. 影响范围与修改清单

| 文件路径 | 变更类型 | 详细修改内容 |
| :--- | :--- | :--- |
| `src/plugin.ts` | 核心逻辑 | 新增 `registerTemplateSlashCommands` 动态命令同步器；在 `startSmartCommands` 中集成。 |
| `src/index.ts` | 适配逻辑 | 完善 Cordis `ctx.inject(['commands'], ...)` 的绑定逻辑，支持动态命令监听注销。 |
| `tests/command-runner.spec.ts` | 单元测试 | 补充单测用例：验证模板直接以 `/<name>` 形式调用、动态创建模板后命令自动注册、删除后自动注销。 |
| `README.md` / `AGENTS.md` | 文档更新 | 补充用户使用文档，强调用户可直接在聊天框输入 `/<name>` 触发执行。 |

---

## 5. 验证与测试步骤

1. **代码编译与类型检查**：
   执行 `npm run typecheck`，确保 TypeScript 类型 100% 严格通过。
2. **单元测试与边界用例**：
   - 验证默认启动后已加载的模板（如 `review`、`pipeline`）自动注册 `/review`、`/pipeline` 命令。
   - 验证用户在命令输入框输入 `/review "src/auth.ts"` 时直接执行并正确替换 `$1` / `$@`。
   - 模拟执行 `runner.manage({ action: 'create', name: 'quick-test', ... })`，验证 `/quick-test` 命令实时可用。
   - 模拟执行 `runner.manage({ action: 'delete', name: 'quick-test' })`，验证 `/quick-test` 自动被注销。
3. **回归验证**：
   确保原有的 `/smart` 总命令、`smart_command_run` / `smart_command_list` / `smart_command_manage` 工具不受任何影响。

---

## 6. 后续提议：按需读会话模型，委托时不改父会话

现状是入口几乎总会读当前会话模型（`agent-default-model`），再拿模板 `model:` 去匹配。对 `/tel` 这类「写了具体 `model` + `subagent: true`」的路径，这次快照语义上用不到，却仍会执行。

建议只改有副作用的行为，不做大重构：

1. 模板有具体且可解析的 `model:` 时，直接用它，不必先拿会话模型当匹配池。
2. `subagent: true` 或存在 `chain` 时，**不要** `withModelOverride` 改父会话模型；只把 `provider` + `model` 传给子代理。父会话只在无 `subagent` 且需要切模型时才 snapshot / restore。
3. 模板没写 `model`，或写了但跨 provider 清单里都找不到时，再读会话模型当回退。

「全程不拍快照」可以以后再收。当前优先修的是：跨 provider 识别模板模型，以及模板模型不可用时回退会话模型。
