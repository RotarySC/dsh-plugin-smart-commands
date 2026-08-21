import type { InventoryTemplate } from '../types/catalog.js'

/**
 * Format the draft text to be inserted when selecting a template.
 * If existing draft text is empty, returns `/<slashName> ` (or `/<name> `).
 * If existing draft is non-empty, joins them with `\n` to preserve user input.
 */
export function formatTemplateDraft(existingDraft: string, item: InventoryTemplate): string {
  const cmdText = item.slashName ? `/${item.slashName} ` : `/${item.name} `
  if (!existingDraft || !existingDraft.trim()) {
    return cmdText
  }
  return `${cmdText}\n${existingDraft}`
}
