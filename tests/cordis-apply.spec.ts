import { afterEach, describe, expect, it } from 'vitest'
import { apply, type CordisLikeContext } from '../src/index.ts'

function forbiddenProxy(injected: Record<string, unknown> = {}): CordisLikeContext {
  return new Proxy({
    get(name: string) {
      return injected[name]
    },
    inject() {},
    effect(callback: () => () => void) {
      return callback()
    },
  } as CordisLikeContext, {
    get(target, prop, receiver) {
      if (prop === 'get' || prop === 'inject' || prop === 'effect') {
        return Reflect.get(target, prop, receiver)
      }
      throw new Error(`cannot get property "${String(prop)}" without inject`)
    },
  })
}

describe('cordis apply', () => {
  const disposers: Array<() => void> = []
  afterEach(() => {
    for (const dispose of disposers) dispose()
    disposers.length = 0
  })

  it('does not read undeclared ctx properties such as workspace', () => {
    const tools = {
      register() {
        return () => undefined
      },
    }
    const ctx = forbiddenProxy({ tools })
    expect(() => apply(ctx)).not.toThrow()
  })
})
