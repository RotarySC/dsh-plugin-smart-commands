import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { bindSmartCommandsDescriptors, SMART_COMMANDS_PACKAGE } from './remote/contract.js'
import {
  catalogMutationResultSchema,
  catalogScopeSchema,
  templateCopyRequestSchema,
  templateDocumentSchema,
  templateIdentitySchema,
  templateInventorySchema,
  templateWriteRequestSchema,
} from './remote/schemas.js'
import type {
  CatalogMutationResult,
  CatalogScope,
  TemplateCopyRequest,
  TemplateDocument,
  TemplateIdentity,
  TemplateInventory,
  TemplateWriteRequest,
} from './types/catalog.js'

export const TYPERT_REMOTE: TypertRemoteContribution = {
  package: SMART_COMMANDS_PACKAGE,
  descriptors: bindSmartCommandsDescriptors({
    CatalogScope: catalogScopeSchema,
    TemplateIdentity: templateIdentitySchema,
    TemplateWriteRequest: templateWriteRequestSchema,
    TemplateCopyRequest: templateCopyRequestSchema,
    TemplateInventory: templateInventorySchema,
    TemplateDocument: templateDocumentSchema,
    CatalogMutationResult: catalogMutationResultSchema,
  }),
}

export default TYPERT_REMOTE

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceSmartCommands {
    list: (request?: CatalogScope) => Promise<import('@deepseek-ai/dsh-typert-protocol').RemoteResult<TemplateInventory>>
    read: (request: TemplateIdentity) => Promise<import('@deepseek-ai/dsh-typert-protocol').RemoteResult<TemplateDocument>>
    write: (request: TemplateWriteRequest) => Promise<import('@deepseek-ai/dsh-typert-protocol').RemoteResult<CatalogMutationResult>>
    deleteTemplate: (request: TemplateIdentity) => Promise<import('@deepseek-ai/dsh-typert-protocol').RemoteResult<CatalogMutationResult>>
    copy: (request: TemplateCopyRequest) => Promise<import('@deepseek-ai/dsh-typert-protocol').RemoteResult<CatalogMutationResult>>
  }
  interface TypertRemoteMap {
    'smartCommands/list': (request?: CatalogScope) => Promise<import('@deepseek-ai/dsh-typert-protocol').RemoteResult<TemplateInventory>>
    'smartCommands/read': (request: TemplateIdentity) => Promise<import('@deepseek-ai/dsh-typert-protocol').RemoteResult<TemplateDocument>>
    'smartCommands/write': (request: TemplateWriteRequest) => Promise<import('@deepseek-ai/dsh-typert-protocol').RemoteResult<CatalogMutationResult>>
    'smartCommands/deleteTemplate': (request: TemplateIdentity) => Promise<import('@deepseek-ai/dsh-typert-protocol').RemoteResult<CatalogMutationResult>>
    'smartCommands/copy': (request: TemplateCopyRequest) => Promise<import('@deepseek-ai/dsh-typert-protocol').RemoteResult<CatalogMutationResult>>
  }
  interface TypertRemoteNamespaceMap {
    smartCommands: TypertRemoteNamespaceSmartCommands
  }
}
