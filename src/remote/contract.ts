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
  { method: 'listRuns', request: 'ChainRunScope', result: 'ChainRunInventory' },
  { method: 'cancelRun', request: 'ChainRunCancelRequest', result: 'ChainRunCancelResult' },
  { method: 'dismissRun', request: 'ChainRunDismissRequest', result: 'ChainRunDismissResult' },
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
  | 'ChainRunStep'
  | 'ChainRunRecord'
  | 'ChainRunScope'
  | 'ChainRunInventory'
  | 'ChainRunCancelRequest'
  | 'ChainRunCancelResult'
  | 'ChainRunDismissRequest'
  | 'ChainRunDismissResult'

export interface SchemaLike<Output = unknown> {
  parse(value: unknown): Output
}

export function smartCommandsTypeSymbol(name: SmartCommandsSchemaName): string {
  return `${SMART_COMMANDS_PACKAGE}/types#${name}`
}

/**
 * One strict codec, carrying every field either Typert runtime generation reads.
 *
 * `@deepseek-ai/dsh-typert-protocol@0.1.0-rc.8` holds the schema eagerly in
 * `schema`; `0.1.7-rc.1` dropped that field for a lazy `create()` factory and
 * rejects a codec without one (`typert: … strict codec has no create()
 * factory`, raised by the Host registry, the Client registry, and the Host
 * typert-loader alike). Shipping both keeps one artifact valid for either
 * runtime, and the wire boundary only ever calls `create().parse(value)`, so
 * handing back the same schema instance on every call is enough.
 */
function strictCodec(
  name: SmartCommandsSchemaName,
  schemas: Record<SmartCommandsSchemaName, SchemaLike>,
) {
  return {
    mode: 'strict' as const,
    typeSymbol: smartCommandsTypeSymbol(name),
    create: () => schemas[name],
    schema: schemas[name],
  }
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
      codec: strictCodec(endpoint.request, schemas),
    }],
    result: strictCodec(endpoint.result, schemas),
  }))
}
