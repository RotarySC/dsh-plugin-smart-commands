export type TemplateOrigin = 'user' | 'project'

export interface InventoryTemplate {
  readonly name: string
  readonly slashName?: string
  readonly description: string
  readonly origin: TemplateOrigin
  readonly sourceLabel: string
  readonly hasChain: boolean
  readonly models: string[]
  readonly subagent: boolean | string
  readonly continuable: boolean
  readonly context: 'fresh' | 'fork'
  readonly parameters: string[]
  readonly isSubagent: boolean
}

export interface InventoryError {
  readonly origin: TemplateOrigin
  readonly name?: string
  readonly error: string
}

export interface TemplateInventory {
  readonly templates: InventoryTemplate[]
  readonly errors: InventoryError[]
}

export interface TemplateDocument extends InventoryTemplate {
  readonly content: string
}

export interface CatalogMutationResult {
  readonly ok: boolean
  readonly name?: string
  readonly origin?: TemplateOrigin
  readonly error?: string
}

export interface CatalogScope {
  readonly workspaceRoot?: string
}

export interface TemplateIdentity extends CatalogScope {
  readonly name: string
  readonly origin: TemplateOrigin
}

export interface TemplateWriteRequest extends CatalogScope {
  readonly name: string
  readonly origin: TemplateOrigin
  readonly content: string
  readonly mode?: 'create' | 'update'
}

export interface TemplateCopyRequest extends CatalogScope {
  readonly fromName: string
  readonly fromOrigin: TemplateOrigin
  readonly toName: string
  readonly toOrigin: TemplateOrigin
}
