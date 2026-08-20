import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { bindSmartCommandsDescriptors, SMART_COMMANDS_PACKAGE } from '../remote/contract.js'

function fail(message: string): never {
  throw new Error(message)
}

function asObject(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${path} must be an object`)
  return value as Record<string, unknown>
}

function asString(value: unknown, path: string): string {
  if (typeof value !== 'string') fail(`${path} must be a string`)
  return value
}

function asBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(`${path} must be a boolean`)
  return value
}

function asStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) fail(`${path} must be a string array`)
  return value
}

function asOrigin(value: unknown, path: string): 'user' | 'project' {
  if (value !== 'user' && value !== 'project') fail(`${path} must be user or project`)
  return value
}

function asContext(value: unknown, path: string): 'fresh' | 'fork' {
  if (value !== 'fresh' && value !== 'fork') fail(`${path} must be fresh or fork`)
  return value
}

function parseTemplate(value: unknown, path: string): Record<string, unknown> {
  const record = asObject(value, path)
  const slashName = record.slashName
  return {
    name: asString(record.name, `${path}.name`),
    ...typeof slashName === 'string' ? { slashName } : {},
    description: asString(record.description, `${path}.description`),
    origin: asOrigin(record.origin, `${path}.origin`),
    sourceLabel: asString(record.sourceLabel, `${path}.sourceLabel`),
    hasChain: asBoolean(record.hasChain, `${path}.hasChain`),
    models: asStringArray(record.models, `${path}.models`),
    subagent: typeof record.subagent === 'boolean' || typeof record.subagent === 'string'
      ? record.subagent
      : fail(`${path}.subagent must be a boolean or string`),
    continuable: asBoolean(record.continuable, `${path}.continuable`),
    context: asContext(record.context, `${path}.context`),
    parameters: asStringArray(record.parameters, `${path}.parameters`),
    isSubagent: asBoolean(record.isSubagent, `${path}.isSubagent`),
  }
}

function optionalWorkspaceRoot(record: Record<string, unknown>): { workspaceRoot?: string } {
  return typeof record.workspaceRoot === 'string' && record.workspaceRoot.trim()
    ? { workspaceRoot: record.workspaceRoot }
    : {}
}

function parseScope(value: unknown) {
  if (value === undefined || value === null) return {}
  return optionalWorkspaceRoot(asObject(value, 'request'))
}

function parseIdentity(value: unknown) {
  const record = asObject(value, 'request')
  return {
    name: asString(record.name, 'request.name'),
    origin: asOrigin(record.origin, 'request.origin'),
    ...optionalWorkspaceRoot(record),
  }
}

function parseWrite(value: unknown) {
  const record = asObject(value, 'request')
  const mode = record.mode
  return {
    name: asString(record.name, 'request.name'),
    origin: asOrigin(record.origin, 'request.origin'),
    content: asString(record.content, 'request.content'),
    ...mode === 'create' || mode === 'update' ? { mode } : {},
    ...optionalWorkspaceRoot(record),
  }
}

function parseCopy(value: unknown) {
  const record = asObject(value, 'request')
  return {
    fromName: asString(record.fromName, 'request.fromName'),
    fromOrigin: asOrigin(record.fromOrigin, 'request.fromOrigin'),
    toName: asString(record.toName, 'request.toName'),
    toOrigin: asOrigin(record.toOrigin, 'request.toOrigin'),
    ...optionalWorkspaceRoot(record),
  }
}

function parseInventory(value: unknown) {
  const record = asObject(value, 'result')
  if (!Array.isArray(record.templates) || !Array.isArray(record.errors)) fail('inventory shape is invalid')
  return {
    templates: record.templates.map((item, index) => parseTemplate(item, `templates[${index}]`)),
    errors: record.errors.map((item, index) => {
      const error = asObject(item, `errors[${index}]`)
      return {
        origin: asOrigin(error.origin, `errors[${index}].origin`),
        ...typeof error.name === 'string' ? { name: error.name } : {},
        error: asString(error.error, `errors[${index}].error`),
      }
    }),
  }
}

function parseDocument(value: unknown) {
  const record = asObject(value, 'result')
  return {
    ...parseTemplate(record, 'result'),
    content: asString(record.content, 'result.content'),
  }
}

function parseMutation(value: unknown) {
  const record = asObject(value, 'result')
  return {
    ok: asBoolean(record.ok, 'result.ok'),
    ...typeof record.name === 'string' ? { name: record.name } : {},
    ...record.origin === 'user' || record.origin === 'project' ? { origin: record.origin } : {},
    ...typeof record.error === 'string' ? { error: record.error } : {},
  }
}

function schema<T>(parse: (value: unknown) => T): { parse(value: unknown): T } {
  return { parse }
}

export const TYPERT_REMOTE: TypertRemoteContribution = {
  package: SMART_COMMANDS_PACKAGE,
  descriptors: bindSmartCommandsDescriptors({
    CatalogScope: schema(parseScope),
    TemplateIdentity: schema(parseIdentity),
    TemplateWriteRequest: schema(parseWrite),
    TemplateCopyRequest: schema(parseCopy),
    TemplateInventory: schema(parseInventory),
    TemplateDocument: schema(parseDocument),
    CatalogMutationResult: schema(parseMutation),
  }),
}
