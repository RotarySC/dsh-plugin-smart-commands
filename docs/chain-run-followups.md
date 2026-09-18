# Chain 分离运行 —— 待办、备选方案与未决问题

> 本文件是 `feat/chain-run-projection` 分支的**续接工件**：记录已实现的行为契约、未决问题的定位结论、可选方案与待办清单。
>
> | 项 | 值 |
> |---|---|
> | 分支 | `feat/chain-run-projection` |
> | 已提交 HEAD | `00032ef`（**面板默认折叠 + §7.4 现场手册**；其下依次为 `546d167` 面板样式统一、`9ff19cd` 方案 A 回投、`6a2421f` 文档、`d0f2362` 面板、`837a858` 分离运行 —— 共 6 笔 / 39 文件） |
> | 未提交改动 | 本文件的 §8 快照与 §9 审查记录，以及分支审查后的修复（§9 列出） |
> | 验证状态 | `npm run typecheck` ✅ · `npm test` 189 用例 / 23 文件 ✅ · `npm run build` ✅ |
> | DSH 版本 | `0.1.6-alpha.1` |
>
> 证据标注约定：**【一手】**= 本文档作者直接读代码/解日志核对过；**【转述】**= 由调研子代理给出，行号未逐条复核；**【推测】**= 尚未验证的推断，附验证方法。
>
> **T1 已拍板：问题 A 走方案 A（运行结束回投汇总），已实现。** 详见 §5.1。

---

## 1. 背景：已完成什么

链式模板的斜杠命令原先在 handler 内同步跑完整条链才返回。DSH 的「claimed command」事务在 handler 结算前会锁住输入框（`InputState.phase` 为 `adjudicating`/`submitting` 时 `editable=false`），因此整条流水线期间输入框不可交互，而这不是链本身的需要——每个步骤本来就跑在独立子代理会话里。

已实现的 C 方向改动（含方案 A 回投）：

| 层 | 内容 | 位置 |
|---|---|---|
| 运行表 | 每次分离运行一个 `AbortController` + 步骤进度；纯 JSON 快照；保留 20 条 / 10 分钟 | `src/engine/run-registry.ts` |
| 执行 | `ChainExecutor.onStep` 上报步骤边界；`CommandRunner.startDetached()` 起跑即结算；`run(..., runId)` 把进度镜像进运行表 | `src/engine/chain-executor.ts`、`src/engine/command-runner.ts` |
| 命令路径 | 斜杠 handler：有 `agent.id` 且模板含 `chain` → 分离；否则保持阻塞语义 | `src/plugin.ts` |
| 远程 | `listRuns` / `cancelRun` / `dismissRun`（端点 7 → 9 → 10，`contract.ts` 单点传播三处绑定） | `src/remote/contract.ts`、`run-api.ts`、`gateway.ts` |
| UI | `RunDock` 挂 `conversation.input.dock`（id `smart-commands.runs`）：状态字形/状态·步骤/耗时/取消/结果展开/关闭 | `src/client/RunDock.tsx`、`run-view.ts`、`run-dock.css.ts` |
| **回投** | 运行结算后向会话回投汇总（方案 A）：`ChainRunRegistry` 的 `onSettled` 观察点 → `HostAgent.notify` → `Agent.followup` | `src/engine/run-registry.ts`、`run-summary.ts`、`command-runner.ts`、`host/dsh-adapter.ts` |

**运行面板的可见性规则**（`run-view.ts` 的 `visibleRuns`）：

- 运行中的行**永不隐藏**（它是唯一的取消入口）
- 未打开过的结束行 90 秒后自动消失
- 打开过（点了「结果」）的行保留到用户点 `×` 关闭
- 关闭 = **宿主侧移除**（`dismissRun` → `ChainRunRegistry.dismiss`）：从运行表删除，切换会话 / 刷新页面 / 其它标签页都不会再现。运行中的行**不给**关闭入口，宿主也拒绝 —— 它承载唯一的取消按钮，必须先取消
- 面板外观**沿用 DSH 自带 dock 的 token**（面板抄 `TodoPanel.module.css`，行抄队列 dock 的 36px 行 + 28px 圆形操作按钮），宽度用同一组 `--dsh-composer-*` 变量，因此与「任务」「目标」条对齐

**硬约束（不可违反）**：进度**不能**用自定义 session 事件承载。`Session.append` 没有 `ignorable` 入口，而持久化读路径拒绝未知且非 ignorable 的事件类型 → 会让该会话重启后打不开。`dsh-session-projection` 只折叠已提交事件，也承载不了实时进度。

---

## 2. 未决问题 A：新会话首条为斜杠命令时，该会话在侧栏不可见（**chain 场景已由方案 A 化解；其余斜杠命令仍存在**）

### 2.1 症状（用户报告）

1. 开启新会话 → 发送 chain 模板 → 切到其他会话或刷新页面 → **该会话消失**，不在记录中
2. 再点「新建会话」→ 该会话**「恢复」出现**
3. 之后只要再切换会话，它**又消失**
4. 要让它稳定留存，必须先用该会话进行**一轮正常对话**

