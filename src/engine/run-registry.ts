import type {
  ChainRunCancelResult,
  ChainRunHandle,
  ChainRunListFilter,
  ChainRunRecord,
  ChainRunStartInput,
  ChainRunStatus,
  ChainRunStep,
  ChainRunStepStatus,
} from '../types/runs.js'

export interface ChainRunRegistryOptions {
  /** Terminal runs kept before the oldest are dropped. Default 20. */
  readonly retainFinished?: number
  /** Terminal runs older than this are dropped on read. Default 10 minutes. */
  readonly finishedTtlMs?: number
  readonly now?: () => number
  readonly idFactory?: (sequence: number, now: number) => string
}

interface MutableRun {
  readonly id: string
  readonly command: string
  readonly sessionId: string
  readonly workspaceRoot: string
  status: ChainRunStatus
  readonly startedAt: number
  endedAt: number | undefined
  round: number
  readonly rounds: number
  steps: ChainRunStep[]
  files: string[]
  text: string | undefined
  error: string | undefined
  readonly controller: AbortController
}

const DEFAULT_RETAIN_FINISHED = 20
const DEFAULT_FINISHED_TTL_MS = 10 * 60_000

function defaultIdFactory(sequence: number, now: number): string {
  return `run-${now.toString(36)}-${sequence.toString(36)}`
}

/**
 * In-memory table of detached chain runs.
 *
 * The slash-command handler settles as soon as a run starts (the composer
 * unlocks with it), so the run — not the command transaction — owns the live
 * progress the dock panel reads and the AbortController that cancels it.
 *
 * Every mutator is defensive on purpose: a progress observer is called from
 * inside the chain executor, and an unknown or already-terminal run must be a
 * silent no-op rather than an exception thrown into the running chain.
 */
export class ChainRunRegistry {
  private readonly runs = new Map<string, MutableRun>()
  private readonly retainFinished: number
  private readonly finishedTtlMs: number
  private readonly now: () => number
  private readonly idFactory: (sequence: number, now: number) => string
  private sequence = 0

  constructor(options: ChainRunRegistryOptions = {}) {
    this.retainFinished = Math.max(0, options.retainFinished ?? DEFAULT_RETAIN_FINISHED)
    this.finishedTtlMs = Math.max(0, options.finishedTtlMs ?? DEFAULT_FINISHED_TTL_MS)
    this.now = options.now ?? (() => Date.now())
    this.idFactory = options.idFactory ?? defaultIdFactory
  }

  /** Register a new run and mint the handle its executor observes and cancels. */
  start(input: ChainRunStartInput): ChainRunHandle {
    const at = this.now()
    this.sequence += 1
    const id = this.idFactory(this.sequence, at)
    const run: MutableRun = {
      id,
      command: input.command,
      sessionId: input.sessionId,
      workspaceRoot: input.workspaceRoot,
      status: 'running',
      startedAt: at,
      endedAt: undefined,
      round: 1,
      rounds: Math.max(1, input.rounds ?? 1),
      steps: input.stepNames.map((name, index) => ({ name, index, status: 'pending' as ChainRunStepStatus })),
      files: [],
      text: undefined,
      error: undefined,
      controller: new AbortController(),
    }
    this.runs.set(id, run)
    this.prune()
    return { id, signal: run.controller.signal }
  }

  /** Reset per-step status for one `loop` round; later rounds replay the same steps. */
  beginRound(id: string, round: number): void {
    const run = this.runs.get(id)
    if (!run || run.status !== 'running') return
    run.round = Math.max(1, round)
    run.steps = run.steps.map(step => ({ name: step.name, index: step.index, status: 'pending' as ChainRunStepStatus }))
  }

  stepStarted(id: string, index: number): void {
    this.patchStep(id, index, { status: 'running', startedAt: this.now() })
  }

  stepFinished(id: string, index: number, patch: { status: ChainRunStepStatus; error?: string } = { status: 'done' }): void {
    this.patchStep(id, index, {
      status: patch.status,
      endedAt: this.now(),
      ...patch.error ? { error: patch.error } : {},
    })
  }

