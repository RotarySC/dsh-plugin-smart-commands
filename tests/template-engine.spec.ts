import { describe, expect, it } from 'vitest'
import {
  parseCommandArgs,
  renderTemplate,
  renderTemplateConditionals,
  substituteArgs,
} from '../src/engine/template-engine.ts'

describe('template engine', () => {
  it('parses quoted argument phrases as single tokens', () => {
    expect(parseCommandArgs('alpha "two words" beta')).toEqual(['alpha', 'two words', 'beta'])
    expect(parseCommandArgs("one 'two three' four")).toEqual(['one', 'two three', 'four'])
  })

  it('expands positional, aggregate, and slice placeholders from known literals', () => {
    const result = substituteArgs('$1 | $@ | $ARGUMENTS | ${@:2} | ${@:2:2}', ['one', 'two', 'three', 'four'])
    expect(result).toBe('one | one two three four | one two three four | two three four | two three')
  })

  it('does not recursively expand substituted argument text', () => {
    expect(substituteArgs('$1 / $@', ['$2', '$ARGUMENTS'])).toBe('$2 / $2 $ARGUMENTS')
  })

  it('keeps the matching if-model branch and the else branch independently', () => {
    const model = { provider: 'deepseek', id: 'deepseek-reasoner' }
    const template = [
      'review: $@',
      '',
      '<if-model is="deepseek-reasoner, deepseek/*">',
      'deep analysis',
      '<else>',
      'style review',
      '</if-model>',
    ].join('\n')

    const rendered = renderTemplate(template, ['auth.ts'], model, 'code-review')
    expect(rendered.error).toBeUndefined()
    expect(rendered.content).toContain('review: auth.ts')
    expect(rendered.content).toContain('deep analysis')
    expect(rendered.content).not.toContain('style review')
    expect(rendered.content).not.toContain('<if-model')
  })

  it('preserves original markup and reports an error for invalid if-model tags', () => {
    const template = '<if-model is="deepseek/*">ok<else extra="nope">bad</if-model>'
    const result = renderTemplateConditionals(template, { provider: 'deepseek', id: 'deepseek-chat' }, 'demo')
    expect(result.content).toBe(template)
    expect(result.error).toMatch(/Invalid <if-model> markup in prompt `demo`/)
  })
})
