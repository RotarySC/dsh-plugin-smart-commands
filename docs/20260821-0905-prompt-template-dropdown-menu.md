# 实施计划：DSH 聊天框快速填入项目模板命令下拉列表（Prompt Template Dropdown Menu）

## 1. 背景与需求溯源
- **需求背景**：用户希望在 DSH Web GUI 聊天输入框（Composer）工具栏区域设计一个“提示词 / 模板命令”下拉列表按钮与弹层菜单。
- **参考设计与视觉证据**：
  1. **输入框底部工具栏入口**（参考图 1）：
     - 位于聊天输入框底栏左侧区域（紧随 `Workspace Write` 权限选择器等 resident control 之后）。
     - 图标与文案样式：气泡/对话图标 `💬` + `提示词` 文本 + 展开箭头 `⌄`（展开时翻转为 `⌃`）。
     - 胶囊/圆角按钮形态，与宿主其他按钮视觉风格统一（`var(--dsw-alias-bg-module-platform)` / 背景与 Hover 效果）。
  2. **下拉弹层列表界面**（参考图 2）：
     - 弹层顶部配备搜索过滤框：`搜索标题、标签或内容...`（带微圆角与聚焦光晕）。
     - 列表项布局（垂直列表）：
       - 主标题（粗体，如 `Explain code`、`Code review`、`Weekly update`、`Write unit tests`）。
       - 副标题/描述与标签（浅灰色文字，如 `learning — Explain the code below in plain language...`、`development · review — ...`）。
       - 右侧预留操作区/选择区（方圆 Checkbox / 单选标记 / 插入动作区域）。
     - 交互逻辑：点击某个模板项或确认选择后，自动将该模板对应的命令（如 `/explain-code`）或模板内容填充到当前会话输入框的草稿区域（`inputActions.setDraft`），并关闭弹层。
- **架构立足点**：
  - 本项目是 DSH 的前端与后端插件 `@deepseek-ai/dsh-plugin-smart-commands`。
  - DSH Client 端通过 `conversation.input.left` 插槽注入聊天框工具栏组件。
  - 前端 ClientContext 暴露 `slots`、`locale`、`remote`、`typert` 等服务，并通过 Session Kit 提供 `useInput` 和 `inputActions`（包含 `setDraft`）。
  - 模板数据通过已实现的 Typert Remote 接口（`remote.smartCommands.list({ workspaceRoot })`）获取。

---

## 2. 影响范围与关键文件
- **新建组件与模块**：
  - `src/client/PromptMenuButton.tsx`：聊天框工具栏下拉按钮及浮层组件（含搜索过滤、键盘导航、模板渲染与点击填入输入框）。
  - `src/client/prompt-menu.css.ts`：下拉菜单与搜索框、列表项的高保真 CSS 样式（严格对齐 DSH CSS Token 与参考图）。
- **修改现有文件**：
  - `src/client/index.ts`：在 `apply(ctx)` 中通过 `ctx.slots.inject('conversation.input.left', ...)` 注册提示词按钮与下拉组件；扩展依赖注入与 Session Kit 上下文传递。
  - `src/client/locales.ts`：补充“提示词”、“搜索标题、标签或内容…”等中英文多语言词条。
  - `package.json`：确保 `dsh.client.inject` 包含必要服务。
- **测试与验证文件**：
  - `tests/prompt-menu.spec.ts`（或相关的 client 纯逻辑/渲染单测）。

---

## 3. 原子化实施步骤

### 步骤 1：多语言词条扩展（i18n）
- **目标**：在 `src/client/locales.ts` 中增补提示词下拉菜单所需的多语言字典。
- **改动内容**：
  - `zh`:
    - `promptButton: '提示词'`
    - `searchPlaceholder: '搜索标题、标签或内容...'`
    - `noMatchingTemplates: '无匹配模板'`
    - `loadingTemplates: '加载模板中...'`
  - `en`:
    - `promptButton: 'Prompts'`
    - `searchPlaceholder: 'Search title, tags, or content...'`
    - `noMatchingTemplates: 'No matching templates'`
    - `loadingTemplates: 'Loading templates...'`
- **优先级/依赖**：P0，无前置依赖。

### 步骤 2：下拉浮层与按钮高保真样式设计
- **目标**：在 `src/client/prompt-menu.css.ts` 中定义符合图 1 和图 2 视觉效果的样式。
- **核心样式规则**：
  - 触发按钮：`.sc-prompt-trigger`，带气泡图标、文本与折叠箭头，支持 active/hover 态。
  - 浮层容器：`.sc-prompt-popover`，使用 `createPortal` 挂载在 `document.body`，或通过锚点绝对定位在输入框上方，设定 `z-index: 1050`，背景 `var(--dsw-alias-bg-layer-1)`，外边框 `var(--dsw-alias-border-l1)`，圆角 `12px`，带柔和投影。
  - 搜索栏：`.sc-prompt-search-input`，内边距、圆角与边框契合图 2 中的搜索框样式。
  - 模板列表项：`.sc-prompt-item`，Flex 布局，包含标题 `.sc-prompt-item-title`、标签与描述 `.sc-prompt-item-desc`，以及右侧图标/勾选框占位 `.sc-prompt-item-check`。
