import type { ToolFilter } from './chain.js'

export interface ModelRef {
  readonly provider?: string
  readonly id: string
}

export interface ModelRegistry {
  readonly current?: ModelRef
  readonly available: readonly ModelRef[]
}

export interface HostLlm {
  list?(): unknown
  listProviders?(): Array<{ id?: string }>
  listModels?(provider: string): Promise<Array<{ id?: string; model?: string }>> | Array<{ id?: string; model?: string }>
}

export interface ModelSession {
  getModel(): string | undefined
  setModel(model: string | undefined): Promise<void> | void
}

export interface HostAgent {
  readonly id: string
  readonly options?: { provider?: string; model?: string }
  readonly sessionCwd?: string
  /** The host-native agent object this adapter wraps (the real DSH Agent). Delegated child runs must receive it untouched — a duck-typed wrapper lacks `session`/`ctx` and breaks host-side delegation. */
  readonly original?: unknown
  submit?(prompt: string, signal: AbortSignal): Promise<HostTurnResult>
}

export interface HostTurnResult {
  readonly text: string
  readonly changedFiles?: string[]
  readonly childId?: string
}

export interface SubagentStartRequest {
  readonly provider: string
  readonly prompt: string
  readonly label: string
  readonly parent?: HostAgent
  readonly signal: AbortSignal
  readonly agentOptions?: { provider?: string; model?: string }
  readonly persona?: string
  readonly toolFilter?: ToolFilter
  readonly maxDepth?: number
  readonly cwd?: string
}

export interface SubagentRunResult {
  readonly text: string
  readonly stopReason: 'completed' | 'aborted' | 'error' | string
  readonly changedFiles?: string[]
  readonly childId?: string
}

export interface ContinuableStartResult {
  readonly childId: string
  readonly messageId?: string
}

export interface HostSubagents {
  list(): string[]
  start(request: SubagentStartRequest): Promise<SubagentRunResult>
  startContinuable?(request: SubagentStartRequest): Promise<ContinuableStartResult>
}

export interface HostConfiguration {
  get<T>(key: string, defaultValue?: T): T | undefined
  update?(key: string, value: unknown): Promise<void> | void
}

export interface HostToolExecution {
  readonly signal: AbortSignal
  readonly agent?: HostAgent
}

export interface HostToolContentBlock {
  readonly type: 'text'
  readonly text: string
}

export interface HostToolOutput {
  readonly schema: Record<string, unknown>
  render(args: Record<string, unknown>, value: unknown): HostToolContentBlock[]
  presentationMeta?(args: Record<string, unknown>, value: unknown): unknown
}

export interface HostToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
  readonly output: HostToolOutput
  execute(args: Record<string, unknown>, exec: HostToolExecution): Promise<unknown>
}

export interface HostTools {
  register(tool: HostToolDefinition): () => void
}

export interface HostCommands {
  register(definition: {
    name: string
    description: string
    input?: { hint: string }
    handler: (invocation: {
      rawInput: string
      signal: AbortSignal
      agent?: HostAgent
    }) => Promise<{ kind: 'success' | 'error'; text: string }>
  }): () => void
}

export interface PluginConfig {
  readonly userTemplatesDir: string
  readonly projectTemplatesDir: string
  readonly maxChainSteps: number
  readonly maxConcurrency: number
  readonly maxDelegationDepth: number
  readonly spawnProvider: string
  readonly forkProvider: string
}

export const DEFAULT_PLUGIN_CONFIG: PluginConfig = {
  userTemplatesDir: '~/.dsh/commands',
  projectTemplatesDir: '.dsh/commands',
  maxChainSteps: 10,
  maxConcurrency: 5,
  maxDelegationDepth: 3,
  spawnProvider: 'spawn',
  forkProvider: 'fork',
}

export interface SmartCommandsHost {
  readonly workspaceRoot: string
  readonly userHome: string
  readonly config: PluginConfig
  readonly configuration?: HostConfiguration
  readonly tools?: HostTools
  readonly commands?: HostCommands
  readonly subagents?: HostSubagents
  readonly llm?: HostLlm
  readonly modelRegistry?: ModelRegistry
  readonly modelSession?: ModelSession
  readonly parentAgent?: HostAgent
  now?(): number
}
