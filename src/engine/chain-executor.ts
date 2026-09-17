import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isParallelStep, type ChainStep, type ParallelStep, type ParallelTaskItem, type SequentialStep } from '../types/chain.js'
import type { DelegationRequest, StepResult } from '../types/execution.js'
import type { PluginConfig } from '../types/host.js'
import type { ChainStepProgress } from '../types/runs.js'
import {
  aggregateParallelOutputs,
  interpolateChainTask,
  mapConcurrent,
  validateChainOutputBindings,
} from './chain-validation.js'
import { substituteArgs } from './template-engine.js'
import { SubagentBridge } from './subagent-bridge.js'
import { cleanupWorktrees, createWorktrees, diffWorktrees, type WorktreeDiff } from '../utils/worktree.js'

export interface ChainRunOptions {
  readonly task: string
  readonly args: string[]
  readonly depth: number
  readonly signal: AbortSignal
  readonly maxConcurrency: number
  readonly workspaceRoot?: string
  readonly worktree?: boolean
  readonly worktreeBaseDir?: string
  readonly runId?: string
  readonly skills?: string[]
  /** Step-boundary observer for the run panel; never affects the run's outcome. */
  readonly onStep?: (event: ChainStepProgress) => void
}

export interface ChainRunResult {
  readonly text: string
  readonly steps: StepResult[]
  readonly files: string[]
}

interface BoundTask {
  readonly name: string
  readonly agent?: string
  readonly model?: string
  readonly task: string
  readonly as?: string
  readonly tools?: SequentialStep['tools']
  readonly context: 'fresh' | 'fork'
  readonly reads?: string[]
  readonly outputMode?: SequentialStep['outputMode']
}

function bindSequential(step: SequentialStep, fallbackContext: 'fresh' | 'fork'): BoundTask {
  return {
    name: step.name,
    task: step.task,
    context: step.context ?? fallbackContext,
    ...step.agent !== undefined ? { agent: step.agent } : {},
    ...step.model !== undefined ? { model: step.model } : {},
    ...step.as !== undefined ? { as: step.as } : {},
    ...step.tools !== undefined ? { tools: step.tools } : {},
    ...step.reads !== undefined ? { reads: step.reads } : {},
    ...step.outputMode !== undefined ? { outputMode: step.outputMode } : {},
  }
}

function appendReads(prompt: string, reads?: string[]): string {
  if (!reads?.length) return prompt
  return `${prompt}\n\nRequired reads:\n${reads.map(path => `- ${path}`).join('\n')}`
}

async function writeFileOnlyOutput(
  runId: string,
  name: string,
  text: string,
  baseDir = tmpdir(),
): Promise<string> {
  const dir = join(baseDir, `dsh-smart-outputs-${runId}`)
  await mkdir(dir, { recursive: true })
  const path = join(dir, `${name}.txt`)
  await writeFile(path, text, 'utf8')
  return `Output saved to: ${path} (${Buffer.byteLength(text, 'utf8')}B)`
}

function bindParallelTask(
  stepName: string,
  task: ParallelTaskItem,
  index: number,
  fallbackContext: 'fresh' | 'fork',
): BoundTask {
  return {
    name: `${stepName}#${index + 1}`,
    task: task.task,
    context: task.context ?? fallbackContext,
    ...task.agent !== undefined ? { agent: task.agent } : {},
    ...task.model !== undefined ? { model: task.model } : {},
    ...task.as !== undefined ? { as: task.as } : {},
    ...task.tools !== undefined ? { tools: task.tools } : {},
  }
}

export class ChainExecutor {
  constructor(
    private readonly bridge: SubagentBridge,
    private readonly config: PluginConfig,
    private readonly now: () => number = () => Date.now(),
    private readonly fallbackContext: 'fresh' | 'fork' = 'fresh',
  ) {}

  async run(steps: ChainStep[], options: ChainRunOptions): Promise<ChainRunResult> {
    if (steps.length === 0) {
      throw new Error('chain must declare at least one step')
    }
    if (steps.length > this.config.maxChainSteps) {
      throw new Error(`chain exceeds maxChainSteps (${this.config.maxChainSteps})`)
    }
    validateChainOutputBindings(steps)

    const outputs: Record<string, string> = {}
    const collected: StepResult[] = []
    const files = new Set<string>()
    let previous = ''
    const runId = options.runId ?? `chain-${this.now().toString(36)}`

    for (const [index, step] of steps.entries()) {
      this.throwIfAborted(options.signal)
      const notify = (phase: ChainStepProgress['phase'], error?: unknown): void => {
        if (!options.onStep) return
        try {
          options.onStep({
            phase,
            index,
            name: step.name,
            ...error !== undefined ? { error: error instanceof Error ? error.message : String(error) } : {},
          })
        } catch {
          // A progress observer is advisory: it must never break the chain.
        }
      }
      notify('start')
      try {
        if (isParallelStep(step)) {
          const result = await this.runParallel(step, outputs, previous, options, runId)
          collected.push(...result.steps)
          for (const file of result.files) files.add(file)
          previous = result.text
        } else {
          const result = await this.runSequential(step, outputs, previous, options, runId)
          collected.push(result)
          for (const file of result.changedFiles) files.add(file)
          previous = result.text
          if (result.as) outputs[result.as] = result.text
        }
      } catch (error) {
        notify('end', error)
        throw error
      }
      notify('end')
    }

    return {
      text: previous,
      steps: collected,
      files: [...files],
    }
  }

