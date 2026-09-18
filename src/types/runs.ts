/**
 * Chain run state: the live view of one template run that executes detached
 * from the slash-command transaction. Every value here is plain JSON by
 * construction — the same records ride the Typert remote to the client, so no
 * class instance or AbortController may leak into a snapshot.
 */

/** Terminal-or-live lifecycle of one detached run. */
export type ChainRunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled'

/** Per-step status inside one run (one entry per chain step, not per task). */
export type ChainRunStepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped'

export interface ChainRunStep {
  readonly name: string
  readonly index: number
  readonly status: ChainRunStepStatus
  readonly startedAt?: number
  readonly endedAt?: number
  readonly error?: string
}

export interface ChainRunRecord {
  readonly id: string
  /** Template name that owns the run (its catalog name, not the slash name). */
  readonly command: string
  /** Owning DSH session (`invocation.agent.id`) — the panel filters on this. */
  readonly sessionId: string
  readonly workspaceRoot: string
  readonly status: ChainRunStatus
  readonly startedAt: number
  readonly endedAt?: number
  /** 1-based `loop` round currently executing. */
  readonly round: number
  readonly rounds: number
  readonly steps: readonly ChainRunStep[]
  readonly files: readonly string[]
  readonly text?: string
  readonly error?: string
}

export interface ChainRunStartInput {
  readonly command: string
  readonly sessionId: string
  readonly workspaceRoot: string
  readonly stepNames: readonly string[]
  /** `loop:` count; defaults to 1. */
  readonly rounds?: number
  /**
   * Called once with the terminal snapshot when the run ends — settled by its
   * own work, or cancelled through the run panel. Deliberately NOT called for a
   * disposal cancel ({@link ChainRunRegistry.cancelAll}): unloading the plugin is
   * teardown, and every live run reporting at once would only inject noise into
   * the sessions it is trying to leave. A throwing observer never affects the run.
   */
  readonly onSettled?: (run: ChainRunRecord) => void
}

export interface ChainRunListFilter {
  readonly sessionId?: string
  readonly workspaceRoot?: string
  /** Include terminal runs (bounded by retention); defaults to true. */
  readonly includeFinished?: boolean
}

export interface ChainRunHandle {
  readonly id: string
  /** Aborts the run's own work — never the caller's command-transaction signal. */
  readonly signal: AbortSignal
}

/**
 * One chain step boundary reported by {@link ChainExecutor}. A progress hook is
 * advisory: it must never be load-bearing for the run's outcome.
 */
export interface ChainStepProgress {
  readonly phase: 'start' | 'end'
  readonly index: number
  readonly name: string
  readonly error?: string
}

/** Remote request scope for `listRuns`. Terminal runs are always included. */
export interface ChainRunScope {
  readonly sessionId?: string
  readonly workspaceRoot?: string
}

/** Remote result for `listRuns`. */
export interface ChainRunInventory {
  readonly runs: ChainRunRecord[]
}

/** Remote request for `cancelRun`. */
export interface ChainRunCancelRequest {
  readonly runId: string
  /** Scope guard: the panel only cancels runs of its own session. */
  readonly sessionId?: string
}

/** Remote result for `cancelRun`. */
export interface ChainRunCancelResult {
  readonly ok: boolean
  readonly runId?: string
  readonly error?: string
}

/**
 * Remote request for `dismissRun`.
 *
 * The dock's close button means "I am done with this row", so the row has to
 * leave the *table*, not merely one browser's memory: a client-local hide
 * resurrects on the next `listRuns` (session switch, reload, second tab).
 */
export interface ChainRunDismissRequest {
  readonly runId: string
  /** Scope guard: the panel only dismisses runs of its own session. */
  readonly sessionId?: string
}

/** Remote result for `dismissRun`. */
export interface ChainRunDismissResult {
  readonly ok: boolean
  readonly runId?: string
  readonly error?: string
}
