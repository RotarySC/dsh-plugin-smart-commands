import type { CatalogScope, TemplateOrigin } from './catalog.js'

export interface KeywordCategory {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly keywords: string[]
}

export interface KeywordDocument {
  readonly version: number
  readonly categories: KeywordCategory[]
}

export interface InventoryKeywordCategory extends KeywordCategory {
  readonly origin: TemplateOrigin
  readonly sourceLabel: string
}

export interface KeywordInventoryError {
  readonly origin: TemplateOrigin
  readonly error: string
}

export interface KeywordInventory {
  readonly categories: InventoryKeywordCategory[]
  readonly errors: KeywordInventoryError[]
}

export interface KeywordWriteRequest extends CatalogScope {
  readonly origin: TemplateOrigin
  readonly categories: KeywordCategory[]
}

export interface KeywordMutationResult {
  readonly ok: boolean
  readonly origin?: TemplateOrigin
  readonly error?: string
}
