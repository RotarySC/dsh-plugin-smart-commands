import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { InventoryTemplate, TemplateInventory } from '../src/types/catalog.js'
import { filterInventory, matchesCatalogQuery } from '../src/catalog-query.js'
import { formatTemplateDraft } from '../src/client/draft-format.js'

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

  it('joins with newline when existing draft is present', () => {
    expect(formatTemplateDraft('const a = 1;', templateWithSlash)).toBe('/explain \nconst a = 1;')
    expect(formatTemplateDraft('Check this code please', templateWithoutSlash)).toBe('/custom-prompt \nCheck this code please')
  })
})
