# Chain 分离运行 —— 待办、备选方案与未决问题

> 本文件是 `feat/chain-run-projection` 分支的**续接工件**：记录已实现的行为契约、未决问题的定位结论、可选方案与待办清单。
>
> | 项 | 值 |
> |---|---|
> | 分支 | `feat/chain-run-projection` |
> | 已提交 HEAD | `9ff19cd`（面板修复 + **方案 A 回投汇总**，23 文件；其下为 `6a2421f`/`d0f2362`/`837a858` 三笔 C 方向） |
> | 未提交改动 | 仅本文件的 §8 状态快照（提交后回填） |
> | 验证状态 | `npm run typecheck` ✅ · `npm test` 181 用例 / 23 文件 ✅ · `npm run build` ✅ |
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
| T3 | 方案 A：`startDetached` 结算后回投汇总 + 测试 | 实现 | T1 | ✅ **已完成**（`onSettled` → `notify`；新增 24 个用例） |
| T4 | README 与 AGENTS 补充"新会话首条用斜杠命令"的限制 | 文档 | T1 | ✅ **已完成**（README「分离执行与运行面板」+ AGENTS 不变式两条） |
| T5 | 向上游提 issue：`list.js:29` 未把 `command/run` 视为 engagement | 上游 | — | 挂起（方案 A 不替代它：其它斜杠命令仍会隐藏会话） |
| T6 | 现场验证：方案 A 是否真的让 chain 会话稳定留存；并分离 P2（客户端 blank 陈旧）vs P1（5 行折叠） | 验证 | 需用户配合：重启 `dsh web` → 新会话跑一次 `/chain-test` → 切走／刷新观察 | 挂起（**现在含方案 A 的端到端确认**） |
| T7 | 决定是否把 `subagent: true` / persona 的单次子代理也纳入分离运行（问题 C） | 决策 | — | 挂起 |
| T8 | （可选）与 `dsh-schedule` 对齐，在命令后调用 `ctx.sessions.flush(session)` | 实现 | — | **不建议**：flush 只影响落盘时序/屏障，**改变不了可见性**，解决不了问题 A；方案 A 已用另一条路径解决 |
| T9 | （可选）把测试链模板 `.dsh/commands/chain-test.md` 提升为 `examples/` 中随仓库分发的样例 | 文档 | — | 挂起 |

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

---

## 8. 状态快照与续接方式

**已提交**（分支 `feat/chain-run-projection`）：

```
9ff19cd feat(runs): report settled chain runs back into their session   ← 本轮：面板修复 + 方案 A（23 文件）
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

**本轮（用户反馈后，未提交）**：面板样式统一 + 「关闭」真正生效

```
UI 重做    src/client/{RunDock.tsx, run-dock.css.ts, icons.tsx}
           —— 面板抄 TodoPanel（0.5px 边框 / --dsw-specific-tip / 12px 圆角 /
              宽度 calc(--dsh-composer-*) / 字形+标题+计数头部），行抄队列 dock
              （36px、13px 文本、28px 圆形操作按钮）；进度条换成状态字形
              （spinner/对勾/叉/横杠），绿色 2px 条与带边框药丸按钮删除
新端点     src/remote/{contract.ts, schemas.ts, run-api.ts, gateway.ts}
           src/typert.host.ts、src/typert.remote-client.ts
           src/types/runs.ts、src/engine/run-registry.ts（dismiss）
           src/client/{remote-contribution.ts, SmartCommandsSection.tsx}
测试       tests/{run-registry.spec.ts, run-api.spec.ts, client-remote.spec.ts}
文档       README.md、AGENTS.md、本文件
```

**未提交**：上表全部（等用户说「提交」）。

**本地（gitignored，不入库）**：`.dsh/commands/chain-test.md` —— `/chain-test` 测试链（4 步约 45 秒；顺序 + 并行 2 路；`as`/`{outputs.x}`/`{previous}` 绑定；body 内写有把 `loop` 改 2 验证轮次、给第 2 步加 `worktree true` 验证隔离工作树的改法）。

**续接方式**：剩下的是 T5（上游 issue）、T6（现场验证）、T7（决策）、T9（可选）。T6 需**重启 `dsh web` 进程**（宿主改动）＋刷新页面（客户端改动），验证顺序：重启 → 新建会话 → 跑一次 `/chain-test` → 等面板结算 → 看会话里是否出现 `smart-commands` 上下文行 → 切走／刷新看会话是否仍在列表。若会话仍消失，则 §2.6 的 P1/P2 分支需要现场打印 `summary.blank` 来分离。**关闭按钮的验证同样是宿主侧行为**（`dismissRun` 在宿主进程里），只刷新页面验证不了。
