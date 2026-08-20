# DeepSeek Harness (DSH) 基础插件开发完整指南

> 本指南基于 [DeepSeek Harness 官方开发体系 (develop/basic)](https://github.com/deepseek-ai/deepseek-harness) 梳理与解析，旨在为开发者提供从环境搭建、架构理解、清单配置、生命周期管理、工具注册、沙箱权限到调试发布的端到端实战手册。

---

## 目录

1. [核心架构与设计哲学](#一-核心架构与设计哲学)
2. [插件工程结构与清单规范 (Manifest)](#二-插件工程结构与清单规范-manifest)
3. [插件生命周期与上下文 (Lifecycle & Context)](#三-插件生命周期与上下文-lifecycle--context)
4. [工具注册与参数契约 (Tool Registration & Schema)](#四-工具注册与参数契约-tool-registration--schema)
5. [配置管理与状态持久化 (Configuration & State)](#五-配置管理与状态持久化-configuration--state)
6. [运行时沙箱与权限审批 (Sandbox & Permissions)](#六-运行时沙箱与权限审批-sandbox--permissions)
7. [完整实战案例：开发一个专业检索插件](#七-完整实战案例开发一个专业检索插件)
8. [本地调试、测试与发布流程](#八-本地调试测试与发布流程)
9. [最佳实践与避坑指南](#九-最佳实践与避坑指南)

---

## 一、 核心架构与设计哲学

DeepSeek Harness 采用 **"Everything is a Plugin"（一切皆插件）** 的高度解耦与可扩展设计。

```
+-------------------------------------------------------------+
|               DeepSeek Harness 宿主运行环境 (Core)           |
|  +-------------------------------------------------------+  |
|  |           LLM 决策与调度引擎 (Agent / Orchestrator)    |  |
|  +-------------------------------------------------------+  |
|         │                        │                     │    |
|         ▼                        ▼                     ▼    |
|  +--------------+       +------------------+   +---------+  |
|  | 内置核心工具 |       | 第三方扩展插件   |   | UI 扩展 |  |
|  | (FS/Pwsh...) |       | (Search/DB/API)  |   | (Slots) |  |
|  +--------------+       +------------------+   +---------+  |
|         │                        │                     │    |
|  +-------------------------------------------------------+  |
|  |             统一沙箱与权限控制层 (Sandbox)             |  |
|  +-------------------------------------------------------+  |
+-------------------------------------------------------------+
```

### 1. 为什么采用插件化机制？
- **能力解耦**：宿主核心保持轻量，所有具体功能（文件读写、终端执行、图像分析、外部集成）均作为插件接入。
- **LLM 原生交互**：插件对外暴露的不仅仅是可调用的函数，更是一套**具备强语义描述的 Prompt/Schema**，使得大模型能够准确感知“何时使用该工具”以及“参数约束与返回契约”。
- **统一生命周期与安全审计**：插件由宿主运行时统一管理激活、卸载与资源释放，并通过多级权限模式（Read-Only / Workspace-Write / Danger-Full-Access）保护用户系统安全。

---

## 二、 插件工程结构与清单规范 (Manifest)

一个典型的 DSH 插件采用 TypeScript 编写，标准目录结构如下：

```text
dsh-plugin-sample/
├── package.json          # 插件元数据与 DSH 扩展声明
├── tsconfig.json         # TypeScript 编译配置
├── README.md             # 插件介绍与使用指南
├── src/
│   ├── index.ts          # 插件主入口 (导出 activate / deactivate)
│   ├── tools/            # 工具实现目录
│   │   └── query.ts      # 具体 Tool 的 Schema 与 Handler
│   ├── types.ts          # 类型定义
│   └── utils/            # 辅助工具函数
└── dist/                 # 编译打包输出目录
```

### `package.json` 清单声明规范

DSH 在 `package.json` 中通过 `dsh` 字段解析插件扩展点：

```json
{
  "name": "dsh-plugin-academic-search",
  "version": "1.0.0",
  "description": "DeepSeek Harness 学术论文与资料检索插件",
  "main": "dist/index.js",
  "engines": {
    "node": ">=18.0.0"
  },
  "dsh": {
    "displayName": "Academic Search",
    "categories": ["Research", "Productivity"],
    "activationEvents": [
      "onStartup"
    ],
    "tools": [
      {
        "name": "academic_search_query",
        "description": "检索学术论文数据库（如 arXiv, Semantic Scholar），支持按领域、年份和关键词过滤。"
      }
    ],
    "configuration": {
      "title": "Academic Search Settings",
      "properties": {
        "academicSearch.apiKey": {
          "type": "string",
          "default": "",
          "description": "学术数据检索服务的 API Key（可选）"
        },
        "academicSearch.maxResults": {
          "type": "number",
          "default": 10,
          "description": "单次检索返回的最大论文数量"
        }
      }
    }
  },
  "scripts": {
    "build": "tsc",
    "watch": "tsc -w",
    "prepublishOnly": "npm run build"
  },
  "devDependencies": {
    "@deepseek-ai/dsh-types": "^1.0.0",
    "typescript": "^5.0.0"
  }
}
```

---

## 三、 插件生命周期与上下文 (Lifecycle & Context)

每个 DSH 插件主入口文件必须导出 `activate` 和可选的 `deactivate` 函数。

### 1. `activate(context: ExtensionContext)`
插件被 DSH 宿主加载时触发。`ExtensionContext` 提供核心上下文接口：
- `context.tools`：注册/注销 Tool。
- `context.configuration`：读取、监听用户配置。
- `context.workspaceState`：针对当前工作区的轻量键值存储。
- `context.globalState`：跨工作区的全局持久化存储。
- `context.subscriptions`：资源注销列表（Disposable），当插件失效时统一回收。

### 2. `deactivate()`
插件被卸载、禁用或宿主关闭时调用。用于终止未完成的后台子进程、清理临时网络连接和释放系统句柄。

```typescript
import { ExtensionContext, Disposable } from '@deepseek-ai/dsh-types';
import { registerAcademicTools } from './tools/query';

export function activate(context: ExtensionContext) {
  console.log('[Academic Search Plugin] Activating...');

  // 1. 注册工具并放入 subscriptions
  const toolDisposables = registerAcademicTools(context);
  context.subscriptions.push(...toolDisposables);

  // 2. 监听配置变更
  const configListener = context.configuration.onDidChange((e) => {
    if (e.affectsConfiguration('academicSearch.apiKey')) {
      console.log('[Academic Search Plugin] API Key has been updated.');
    }
  });
  context.subscriptions.push(configListener);
}

export function deactivate() {
  console.log('[Academic Search Plugin] Deactivated.');
}
```

---

## 四、 工具注册与参数契约 (Tool Registration & Schema)

### 1. 工具声明的核心要素
一个完整的 Tool 由三部分构成：
1. **`name`**：唯一标识符，建议采用小写蛇形命名（如 `search_articles`）。
2. **`description`**：**最重要的 Prompt 指引**。需清晰阐述“此工具干什么”、“在什么场景下触发”、“输入输出语义”。
3. **`parameters`**：符合 JSON Schema 标准的参数对象定义（含 `type`, `properties`, `required`, `description`）。
4. **`handler`**：执行具体业务逻辑的异步函数 `async (args, toolContext) => Promise<any>`。

### 2. 工具注册示例

```typescript
import { ExtensionContext, ToolDefinition, ToolContext } from '@deepseek-ai/dsh-types';

interface SearchArgs {
  query: string;
  year_start?: number;
  limit?: number;
}

export function registerAcademicTools(context: ExtensionContext) {
  const searchTool: ToolDefinition<SearchArgs> = {
    name: 'academic_search_query',
    description: '用于在学术论文索引中检索特定领域的文献。当用户要求查找学术论文、研究前沿或引用出处时使用。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '检索关键词、论文标题或学术问题'
        },
        year_start: {
          type: 'integer',
          description: '限定发表起始年份（例如 2023）'
        },
        limit: {
          type: 'integer',
          description: '返回结果数量上限，默认 5，最大 20',
          default: 5
        }
      },
      required: ['query']
    },
    handler: async (args: SearchArgs, toolContext: ToolContext) => {
      // 检查中断信号
      if (toolContext.cancellationToken.isCancellationRequested) {
        return { aborted: true, message: 'Operation cancelled by user' };
      }

      try {
        const apiKey = context.configuration.get<string>('academicSearch.apiKey', '');
        const limit = args.limit || 5;

        // 执行具体检索请求
        const results = await fetchPapersFromApi(args.query, args.year_start, limit, apiKey);

        return {
          ok: true,
          count: results.length,
          papers: results
        };
      } catch (err: any) {
        // 返回自解释的错误信息，便于 LLM 进行反思与重试
        return {
          ok: false,
          error: err.message,
          suggestion: 'Check network connectivity or refine query parameters'
        };
      }
    }
  };

  return [context.tools.registerTool(searchTool)];
}
```

---

## 五、 配置管理与状态持久化 (Configuration & State)

### 1. 配置项读取与监听
- **获取配置**：
  ```typescript
  const maxResults = context.configuration.get<number>('academicSearch.maxResults', 10);
  ```
- **更新配置**：
  ```typescript
  await context.configuration.update('academicSearch.maxResults', 20);
  ```

### 2. 状态存储 (State Storage)
- **工作区级别状态（随当前项目持久化）**：
  ```typescript
  // 写入
  await context.workspaceState.update('last_search_query', 'Agent Architecture');
  // 读取
  const lastQuery = context.workspaceState.get<string>('last_search_query');
  ```
- **全局状态（跨项目全局共享）**：
  ```typescript
  await context.globalState.update('user_auth_token', token);
  ```

---

## 六、 运行时沙箱与权限审批 (Sandbox & Permissions)

DSH 包含严格的沙箱隔离与审批拦截层，保证 Agent 调用的安全性：

| 权限模式 | 作用域与约束 | 适用场景 |
| :--- | :--- | :--- |
| **`read-only`** | 仅允许只读操作，受限语言模式（Constrained Language）。无法修改文件或外发非授权写请求。 | 数据查询、文档解析、只读探测 |
| **`workspace-write`** | 允许对当前工作区（Workspace）内的文件进行创建、编辑、格式化与删除。 | 代码生成、单测编写、工程重构 |
| **`danger-full-access`** | 系统全权限访问，允许修改跨目录文件或执行高危系统指令。需用户显式单次审批。 | 跨系统依赖安装、全局环境配置 |

### 插件中的安全原则
1. **最小权限原则**：默认在最低权限模式下完成绝大多数计算与请求。
2. **规范错误结构**：如果工具因权限或依赖被拒，应当返回明确的语义标记（例如 `[sandbox: file access denied]`），让 Agent 能够根据策略提示用户进行授权，切忌吞掉异常。

---

## 七、 完整实战案例：开发一个专业检索插件

以下为一个完整的单文件插件范例 `src/index.ts`：

```typescript
import { ExtensionContext, ToolDefinition, ToolContext } from '@deepseek-ai/dsh-types';

interface QueryParams {
  keywords: string[];
  maxCount?: number;
}

export function activate(context: ExtensionContext) {
  const searchTool: ToolDefinition<QueryParams> = {
    name: 'tech_doc_lookup',
    description: '用于在技术文档库中快速查找 API、类型定义和代码示例。输入关键词列表，返回匹配章节和内容摘要。',
    parameters: {
      type: 'object',
      properties: {
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: '检索关键词列表'
        },
        maxCount: {
          type: 'number',
          description: '返回的最大匹配条数',
          default: 3
        }
      },
      required: ['keywords']
    },
    handler: async (args: QueryParams, toolCtx: ToolContext) => {
      const { keywords, maxCount = 3 } = args;

      if (!keywords || keywords.length === 0) {
        return { success: false, error: 'Keywords list cannot be empty.' };
      }

      // 模拟索引检索
      const matched = [
        {
          title: 'DeepSeek Harness Plugin Lifecycle',
          snippet: 'Plugins must implement activate() and optionally deactivate().',
          score: 0.95
        },
        {
          title: 'Tool Calling & JSON Schema',
          snippet: 'Define clear parameter contracts using JSON Schema.',
          score: 0.88
        }
      ].slice(0, maxCount);

      return {
        success: true,
        total: matched.length,
        items: matched
      };
    }
  };

  // 注册并托管生命周期
  const disposable = context.tools.registerTool(searchTool);
  context.subscriptions.push(disposable);

  console.log('[TechDocLookup] Successfully registered tool: tech_doc_lookup');
}

export function deactivate() {
  console.log('[TechDocLookup] Cleaned up.');
}
```

---

## 八、 本地调试、测试与发布流程

### 1. 本地联调测试 (Local Linking)
在开发插件时，可以通过以下步骤直接在 DSH 宿主中进行热调试：

1. **编译插件**：
   ```bash
   pnpm run build
   # 或监听编译
   pnpm run watch
   ```
2. **软链接至 DSH 插件目录**：
   在 DSH 的插件工作目录或通过命令行载入：
   ```bash
   dsh plugin link /path/to/my-dsh-plugin
   ```
3. **在 Web GUI 中验证**：
   - 打开 DSH Web 控制台（默认 `http://127.0.0.1:3080`）。
   - 在对话框中输入触发指令（例如：“帮我检索关于 Plugin Lifecycle 的技术文档”）。
   - 观察 LLM 是否准确识别并调用 `tech_doc_lookup` 工具，并在界面中检查参数与输出结果。

### 2. 发布到生态 (Publishing)
1. **打包校验**：
   确保 `package.json` 中的 `dsh` 字段完整且 `dist` 产物已生成。
2. **发布至 npm 仓库**：
   ```bash
   npm publish --access public
   ```
3. **提交到官方插件市场**：
   在 [DeepSeek Harness 官方插件目录](https://github.com/deepseek-ai/deepseek-harness) 提交 PR，将你的插件登记至官方推荐清单中。

---

## 九、 最佳实践与避坑指南

1. **Prompt 描述决定调用质量**：
   - 工具与参数的 `description` 是模型唯一的参考依据。
   - 必须注明**何时调用**、**何时不该调用**、**默认值行为**与**单位格式**。
2. **优雅的异常处理与重试友好性**：
   - 避免在 Handler 顶层裸抛未捕获异常。
   - 返回 `{ ok: false, error: "具体的错误原因", hint: "建议解决方案" }`，以便 Agent 自主修正参数。
3. **防范资源泄露**：
   - 所有创建的事件监听器、定时器、子进程，必须放入 `context.subscriptions` 或在 `deactivate` 中主动清理。
4. **轻量与响应性**：
   - 耗时长的工具应及时检查 `toolContext.cancellationToken`，响应用户的主动中断请求。
