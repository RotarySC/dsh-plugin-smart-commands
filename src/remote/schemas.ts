import { z } from 'zod'

const originSchema = z.union([z.literal('user'), z.literal('project')])
const contextSchema = z.union([z.literal('fresh'), z.literal('fork')])
const workspaceRootSchema = z.string().min(1).optional()

export const inventoryTemplateSchema = z.object({
  name: z.string(),
  slashName: z.string().optional(),
  description: z.string(),
  origin: originSchema,
  sourceLabel: z.string(),
  hasChain: z.boolean(),
  models: z.array(z.string()),
  subagent: z.union([z.boolean(), z.string()]),
  continuable: z.boolean(),
  context: contextSchema,
  parameters: z.array(z.string()),
  isSubagent: z.boolean(),
})

export const inventoryErrorSchema = z.object({
  origin: originSchema,
  name: z.string().optional(),
  error: z.string(),
})

export const templateInventorySchema = z.object({
  templates: z.array(inventoryTemplateSchema),
  errors: z.array(inventoryErrorSchema),
})

export const catalogScopeSchema = z.object({
  workspaceRoot: workspaceRootSchema,
})

export const templateIdentitySchema = z.object({
  name: z.string(),
  origin: originSchema,
  workspaceRoot: workspaceRootSchema,
})

export const templateDocumentSchema = inventoryTemplateSchema.extend({
  content: z.string(),
})

export const templateWriteRequestSchema = z.object({
  name: z.string(),
  origin: originSchema,
  content: z.string(),
  mode: z.union([z.literal('create'), z.literal('update')]).optional(),
  workspaceRoot: workspaceRootSchema,
})

export const templateCopyRequestSchema = z.object({
  fromName: z.string(),
  fromOrigin: originSchema,
  toName: z.string(),
  toOrigin: originSchema,
  workspaceRoot: workspaceRootSchema,
})

export const catalogMutationResultSchema = z.object({
  ok: z.boolean(),
  name: z.string().optional(),
  origin: originSchema.optional(),
  error: z.string().optional(),
})