### 2.2 结论

斜杠命令只写 `command/run` + `command/done` 两个 log-only 事件（DSH 有意设计），**永不产生 `turn/start`**；而「空白会话」标志 `blank` **只被 `turn/start` 翻转**。侧栏对 `blank` 会话只在它是当前会话时才显示。四个症状逐条由这一条规则解释：

| 症状 | 机制 |
|---|---|
| 切走后消失 | 不再是 current，且 `blank=true` → 被过滤 |
| 点「新建会话」又出现 | `startSession` 复用该工作区中已存在的 blank 会话（而非新建）并设为 current → 放行 |
| 再切走又消失 | 又不再是 current |
| 聊一轮才稳定 | `turn/start` 把 `blank` 翻成 `false` → 永久可见 |

**方案 A 落地后这条规则对 chain 场景不再触发**：运行结算时的回投汇总本身就是一次 `turn/start`，所以「首条输入是 chain 斜杠命令」的会话会自己离开 `blank`（机制上必然，见 §5.1 的【推测】标注——尚未做端到端现场验证）。其余斜杠命令（`/smart`、`/compact`…）仍完全落入上表。

### 2.3 代码证据（一手复核）

```js
// dsh-api-session-controller/lib/types/list.js:28-36   【一手】
export function applySessionListMetadata(state, event) {
    const blank = state.blank && event.type !== 'turn/start';        // ← 唯一翻转条件
    const lastPromptAt = event.type === 'user/message' && event.data.source.kind === 'user'
        ? event.time : state.lastPromptAt;                          // ← 命令事件不推进
    ...
}
```

```js
// dsh-client-ui-workspace/lib/client.js:395-397   【一手】
function sessionVisible(session, current, archived) {
  return session.origin !== "subagent" && !archived.has(session.id)
      && (!session.blank || session.id === current);
}
```

补充（【一手】grep 复核存在）：

- `dsh-client-ui-workspace/lib/client.js:1340` `const COLLAPSED_SESSION_LIMIT = 5;`，`:1346` 按非 blank 行计数 → **每个工作区分组默认只渲染 5 条非 blank 行**，其余进「展开(n)」；blank 行不占名额。
- `dsh-api-session-controller/lib/types/client/sessions/manager.js:863` `blank: existing.blank && mutation.summary.blank` → **客户端增量合并时 `blank` 只降不升**；`:878-882` 注释明确 `running:true` 兼任跨客户端 blank 翻转。

### 2.4 落盘实测（一手）

会话日志位于 `~/.dsh/sessions/<workspace-slug>/<sessionId>/session.v3.jsonl.zstd`，格式是**多帧 zstd 拼接，每帧 = 一次 drain/flush**（实时路径 200ms 合批）。

对 `session-11fe81f5-b07c-4c4f-b2a5-5fe7df026c65`（本工作区唯一跑过 `/chain-test` 的会话）逐帧解码：

| 观测 | 值 |
|---|---|
| 文件 | 57,052 B / **11 帧** / 28 事件 |
| 唯一 turn | `turn/start` ×1，`turn/end` reason = **`aborted:user`** |
| 模型输出 | `assistant/attempt` 的 `stream` 为**空数组**；`assistant/message` = **0** |
| 命令 | `command/run(name="chain-test")` + `command/done(kind=success)` |
| 子会话 | `subagent/catalog` ×5（prepare / probes#1 / probes#2 / summarize / verify） |
| `workspace.json` | 该工作区 `sessionIds[0]` 即它，workspace `updatedAt` = 它最后一次 flush 的时间 |
| 归档 | 未归档 |
| projcache 行 | `sessionListMetadata = {ver:1, seq:26, val:{"blank":false,"lastPromptAt":1789663096278}}`，`title = "123"` |

⇒ **「没落盘」「没登记」都被排除**；它同时说明 §2.5 的第 ① 条不是它的成因。

### 2.5 已被排除的解释

| # | 曾被提出的解释 | 判定 |
|---|---|---|
| ① | 「列表要求有 assistant 消息 / 完成的 turn」 | **错误**（本文档早期版本曾这么写）。列表行来源是目录扫描 ∪ 活会话，无此类过滤；唯一丢弃规则是 cold 行 `header.cwd === undefined` |
| ② | 「投影缓存决定成员」 | **错误**。projcache 只提供行内投影列；且 `session_projcache.json`(198 行) 既不含该链会话，**也不含当前可见的 `session-163ec6bb`** → 不是区分项 |
| ③ | 「无 turn 就不落库」 | **错误**。全库 340 份日志中有 12 份无 `turn/start` 却已落盘 |
| ④ | 「5 行折叠导致」 | 对 `session-11fe81f5` **暂不成立**（据子代理按其 `updatedAt` 排位第 2/4）；但作为**独立机制**确实存在（§2.3），在会话更多的分组里会独立藏行 |

