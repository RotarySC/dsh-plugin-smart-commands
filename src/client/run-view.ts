import type { ChainRunRecord, ChainRunStep } from '../types/runs.js'

/**
 * How long a settled run stays visible in the dock after it ends.
 *
 * Matches the host's default retention window (`ChainRunRegistry`
 * `finishedTtlMs`, 10 minutes / 20 runs) on purpose: a detached chain no longer
 * returns its aggregate text as the command result, so the panel is where the
 * outcome lives — hiding it earlier would lose the result. The panel is
 * collapsible, so a lingering row costs one header line.
 */
export const FINISHED_VISIBLE_MS = 10 * 60_000

/** Terminal step states count as done for progress purposes. */
const SETTLED_STEPS = new Set(['done', 'failed', 'skipped'])

export interface RunProgress {
  readonly done: number
  readonly total: number
  readonly runningIndex: number | undefined
  readonly percent: number
}

/** Step progress of one run; a stepless run is 0% while live and 100% once settled. */
export function runProgress(run: ChainRunRecord): RunProgress {
  const total = run.steps.length
  const done = run.steps.filter(step => SETTLED_STEPS.has(step.status)).length
  const runningIndex = run.steps.findIndex(step => step.status === 'running')
  const percent = total === 0
    ? run.status === 'running' ? 0 : 100
    : Math.round((done / total) * 100)
  return {
    done,
    total,
    runningIndex: runningIndex === -1 ? undefined : runningIndex,
    percent,
  }
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

/** Compact human duration: `840ms`, `12.3s`, `3m 05s`. */
export function formatDuration(ms: number): string {
  if (ms < 1_000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1_000)
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

/**
 * The dock's roster: every live run plus settled runs that ended within `ttl`.
 * Order is the host's (live oldest-first, then most recently settled).
 */
export function visibleRuns(
  runs: readonly ChainRunRecord[],
  now: number,
  ttl: number = FINISHED_VISIBLE_MS,
): ChainRunRecord[] {
  return runs.filter(run => isLive(run) || (run.endedAt !== undefined && now - run.endedAt <= ttl))
}

/** Ids worth cancelling from one roster snapshot. */
export function liveRunIds(runs: readonly ChainRunRecord[]): string[] {
  return runs.filter(isLive).map(run => run.id)
}
