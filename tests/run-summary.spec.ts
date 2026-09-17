import { describe, expect, it } from 'vitest'
import {
  RUN_SUMMARY_HEADLINE_MAX_CHARS,
  RUN_SUMMARY_OUTPUT_MAX_CHARS,
  formatRunSummary,
  runSummaryHeadline,
} from '../src/engine/run-summary.ts'
import type { ChainRunRecord, ChainRunStep } from '../src/types/runs.ts'

function record(overrides: Partial<ChainRunRecord> = {}): ChainRunRecord {
  return {
    id: 'run-1',
    command: 'pipeline',
    sessionId: 's1',
    workspaceRoot: '/ws',
    status: 'succeeded',
    startedAt: 1_000,
    endedAt: 13_300,
    round: 1,
    rounds: 1,
    steps: [],
    files: [],
    ...overrides,
  }
}

const mixed: ChainRunStep[] = [
  { name: 'scan', index: 0, status: 'done', startedAt: 1_000, endedAt: 2_200 },
  { name: 'fix', index: 1, status: 'failed', startedAt: 2_200, endedAt: 5_000, error: 'boom\n  at scan (a.ts:1)' },
]

describe('run summary headline', () => {
  it('names the command, the outcome, and how far the chain got', () => {
    expect(runSummaryHeadline(record({ steps: mixed })))
      .toBe('smart command pipeline: succeeded in 12.3s (1/2 steps)')
  })

  it('appends the loop round only when the template loops', () => {
    expect(runSummaryHeadline(record({ round: 2, rounds: 3 })))
      .toBe('smart command pipeline: succeeded in 12.3s, round 2 of 3')
  })

  it('reports a cancelled run from when it actually stopped', () => {
    expect(runSummaryHeadline(record({ status: 'cancelled', endedAt: 4_000, steps: mixed })))
      .toBe('smart command pipeline: cancelled in 3.0s (1/2 steps)')
  })

  it('stays inside the notice bound DSH enforces', () => {
    const headline = runSummaryHeadline(record({ command: 'x'.repeat(400) }))
    expect(headline).toHaveLength(RUN_SUMMARY_HEADLINE_MAX_CHARS)
    expect(headline.endsWith('…')).toBe(true)
  })
})

describe('run summary body', () => {
  it('leads with the headline and lists steps, files, and the aggregate output', () => {
    const body = formatRunSummary(record({ steps: mixed, files: ['src/a.ts'], text: 'all done' }))

    expect(body.split('\n')[0]).toBe('smart command pipeline: succeeded in 12.3s (1/2 steps)')
    expect(body).toContain('Steps:\n- 1. scan: done (1.2s)\n- 2. fix: failed (2.8s) — boom')
    expect(body).toContain('Changed files:\n- src/a.ts')
    expect(body).toContain('Final output:\nall done')
    expect(body).toContain('Generated automatically by the smart-commands plugin')
  })

  it('keeps only the first line of a multi-line step failure', () => {
    const body = formatRunSummary(record({ steps: mixed }))
    expect(body).toContain('— boom')
    expect(body).not.toContain('at scan (a.ts:1)')
  })

  it('omits sections a run has nothing to say about', () => {
    const body = formatRunSummary(record())
    for (const heading of ['Steps:', 'Changed files:', 'Final output:', 'Error:']) {
      expect(body).not.toContain(heading)
    }
  })

  it('reports a multi-line run error as one line', () => {
    const body = formatRunSummary(record({ status: 'failed', error: 'chain exceeds maxChainSteps (10)\nmore' }))
    expect(body).toContain('Error:\nchain exceeds maxChainSteps (10)')
    expect(body).not.toContain('\nmore')
  })

  it('prints a step with no timing rather than a zero duration', () => {
    const body = formatRunSummary(record({ steps: [{ name: 'scan', index: 0, status: 'pending' }] }))
    expect(body).toContain('- 1. scan: pending\n')
  })

  it('collapses a long file list into a count', () => {
    const files = Array.from({ length: 23 }, (_, index) => `src/f${index}.ts`)
    const body = formatRunSummary(record({ files }))
    expect(body).toContain('- src/f19.ts')
    expect(body).not.toContain('- src/f20.ts')
    expect(body).toContain('- … and 3 more')
  })

  it('truncates an oversized aggregate output and says by how much', () => {
    const text = 'y'.repeat(RUN_SUMMARY_OUTPUT_MAX_CHARS + 25)
    const body = formatRunSummary(record({ text }))
    expect(body).toContain('y'.repeat(RUN_SUMMARY_OUTPUT_MAX_CHARS))
    expect(body).not.toContain('y'.repeat(RUN_SUMMARY_OUTPUT_MAX_CHARS + 1))
    expect(body).toContain(`[output truncated at ${RUN_SUMMARY_OUTPUT_MAX_CHARS} of ${text.length} characters]`)
  })

  it('carries a cancelled chain\'s ledger so the stopped step is visible', () => {
    const steps: ChainRunStep[] = [
      { name: 'scan', index: 0, status: 'done', startedAt: 1_000, endedAt: 2_000 },
      { name: 'fix', index: 1, status: 'skipped', startedAt: 2_000, endedAt: 8_000 },
      { name: 'verify', index: 2, status: 'pending' },
    ]
    const body = formatRunSummary(record({ status: 'cancelled', endedAt: 8_000, steps }))
    expect(body.split('\n')[0]).toBe('smart command pipeline: cancelled in 7.0s (1/3 steps)')
    expect(body).toContain('- 2. fix: skipped (6.0s)')
    expect(body).toContain('- 3. verify: pending')
  })
})