  private async runSequential(
    step: SequentialStep,
    outputs: Record<string, string>,
    previous: string,
    options: ChainRunOptions,
    runId: string,
  ): Promise<StepResult> {
    const bound = bindSequential(step, this.fallbackContext)
    const prompt = appendReads(
      interpolateChainTask(substituteArgs(bound.task, options.args), options.task, previous, outputs),
      bound.reads,
    )
    const result = await this.delegate(bound, prompt, options)
    if (bound.outputMode !== 'file-only' || !bound.as) return result
    const pointer = await writeFileOnlyOutput(runId, bound.as, result.text, options.worktreeBaseDir)
    return { ...result, text: pointer }
  }

  private async runParallel(
    step: ParallelStep,
    outputs: Record<string, string>,
    previous: string,
    options: ChainRunOptions,
    runId: string,
  ): Promise<{ text: string; steps: StepResult[]; files: string[] }> {
    const tasks = step.parallel.map((task, index) => bindParallelTask(step.name, task, index, this.fallbackContext))
    const concurrency = Math.min(step.concurrency ?? options.maxConcurrency, options.maxConcurrency, tasks.length)
    const useWorktree = step.worktree ?? options.worktree === true
    const worktreeRoot = options.workspaceRoot ?? process.cwd()
    const worktrees = useWorktree ? createWorktrees(worktreeRoot, `${runId}-${step.name}`, tasks.length, options.worktreeBaseDir ?? tmpdir()) : undefined
    const diffsDir = useWorktree ? join(options.worktreeBaseDir ?? tmpdir(), `dsh-smart-diffs-${runId}-${step.name}`) : undefined
    if (diffsDir) await mkdir(diffsDir, { recursive: true })

    const failures: string[] = []
    const group = new AbortController()
    const abortGroup = (): void => { group.abort() }
    options.signal.addEventListener('abort', abortGroup)
    const scopedOptions = { ...options, signal: group.signal }
    try {
      const results = await mapConcurrent(tasks, concurrency, async (task, index) => {
        this.throwIfAborted(scopedOptions.signal)
        const prompt = interpolateChainTask(substituteArgs(task.task, scopedOptions.args), scopedOptions.task, previous, outputs)
        try {
          const result = await this.delegate(task, prompt, scopedOptions, worktrees?.worktrees[index]?.path)
          if (result.as) outputs[result.as] = result.text
          return { ok: true as const, result }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          failures.push(`${task.name}: ${message}`)
          if (step.failFast) {
            group.abort()
            throw error instanceof Error ? error : new Error(message)
          }
          return {
            ok: false as const,
            result: {
              name: task.name,
              ...task.agent ? { agent: task.agent } : {},
              ...task.model ? { model: task.model } : {},
              ...task.as ? { as: task.as } : {},
              text: '',
              durationMs: 0,
              changedFiles: [],
            } satisfies StepResult,
            error: message,
          }
        }
      })

      let diffs: WorktreeDiff[] = []
      if (worktrees && diffsDir) {
        diffs = diffWorktrees(worktrees, tasks.map(task => task.agent ?? task.name), diffsDir)
      }

      const stepResults = results.map((item, index) => {
        const diff = diffs[index]
        const result = item.result
        return {
          ...result,
          ...diff?.patch ? { worktreePatch: diff.patch } : {},
          changedFiles: diff && diff.filesChanged > 0 ? [...result.changedFiles, diff.patchPath] : result.changedFiles,
        }
      })
      const files = stepResults.flatMap(result => result.changedFiles)
      const text = aggregateParallelOutputs(results.map((item, index) => ({
        name: tasks[index]!.name,
        agent: tasks[index]!.agent,
        text: item.result.text,
        ...item.ok ? {} : { error: item.error },
      })))
      if (failures.length > 0 && step.failFast) {
        throw new Error(failures.join('; '))
      }
      return { text, steps: stepResults, files }
    } finally {
      options.signal.removeEventListener('abort', abortGroup)
      if (worktrees) cleanupWorktrees(worktrees)
    }
  }

  private async delegate(
    task: BoundTask,
    prompt: string,
    options: ChainRunOptions,
    cwd?: string,
  ): Promise<StepResult> {
    const started = this.now()
    const request: DelegationRequest = {
      prompt,
      label: task.name,
      context: task.context,
      signal: options.signal,
      depth: options.depth,
      ...task.agent ? { agent: task.agent } : {},
      ...task.model ? { model: task.model } : {},
      ...task.tools ? { tools: task.tools } : {},
      ...cwd ? { cwd } : {},
      ...options.skills ? { skills: options.skills } : {},
    }
    const result = await this.bridge.run(request)
    return {
      name: task.name,
      ...task.agent ? { agent: task.agent } : {},
      ...task.model ? { model: task.model } : {},
      ...task.as ? { as: task.as } : {},
      text: result.text,
      durationMs: this.now() - started,
      changedFiles: result.changedFiles ?? [],
    }
  }

  private throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) throw new Error('Operation cancelled by user')
  }
}
