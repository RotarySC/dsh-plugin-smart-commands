import { describe, expect, it } from 'vitest'
import { slashCommandNameFor } from '../src/engine/slash-name.ts'

describe('slash command name mapping', () => {
  it('maps numbered templates onto host-legal command names', () => {
    expect(slashCommandNameFor('001-research')).toBe('research')
    expect(slashCommandNameFor('002-code-review')).toBe('code-review')
    expect(slashCommandNameFor('review/code')).toBe('review-code')
  })

  it('keeps already legal names and rejects reserved smart', () => {
    expect(slashCommandNameFor('code-review')).toBe('code-review')
    expect(slashCommandNameFor('smart')).toBeUndefined()
  })

  it('does not map a help template onto the host /help command', () => {
    expect(slashCommandNameFor('help')).toBeUndefined()
    expect(slashCommandNameFor('Help')).toBeUndefined()
  })
})
