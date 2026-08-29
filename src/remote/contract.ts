export const SMART_COMMANDS_PACKAGE = '@deepseek-ai/dsh-plugin-smart-commands'
export const SMART_COMMANDS_SERVICE = 'smartCommands'

export const SMART_COMMANDS_ENDPOINTS = [
  { method: 'list', request: 'CatalogScope', result: 'TemplateInventory' },
  { method: 'read', request: 'TemplateIdentity', result: 'TemplateDocument' },
  { method: 'write', request: 'TemplateWriteRequest', result: 'CatalogMutationResult' },
  { method: 'deleteTemplate', request: 'TemplateIdentity', result: 'CatalogMutationResult' },
  { method: 'copy', request: 'TemplateCopyRequest', result: 'CatalogMutationResult' },
  { method: 'listKeywords', request: 'CatalogScope', result: 'KeywordInventory' },
  { method: 'writeKeywords', request: 'KeywordWriteRequest', result: 'KeywordMutationResult' },
] as const

export type SmartCommandsSchemaName =
  | 'CatalogScope'
  | 'TemplateIdentity'
  | 'TemplateWriteRequest'
  | 'TemplateCopyRequest'
  | 'TemplateInventory'
  | 'TemplateDocument'
  | 'CatalogMutationResult'
  | 'KeywordCategory'
  | 'KeywordInventory'
  | 'KeywordWriteRequest'
  | 'KeywordMutationResult'

export interface SchemaLike<Output = unknown> {
  parse(value: unknown): Output
}

export function smartCommandsTypeSymbol(name: SmartCommandsSchemaName): string {
  return `${SMART_COMMANDS_PACKAGE}/types#${name}`
}

export function bindSmartCommandsDescriptors(
  schemas: Record<SmartCommandsSchemaName, SchemaLike>,
) {
  return SMART_COMMANDS_ENDPOINTS.map(endpoint => ({
    id: `${SMART_COMMANDS_PACKAGE}#${SMART_COMMANDS_SERVICE}/${endpoint.method}`,
    service: SMART_COMMANDS_SERVICE,
    namespace: SMART_COMMANDS_SERVICE,
    method: endpoint.method,
    invocation: { kind: 'direct' as const },
    parameters: [{
      name: 'request' as const,
      wire: 'request' as const,
      source: 'json' as const,
      codec: {
        mode: 'strict' as const,
        typeSymbol: smartCommandsTypeSymbol(endpoint.request),
        schema: schemas[endpoint.request],
      },
    }],
    result: {
      mode: 'strict' as const,
      typeSymbol: smartCommandsTypeSymbol(endpoint.result),
      schema: schemas[endpoint.result],
    },
  }))
}
