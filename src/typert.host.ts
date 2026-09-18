import { bindSmartCommandsDescriptors, SMART_COMMANDS_PACKAGE } from './remote/contract.js'
import {
  catalogMutationResultSchema,
  catalogScopeSchema,
  chainRunCancelRequestSchema,
  chainRunCancelResultSchema,
  chainRunDismissRequestSchema,
  chainRunDismissResultSchema,
  chainRunInventorySchema,
  chainRunRecordSchema,
  chainRunScopeSchema,
  chainRunStepSchema,
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
  ChainRunStep: chainRunStepSchema,
  ChainRunRecord: chainRunRecordSchema,
  ChainRunScope: chainRunScopeSchema,
  ChainRunInventory: chainRunInventorySchema,
  ChainRunCancelRequest: chainRunCancelRequestSchema,
  ChainRunCancelResult: chainRunCancelResultSchema,
  ChainRunDismissRequest: chainRunDismissRequestSchema,
  ChainRunDismissResult: chainRunDismissResultSchema,
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