  /** Settle the run. A cancelled run stays cancelled — cancellation wins the race. */
  finish(
    id: string,
    outcome: { status: Exclude<ChainRunStatus, 'running'>; text?: string; error?: string; files?: readonly string[] },
  ): void {
    const run = this.runs.get(id)
    if (!run || run.status !== 'running') return
    if (outcome.text !== undefined) run.text = outcome.text
    if (outcome.error !== undefined) run.error = outcome.error
    if (outcome.files) run.files = [...outcome.files]
    run.status = outcome.status
    run.endedAt = this.now()
    run.steps = run.steps.map(step =>
      step.status === 'running' ? { ...step, status: 'skipped' as ChainRunStepStatus, endedAt: run.endedAt } : step,
    )
  }

  get(id: string): ChainRunRecord | undefined {
    const run = this.runs.get(id)
    return run ? snapshotOf(run) : undefined
  }

  /** Live runs first (oldest first), then terminal runs (most recent first). */
  list(filter: ChainRunListFilter = {}): ChainRunRecord[] {
    this.prune()
    const includeFinished = filter.includeFinished !== false
    const records: ChainRunRecord[] = []
    for (const run of this.runs.values()) {
      if (filter.sessionId !== undefined && run.sessionId !== filter.sessionId) continue
      if (filter.workspaceRoot !== undefined && run.workspaceRoot !== filter.workspaceRoot) continue
      if (!includeFinished && run.status !== 'running') continue
      records.push(snapshotOf(run))
    }
    return records.sort((a, b) => {
      if (a.status === 'running' && b.status !== 'running') return -1
      if (b.status === 'running' && a.status !== 'running') return 1
      if (a.status === 'running') return a.startedAt - b.startedAt
      return (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt)
    })
  }

  /**
   * Cancel one live run by aborting its own signal.
   * @param sessionId - when given, the run must belong to that session.
   */
  cancel(id: string, sessionId?: string): ChainRunCancelResult {
    const run = this.runs.get(id)
    if (!run) return { ok: false, error: `unknown run: ${id}` }
    if (sessionId !== undefined && run.sessionId !== sessionId) {
      return { ok: false, error: 'run belongs to another session' }
    }
    if (run.status !== 'running') return { ok: false, error: `run already ${run.status}` }
    run.status = 'cancelled'
    run.endedAt = this.now()
    run.controller.abort()
    return { ok: true, runId: id }
  }

  /** Abort every live run (plugin disposal). @returns how many were cancelled. */
  cancelAll(): number {
    let cancelled = 0
    for (const run of [...this.runs.values()]) {
      if (run.status !== 'running') continue
      run.status = 'cancelled'
      run.endedAt = this.now()
      run.controller.abort()
      cancelled += 1
    }
    return cancelled
  }

  private patchStep(id: string, index: number, patch: Partial<ChainRunStep>): void {
    const run = this.runs.get(id)
    if (!run || run.status !== 'running') return
    const step = run.steps[index]
    if (!step) return
    run.steps[index] = { ...step, ...patch, name: step.name, index: step.index }
  }

  private prune(): void {
    const at = this.now()
    const terminal = [...this.runs.values()]
      .filter(run => run.status !== 'running')
      .sort((a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt))
    terminal.forEach((run, position) => {
      const expired = at - (run.endedAt ?? run.startedAt) > this.finishedTtlMs
      const beyondRetention = position >= this.retainFinished
      if (expired || beyondRetention) this.runs.delete(run.id)
    })
  }
}

function snapshotOf(run: MutableRun): ChainRunRecord {
  return {
    id: run.id,
    command: run.command,
    sessionId: run.sessionId,
    workspaceRoot: run.workspaceRoot,
    status: run.status,
    startedAt: run.startedAt,
    ...run.endedAt !== undefined ? { endedAt: run.endedAt } : {},
    round: run.round,
    rounds: run.rounds,
    steps: run.steps.map(step => ({ ...step })),
    files: [...run.files],
    ...run.text !== undefined ? { text: run.text } : {},
    ...run.error !== undefined ? { error: run.error } : {},
  }
}
