import { afterEach, describe, expect, it } from 'vitest'
import { apply, type CordisLikeContext } from '../src/index.ts'

function forbiddenProxy(injected: Record<string, unknown> = {}): CordisLikeContext {
  const target = {
    get(name: string) {
      return injected[name]
    },
    inject(_deps: string[], callback: (scoped: CordisLikeContext) => void) {
      callback(ctx)
    },
    effect(callback: () => () => void) {
      return callback()
    },
  } as CordisLikeContext
  const ctx = new Proxy(target, {
    get(inner, prop, receiver) {
      if (prop === 'get' || prop === 'inject' || prop === 'effect') {
        return Reflect.get(inner, prop, receiver)
      }
      throw new Error(`cannot get property "${String(prop)}" without inject`)
    },
  })
  return ctx
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

  it('reads workspace.path and sandboxPolicy.workspaceRoot without touching ctx.workspace', () => {
    const tools = {
      register() {
        return () => undefined
      },
    }
    const ctx = forbiddenProxy({
      tools,
      workspace: { path: 'C:\\workspaces\\app' },
      sandboxPolicy: { workspaceRoot: 'C:\\fallback' },
    })
    expect(() => apply(ctx)).not.toThrow()
  })

  it('skips the Typert gateway when ctx.reflect.provide is absent', () => {
    const tools = {
      register() {
        return () => undefined
      },
    }
    expect(() => apply(forbiddenProxy({ tools }))).not.toThrow()
  })

  it('never re-registers the TYPERT host face, even when typert is injectable', () => {
    // Regression guard for the 2026-10-19 `desktop welcome: Web RPC failed`
    // startup failure. `package.json` exports `./typert`, so dsh-typert-loader
    // registers this package's `#host` face itself, in one batch. A manual
    // `typert.register(TYPERT)` from apply races that batch: when the loader
    // loses it fails hard and WITHDRAWS every definition it owns — including
    // unrelated ones such as `settings/describe`. `bundle-manifest.spec.ts`
    // guards the other half of the pair (the `./typert` export must stay).
    const registered: unknown[] = []
    const tools = {
      register() {
        return () => undefined
      },
    }
    const typert = {
      register(contribution: unknown) {
        registered.push(contribution)
        return () => undefined
      },
    }
    expect(() => apply(forbiddenProxy({ tools, typert }))).not.toThrow()
    expect(registered).toHaveLength(0)
  })
})
