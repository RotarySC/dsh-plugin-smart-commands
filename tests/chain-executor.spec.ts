import { describe, expect, it } from 'vitest'
import { ChainExecutor } from '../src/engine/chain-executor.ts'
import { ChainValidationError, validateChainOutputBindings } from '../src/engine/chain-validation.ts'
import { SubagentBridge } from '../src/engine/subagent-bridge.ts'
import { DEFAULT_PLUGIN_CONFIG } from '../src/types/host.ts'
import type { ChainStep } from '../src/types/chain.ts'

describe('chain DAG validation', () => {
  it('rejects a forward reference and a duplicate as name before execution', () => {
    expect(() => validateChainOutputBindings([
      { name: 'fix', task: 'use {outputs.findings}' },
      { name: 'scan', task: 'scan', as: 'findings' },
    ])).toThrow(ChainValidationError)

    expect(() => validateChainOutputBindings([
      { name: 'a', task: 'one', as: 'out' },
      { name: 'b', task: 'two', as: 'out' },
    ])).toThrow(/Duplicate chain output name/)
  })
})

describe('chain executor', () => {
  it('threads previous and named outputs through sequential then parallel steps', async () => {
    const calls: string[] = []
    const bridge = new SubagentBridge({
      config: DEFAULT_PLUGIN_CONFIG,
      fallback: async prompt => {
        calls.push(prompt)
        return { text: `done:${prompt}` }
      },
    })
    const executor = new ChainExecutor(bridge, DEFAULT_PLUGIN_CONFIG, () => 1)
    const steps: ChainStep[] = [
      { name: 'scan', agent: 'scout', task: 'scan $1 {task}', as: 'findings' },
      {
        name: 'fix',
        parallel: [
          { agent: 'backend', task: 'api {outputs.findings}' },
          { agent: 'tests', task: 'tests {previous}' },
        ],
        concurrency: 2,
      },
    ]

    const result = await executor.run(steps, {
      task: 'auth',
      args: ['auth'],
      depth: 1,
      signal: new AbortController().signal,
      maxConcurrency: 5,
    })

    expect(calls[0]).toBe('scan auth auth')
    expect(calls).toContain('api done:scan auth auth')
    expect(calls).toContain('tests done:scan auth auth')
    expect(result.steps).toHaveLength(3)
    expect(result.text).toContain('=== Parallel Task 1 (backend) ===')
    expect(result.text).toContain('=== Parallel Task 2 (tests) ===')
  })

  it('stops remaining parallel work when failFast is true', async () => {
    let started = 0
    const bridge = new SubagentBridge({
      config: DEFAULT_PLUGIN_CONFIG,
      fallback: async prompt => {
        started++
        if (prompt.includes('boom')) throw new Error('scan failed')
        await new Promise(resolve => setTimeout(resolve, 20))
        return { text: prompt }
      },
    })
    const executor = new ChainExecutor(bridge, DEFAULT_PLUGIN_CONFIG, () => 1)
    await expect(executor.run([
      {
        name: 'group',
        failFast: true,
        concurrency: 1,
        parallel: [
          { agent: 'a', task: 'boom' },
          { agent: 'b', task: 'later' },
        ],
      },
    ], {
      task: 'x',
      args: [],
      depth: 1,
      signal: new AbortController().signal,
      maxConcurrency: 1,
    })).rejects.toThrow('scan failed')
    expect(started).toBe(1)
  })

  it('stores file-only sequential output as a pointer for later steps', async () => {
    const bridge = new SubagentBridge({
      config: DEFAULT_PLUGIN_CONFIG,
      fallback: async prompt => ({ text: prompt === 'scan' ? 'huge-report-body' : prompt }),
    })
    const executor = new ChainExecutor(bridge, DEFAULT_PLUGIN_CONFIG, () => 1)
    const result = await executor.run([
      { name: 'scan', task: 'scan', as: 'findings', outputMode: 'file-only' },
      { name: 'fix', task: 'fix {outputs.findings}' },
    ], {
      task: 'auth',
      args: [],
      depth: 1,
      signal: new AbortController().signal,
      maxConcurrency: 1,
    })
    expect(result.steps[0]?.text).toMatch(/^Output saved to: /)
    expect(result.steps[1]?.text).toMatch(/^fix Output saved to: /)
    expect(result.steps[1]?.text).not.toContain('huge-report-body')
  })
})

describe('chain executor progress observer', () => {
  it('reports one start and one end per step, in order', async () => {
    const events: string[] = []
    const bridge = new SubagentBridge({
      config: DEFAULT_PLUGIN_CONFIG,
      fallback: async prompt => ({ text: prompt }),
    })
    const executor = new ChainExecutor(bridge, DEFAULT_PLUGIN_CONFIG, () => 1)

    await executor.run([
      { name: 'scan', task: 'scan' },
      { name: 'fix', parallel: [{ task: 'api' }, { task: 'tests' }], concurrency: 2 },
    ], {
      task: 'auth',
      args: [],
      depth: 1,
      signal: new AbortController().signal,
      maxConcurrency: 2,
      onStep: event => events.push(`${event.phase}:${event.index}:${event.name}`),
    })

    expect(events).toEqual(['start:0:scan', 'end:0:scan', 'start:1:fix', 'end:1:fix'])
  })

  it('reports the failing step and never lets a throwing observer replace the chain error', async () => {
    const events: string[] = []
    const bridge = new SubagentBridge({
      config: DEFAULT_PLUGIN_CONFIG,
      fallback: async () => { throw new Error('child exploded') },
    })
    const executor = new ChainExecutor(bridge, DEFAULT_PLUGIN_CONFIG, () => 1)

    await expect(executor.run([{ name: 'scan', task: 'scan' }], {
      task: 'auth',
      args: [],
      depth: 1,
      signal: new AbortController().signal,
      maxConcurrency: 1,
      onStep: event => {
        events.push(event.phase === 'end' && event.error ? `end:${event.error}` : event.phase)
        throw new Error('observer exploded')
      },
    })).rejects.toThrow('child exploded')

    expect(events).toEqual(['start', 'end:child exploded'])
  })
})
