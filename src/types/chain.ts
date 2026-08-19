/**
 * Chain step contracts. Sequential and static-parallel steps are plain data;
 * the executor owns all behavior.
 */

export interface ToolFilter {
  readonly allow?: string[]
  readonly deny?: string[]
}

export interface SequentialStep {
  readonly name: string
  readonly agent?: string
  readonly model?: string
  readonly task: string
  readonly as?: string
  readonly outputMode?: 'inline' | 'file-only'
  readonly reads?: string[]
  readonly tools?: ToolFilter
  readonly context?: 'fresh' | 'fork'
}

export interface ParallelTaskItem {
  readonly agent?: string
  readonly model?: string
  readonly task: string
  readonly as?: string
  readonly tools?: ToolFilter
  readonly context?: 'fresh' | 'fork'
}

export interface ParallelStep {
  readonly name: string
  readonly parallel: ParallelTaskItem[]
  readonly concurrency?: number
  readonly failFast?: boolean
  readonly worktree?: boolean
}

export type ChainStep = SequentialStep | ParallelStep

export function isParallelStep(step: ChainStep): step is ParallelStep {
  return 'parallel' in step && Array.isArray(step.parallel)
}

export function isSequentialStep(step: ChainStep): step is SequentialStep {
  return !isParallelStep(step)
}
