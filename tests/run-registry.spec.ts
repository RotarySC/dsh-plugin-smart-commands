import { describe, expect, it } from 'vitest'
import { ChainRunRegistry } from '../src/engine/run-registry.js'
import type { ChainRunRecord } from '../src/types/runs.js'

function harness(options: { retainFinished?: number; finishedTtlMs?: number } = {}) {
  let clock = 1_000
  const registry = new ChainRunRegistry({
    ...options,
    now: () => clock,
    idFactory: (sequence) => `run-${sequence}`,
  })
  return {
    registry,
    tick: (ms = 100) => { clock += ms },
    at: () => clock,
  }
}

function startRun(registry: ChainRunRegistry, command = 'pipeline', sessionId = 's1') {
  return registry.start({
    command,
    sessionId,
    workspaceRoot: '/ws',
    stepNames: ['plan', 'build', 'verify'],
  })
}

describe('ChainRunRegistry', () => {
  it('records a live run with pending steps and an unaborted signal', () => {
    const { registry, at } = harness()
    const handle = startRun(registry)

    expect(handle.id).toBe('run-1')
    expect(handle.signal.aborted).toBe(false)

    const [run] = registry.list()
    expect(run).toBeDefined()
    expect(run!.status).toBe('running')
    expect(run!.command).toBe('pipeline')
    expect(run!.sessionId).toBe('s1')
    expect(run!.startedAt).toBe(at())
    expect(run!.round).toBe(1)
    expect(run!.rounds).toBe(1)
    expect(run!.steps.map(step => step.status)).toEqual(['pending', 'pending', 'pending'])
    expect(run!.steps.map(step => step.index)).toEqual([0, 1, 2])
  })

  it('mints distinct ids across runs', () => {
    const { registry } = harness()
    const first = startRun(registry)
    const second = startRun(registry)
    expect(first.id).not.toBe(second.id)
    expect(registry.list()).toHaveLength(2)
  })

  it('tracks step start and completion timestamps', () => {
    const { registry, tick } = harness()
    const handle = startRun(registry)

    registry.stepStarted(handle.id, 0)
    tick(250)
    registry.stepFinished(handle.id, 0, { status: 'done' })

    const [run] = registry.list()
    expect(run!.steps[0]).toMatchObject({ status: 'done', startedAt: 1_000, endedAt: 1_250 })
    expect(run!.steps[1]!.status).toBe('pending')
  })

  it('records a step failure without ending the run', () => {
    const { registry } = harness()
    const handle = startRun(registry)

    registry.stepStarted(handle.id, 1)
    registry.stepFinished(handle.id, 1, { status: 'failed', error: 'boom' })

    const [run] = registry.list()
    expect(run!.status).toBe('running')
    expect(run!.steps[1]).toMatchObject({ status: 'failed', error: 'boom' })
  })

  it('settles the run and skips the interrupted step', () => {
    const { registry, tick, at } = harness()
    const handle = startRun(registry)

    registry.stepStarted(handle.id, 0)
    registry.stepFinished(handle.id, 0, { status: 'done' })
    registry.stepStarted(handle.id, 1)
    tick(400)
    registry.finish(handle.id, { status: 'succeeded', text: 'all good', files: ['a.ts'] })

    const [run] = registry.list()
    expect(run!.status).toBe('succeeded')
    expect(run!.endedAt).toBe(at())
    expect(run!.text).toBe('all good')
    expect(run!.files).toEqual(['a.ts'])
    expect(run!.steps.map(step => step.status)).toEqual(['done', 'skipped', 'pending'])
  })

  it('resets per-step status on a later loop round', () => {
    const { registry } = harness()
    const handle = registry.start({
      command: 'looping',
      sessionId: 's1',
      workspaceRoot: '/ws',
      stepNames: ['a', 'b'],
      rounds: 3,
    })
    registry.stepFinished(handle.id, 0, { status: 'done' })
    registry.stepFinished(handle.id, 1, { status: 'done' })

    registry.beginRound(handle.id, 2)

    const [run] = registry.list()
    expect(run!.round).toBe(2)
    expect(run!.rounds).toBe(3)
    expect(run!.steps.map(step => step.status)).toEqual(['pending', 'pending'])
  })

  it('cancels by aborting the run signal, and cancellation wins the race', () => {
    const { registry } = harness()
    const handle = startRun(registry)

    const result = registry.cancel(handle.id, 's1')

    expect(result).toEqual({ ok: true, runId: handle.id })
    expect(handle.signal.aborted).toBe(true)
    expect(registry.list()[0]!.status).toBe('cancelled')

    registry.finish(handle.id, { status: 'succeeded', text: 'too late' })
    expect(registry.list()[0]!.status).toBe('cancelled')
  })

  it('refuses to cancel across sessions, unknown runs, and settled runs', () => {
    const { registry } = harness()
    const handle = startRun(registry, 'pipeline', 's1')

    expect(registry.cancel(handle.id, 'other')).toEqual({ ok: false, error: 'run belongs to another session' })
    expect(handle.signal.aborted).toBe(false)

    expect(registry.cancel('missing')).toEqual({ ok: false, error: 'unknown run: missing' })

    registry.finish(handle.id, { status: 'succeeded' })
    expect(registry.cancel(handle.id)).toEqual({ ok: false, error: 'run already succeeded' })
  })

  it('cancels every live run on disposal', () => {
    const { registry } = harness()
    const first = startRun(registry)
    const second = startRun(registry)
    registry.finish(second.id, { status: 'succeeded' })

    expect(registry.cancelAll()).toBe(1)
    expect(first.signal.aborted).toBe(true)
    expect(registry.list().find(run => run.id === second.id)!.status).toBe('succeeded')
  })

  it('filters by session, workspace, and liveness', () => {
    const { registry } = harness()
    const mine = registry.start({ command: 'a', sessionId: 's1', workspaceRoot: '/ws', stepNames: [] })
    registry.start({ command: 'b', sessionId: 's2', workspaceRoot: '/ws', stepNames: [] })
    registry.start({ command: 'c', sessionId: 's1', workspaceRoot: '/other', stepNames: [] })
    registry.finish(mine.id, { status: 'succeeded' })

    // Live runs sort before terminal ones: c is still running, a already settled.
    expect(registry.list({ sessionId: 's1' }).map(run => run.command)).toEqual(['c', 'a'])
    expect(registry.list({ workspaceRoot: '/ws' }).map(run => run.command)).toEqual(['b', 'a'])
    expect(registry.list({ sessionId: 's1', includeFinished: false }).map(run => run.command)).toEqual(['c'])
    expect(registry.list({ includeFinished: false }).map(run => run.command)).toEqual(['b', 'c'])
  })

  it('lists live runs first (oldest first), then terminal runs (newest first)', () => {
    const { registry, tick } = harness()
    const older = startRun(registry, 'older')
    registry.finish(older.id, { status: 'succeeded' })
    tick()
    const newer = startRun(registry, 'newer')
    registry.finish(newer.id, { status: 'failed', error: 'nope' })
    tick()
    const live = startRun(registry, 'live')

    expect(registry.list().map(run => run.command)).toEqual(['live', 'newer', 'older'])
    expect(live.signal.aborted).toBe(false)
  })

  it('drops terminal runs beyond the retention count but never live ones', () => {
    const { registry, tick } = harness({ retainFinished: 2 })
    const live = startRun(registry, 'live')
    for (const name of ['one', 'two', 'three']) {
      const handle = startRun(registry, name)
      tick()
      registry.finish(handle.id, { status: 'succeeded' })
    }

    expect(registry.list().map(run => run.command)).toEqual(['live', 'three', 'two'])
    expect(registry.get(live.id)!.status).toBe('running')
  })

  it('drops terminal runs past the TTL', () => {
    const { registry, tick } = harness({ finishedTtlMs: 500 })
    const handle = startRun(registry)
    registry.finish(handle.id, { status: 'succeeded' })
    expect(registry.list()).toHaveLength(1)

    tick(600)
    expect(registry.list()).toHaveLength(0)
  })

  it('ignores progress for unknown or settled runs instead of throwing', () => {
    const { registry } = harness()
    const handle = startRun(registry)
    registry.finish(handle.id, { status: 'succeeded' })

    expect(() => {
      registry.stepStarted('missing', 0)
      registry.stepFinished('missing', 9, { status: 'done' })
      registry.beginRound('missing', 2)
      registry.stepStarted(handle.id, 0)
      registry.stepFinished(handle.id, 99, { status: 'done' })
      registry.beginRound(handle.id, 2)
      registry.finish('missing', { status: 'failed' })
    }).not.toThrow()

    const [run] = registry.list()
    expect(run!.status).toBe('succeeded')
    expect(run!.steps.map(step => step.status)).toEqual(['pending', 'pending', 'pending'])
    expect(run!.round).toBe(1)
  })

  it('exposes snapshots detached from later mutation', () => {
    const { registry } = harness()
    const handle = startRun(registry)
    const before = registry.get(handle.id)!

    registry.stepStarted(handle.id, 0)
    registry.finish(handle.id, { status: 'succeeded', files: ['x.ts'] })

    expect(before.status).toBe('running')
    expect(before.steps[0]!.status).toBe('pending')
    expect(before.files).toEqual([])
    expect(registry.get(handle.id)!.status).toBe('succeeded')
  })

  it('reports a settled run to its observer exactly once', () => {
    const { registry } = harness()
    const settled: ChainRunRecord[] = []
    const handle = registry.start({
      command: 'pipeline',
      sessionId: 's1',
      workspaceRoot: '/ws',
      stepNames: ['scan'],
      onSettled: run => { settled.push(run) },
    })

    registry.finish(handle.id, { status: 'succeeded', text: 'all good' })
    registry.finish(handle.id, { status: 'failed', error: 'too late' })
    registry.cancel(handle.id)

    expect(settled).toHaveLength(1)
    expect(settled[0]).toMatchObject({ status: 'succeeded', text: 'all good' })
  })

  it('reports a cancelled run, but stays silent when disposal cancels', () => {
    const { registry } = harness()
    const settled: ChainRunRecord[] = []
    const observe = (run: ChainRunRecord): void => { settled.push(run) }
    const cancelled = registry.start({
      command: 'a', sessionId: 's1', workspaceRoot: '/ws', stepNames: ['scan'], onSettled: observe,
    })
    registry.start({
      command: 'b', sessionId: 's1', workspaceRoot: '/ws', stepNames: ['scan'], onSettled: observe,
    })
    registry.stepStarted(cancelled.id, 0)

    registry.cancel(cancelled.id, 's1')
    expect(settled.map(run => run.status)).toEqual(['cancelled'])
    // The interrupted step is settled with the run, never left looking live.
    expect(settled[0]!.steps[0]!.status).toBe('skipped')

    expect(registry.cancelAll()).toBe(1)
    expect(settled).toHaveLength(1)
  })

  it('absorbs an observer that throws', () => {
    const { registry } = harness()
    const handle = registry.start({
      command: 'pipeline',
      sessionId: 's1',
      workspaceRoot: '/ws',
      stepNames: ['scan'],
      onSettled: () => { throw new Error('observer exploded') },
    })

    expect(() => registry.finish(handle.id, { status: 'succeeded' })).not.toThrow()
    expect(registry.get(handle.id)!.status).toBe('succeeded')
  })

  it('drops a settled run on dismiss so no later list can show it again', () => {
    const { registry } = harness()
    const handle = startRun(registry)
    registry.finish(handle.id, { status: 'succeeded', text: 'done' })

    expect(registry.dismiss(handle.id, 's1')).toEqual({ ok: true, runId: handle.id })
    expect(registry.get(handle.id)).toBeUndefined()
    expect(registry.list()).toEqual([])
    expect(registry.dismiss(handle.id)).toEqual({ ok: false, error: `unknown run: ${handle.id}` })
  })

  it('refuses to dismiss a live run, a foreign run, or an unknown one', () => {
    const { registry } = harness()
    const handle = startRun(registry)

    expect(registry.dismiss(handle.id, 'other')).toEqual({ ok: false, error: 'run belongs to another session' })
    expect(registry.dismiss(handle.id, 's1')).toEqual({ ok: false, error: 'run is still running; cancel it first' })
    expect(registry.dismiss('missing')).toEqual({ ok: false, error: 'unknown run: missing' })
    // A refused dismiss never disturbs the run itself.
    expect(registry.get(handle.id)!.status).toBe('running')
    expect(handle.signal.aborted).toBe(false)
  })

  it('dismisses a cancelled run once the cancel settled it', () => {
    const { registry } = harness()
    const handle = startRun(registry)
    registry.cancel(handle.id, 's1')

    expect(registry.dismiss(handle.id, 's1')).toEqual({ ok: true, runId: handle.id })
    expect(registry.list()).toEqual([])
  })
})
