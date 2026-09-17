import { describe, expect, it } from 'vitest'
import { TYPERT_REMOTE } from '../src/client/remote-contribution.ts'
import { apply, mountSmartCommandsRemote } from '../src/client/index.ts'
import type { SmartCommandsRemote } from '../src/client/SmartCommandsSection.tsx'

function fakeRemote(): SmartCommandsRemote {
  return {
    list: async () => ({ ok: true, value: { templates: [], errors: [] } }),
    read: async () => ({ ok: false, error: { code: 'x', message: 'no' } }),
    write: async () => ({ ok: true, value: { ok: true } }),
    deleteTemplate: async () => ({ ok: true, value: { ok: true } }),
    copy: async () => ({ ok: true, value: { ok: true } }),
  }
}

describe('client remote mount', () => {
  it('reuses an already mounted remote.smartCommands service', async () => {
    const existing = fakeRemote()
    const mounted = await mountSmartCommandsRemote({
      locale: { register: () => () => undefined, bind: () => () => '' },
      slots: { inject() {}, register: () => () => undefined },
      remote: {
        $mount: async () => {
          throw new Error('$mount should not run')
        },
      },
      get(name) {
        return name === 'remote.smartCommands' ? existing : undefined
      },
      effect() {},
    })
    expect(mounted).toBe(existing)
  })

  it('reads the nested Cordis service after $mount, not a field on ctx.remote', async () => {
    const mounted = fakeRemote()
    let sawContribution = false
    const result = await mountSmartCommandsRemote({
      locale: { register: () => () => undefined, bind: () => () => '' },
      slots: { inject() {}, register: () => () => undefined },
      remote: {
        $mount: async contribution => {
          sawContribution = contribution === TYPERT_REMOTE
        },
      },
      get(name) {
        return name === 'remote.smartCommands' && sawContribution ? mounted : undefined
      },
      effect() {},
    })
    expect(sawContribution).toBe(true)
    expect(result).toBe(mounted)
  })

  it('registers the settings section, prompt trigger, and run dock with a connect callback', () => {
    const registrations: Array<{ name?: string; id?: string; inject?: Record<string, unknown> }> = []
    apply({
      locale: {
        register: () => () => undefined,
        bind: () => (key: string) => key,
      },
      slots: {
        inject(_name, callback) {
          callback()
        },
        register(options) {
          registrations.push({
            name: options.name as string | undefined,
            id: options.id as string | undefined,
            inject: typeof options.inject === 'function'
              ? (options.inject as () => Record<string, unknown>)()
              : undefined,
          })
          return () => undefined
        },
      },
      remote: {
        $mount: async () => undefined,
      },
      effect(callback) {
        callback()
      },
    })
    expect(registrations.map(entry => entry.name)).toEqual([
      'settings.section',
      'conversation.input.left',
      'conversation.input.dock',
    ])
    expect(registrations.map(entry => entry.id)).toEqual([
      'smart-commands',
      'smart-commands.prompt-trigger',
      'smart-commands.runs',
    ])
    for (const entry of registrations) {
      expect(typeof entry.inject?.connect).toBe('function')
      expect(typeof entry.inject?.t).toBe('function')
    }
  })

  it('waits on inject when get cannot see the nested service yet', async () => {
    const mounted = fakeRemote()
    let mountedContribution = false
    const result = await mountSmartCommandsRemote({
      locale: { register: () => () => undefined, bind: () => () => '' },
      slots: { inject() {}, register: () => () => undefined },
      remote: {
        $mount: async () => {
          mountedContribution = true
        },
      },
      get() {
        return undefined
      },
      inject(deps, callback) {
        expect(mountedContribution).toBe(true)
        expect(deps).toEqual(['remote.smartCommands'])
        callback({
          locale: { register: () => () => undefined, bind: () => () => '' },
          slots: { inject() {}, register: () => () => undefined },
          remote: { $mount: async () => undefined },
          get(name) {
            return name === 'remote.smartCommands' ? mounted : undefined
          },
          effect() {},
        })
      },
      effect() {},
    })
    expect(result).toBe(mounted)
  })

  it('parses a run inventory through the client-side descriptors', () => {
    const descriptor = TYPERT_REMOTE.descriptors.find(item => item.method === 'listRuns')
    expect(descriptor).toBeDefined()
    const inventory = descriptor!.result.schema.parse({
      runs: [{
        id: 'run-1',
        command: 'pipeline',
        sessionId: 's1',
        workspaceRoot: '/ws',
        status: 'running',
        startedAt: 1_000,
        round: 2,
        rounds: 3,
        steps: [{ name: 'scan', index: 0, status: 'running', startedAt: 1_000 }],
        files: [],
      }],
    })
    expect(inventory.runs[0]).toMatchObject({ command: 'pipeline', status: 'running', round: 2, rounds: 3 })
    expect(inventory.runs[0].steps[0]).toMatchObject({ name: 'scan', index: 0, status: 'running' })
    expect(() => descriptor!.result.schema.parse({ runs: [{ id: 'run-1' }] })).toThrow()
  })

  it('parses cancel requests and result envelopes through the client-side descriptors', () => {
    const descriptor = TYPERT_REMOTE.descriptors.find(item => item.method === 'cancelRun')
    expect(descriptor).toBeDefined()
    expect(descriptor!.parameters[0].codec.schema.parse({ runId: 'run-1', sessionId: 's1' }))
      .toEqual({ runId: 'run-1', sessionId: 's1' })
    expect(descriptor!.parameters[0].codec.schema.parse({ runId: 'run-1' })).toEqual({ runId: 'run-1' })
    expect(descriptor!.result.schema.parse({ ok: false, error: 'unknown run: run-1' }))
      .toEqual({ ok: false, error: 'unknown run: run-1' })
    expect(() => descriptor!.parameters[0].codec.schema.parse({})).toThrow()
  })
})
