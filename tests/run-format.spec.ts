import { describe, expect, it } from 'vitest'
import { firstLine, formatDuration } from '../src/run-format.ts'

describe('formatDuration', () => {
  it('formats millisecond, second, and minute durations', () => {
    expect(formatDuration(840)).toBe('840ms')
    expect(formatDuration(12_340)).toBe('12.3s')
    expect(formatDuration(185_000)).toBe('3m 05s')
  })

  it('characterizes the second/minute boundary as it stands', () => {
    // 59_999 rounds up to "60.0s" one millisecond before it becomes "1m 00s".
    // Cosmetic, long-standing, and asserted only so a move of this function
    // cannot change it silently.
    expect(formatDuration(59_999)).toBe('60.0s')
    expect(formatDuration(60_000)).toBe('1m 00s')
    expect(formatDuration(0)).toBe('0ms')
  })
})

describe('firstLine', () => {
  it('keeps the first line and drops the rest', () => {
    expect(firstLine('boom\n  at scan (a.ts:1)')).toBe('boom')
    expect(firstLine('   padded   ')).toBe('padded')
    expect(firstLine('')).toBe('')
  })
})
