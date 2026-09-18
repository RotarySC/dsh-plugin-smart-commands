import { describe, expect, it } from 'vitest'
import { ChainRunRegistry } from '../src/engine/run-registry.ts'
import { SmartCommandsRunApi } from '../src/remote/run-api.ts'

function registryWithRuns(): { runs: ChainRunRegistry; first: string; second: string } {
  const runs = new ChainRunRegistry()
  const first = runs.start({
    command: 'pipeline',
    sessionId: 's1',
    workspaceRoot: '/ws',
    stepNames: ['scan', 'fix'],
  })
  const second = runs.start({
    command: 'audit',
    sessionId: 's2',
    workspaceRoot: '/ws',
    stepNames: ['read'],
  })
  return { runs, first: first.id, second: second.id }
}

describe('smartCommands run remote api', () => {
  it('lists the whole table by default', async () => {
    const { runs } = registryWithRuns()
    const inventory = await new SmartCommandsRunApi(runs).listRuns()
    expect(inventory.runs.map(run => run.command)).toEqual(['pipeline', 'audit'])
    expect(inventory.runs[0]?.steps.map(step => step.name)).toEqual(['scan', 'fix'])
  })

  it('scopes the roster to one session', async () => {
    const { runs } = registryWithRuns()
    const inventory = await new SmartCommandsRunApi(runs).listRuns({ sessionId: 's2' })
    expect(inventory.runs.map(run => run.command)).toEqual(['audit'])
  })

  it('drops settled runs when the caller asks for live ones only', async () => {
    const { runs, first } = registryWithRuns()
    runs.finish(first, { status: 'succeeded' })
    const api = new SmartCommandsRunApi(runs)
    expect((await api.listRuns()).runs.map(run => run.command)).toEqual(['audit', 'pipeline'])
    expect((await api.listRuns({ includeFinished: false })).runs.map(run => run.command)).toEqual(['audit'])
  })

  it('cancels a run and reports refusals as results, never as throws', async () => {
    const { runs, first } = registryWithRuns()
    const api = new SmartCommandsRunApi(runs)

    expect(await api.cancelRun({ runId: first, sessionId: 's1' })).toEqual({ ok: true, runId: first })
    expect(await api.cancelRun({ runId: first })).toEqual({ ok: false, error: 'run already cancelled' })
    expect(await api.cancelRun({ runId: 'missing' })).toEqual({ ok: false, error: 'unknown run: missing' })
  })

  it('refuses a cancel from another session', async () => {
    const { runs, first } = registryWithRuns()
    expect(await new SmartCommandsRunApi(runs).cancelRun({ runId: first, sessionId: 's2' }))
      .toEqual({ ok: false, error: 'run belongs to another session' })
  })

  it('dismisses a settled run so the next list no longer carries it', async () => {
    const { runs, first } = registryWithRuns()
    const api = new SmartCommandsRunApi(runs)
    runs.finish(first, { status: 'succeeded', text: 'done' })

    expect(await api.dismissRun({ runId: first, sessionId: 's1' })).toEqual({ ok: true, runId: first })
    expect((await api.listRuns()).runs.map(run => run.command)).toEqual(['audit'])
  })

  it('reports a refused dismissal as a result, keeping the run', async () => {
    const { runs, first } = registryWithRuns()
    const api = new SmartCommandsRunApi(runs)

    expect(await api.dismissRun({ runId: first, sessionId: 's2' }))
      .toEqual({ ok: false, error: 'run belongs to another session' })
    expect(await api.dismissRun({ runId: first }))
      .toEqual({ ok: false, error: 'run is still running; cancel it first' })
    expect((await api.listRuns()).runs).toHaveLength(2)
  })
})