### 2.6 仍待现场验证的一条分支

`session-11fe81f5` 的宿主 `blank=false`（§2.4），所以 §2.2 的规则**解释不了它**。剩余候选：

- **P2：客户端 `blank` 陈旧**。客户端 `blank` 只降不升（§2.3），而斜杠命令走的入口 `session.command(line)` → `remote.commands.execute(...)` 不产生 `engaged` / `status running` / `create-fork` upsert / 全量重拉这四条翻转路径中的任何一条 ⇒ **宿主已 `blank=false`，客户端可能仍停在 `true`**，于是按规则继续隐藏，直到用户聊一轮（`running`）或刷新（全量重拉）。**【推测】** 与"刷新后消失"也吻合（重拉/持久选择清理的时序）。
- **P1：5 行折叠**。`updatedAt = max(createdAt, lastPromptAt)`，命令事件不推进 `lastPromptAt` ⇒ 只跑命令的会话会随他人聊天缓慢下沉，最终落到第 6 名之后被折叠。**【转述】** 对该会话当前不成立。

**验证方法**（任一即可判定）：

1. 同一页面**不刷新**观察该会话是否一直隐藏，然后按 `F5`：刷新后出现 → 指向 P2（客户端陈旧）；刷新后仍无 → 指向 P1 或其它。
2. 在侧栏行过滤处临时打印 `summary.blank`（`sessionVisible` 入参）。
3. 检查侧栏排序模式与分组内可见行数（是否被折叠进「展开(n)」）。
4. 用 URL / 会话 id 直接打开该会话：置为 current 即应显示——这是**立即可用的临时规避**。

### 2.7 影响面与归属

- **影响面**：任何"会话首条输入是斜杠命令"的场景，**与本插件无关**（`/smart`、`/goal`、`/compact` 同理）。
- **归属**：**不是本分支引入的**。旧版 chain 同步执行产生的事件集合与现在完全相同（`command/run` + `command/done` + `subagent/catalog`，引用会话同样无 turn）；本插件不写任何 session 事件（AGENTS.md 不变式）。
- **不是"丢失"**：日志、标题、workspace 成员关系都在，只是侧栏行被隐藏。

---

## 3. 未决问题 B：链的最终产出只存在于运行面板 —— **已由方案 A 解决**

分离运行后，`command/done` 记录的文本是「Started `chain-test` (4 steps) in the background…」，改动前面板不存在时链的结果是直接作为命令结果返回的（在命令卡片与 notice 带里可见）。

方案 A 落地后，运行结算会向会话回投一条汇总（状态 / 耗时 / 步骤账本 / 变更文件 / 最终产出），它**写进会话日志**，因此不再依赖面板的保留窗口（前端 90 秒～手动关闭，宿主 10 分钟 / 20 条）。超出 `RUN_SUMMARY_OUTPUT_MAX_CHARS`（4000 字符）的产出会被截断并标注原长度；把 `smartCommands.notifyOnRunSettle` 关掉即回到"只有面板"的旧行为。

---

## 4. 未决问题 C：单次子代理模板仍未纳管

`subagent: true` / persona 字符串的单次子代理模板**仍在 handler 内等完整个子代理**（同类冻结，时长通常更短）。本轮只分离了 `chain` 模板。面板对它们没有多步骤可展示，但完全可以显示为"单步运行 + 取消"。**未实现，待决策。**

---

## 5. 备选方案

### 方案 A：运行结束时用 `followup()` 回投汇总消息（推荐）—— **已实现（§5.1）**

- **做法**：分离运行结算后（成功/失败/取消），由插件用 `invocation.agent.followup(createUserMessage(...))` 回投一条汇总（链名、状态、耗时、步骤结果、变更文件）。
- **收益**：① 会话获得 `turn/start` → `blank=false` → **问题 A 的规则路径被解除**；② 链的产出**持久进入会话记录**（解决问题 B）；③ 与 in-session 模板现有语义一致（那条路径本来就这么做）。
- **代价**：每次跑 chain **多一轮主 agent 对话**（token 成本；模型会回应这条汇总）。
- **风险**：低（复用既有适配器 `asHostAgent` → `submit`）。注意**不要**改成 `await whenIdle()`。
- **状态**：对问题 A 的规则路径有效（机制上必然产生 `turn/start`）；对 §2.6 的 P2 同样有效（客户端 `running` 帧会翻 blank）。

### 5.1 方案 A 的落地形态（一手）

