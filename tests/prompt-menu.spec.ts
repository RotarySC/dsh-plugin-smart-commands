import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { InventoryTemplate, TemplateInventory } from '../src/types/catalog.js'
import { filterInventory, matchesCatalogQuery } from '../src/catalog-query.js'
import { appendKeywordToDraft, formatTemplateDraft, resolveComposerDraft } from '../src/client/draft-format.js'

describe('PromptMenu query and filtering logic', () => {
  const sampleTemplates: InventoryTemplate[] = [
    {
      name: 'explain-code',
      slashName: 'explain',
      description: 'Explain the code in plain English',
      origin: 'user',
      sourceLabel: 'user',
      hasChain: false,
      models: [],
      subagent: false,
      continuable: false,
      context: 'fresh',
      parameters: ['code'],
      isSubagent: false,
    },
    {
      name: '001-code-review',
      slashName: 'code-review',
      description: 'Review diff for best practices and style',
      origin: 'project',
      sourceLabel: 'my-project',
      hasChain: false,
      models: ['claude-3-5-sonnet'],
      subagent: true,
      continuable: false,
      context: 'fresh',
      parameters: [],
      isSubagent: true,
    },
    {
      name: 'deploy-chain',
      slashName: 'deploy',
      description: 'Multi-stage release pipeline',
      origin: 'project',
      sourceLabel: 'my-project',
      hasChain: true,
      models: [],
      subagent: false,
      continuable: false,
      context: 'fresh',
      parameters: ['target'],
      isSubagent: false,
    },
  ]

  it('matches templates by name, slashName, description or model', () => {
    expect(matchesCatalogQuery(sampleTemplates[0]!, 'explain')).toBe(true)
    expect(matchesCatalogQuery(sampleTemplates[0]!, 'english')).toBe(true)
    expect(matchesCatalogQuery(sampleTemplates[1]!, 'sonnet')).toBe(true)
    expect(matchesCatalogQuery(sampleTemplates[1]!, 'review')).toBe(true)
    expect(matchesCatalogQuery(sampleTemplates[2]!, 'pipeline')).toBe(true)
    expect(matchesCatalogQuery(sampleTemplates[2]!, 'nonexistent')).toBe(false)
  })

  it('filters template list accurately', () => {
    const results = filterInventory(sampleTemplates, 'review', 'all')
    expect(results).toHaveLength(1)
    expect(results[0]?.name).toBe('001-code-review')

    const emptyResults = filterInventory(sampleTemplates, 'xyz123', 'all')
    expect(emptyResults).toHaveLength(0)

    const allResults = filterInventory(sampleTemplates, '', 'all')
    expect(allResults).toHaveLength(3)
  })
})

describe('formatTemplateDraft function', () => {
  const templateWithSlash: InventoryTemplate = {
    name: 'explain-code',
    slashName: 'explain',
    description: 'Explain code',
    origin: 'user',
    sourceLabel: 'user',
    hasChain: false,
    models: [],
    subagent: false,
    continuable: false,
    context: 'fresh',
    parameters: [],
    isSubagent: false,
  }

  const templateWithoutSlash: InventoryTemplate = {
    name: 'custom-prompt',
    description: 'Custom prompt',
    origin: 'user',
    sourceLabel: 'user',
    hasChain: false,
    models: [],
    subagent: false,
    continuable: false,
    context: 'fresh',
    parameters: [],
    isSubagent: false,
  }

  it('formats draft with slash command prefix when draft is empty', () => {
    expect(formatTemplateDraft('', templateWithSlash)).toBe('/explain ')
    expect(formatTemplateDraft('   ', templateWithSlash)).toBe('/explain ')
    expect(formatTemplateDraft('', templateWithoutSlash)).toBe('/custom-prompt ')
  })

  it('appends the command below existing draft', () => {
    expect(formatTemplateDraft('const a = 1;', templateWithSlash)).toBe('const a = 1;\n/explain ')
    expect(formatTemplateDraft('Check this code please', templateWithoutSlash)).toBe('Check this code please\n/custom-prompt ')
  })

  it('stacks consecutive prompt clicks downward', () => {
    const first = formatTemplateDraft('', templateWithSlash)
    expect(first).toBe('/explain ')
    expect(formatTemplateDraft(first, templateWithoutSlash)).toBe('/explain\n/custom-prompt ')
  })
})

describe('appendKeywordToDraft', () => {
  it('appends keywords sequentially with whitespace', () => {
    let draft = ''
    draft = appendKeywordToDraft(draft, '--verbose')
    expect(draft).toBe('--verbose ')

    draft = appendKeywordToDraft(draft, 'src/client')
    expect(draft).toBe('--verbose src/client ')

    draft = appendKeywordToDraft(draft, '--dry-run')
    expect(draft).toBe('--verbose src/client --dry-run ')
  })

  it('handles existing draft correctly when appending', () => {
    expect(appendKeywordToDraft('/code-review', 'src/engine')).toBe('/code-review src/engine ')
  })
})

describe('resolveComposerDraft', () => {
  it('prefers liveDraft from useInput over stale DOM / legacy text fields', () => {
    expect(resolveComposerDraft({
      liveDraft: '/review foo',
      input: { text: 'stale-text' },
      contentEditableText: 'stale-dom',
    })).toBe('/review foo')
  })

  it('treats empty liveDraft as authoritative so a cleared composer is not refilled from DOM', () => {
    expect(resolveComposerDraft({
      liveDraft: '',
      input: { text: 'stale-text' },
      contentEditableText: 'stale-dom',
    })).toBe('')
  })

  it('falls back to InputState.draft then legacy input.text', () => {
    expect(resolveComposerDraft({
      input: { draft: 'from-draft' },
      contentEditableText: 'stale-dom',
    })).toBe('from-draft')
    expect(resolveComposerDraft({
      input: { text: 'from-text' },
      contentEditableText: 'stale-dom',
    })).toBe('from-text')
  })

  it('uses contenteditable / composer DOM only when no session snapshot is available', () => {
    expect(resolveComposerDraft({
      contentEditableText: 'from-lexical',
    })).toBe('from-lexical')
    expect(resolveComposerDraft({})).toBe('')
  })
})
