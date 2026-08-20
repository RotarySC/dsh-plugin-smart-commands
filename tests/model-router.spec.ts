import { describe, expect, it } from 'vitest'
import { parseModelRef, selectModel } from '../src/engine/model-router.ts'

describe('parseModelRef', () => {
  it('splits provider/id strings and keeps bare ids', () => {
    expect(parseModelRef('deepseek/deepseek-chat')).toEqual({
      provider: 'deepseek',
      id: 'deepseek-chat',
    })
    expect(parseModelRef('deepseek-chat')).toEqual({ id: 'deepseek-chat' })
  })
})

describe('selectModel', () => {
  it('matches provider/id specs against bare model ids', () => {
    const selected = selectModel(['deepseek/deepseek-r1', 'openai/gpt-4o'], {
      current: { id: 'deepseek-chat' },
      available: [{ id: 'deepseek-r1' }, { id: 'gpt-4o' }],
    })
    expect(selected?.model).toEqual({ id: 'deepseek-r1' })
  })

  it('matches a fully qualified current session model', () => {
    const selected = selectModel(['deepseek/deepseek-v4-flash'], {
      current: { provider: 'deepseek', id: 'deepseek-v4-flash' },
      available: [],
    })
    expect(selected?.alreadyActive).toBe(true)
    expect(selected?.model.id).toBe('deepseek-v4-flash')
  })

  it('falls back to the current session model when no listed spec is available', () => {
    const selected = selectModel(['deepseek-v4-flash'], {
      current: { provider: 'cpa', id: 'gemini-3.7-flash-high' },
      available: [{ provider: 'cpa', id: 'gemini-3.7-flash-high' }],
    })
    expect(selected?.alreadyActive).toBe(true)
    expect(selected?.model).toEqual({ provider: 'cpa', id: 'gemini-3.7-flash-high' })
  })

  it('matches a bare model id on a non-current provider', () => {
    const selected = selectModel(['deepseek-v4-flash'], {
      current: { provider: 'cpa', id: 'gemini-3.7-flash-high' },
      available: [
        { provider: 'cpa', id: 'gemini-3.7-flash-high' },
        { provider: 'opencode-go', id: 'deepseek-v4-flash' },
      ],
    })
    expect(selected?.model).toEqual({ provider: 'opencode-go', id: 'deepseek-v4-flash' })
  })
})