| 决定 | 取值 | 为什么 |
|---|---|---|
| 观察点 | `ChainRunStartInput.onSettled`，由 `ChainRunRegistry.finish` / `cancel` 各触发一次 | 终态判定（"cancelled 是终态，finish 不会翻回来"）本来就在注册表里；放这里就不可能漏、也不可能重复 |
| `cancelAll` | **不触发** | 插件卸载会一次终止所有运行，逐个回投＝向正要卸载的会话各插一轮对话 |
| 消息来源 | `{ kind: 'plugin', plugin: 'smart-commands', form: 'notice', summary: 首行 }` | 诚实来源；transcript 渲染为 `smart-commands` 的**折叠上下文行**而不是用户气泡。`form: 'notice'` 与 `dsh-plan-mode` 的 narration、`kind:'plugin'` 与 `dsh-schedule` 的投递同形（两处先例都在 DSH 包内） |
| 传输 | `HostAgent.notify(text)`（与 `submit` 分开） | `submit` 是"用户的模板提示词"（`kind:'user'`、受 abort 保护）；`notify` 是"插件对已发生事实的报告"（不受 abort 保护，取消后仍要报告） |
| 文本 | `formatRunSummary(record)`，`ChainRunRecord` 的纯函数 | 无 host／无 agent／无时钟即可测；步骤账本、文件列表、产出截断全都有单测 |
| 开关 | `smartCommands.notifyOnRunSettle`，默认 `true` | 代价是实打实的一轮对话，必须能关 |
| 失败处理 | 注册表与 runner **双重** try/catch 吞掉 | 报告是建议不是结果：已经结算的运行不能因为描述它的消息而变成失败 |

**仍未验证的一点**【推测】：机制上必然产生 `turn/start`，但对 §2.6 的 P2（客户端 `blank` 陈旧）只能从"`running` 帧会翻转 blank"这条路径推断——需要现场跑一次 `/chain-test` 后切走／刷新来确认（并入 T6）。

### 方案 B：仅写文档 + 向上游报 issue

- **做法**：保持行为不变，把限制写进 README/AGENTS，并按 §5 方案 D 的位置向上游提 issue。
- **收益**：零行为变更、零 token 成本；把根因推给正确的层。
- **代价**：用户侧仍需"先聊一句"或从 URL 打开会话才能保住它。
- **状态**：**【一手】** 这是唯一"不改变产品语义"的路；但**不解决体验**。

### 方案 C：不做任何变更

- 只提交面板修复。会话可见性问题明确记为 DSH 上游行为，不处理。
- **代价**：问题 A 的用户可见症状保留。

### 方案 D（上游修复）：把已提交的 `command/run` 视为 engagement

- **位置**：`dsh-api-session-controller/lib/types/list.js:29`——
  `const blank = state.blank && event.type !== 'turn/start';`
  改为把已提交的 `command/run`（或任何非 seed 的 commit）也算作 engagement。
- **收益**：从根上修掉"命令会话在侧栏不可见"，对所有插件生效。
- **代价**：不在本仓库控制范围内，需要上游评审（可能涉及"blank"语义的产品决策）。

### 对比

| | A 回投汇总 | B 仅文档+issue | C 不处理 | D 上游修复 |
|---|---|---|---|---|
| 解决问题 A | ✅（规则路径，已落地） | ❌ | ❌ | ✅（根治，覆盖所有斜杠命令） |
| 解决问题 B | ✅（已落地） | ❌ | ❌ | ❌ |
| token 成本 | 每次 chain +1 轮（可关） | 无 | 无 | 无 |
| 行为变更 | 有（会话多一条消息） | 无 | 无 | 有（全局） |
| 可自行落地 | ✅ | ✅ | ✅ | ❌ |
| 工作量 | 中（host 改动 + 测试 + 文档） | 小 | 极小 | 上游 issue |

**建议组合（已执行）**：A（本插件落地）+ D（同时向上游提 issue，把根因留在正确的层修掉，见 T5）。A 不替代 D：它只覆盖 chain 模板，`/smart`、`/compact` 等首条输入的会话仍然会隐藏。

---

## 6. 待办清单

