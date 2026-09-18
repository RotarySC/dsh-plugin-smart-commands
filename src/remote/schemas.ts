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

export const keywordCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  keywords: z.array(z.string()),
})

export const inventoryKeywordCategorySchema = keywordCategorySchema.extend({
  origin: originSchema,
  sourceLabel: z.string(),
})

export const keywordInventoryErrorSchema = z.object({
  origin: originSchema,
  error: z.string(),
})

export const keywordInventorySchema = z.object({
  categories: z.array(inventoryKeywordCategorySchema),
  errors: z.array(keywordInventoryErrorSchema),
})

export const keywordWriteRequestSchema = z.object({
  origin: originSchema,
  categories: z.array(keywordCategorySchema),
  workspaceRoot: workspaceRootSchema,
})

export const keywordMutationResultSchema = z.object({
  ok: z.boolean(),
  origin: originSchema.optional(),
  error: z.string().optional(),
})

const chainRunStatusSchema = z.union([
  z.literal('running'),
  z.literal('succeeded'),
  z.literal('failed'),
  z.literal('cancelled'),
])

const chainRunStepStatusSchema = z.union([
  z.literal('pending'),
  z.literal('running'),
  z.literal('done'),
  z.literal('failed'),
  z.literal('skipped'),
])

/** One chain step's live state inside a detached run. */
export const chainRunStepSchema = z.object({
  name: z.string(),
  index: z.number(),
  status: chainRunStepStatusSchema,
  startedAt: z.number().optional(),
  endedAt: z.number().optional(),
  error: z.string().optional(),
})

/** One detached chain run as the dock panel reads it. */
export const chainRunRecordSchema = z.object({
  id: z.string(),
  command: z.string(),
  sessionId: z.string(),
  workspaceRoot: z.string(),
  status: chainRunStatusSchema,
  startedAt: z.number(),
  endedAt: z.number().optional(),
  round: z.number(),
  rounds: z.number(),
  steps: z.array(chainRunStepSchema),
  files: z.array(z.string()),
  text: z.string().optional(),
  error: z.string().optional(),
})

export const chainRunInventorySchema = z.object({
  runs: z.array(chainRunRecordSchema),
})

export const chainRunScopeSchema = z.object({
  sessionId: z.string().min(1).optional(),
  workspaceRoot: workspaceRootSchema,
  includeFinished: z.boolean().optional(),
})

export const chainRunCancelRequestSchema = z.object({
  runId: z.string(),
  sessionId: z.string().min(1).optional(),
})

export const chainRunCancelResultSchema = z.object({
  ok: z.boolean(),
  runId: z.string().optional(),
  error: z.string().optional(),
})

export const chainRunDismissRequestSchema = z.object({
  runId: z.string(),
  sessionId: z.string().min(1).optional(),
})

export const chainRunDismissResultSchema = z.object({
  ok: z.boolean(),
  runId: z.string().optional(),
  error: z.string().optional(),
})

