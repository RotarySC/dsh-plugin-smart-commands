import { describe, expect, it } from 'vitest'
import { asHostAgent, asHostSubagents, loadAvailableModels, modelRegistryFromContext, modelSessionFromConfiguration, wrapDshSubagents } from '../src/host/dsh-adapter.ts'
import { getByPointer, JsonPointerError } from '../src/utils/json-pointer.ts'

describe('DSH subagent adapter', () => {
  it('adapts ctx.subagents.start(name, request) into the host start contract', async () => {
    const seen: Array<{ name: string; prompt: unknown }> = []
    const wrapped = wrapDshSubagents({
      list: () => ['spawn', 'fork'],
      start: async (name, request) => {
        seen.push({ name, prompt: request.prompt })
        return {
          result: Promise.resolve({
            output: [{ type: 'text', text: `from:${name}` }],
            stopReason: 'completed',
          }),
          dispose: () => undefined,
        }
      },
    })

    const result = await wrapped.start({
      provider: 'fork',
      prompt: 'continue the review',
      label: 'review',
      signal: new AbortController().signal,
    })

    expect(result).toEqual({ text: 'from:fork', stopReason: 'completed' })
    expect(seen[0]?.name).toBe('fork')
    expect(seen[0]?.prompt).toEqual([{ type: 'text', text: 'continue the review' }])
  })

  it('detects the two-argument DSH start signature', () => {
    const adapted = asHostSubagents({
      start: (name: string, request: { prompt: unknown }) => {
        void name
        void request
        return Promise.resolve({ result: Promise.resolve({ output: [], stopReason: 'completed' }) })
      },
    })
    expect(adapted).toBeDefined()
    expect(adapted?.list()).toEqual([])
  })

  it('adapts startContinuable into a durable child id', async () => {
    const wrapped = wrapDshSubagents({
      start: async () => ({
        result: Promise.resolve({ output: [], stopReason: 'completed' }),
      }),
      startContinuable: async spec => ({
        childId: `child-of-${spec.provider}`,
        messageId: 'msg-1',
      }),
    })
    const started = await wrapped.startContinuable!({
      provider: 'spawn',
      prompt: 'keep going',
      label: 'chat',
      signal: new AbortController().signal,
    })
    expect(started).toEqual({ childId: 'child-of-spawn', messageId: 'msg-1' })
  })

  it('forwards the original agent to DSH delegation, not the adapter wrapper', async () => {
    const seen: Array<{ parent: unknown }> = []
    const wrapped = wrapDshSubagents({
      start: async (_name, request) => {
        seen.push({ parent: request.parent })
        return {
          result: Promise.resolve({ output: [{ type: 'text', text: 'ok' }], stopReason: 'completed' }),
        }
      },
    })
    // DSH delegation reads parent.session.header / parent.ctx — a duck wrapper
    // without them crashes with "Cannot read properties of undefined (reading
    // 'header')". The adapter must unwrap to the original agent.
    const dshAgent = {
      id: 'session-1',
      session: { header: { id: 'session-1' } },
      ctx: {},
      options: { provider: 'p', model: 'm' },
      followup: () => {},
    }
    const adapted = asHostAgent(dshAgent)!
    await wrapped.start({
      provider: 'spawn',
      prompt: 'go',
      label: 'child',
      parent: adapted,
      signal: new AbortController().signal,
    })
    expect(seen[0]?.parent).toBe(dshAgent)
  })
})