| # | 事项 | 类型 | 依赖 | 状态 |
|---|---|---|---|---|
| T1 | 裁定问题 A 走 A / B / C 哪个方案 | 决策 | — | ✅ **已拍板：方案 A** |
| T2 | 提交运行面板修复 + 方案 A | 提交 | T1 | ✅ **已完成**（`9ff19cd`，23 文件） |
| T3 | 方案 A：`startDetached` 结算后回投汇总 + 测试 | 实现 | T1 | ✅ **已完成**（`onSettled` → `notify`；新增 25 个用例：`6a2421f` 156 → `9ff19cd` 181） |
| T4 | README 与 AGENTS 补充"新会话首条用斜杠命令"的限制 | 文档 | T1 | ✅ **已完成**（README「分离执行与运行面板」+ AGENTS 不变式两条） |
| T5 | 向上游提 issue：`list.js:29` 未把 `command/run` 视为 engagement | 上游 | — | 挂起（方案 A 不替代它：其它斜杠命令仍会隐藏会话） |
| T6 | 现场验证：方案 A 是否真的让 chain 会话稳定留存；并分离 P2（客户端 blank 陈旧）vs P1（5 行折叠） | 验证 | 需用户配合：重启 `dsh web` → 新会话跑一次 `/chain-test` → 切走／刷新观察 | 挂起（**现在含方案 A 的端到端确认**） |
| T7 | 决定是否把 `subagent: true` / persona 的单次子代理也纳入分离运行（问题 C） | 决策 | — | 挂起 |
| T8 | （可选）与 `dsh-schedule` 对齐，在命令后调用 `ctx.sessions.flush(session)` | 实现 | — | **不建议**：flush 只影响落盘时序/屏障，**改变不了可见性**，解决不了问题 A；方案 A 已用另一条路径解决 |
| T9 | （可选）把测试链模板 `.dsh/commands/chain-test.md` 提升为 `examples/` 中随仓库分发的样例 | 文档 | — | 挂起 |
| T10 | 面板轮询健壮性：`await load()` 加超时并在超时后**继续排下一次**；把最近一次运行列表缓存到 `sessionStorage`，重挂载时先渲染"上次已知（可能过期）"而不是整条消失 | 实现 | 本次事故 | 挂起（用户选 C 先抓现场，改了会掩盖症状，故**暂不做**） |
| T11 | 把"入站请求通路停摆"(§7.4) 与 `list-children.js` 的静默丢弃路径一并上报上游 | 上游 | §7.4 取证 | 挂起 |
| T12 | 把"亮色下 `--dsw-alias-label-tertiary` on `--dsw-specific-tip` = 3.42:1（AA 需 4.5）"上报上游。本插件**刻意保持与 DSH 自带 dock 一致**（`TodoPanel` 用同一配对，暗色 5.67:1 达标），故不在本仓改 token —— 详见 §9 | 上游 | — | 挂起（用户拍板：不改本仓） |
| T13 | `RunDock` 关闭按钮把焦点节点从名册移除且无焦点转移/播报（审查列为 pre-existing） | 实现 | — | 挂起（需可渲染环境验证，盲改有风险） |

---

## 7. 复现与取证手册

### 7.1 会话日志容器格式

`session.v3.jsonl.zstd` 不是单个 zstd 流，而是**多帧拼接**（每次 drain 一批事件写一帧，实时路径 200ms 合批）。这解释了「文件 57KB 却只解出一行 `{"session":1}`」——`zstdDecompressSync` / 流式解码都只吃第一帧。**必须按 magic 切帧**：

```js
// node -e '...'  （按 zstd magic 0x28B52FFD 切帧后逐帧解压）
const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const offs = []; let i = 0;
while (true) { const k = buf.indexOf(magic, i); if (k < 0) break; offs.push(k); i = k + 1; }
for (let n = 0; n < offs.length; n++) {
  const slice = buf.subarray(offs[n], n + 1 < offs.length ? offs[n + 1] : buf.length);
  try { text += zlib.zstdDecompressSync(slice).toString('utf8') } catch {}   // 假边界直接跳过
}
```

### 7.2 取证路径

| 目的 | 路径 |
|---|---|
| 会话日志 | `~/.dsh/sessions/<workspace-slug>/<sessionId>/session.v3.jsonl.zstd` |
| 工作区成员与归档 | `~/.dsh/storages/workspace.json`（`tables.workspaces.<wsId>.sessionIds`、`global.archivedSessionIds`） |
| 列表行投影 | `~/.dsh/storages/session_projcache*.json`、`session_projcache_archive_manager_v2/sessions/*.json` |

### 7.3 代码证据索引

| 行号 | 内容 | 复核 |
|---|---|---|
| `dsh-api-session-controller/lib/types/list.js:28-36` | `blank` 只被 `turn/start` 翻转 | 一手 |
| `dsh-client-ui-workspace/lib/client.js:395-397` | `sessionVisible`：`!blank \|\| id === current` | 一手 |
| `dsh-client-ui-workspace/lib/client.js:1340/1346` | 每分组默认 5 条非 blank 行 | 一手 |
| `dsh-api-session-controller/lib/types/client/sessions/manager.js:863` | 增量合并 `blank` 只降不升 | 一手 |
| `dsh-client-ui-workspace/lib/client.js:44-60, 81-96` | `startSession` 复用 blank 会话 | 转述 |
| `dsh-api-session-controller/lib/types/client/sessions/session.js:292-297` | `command(line)` 不触发 blank 翻转 | 转述 |
| `dsh-commands/lib/index.js:327-421` | 命令生命周期为 log-only append | 转述 |
| `dsh-session-persistence-jsonl/lib/index.js:186-193, 408-412` | 实时落盘 200ms 合批、每批一帧 | 转述 |
| `dsh-session-persistence/lib/types/index.d.ts:123-134` | `sessionPersistence.flush()` | 转述 |
| `dsh-schedule/lib/types/persistence.js:19-29` | schedule 在 append 后显式 flush（先例） | 转述 |
| `dsh-agent-loop/lib/index.js:783-797` | `Agent.followup` = `send(msg, 'next-turn', true)`；任何 phase 下发都只做排队＋wake，**不需要 `runMaintenance`**（schedule 用它是为了让"读-决策-投递"原子化） | 一手 |
| `dsh-llm/lib/types/message.d.ts:94-104` | `MessageSourceMap.plugin = { kind: 'plugin', plugin: string } & ContextFormed`：插件消息是被支持的一等来源 | 一手 |
| `dsh-llm/lib/types/message.d.ts:110-116` | `CONTEXT_SUMMARY_MAX_CHARS = 120`（notice summary 的界） | 一手 |
| `dsh-schedule/lib/types/runtime.js:236-240` | 插件投递先例：`createUserMessage({ content, source: { kind: 'plugin', plugin: 'schedule' } })` + `agent.followup` | 一手 |
| `dsh-plan-mode/lib/types/index.js:408-412` | 插件 notice 先例：`source: { kind: 'plugin', plugin: 'plan-mode', form: 'notice', summary: text }` | 一手 |
| `dsh-client-ui-chat/lib/client.js:4227-4239` | `kind:'plugin'` → transcript 行 role 为 `inject`、label 取 `plugin` 字段（即渲染为上下文行而非用户气泡） | 一手 |

