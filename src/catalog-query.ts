import type { InventoryTemplate, TemplateOrigin } from './types/catalog.js'

export type CatalogFilter = 'all' | 'subagent'

export function isSubagentTemplate(template: {
  readonly subagent: boolean | string
  readonly continuable: boolean
}): boolean {
  return template.subagent !== false || template.continuable
}

export function matchesCatalogQuery(template: InventoryTemplate, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const haystack = [
    template.name,
    template.slashName ?? '',
    template.description,
    template.origin,
    template.sourceLabel,
    template.models.join(' '),
    template.parameters.join(' '),
  ].join(' ').toLowerCase()
  return haystack.includes(needle)
}

export function filterInventory(
  templates: readonly InventoryTemplate[],
  query: string,
  filter: CatalogFilter,
): InventoryTemplate[] {
  return templates.filter(template => {
    if (filter === 'subagent' && !template.isSubagent) return false
    return matchesCatalogQuery(template, query)
  })
}

export function groupInventory(templates: readonly InventoryTemplate[]): {
  readonly subagent: InventoryTemplate[]
  readonly other: InventoryTemplate[]
} {
  const subagent: InventoryTemplate[] = []
  const other: InventoryTemplate[] = []
  for (const template of templates) {
    if (template.isSubagent) subagent.push(template)
    else other.push(template)
  }
  return { subagent, other }
}

export function compareInventory(a: InventoryTemplate, b: InventoryTemplate): number {
  const byName = a.name.localeCompare(b.name)
  if (byName !== 0) return byName
  const order: Record<TemplateOrigin, number> = { project: 0, user: 1 }
  return order[a.origin] - order[b.origin]
}
