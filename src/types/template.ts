import type { ChainStep, ToolFilter } from './chain.js'

/**
 * Parsed Markdown command template. Frontmatter is the execution strategy;
 * body is the prompt or chain-level task text.
 */
export interface CommandTemplate {
  readonly name: string
  readonly sourcePath: string
  readonly origin: 'user' | 'project'
  readonly description: string
  readonly models: string[]
  readonly restore: boolean
  readonly subagent: boolean | string
  readonly context: 'fresh' | 'fork'
  readonly tools?: ToolFilter
  readonly skills?: string[]
  readonly chain?: ChainStep[]
  readonly loop?: number
  readonly converge: boolean
  readonly worktree: boolean
  readonly body: string
}

export interface TemplateFrontmatter {
  readonly description: string
  readonly model?: string
  readonly restore?: boolean
  readonly subagent?: boolean | string
  readonly context?: 'fresh' | 'fork'
  readonly tools?: ToolFilter
  readonly skills?: string[]
  readonly chain?: ChainStep[]
  readonly loop?: number
  readonly converge?: boolean
  readonly worktree?: boolean
}

export interface TemplateParseResult {
  readonly frontmatter: TemplateFrontmatter
  readonly body: string
}

export interface RuntimeOverrides {
  readonly model?: string
  readonly context?: 'fresh' | 'fork'
  readonly subagent?: boolean | string
  readonly restore?: boolean
  readonly loop?: number
  readonly converge?: boolean
  readonly worktree?: boolean
  readonly tools?: ToolFilter
}