### 7.4 「请求通路停摆」现场抓取手册（方案 C）

**适用症状**：面板变空/变旧、发消息不推进轮次（像断网 IM），但界面本身还能点（能切会话、能开弹层）。

**结论先说：卡住时不要立刻重启服务。** 重启会抹掉唯一能区分"客户端侧"和"宿主/通路侧"的证据。

现场按顺序做四件事，每件都记下时刻：

1. **看 `dsh web` 终端**：有没有未捕获异常/栈（宿主若是"事件循环被同步占死"，往往同时 100% CPU；若是 await 死等，则 CPU ≈ 0）。
2. **新开一个浏览器窗口**访问 `http://127.0.0.1:3080`（不是新标签页）：
   - 新窗口正常 → **旧标签页/客户端侧**（旧页的 WS 或重连任务挂住）；
   - 新窗口同样死 → **宿主或通路侧**。
3. **任务管理器看 `node.exe` CPU**：100% → 同步死循环；≈0% → 死等（await 永不 settle）。
4. **在旧标签页按 F5 刷新**：刷新后立刻正常 → 客户端侧；仍旧不答 → 宿主/通路侧。

事后把这些磁盘证据交给我（都能复现分析）：

| 检查 | 做法 | 判定 |
|---|---|---|
| 请求是否被宿主受理 | 扫全库会话日志里时间段内有没有 `agent/inbox/spliced` / `user/message` | 没有 ⇒ 请求**从未抵达宿主**（客户端侧或通路侧），不是"受理后卡住" |
| 宿主是否还活着 | 同一时间段内有没有 `session/end-seed`（空闲会话卸载是宿主定时器在跑） | 有 ⇒ 进程活着、定时器在转 |
| 客户端是否还活着 | 卡住期间能否切换会话/开弹层 | 能 ⇒ 标签页没死 |
| 是否是机器级故障 | `Kernel-Power` 41 / `WHEA-Logger` / BugCheck(1001) 是否落在窗口内 | 落在窗口内 ⇒ 先修机器，别改代码 |
| 面板的"旧数据"从哪来 | 子代理目录 RPC 失败时客户端保留 `previous.entries`，所以列表停在"上一次成功抓取"那一刻 | 列表只有 `prepare` ⇒ 上次成功在链刚起步时 |

**2026-09-18 那次事故的记录（供对照，勿重复推导）**：

- 链 08:07:02 起跑、**08:08:22.407** 结算并回投；回复 turn **08:08:27.346** 结束（notifier 最后一条通知 08:08:27.350）。
- **08:08:27 → 08:13:35 全库零事件**；用户在现场发送的消息**在磁盘上无任何痕迹**（该会话日志完整到 08:21:24 的 end-seed）。
- **08:13:35–47 六个会话被逐个 end-seed**（跨 3 个工作区，间隔约 2 秒，之前无活动）⇒ 宿主进程与定时器当时都在跑。
- 08:21:20 / 08:23:17 两次 `dsh web` 启动（用户重启）。
- 无机器级故障：窗口内无 WHEA/BugCheck/Kernel-Power 41；唯一一次非正常关机是当天 00:46:49（06:57 开机），与本次无关。08:22 那批 WER 是**旧转储补报**。
- 因此：**不是我的面板逻辑**（90 秒 TTL 与作用域都已排除：结算后仅 31 秒，且两次验证作用域正确），而是**入站请求通路在链结束约 1 秒后停摆**。相关性很高，因果未证。

**我自己代码里已确认的健壮性缺口（与本次根因无关，但会放大症状）**：`RunDock` 的轮询 `await load()` 一旦永不返回，就**不会再排下一次**（也没有缓存兜底），所以通路一断，面板会一直黑到页面刷新或重挂载。修法见待办 T10。

---

## 8. 状态快照与续接方式

**已提交**（分支 `feat/chain-run-projection`）：

