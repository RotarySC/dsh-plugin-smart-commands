import { describe, expect, it } from 'vitest'
import { asHostSubagents, loadAvailableModels, modelRegistryFromContext, modelSessionFromConfiguration, wrapDshSubagents } from '../src/host/dsh-adapter.ts'
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
