import type { ChainRunRecord, ChainRunStatus, ChainRunStep } from '../types/runs.js'

/**
 * How long a settled run stays visible in the dock before it clears itself.
 *
 * A detached chain no longer returns its aggregate text as the command result,
 * so the panel is where the outcome lives — which is why a row the user opened
 * ("pinned") stays until it is dismissed, while an unopened one clears itself
 * after this window instead of lingering over the composer.
 */
export const FINISHED_VISIBLE_MS = 90_000

/** Terminal step states count as done for progress purposes. */
const SETTLED_STEPS = new Set(['done', 'failed', 'skipped'])

export interface RunProgress {
  readonly done: number
  readonly total: number
}

/** Step progress of one run: how many of its steps have reached a terminal state. */
export function runProgress(run: ChainRunRecord): RunProgress {
  const total = run.steps.length
  const done = run.steps.filter(step => SETTLED_STEPS.has(step.status)).length
  return { done, total }
}

/** The step to name in the dock: the live one, else the next pending one. */
export function currentStep(run: ChainRunRecord): ChainRunStep | undefined {
  return run.steps.find(step => step.status === 'running')
    ?? run.steps.find(step => step.status === 'pending')
}

export function isLive(run: ChainRunRecord): boolean {
  return run.status === 'running'
}

/** Wall-clock time the run has been (or was) alive. */
export function elapsedMs(run: ChainRunRecord, now: number): number {
  return Math.max(0, (run.endedAt ?? now) - run.startedAt)
}

export interface RunRosterOptions {
  /** Window a settled, unopened run stays visible; defaults to {@link FINISHED_VISIBLE_MS}. */
  readonly ttl?: number
  /** Rows the user closed. */
  readonly dismissed?: ReadonlySet<string>
  /** Rows the user opened; kept past the TTL until dismissed. */
  readonly pinned?: ReadonlySet<string>
}

/**
 * The dock's roster: every live run, every settled run inside the window (or
 * pinned open), minus the rows the user dismissed. Order is the host's (live
 * oldest-first, then most recently settled).
 */
export function visibleRuns(
  runs: readonly ChainRunRecord[],
  now: number,
  options: RunRosterOptions = {},
): ChainRunRecord[] {
  const ttl = options.ttl ?? FINISHED_VISIBLE_MS
  return runs.filter(run => {
    // A live run is never hidden: it owns the only cancel control.
    if (isLive(run)) return true
    if (options.dismissed?.has(run.id) === true) return false
    if (options.pinned?.has(run.id) === true) return true
    return run.endedAt !== undefined && now - run.endedAt <= ttl
  })
}

/** The statuses the panel's header account reports, most current first. */
const HEADER_STATUS_ORDER: readonly ChainRunStatus[] = ['running', 'failed', 'succeeded', 'cancelled']

export interface RunStatusCount {
  readonly status: ChainRunStatus
  readonly count: number
}

/**
 * How the dock's header accounts for its roster — the equivalent of the todo
 * dock's `8 已完成`. Only statuses that are actually present are returned, in
 * {@link HEADER_STATUS_ORDER}, so the caller joins them with the same status
 * labels it already shows per row.
 */
export function runStatusCounts(runs: readonly ChainRunRecord[]): RunStatusCount[] {
  return HEADER_STATUS_ORDER
    .map(status => ({ status, count: runs.filter(run => run.status === status).length }))
    .filter(entry => entry.count > 0)
}
