import { describe, expect, it } from 'vitest'
import { filterInventory, groupInventory, isSubagentTemplate, matchesCatalogQuery } from '../src/catalog-query.ts'
import type { InventoryTemplate } from '../src/types/catalog.ts'

const review: InventoryTemplate = {
  name: 'review',
  slashName: 'review',
  description: 'Review a file',
  origin: 'project',
  sourceLabel: 'dsh-plugin-smart-commands',
  hasChain: false,
  models: ['deepseek-chat'],
  subagent: false,
  continuable: false,
  context: 'fresh',
  parameters: ['$1'],
  isSubagent: false,
}

const chat: InventoryTemplate = {
  name: 'chat',
  slashName: 'chat',
  description: 'Keep chatting',
  origin: 'user',
  sourceLabel: 'user',
  hasChain: false,
  models: [],
  subagent: 'continuable',
  continuable: true,
  context: 'fresh',
  parameters: ['$@'],
  isSubagent: true,
}

describe('catalog query', () => {
  it('treats continuable and persona subagent templates as subagent', () => {
    expect(isSubagentTemplate({ subagent: false, continuable: false })).toBe(false)
    expect(isSubagentTemplate({ subagent: true, continuable: false })).toBe(true)
    expect(isSubagentTemplate({ subagent: 'scout', continuable: false })).toBe(true)
    expect(isSubagentTemplate({ subagent: false, continuable: true })).toBe(true)
  })

  it('matches name, slash name, description, and origin', () => {
    expect(matchesCatalogQuery(review, 'REVIEW')).toBe(true)
    expect(matchesCatalogQuery(review, 'file')).toBe(true)
    expect(matchesCatalogQuery(review, 'project')).toBe(true)
    expect(matchesCatalogQuery(review, 'missing')).toBe(false)
  })

  it('filters the subagent group without dropping it from all', () => {
    expect(filterInventory([review, chat], '', 'all').map(item => item.name)).toEqual(['review', 'chat'])
    expect(filterInventory([review, chat], '', 'subagent').map(item => item.name)).toEqual(['chat'])
    expect(groupInventory([review, chat])).toEqual({
      subagent: [chat],
      other: [review],
    })
  })
})