```
00032ef feat(client): start the run panel collapsed                        ← 本轮：默认折叠 + §7.4 手册
546d167 fix(client): match the run panel to DSH's dock style and make close stick
9ff19cd feat(runs): report settled chain runs back into their session
6a2421f docs: document detached chain runs and the run dock
d0f2362 feat(client): add the chain run dock
837a858 feat(host): run chain templates as detached runs
9480b5f chore: derive typert test order from the contract      ← 曾合入 master
```

`9ff19cd` 的内容分组：

```
面板修复   src/client/{RunDock.tsx, run-dock.css.ts, run-view.ts, icons.tsx, locales.ts}
           tests/run-view.spec.ts
方案 A     src/engine/{run-registry.ts, run-summary.ts, command-runner.ts}
           src/host/dsh-adapter.ts
           src/types/{host.ts, runs.ts}
           src/plugin.ts、src/run-format.ts、package.json
           tests/{run-summary.spec.ts, run-format.spec.ts, run-registry.spec.ts,
                  command-runner.spec.ts, dsh-adapter.spec.ts}
文档       README.md、AGENTS.md、docs/chain-run-followups.md（本文件）
```

`546d167` 的内容分组（面板样式统一 + 「关闭」真正生效）：

```
UI 重做    src/client/{RunDock.tsx, run-dock.css.ts, icons.tsx, run-view.ts}
           —— 面板抄 TodoPanel（0.5px 边框 / --dsw-specific-tip / 12px 圆角 /
              宽度 calc(--dsh-composer-*) / 字形+标题+计数头部），行抄队列 dock
              （36px、13px 文本、28px 圆形操作按钮）；进度条换成状态字形
              （spinner/对勾/叉/横杠），绿色 2px 条与带边框药丸按钮删除
新端点     src/remote/{contract.ts, schemas.ts, run-api.ts, gateway.ts}
           src/typert.host.ts、src/typert.remote-client.ts
           src/types/runs.ts、src/engine/run-registry.ts（dismiss）
           src/client/{remote-contribution.ts, SmartCommandsSection.tsx}
测试       tests/{run-view.spec.ts, run-registry.spec.ts, run-api.spec.ts, client-remote.spec.ts}
文档       README.md、AGENTS.md、本文件
```

`00032ef` 的内容分组（面板默认折叠 + 现场抓取手册）：

```
UI        src/client/RunDock.tsx（collapsed 默认 true —— 头部即摘要，结算后只占一行）
文档      README.md、AGENTS.md、本文件（§7.4 手册 + T10/T11 + 本快照）
```

> §8 的这张表是**指示性**的（每次提交后由当轮回填）：若与 `git log --oneline` 不一致，**以 `git log` 为准**。

**本地（gitignored，不入库）**：`.dsh/commands/chain-test.md` —— `/chain-test` 测试链（4 步约 45 秒；顺序 + 并行 2 路；`as`/`{outputs.x}`/`{previous}` 绑定；body 内写有把 `loop` 改 2 验证轮次、给第 2 步加 `worktree true` 验证隔离工作树的改法）。

**续接方式**：T5/T11 上游、T6 现场验证、T7 决策、T9 可选、T10 面板健壮性（等 C 抓到现场后再决定改法）。§7.4 是卡死时的现场手册——**先别重启**，四步取证后再重启。老 T6 的验证顺序：重启 `dsh web` → 新建会话 → 跑一次 `/chain-test` → 等面板结算 → 看会话里是否出现 `smart-commands` 上下文行 → 切走／刷新看会话是否仍在列表。若会话仍消失，则 §2.6 的 P1/P2 分支需要现场打印 `summary.blank` 来分离。**关闭按钮的验证同样是宿主侧行为**（`dismissRun` 在宿主进程里），只刷新页面验证不了。

---

## 9. 分支审查（`9480b5f..HEAD`）与修复记录

2026-09-18 由三轴并行审查（Standards / Spec / Interface，Interface 走 `interface-review` → `better-interface` full 模式）覆盖全部 6 笔提交、39 文件。**已核实**：`master` 正指向 merge-base `9480b5f`，合并是 fast-forward，无冲突；`npm run typecheck` ✅、`npm test` 189/23 ✅、`dist/client.js` 的 mtime 比 HEAD 早 37 秒且含 `collapsed=true`。

### 9.1 已修（本轮的未提交改动）

