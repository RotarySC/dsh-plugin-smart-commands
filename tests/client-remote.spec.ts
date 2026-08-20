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

  it('registers the settings section immediately with a connect callback', () => {
    let sectionInject: Record<string, unknown> | undefined
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
          sectionInject = typeof options.inject === 'function'
            ? (options.inject as () => Record<string, unknown>)()
            : undefined
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
    expect(typeof sectionInject?.connect).toBe('function')
    expect(typeof sectionInject?.t).toBe('function')
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
})
