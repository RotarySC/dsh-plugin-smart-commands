import { describe, expect, it } from 'vitest'
import type { ChainRunRecord, ChainRunStep } from '../src/types/runs.ts'
import {
  FINISHED_VISIBLE_MS,
  currentStep,
  elapsedMs,
  isLive,
  runProgress,
  runStatusCounts,
  visibleRuns,
} from '../src/client/run-view.ts'

function step(name: string, index: number, status: ChainRunStep['status']): ChainRunStep {
  return { name, index, status }
}

function run(overrides: Partial<ChainRunRecord> = {}): ChainRunRecord {
  return {
    id: 'run-1',
    command: 'pipeline',
    sessionId: 's1',
    workspaceRoot: '/ws',
    status: 'running',
    startedAt: 1_000,
    round: 1,
    rounds: 1,
    steps: [step('scan', 0, 'pending'), step('fix', 1, 'pending')],
    files: [],
    ...overrides,
  }
}

describe('run progress', () => {
  it('reports a fresh run as two steps to go', () => {
    expect(runProgress(run())).toEqual({ done: 0, total: 2 })
  })

  it('counts settled steps', () => {
    const progress = runProgress(run({
      steps: [step('scan', 0, 'done'), step('fix', 1, 'running'), step('verify', 2, 'pending')],
    }))
    expect(progress).toEqual({ done: 1, total: 3 })
  })

  it('treats failed and skipped steps as settled but keeps pending visible', () => {
    const progress = runProgress(run({
      status: 'failed',
      endedAt: 2_000,
      steps: [step('scan', 0, 'done'), step('fix', 1, 'failed'), step('verify', 2, 'skipped'), step('ship', 3, 'pending')],
    }))
    expect(progress.done).toBe(3)
    expect(progress.total).toBe(4)
  })

  it('reports a stepless run as nothing to enumerate', () => {
    expect(runProgress(run({ steps: [] }))).toEqual({ done: 0, total: 0 })
    expect(runProgress(run({ steps: [], status: 'succeeded', endedAt: 2_000 }))).toEqual({ done: 0, total: 0 })
  })

  it('names the live step first, then the next pending one', () => {
    expect(currentStep(run({ steps: [step('scan', 0, 'done'), step('fix', 1, 'running')] }))?.name).toBe('fix')
    expect(currentStep(run({ steps: [step('scan', 0, 'done'), step('fix', 1, 'pending')] }))?.name).toBe('fix')
    expect(currentStep(run({ steps: [step('scan', 0, 'done')], status: 'succeeded' }))).toBeUndefined()
  })
})

describe('run roster header counts', () => {
  it('reports only the statuses present, most current first', () => {
    const roster = [
      run({ id: 'a', status: 'succeeded', endedAt: 2_000 }),
      run({ id: 'b', status: 'running' }),
      run({ id: 'c', status: 'succeeded', endedAt: 3_000 }),
      run({ id: 'd', status: 'failed', endedAt: 4_000 }),
      run({ id: 'e', status: 'cancelled', endedAt: 5_000 }),
    ]
    expect(runStatusCounts(roster)).toEqual([
      { status: 'running', count: 1 },
      { status: 'failed', count: 1 },
      { status: 'succeeded', count: 2 },
      { status: 'cancelled', count: 1 },
    ])
  })

  it('accounts for nothing when the roster is empty', () => {
    expect(runStatusCounts([])).toEqual([])
  })
})

describe('run timing', () => {
  it('measures a live run against the clock and a settled run against its end', () => {
    expect(elapsedMs(run(), 3_500)).toBe(2_500)
    expect(elapsedMs(run({ status: 'succeeded', endedAt: 4_000 }), 9_999)).toBe(3_000)
    expect(elapsedMs(run({ startedAt: 5_000 }), 1_000)).toBe(0)
  })
})

describe('run roster', () => {
  it('keeps every live run and only recently settled ones', () => {
    const now = 100_000
    const roster = visibleRuns([
      run({ id: 'live' }),
      run({ id: 'fresh', status: 'succeeded', endedAt: now - 1_000 }),
      run({ id: 'stale', status: 'succeeded', endedAt: now - FINISHED_VISIBLE_MS - 1 }),
    ], now)
    expect(roster.map(item => item.id)).toEqual(['live', 'fresh'])
  })

  it('honours a custom visibility window', () => {
    const now = 10_000
    const settled = run({ status: 'cancelled', endedAt: now - 500 })
    expect(visibleRuns([settled], now, { ttl: 100 })).toEqual([])
    expect(visibleRuns([settled], now, { ttl: 1_000 })).toHaveLength(1)
  })

  it('hides dismissed rows, keeps pinned rows past the window, and never hides a live run', () => {
    const now = 100_000
    const stale = run({ id: 'stale', status: 'succeeded', endedAt: now - FINISHED_VISIBLE_MS - 1 })
    const fresh = run({ id: 'fresh', status: 'succeeded', endedAt: now - 1_000 })

    expect(visibleRuns([fresh], now, { dismissed: new Set(['fresh']) })).toEqual([])
    expect(visibleRuns([fresh], now)).toHaveLength(1)
    expect(visibleRuns([stale], now, { pinned: new Set(['stale']) }).map(item => item.id)).toEqual(['stale'])
    expect(visibleRuns([stale], now, { dismissed: new Set(['stale']), pinned: new Set(['stale']) })).toEqual([])
    // A live run owns the only cancel control, so dismissal cannot hide it.
    expect(visibleRuns([run({ id: 'live' })], now, { dismissed: new Set(['live']) })).toHaveLength(1)
  })

  it('drops settled runs that report no end time', () => {
    expect(visibleRuns([run({ status: 'failed' })], 10_000)).toEqual([])
  })

  it('classifies live rows apart from settled ones', () => {
    const rows = [run({ id: 'a' }), run({ id: 'b', status: 'succeeded', endedAt: 2 })]
    expect(rows.map(isLive)).toEqual([true, false])
  })
})