| # | 轴 | 问题 | 修法 |
|---|---|---|---|
| 1 | Standards | `dsh-adapter.ts` 重写了 `firstLine`，且 120 上界被声明两次（`NOTICE_SUMMARY_MAX_CHARS` / `RUN_SUMMARY_HEADLINE_MAX_CHARS`）、截断实现 `bound()` 也在两处 | `run-format.ts` 成为唯一出处：新增 `NOTICE_SUMMARY_MAX_CHARS` + `bound()`；`run-summary.ts` 与 `dsh-adapter.ts` 改为复用（`noticeSummary` 现在就是 `bound(firstLine(text), NOTICE_SUMMARY_MAX_CHARS)`） |
| 2 | Standards | README 承诺行内显示 `步骤 i/N`，实现没有该字样；`runStepLabel` 是死键 | `RunDock` 真正使用 `t('runStepLabel')`，行内变为 `步骤 2/4 · 步骤名`，与 README 一致 |
| 3 | Standards / Spec | 删掉进度条后的残留死面：`RunProgress.percent` / `.runningIndex`、`liveRunIds()`、`.sc-run-detail-head` | 全部删除，`tests/run-view.spec.ts` 相应用例改写（不再是"只被自己的测试吊着"） |
| 4 | Spec | `includeFinished` 铺了 5 个文件（types ×2、zod、client parser、run-api）却无人调用 | 从**远程面**移除（`ChainRunScope`、`chainRunScopeSchema`、`parseRunScope`、run-api 映射与对应用例）；注册表自己的 `ChainRunListFilter.includeFinished` 保留，它确有语义且另有测试 |
| 5 | Spec | `gateway.ts` 的 `runs ?? new ChainRunRegistry()` 会在同一全局符号下绑第二张空表（将来两参调用静默返回空名册） | `runs` 改为**必填**（构造函数与 `tryStartSmartCommandsGateway`），两处兜底全部删除；`tests/catalog-api.spec.ts` 相应传表 |
| 6 | Spec | `dsh-adapter.ts` 注释称 `PLUGIN_NAME` "shared with package.json"，与真实包名不符 | 注释改为"§5.1 固定的字面量" |
| 7 | Standards | `plugin.ts` 先 `resolve` 判能否分离，`startDetached` 再 resolve 一次（一次决策两次查表） | handler 只调 `startDetached`，由它独占"分离或阻塞"的决策（其内部 fallback 与 `runTemplateCommand` 等价，后者已删除）；模型工具 `smart_command_run` 路径未动，仍传原始 agent |
| 8 | Spec / 文档 | §8 头部仍记 `9ff19cd` / 181 用例；T3 记"24 个用例" | 本文件头部与 T3 回填为 `00032ef` / 189 用例 / +25 |
| 9 | Spec | README 把 §5.1 明确标【推测】的结论写成了既成事实 | README 该段加未验证限定，指向 §2.6 与 T6 |

### 9.2 刻意不改（附理由，勿当作遗漏）

| 项 | 理由 |
|---|---|
| 亮色下信息性文字 3.42:1（AA 不达标） | **用户拍板**：保持与 DSH 自带 dock 的 `TodoPanel` 完全一致（同一 token、同一 13px），把对比度作为上游问题记录（**T12**）。实测值：亮色 3.42:1 / 暗色 5.67:1；13 个 `--dsw-*` token 在亮暗两套里都有定义，CSS 兜底值永不生效 |
| 折叠行不显示步骤与耗时 | **用户拍板**：只改文档措辞（README 现已写明折叠时看不到细节、展开后可见），不改行为 —— 保住"结算后只占一行"的初衷 |
| `run-summary.ts` 与 `run-view.ts` 各有一份 `elapsedMs` | 语义不同：宿主侧 `endedAt ?? startedAt`（只用于结算后），客户端侧 `endedAt ?? now`（运行中要跳秒）。`run-format.ts` 保持"只吃基本类型"的中立定位，不引入 `ChainRunRecord` 依赖；判断项，收益不抵改动 |
| `CloseIcon` / `CrossIcon` 形状相近 | 角色不同（状态字形 vs 关闭控件），合并会把状态图标与操作控件耦合；判断项 |
| `CONTEXT.md` 的 Chain Run / Run Dock 词条超出 T4 的文档范围 | 词条本身正确且有用，属自愿增益而非缺陷 |
| 自身轮询 `await load()` 无超时/缓存（T10） | 仍**阻塞在 C 现场抓取**，理由见 §7.4 末 |

### 9.3 审查给出、确认满足的结论（供复查）

`onSettled` 由 `finish`/`cancel` 各触发一次、`cancelAll` 静默；被打断步骤落 `skipped`；`dismiss` 删除终态行、拒绝 live 行、以结果而非抛错返回；`notify` 不受 abort 保护而 `submit` 受保护且 `kind:'user'`；消息来源恰为 `{kind:'plugin',plugin:'smart-commands',form:'notice',summary}` 且 ≤120；产出 4000 字符截断；`src` 内无任何自定义 session 事件写入；`RunDock` 只发 `sessionId` 从不发 `workspaceRoot`；`contract.ts` 仍是端点单一来源（`typert-manifest` 未改测试）。

**另有两处一手核实的事实（写入 `AGENTS.md`）**：`conversation.input.dock` 是 `scope:"session"` 的 list 槽，`dsh-client-ui-session` 的 `BUILTIN_SOURCE` 声明 `props:['sessionId']` + `hooks:['session']`（→ `useSession`），故面板的会话过滤与取消守卫在运行时成立；该槽各项以 `display:contents` 锚点渲染，因此 todo(0)/goal(10)/queue(20)/runs(30) 都是 `.composerStack`（`gap: 6px`）的直接 flex 子项。
