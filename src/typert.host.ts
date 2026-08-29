import { bindSmartCommandsDescriptors, SMART_COMMANDS_PACKAGE } from './remote/contract.js'
import {
  catalogMutationResultSchema,
  catalogScopeSchema,
  inventoryKeywordCategorySchema,
  keywordCategorySchema,
  keywordInventorySchema,
  keywordMutationResultSchema,
  keywordWriteRequestSchema,
  templateCopyRequestSchema,
  templateDocumentSchema,
  templateIdentitySchema,
  templateInventorySchema,
  templateWriteRequestSchema,
} from './remote/schemas.js'

const schemas = {
  CatalogScope: catalogScopeSchema,
  TemplateIdentity: templateIdentitySchema,
  TemplateWriteRequest: templateWriteRequestSchema,
  TemplateCopyRequest: templateCopyRequestSchema,
  TemplateInventory: templateInventorySchema,
  TemplateDocument: templateDocumentSchema,
  CatalogMutationResult: catalogMutationResultSchema,
  KeywordCategory: keywordCategorySchema,
  KeywordInventory: keywordInventorySchema,
  KeywordWriteRequest: keywordWriteRequestSchema,
  KeywordMutationResult: keywordMutationResultSchema,
}

export const TYPERT = {
  package: SMART_COMMANDS_PACKAGE,
  face: 'host',
  schemas: [],
  invocations: bindSmartCommandsDescriptors(schemas).map(item => (
    item.method === 'deleteTemplate' ? { ...item, implementation: 'remove' as const } : item
  )),
  model: {
    services: [],
    events: [],
    objects: [],
  },
}
