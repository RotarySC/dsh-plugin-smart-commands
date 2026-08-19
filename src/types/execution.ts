import type { ToolFilter } from './chain.ts'
import type { RuntimeOverrides } from './template.ts'

export interface StepResult {
  readonly name: string
  readonly agent?: string
  readonly model?: string
  readonly as?: string
  readonly text: string
  readonly durationMs: number
  readonly changedFiles: string[]
  readonly worktreePatch?: string
}

export interface CommandRunSuccess {
  readonly ok: true
  readonly command: string
  readonly model?: string
  readonly restored: boolean
  readonly text: string
  readonly steps: StepResult[]
  readonly files: string[]
  readonly durationMs: number
  readonly rounds: number
}

export interface CommandRunFailure {
  readonly ok: false
  readonly command?: string
  readonly error: string
  readonly hint?: string
}

export type CommandRunResult = CommandRunSuccess | CommandRunFailure

export interface RunCommandRequest {
  readonly command: string
  readonly args?: string[] | string
  readonly overrides?: RuntimeOverrides
}

export interface ListCommandItem {
  readonly name: string
  readonly description: string
  readonly origin: 'user' | 'project'
  readonly sourcePath: string
  readonly hasChain: boolean
  readonly models: string[]
  readonly subagent: boolean | string
  readonly context: 'fresh' | 'fork'
}

export interface ManageTemplateRequest {
  readonly action: 'create' | 'update' | 'delete'
  readonly name: string
  readonly content?: string
}

export interface DelegationRequest {
  readonly prompt: string
  readonly label: string
  readonly agent?: string
  readonly model?: string
  readonly context: 'fresh' | 'fork'
  readonly tools?: ToolFilter
  readonly skills?: string[]
  readonly cwd?: string
  readonly signal: AbortSignal
  readonly depth: number
}