describe('DSH agent adapter', () => {
  it('wraps a DSH agent with an in-session submit that follows up the main turn', async () => {
    const followed: unknown[] = []
    const dshAgent = {
      id: 'session-1',
      options: { provider: 'deepseek', model: 'deepseek-chat' },
      followup: (message: unknown) => { followed.push(message) },
    }

    const agent = asHostAgent(dshAgent)
    expect(agent?.id).toBe('session-1')
    expect(agent?.options).toEqual({ provider: 'deepseek', model: 'deepseek-chat' })
    expect(agent?.original).toBe(dshAgent)

    const result = await agent?.submit?.('Draft auth.ts', new AbortController().signal)
    // Fire-and-forget: the command settles immediately so the composer does not
    // stay locked on the slash claim while the main-agent turn runs.
    expect(result?.text).toBe('')
    expect(followed).toHaveLength(1)
    const message = followed[0] as { id: string; role: string; content: unknown[]; source: { kind: string } }
    expect(message.role).toBe('user')
    expect(message.source.kind).toBe('user')
    expect(message.content).toEqual([{ type: 'text', text: 'Draft auth.ts' }])
    expect(typeof message.id).toBe('string')
  })

  it('omits submit when the agent cannot drive turns', () => {
    const agent = asHostAgent({ id: 'session-1', options: { provider: 'p', model: 'm' } })
    expect(agent?.id).toBe('session-1')
    expect(agent?.options).toEqual({ provider: 'p', model: 'm' })
    expect(agent?.submit).toBeUndefined()
    expect(agent?.notify).toBeUndefined()
  })

  it('posts a plugin notice for a report the plugin produced itself', () => {
    const followed: unknown[] = []
    const agent = asHostAgent({ id: 'session-1', followup: (message: unknown) => { followed.push(message) } })!

    agent.notify?.('smart command pipeline: cancelled in 7.0s (1/3 steps)\n\nSteps:\n- 1. scan: done (1.0s)')

    expect(followed).toHaveLength(1)
    const message = followed[0] as { id: string; role: string; content: unknown[]; source: Record<string, unknown> }
    expect(message.role).toBe('user')
    // Honest provenance: the transcript renders this as a smart-commands context
    // row, not as something the user typed.
    expect(message.source).toEqual({
      kind: 'plugin',
      plugin: 'smart-commands',
      form: 'notice',
      summary: 'smart command pipeline: cancelled in 7.0s (1/3 steps)',
    })
    expect(message.content).toEqual([{
      type: 'text',
      text: 'smart command pipeline: cancelled in 7.0s (1/3 steps)\n\nSteps:\n- 1. scan: done (1.0s)',
    }])
    expect(typeof message.id).toBe('string')
  })

  it('bounds the notice summary to the length DSH accepts', () => {
    const followed: unknown[] = []
    const agent = asHostAgent({ id: 'session-1', followup: (message: unknown) => { followed.push(message) } })!

    agent.notify?.(`smart command ${'x'.repeat(400)}: succeeded`)

    const source = (followed[0] as { source: { summary: string } }).source
    expect(source.summary).toHaveLength(120)
    expect(source.summary.endsWith('…')).toBe(true)
  })

  it('returns undefined for non-agent values', () => {
    expect(asHostAgent(undefined)).toBeUndefined()
    expect(asHostAgent(null)).toBeUndefined()
    expect(asHostAgent({})).toBeUndefined()
    expect(asHostAgent({ followup: () => {} })).toBeUndefined()
  })
})

describe('model registry adapter', () => {
  it('parses provider/id strings from llm.list and the session model', () => {
    const registry = modelRegistryFromContext({
      llm: { list: () => ['deepseek/deepseek-chat', 'openai/gpt-4o'] },
      sessionModel: 'deepseek/deepseek-v4-flash',
    })
    expect(registry?.current).toEqual({ provider: 'deepseek', id: 'deepseek-v4-flash' })
    expect(registry?.available).toEqual([
      { provider: 'deepseek', id: 'deepseek-chat' },
      { provider: 'openai', id: 'gpt-4o' },
      { provider: 'deepseek', id: 'deepseek-v4-flash' },
    ])
  })

  it('reads the current model from agent-default-model settings', () => {
    const settings: Record<string, unknown> = {
      'agent-default-model.provider': 'cpa',
      'agent-default-model.model': 'gemini-3.7-flash-high',
    }
    const session = modelSessionFromConfiguration({
      get: (key: string) => settings[key],
      update: (key, value) => { settings[key] = value },
    })
    expect(session?.getModel()).toBe('cpa/gemini-3.7-flash-high')
  })

  it('loads models from every registered provider, not only the current one', async () => {
    const available = await loadAvailableModels({
      listProviders: () => [{ id: 'cpa' }, { id: 'opencode-go' }],
      listModels: async provider => provider === 'cpa'
        ? [{ id: 'gemini-3.7-flash-high' }]
        : [{ id: 'deepseek-v4-flash' }],
    })
    expect(available).toEqual([
      { provider: 'cpa', id: 'gemini-3.7-flash-high' },
      { provider: 'opencode-go', id: 'deepseek-v4-flash' },
    ])
  })
})

describe('json pointer', () => {
  it('reads object and array paths', () => {
    const document = { items: [{ path: 'a.ts' }, { path: 'b.ts' }] }
    expect(getByPointer(document, '/items/1/path')).toBe('b.ts')
  })

  it('rejects a pointer that does not start with a slash', () => {
    expect(() => getByPointer({}, 'items')).toThrow(JsonPointerError)
  })
})