- **优先级/依赖**：P0，依赖步骤 1。

### 步骤 3：实现 `PromptMenuButton` 组件
- **目标**：编写 `src/client/PromptMenuButton.tsx`，实现完整交互闭环。
- **核心逻辑**：
  - 接收 props：`t`（多语言函数）、`connect`（Remote 连接器）、`workspaceRoot` 获取函数、`inputActions`（来自 SessionStandardProps）、`useInput`（输入框状态）。
  - 点击按钮切换浮层开闭；点击浮层外部自动关闭（`useClickAway` 或 document click listener）。
  - 开启浮层时异步拉取模板列表（通过 `remote.list({ workspaceRoot: workspaceRoot() })`），带缓存与防抖。
  - 搜索过滤逻辑：根据用户输入的关键字，即时过滤模板名称（`name`）、描述（`description`）、标签（`tags`/`models`/`subagent`）或正文。
  - 点击或回车选中模板时：
    - 根据模板类型生成填入内容（若存在 `slashName` 则生成 `/<slashName> `；或者直接将模板 prompt body 填入输入框）。
    - 调用 `inputActions.setDraft(templateCommand)` 将命令快速填入当前会话输入框。
    - 关闭下拉浮层，并重新聚焦输入框。
- **优先级/依赖**：P0，依赖步骤 1、步骤 2。

### 步骤 4：在客户端入口注册 `conversation.input.left` 插槽
- **目标**：在 `src/client/index.ts` 的 `apply` 函数中，向 DSH 聊天界面的输入框左侧工具条注入 `PromptMenuButton`。
- **改动点**：
  - `ctx.slots.inject('conversation.input.left', () => ctx.slots.register(...))`
  - 声明 `name: 'conversation.input.left'`, `id: 'smart-commands.prompt-trigger'`, `order: 20`。
  - 将 `t`、`connect`、`workspaceRoot` 及宿主传入的 `inputActions` 传递给 `PromptMenuButton`。
- **优先级/依赖**：P0，依赖步骤 3。

### 步骤 5：构建脚本与客户端打包适配
- **目标**：确保 `scripts/build-client.mjs` 正确打包包含新组件的 `dist/client.js`。
- **操作**：运行 `npm run typecheck` 和 `npm run build:client` 确保编译零警告零错误。
- **优先级/依赖**：P1，依赖步骤 4。

---

## 4. 每步自闭环本地验证手段
1. **步骤 1 & 2 验证**：
   - 运行 `npm run typecheck` 验证 Locale Key 完备性及样式模块类型合法。
2. **步骤 3 & 4 验证**：
   - 编写自动化测试（Vitest）：模拟 `remote.list` 返回模板数据，触发点击选择，验证 `inputActions.setDraft` 被正确调用且入参符合预期格式。
3. **步骤 5 端到端打包验证**：
   - 执行 `npm run build`，产出最新的 `dist/client.js`。
   - 检查打包产物体积与导出规范，确保无 Zod 泄漏，符合 `window.__ModuleLoader__.load` 规范。
   - 在 DSH Web 界面（http://127.0.0.1:3080）刷新页面，实机验证：
     - 聊天框底部左侧是否出现 `[💬 提示词 ⌄]` 按钮。
     - 点击是否平滑弹出带有搜索框的下拉列表。
     - 搜索过滤是否流畅。
     - 点击模板项是否准确将命令填入输入框且自动关闭弹层。

---

## 5. 风险、依赖与回滚注意点
- **插槽上下文依赖**：`conversation.input.left` 处于 session 作用域，必须确保在无活跃 session 或切换 workspace 时，`workspaceRoot` 能够安全回退至当前项目路径或仅展示全局模板。
- **z-index 与定位冲突**：聊天框底部可能存在其它模态框或浮层，弹层组件必须采用 Portal 挂载到 body 或严格计算相对位置，防止被聊天流或底部栏裁切（`overflow: hidden`）。
- **回滚方案**：若发现与宿主版本 UI 冲突，可直接在 `src/client/index.ts` 中注释掉 `conversation.input.left` 插槽注入，完全不影响现有设置页（`settings.section`）和后台命令执行逻辑。

---

## 6. 规格歧义与待确认清单
- **点击填入内容格式**：目前默认设计为优先填入斜杠命令（例如 `/<command-name> `），若该模板未注册斜杠命令，则填入模板预设的完整 Prompt 文本。如需支持“一键直接提交”或“仅填入参数占位符”，后续可通过配置项扩展。
- **已记录不确定性**：由于本轮视觉时间预算耗尽，图 2 中右侧圆角方框是单纯的视觉指示/图标占位，还是支持多选批量填入？当前计划按单选快速填入设计，右侧保留操作占位/箭头以贴合视觉原型。
