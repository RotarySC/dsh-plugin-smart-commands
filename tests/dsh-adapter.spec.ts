import { describe, expect, it } from 'vitest'
import { asHostSubagents, wrapDshSubagents } from '../src/host/dsh-adapter.ts'
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
