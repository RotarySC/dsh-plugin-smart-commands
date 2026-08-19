import { describe, expect, it } from 'vitest'
import { DelegationDepthError, SubagentBridge } from '../src/engine/subagent-bridge.ts'
import { selectModel, withModelOverride } from '../src/engine/model-router.ts'
import { DEFAULT_PLUGIN_CONFIG, type SubagentStartRequest } from '../src/types/host.ts'

describe('model router', () => {
  it('selects the first available fallback and restores the previous model after the action', async () => {
    let current: string | undefined = 'deepseek-chat'
    const selected = selectModel(
      ['missing-model', 'deepseek-reasoner'],
      {
        current: { id: 'deepseek-chat' },
        available: [{ id: 'deepseek-reasoner' }, { id: 'deepseek-chat' }],
      },
    )
    expect(selected?.model.id).toBe('deepseek-reasoner')
    expect(selected?.alreadyActive).toBe(false)

    const seen: Array<string | undefined> = []
    const result = await withModelOverride({
      getModel: () => current,
      setModel: value => { current = value },
    }, selected, true, async () => {
      seen.push(current)
      return 'ok'
    })
    expect(result).toBe('ok')
    expect(seen).toEqual(['deepseek-reasoner'])
    expect(current).toBe('deepseek-chat')
  })

  it('walks the configured fallback list in order instead of preferring the current model', () => {
    const selected = selectModel(
      ['deepseek-reasoner', 'deepseek-chat'],
      {
        current: { id: 'deepseek-chat' },
        available: [{ id: 'deepseek-reasoner' }, { id: 'deepseek-chat' }],
      },
    )
    expect(selected?.model.id).toBe('deepseek-reasoner')
    expect(selected?.alreadyActive).toBe(false)
  })
})

describe('subagent bridge', () => {
  it('routes fresh and fork requests to the configured providers', async () => {
    const started: SubagentStartRequest[] = []
    const bridge = new SubagentBridge({
      config: DEFAULT_PLUGIN_CONFIG,
      parent: { id: 'parent-1' },
      subagents: {
        list: () => ['spawn', 'fork'],
        start: async request => {
          started.push(request)
          return { text: `ran:${request.provider}`, stopReason: 'completed' }
        },
      },
    })

    const fresh = await bridge.run({
      prompt: 'do work',
      label: 'work',
      context: 'fresh',
      signal: new AbortController().signal,
      depth: 1,
    })
    const forked = await bridge.run({
      prompt: 'continue',
      label: 'work',
      context: 'fork',
      signal: new AbortController().signal,
      depth: 1,
      tools: { allow: ['read', 'edit'] },
      agent: 'reviewer',
    })

    expect(fresh.text).toBe('ran:spawn')
    expect(forked.text).toBe('ran:fork')
    expect(started[0]?.provider).toBe('spawn')
    expect(started[1]?.provider).toBe('fork')
    expect(started[1]?.persona).toBe('reviewer')
    expect(started[1]?.toolFilter).toEqual({ allow: ['read', 'edit'] })
  })

  it('prefixes an isolated worktree path onto the delegated prompt', async () => {
    const started: SubagentStartRequest[] = []
    const bridge = new SubagentBridge({
      config: DEFAULT_PLUGIN_CONFIG,
      subagents: {
        list: () => ['spawn'],
        start: async request => {
          started.push(request)
          return { text: 'ok', stopReason: 'completed' }
        },
      },
    })
    await bridge.run({
      prompt: 'fix api',
      label: 'fix',
      context: 'fresh',
      cwd: 'C:/tmp/worktree-0',
      signal: new AbortController().signal,
      depth: 1,
    })
    expect(started[0]?.cwd).toBe('C:/tmp/worktree-0')
    expect(started[0]?.prompt).toContain('C:/tmp/worktree-0')
    expect(started[0]?.prompt).toContain('fix api')
  })

  it('rejects delegation deeper than the configured maxDepth', async () => {
    const bridge = new SubagentBridge({ config: { ...DEFAULT_PLUGIN_CONFIG, maxDelegationDepth: 3 } })
    expect(() => bridge.assertDepth(4)).toThrow(DelegationDepthError)
  })
})
