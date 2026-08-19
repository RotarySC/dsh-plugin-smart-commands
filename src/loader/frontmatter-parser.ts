import { parse as parseYaml } from 'yaml'
import type { ChainStep, ParallelTaskItem, SequentialStep, ToolFilter } from '../types/chain.js'
import type { TemplateFrontmatter, TemplateParseResult } from '../types/template.js'
import { validateChainOutputBindings } from '../engine/chain-validation.js'

const FRONTMATTER_KEYS = new Set([
  'description',
  'model',
  'restore',
  'subagent',
  'context',
  'tools',
  'skills',
  'chain',
  'loop',
  'converge',
  'worktree',
])

const SEQUENTIAL_KEYS = new Set([
  'name',
  'agent',
  'model',
  'task',
  'as',
  'outputMode',
  'reads',
  'tools',
  'context',
])

const PARALLEL_KEYS = new Set([
  'name',
  'parallel',
  'concurrency',
  'failFast',
  'worktree',
])

const PARALLEL_TASK_KEYS = new Set([
  'agent',
  'model',
  'task',
  'as',
  'tools',
  'context',
])

const TOOL_FILTER_KEYS = new Set(['allow', 'deny'])

export class TemplateValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TemplateValidationError'
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function unexpectedKeys(value: Record<string, unknown>, allowed: Set<string>): string[] {
  return Object.keys(value).filter(key => !allowed.has(key))
}

function assertNoExtraKeys(value: Record<string, unknown>, allowed: Set<string>, path: string): void {
  const extra = unexpectedKeys(value, allowed)
  if (extra.length > 0) {
    throw new TemplateValidationError(`${path}: unknown field(s) ${extra.join(', ')}`)
  }
}

function asString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TemplateValidationError(`${path} must be a non-empty string`)
  }
  return value
}

function asOptionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined
  return asString(value, path)
}

function asBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new TemplateValidationError(`${path} must be a boolean`)
  }
  return value
}

function asStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || item.trim() === '')) {
    throw new TemplateValidationError(`${path} must be an array of non-empty strings`)
  }
  return value
}

function parseToolFilter(value: unknown, path: string): ToolFilter {
  if (!isPlainObject(value)) {
    throw new TemplateValidationError(`${path} must be an object with allow/deny string arrays`)
  }
  assertNoExtraKeys(value, TOOL_FILTER_KEYS, path)
  const allow = value.allow === undefined ? undefined : asStringArray(value.allow, `${path}.allow`)
  const deny = value.deny === undefined ? undefined : asStringArray(value.deny, `${path}.deny`)
  if (allow === undefined && deny === undefined) {
    throw new TemplateValidationError(`${path} must declare allow or deny`)
  }
  return { ...allow ? { allow } : {}, ...deny ? { deny } : {} }
}

function parseContext(value: unknown, path: string): 'fresh' | 'fork' {
  if (value !== 'fresh' && value !== 'fork') {
    throw new TemplateValidationError(`${path} must be "fresh" or "fork"`)
  }
  return value
}

function parseParallelTask(value: unknown, path: string): ParallelTaskItem {
  if (!isPlainObject(value)) {
    throw new TemplateValidationError(`${path} must be an object`)
  }
  assertNoExtraKeys(value, PARALLEL_TASK_KEYS, path)
  return {
    task: asString(value.task, `${path}.task`),
    ...value.agent !== undefined ? { agent: asString(value.agent, `${path}.agent`) } : {},
    ...value.model !== undefined ? { model: asString(value.model, `${path}.model`) } : {},
    ...value.as !== undefined ? { as: asString(value.as, `${path}.as`) } : {},
    ...value.tools !== undefined ? { tools: parseToolFilter(value.tools, `${path}.tools`) } : {},
    ...value.context !== undefined ? { context: parseContext(value.context, `${path}.context`) } : {},
  }
}

function parseSequentialStep(value: Record<string, unknown>, path: string): SequentialStep {
  assertNoExtraKeys(value, SEQUENTIAL_KEYS, path)
  const outputMode = value.outputMode
  if (outputMode !== undefined && outputMode !== 'inline' && outputMode !== 'file-only') {
    throw new TemplateValidationError(`${path}.outputMode must be "inline" or "file-only"`)
  }
  return {
    name: asString(value.name, `${path}.name`),
    task: asString(value.task, `${path}.task`),
    ...value.agent !== undefined ? { agent: asString(value.agent, `${path}.agent`) } : {},
    ...value.model !== undefined ? { model: asString(value.model, `${path}.model`) } : {},
    ...value.as !== undefined ? { as: asString(value.as, `${path}.as`) } : {},
    ...outputMode !== undefined ? { outputMode } : {},
    ...value.reads !== undefined ? { reads: asStringArray(value.reads, `${path}.reads`) } : {},
    ...value.tools !== undefined ? { tools: parseToolFilter(value.tools, `${path}.tools`) } : {},
    ...value.context !== undefined ? { context: parseContext(value.context, `${path}.context`) } : {},
  }
}

function parseParallelStep(value: Record<string, unknown>, path: string): ChainStep {
  assertNoExtraKeys(value, PARALLEL_KEYS, path)
  if (!Array.isArray(value.parallel) || value.parallel.length === 0) {
    throw new TemplateValidationError(`${path}.parallel must be a non-empty array`)
  }
  const concurrency = value.concurrency
  if (concurrency !== undefined && (typeof concurrency !== 'number' || !Number.isInteger(concurrency) || concurrency < 1)) {
    throw new TemplateValidationError(`${path}.concurrency must be an integer >= 1`)
  }
  return {
    name: asString(value.name, `${path}.name`),
    parallel: value.parallel.map((task, index) => parseParallelTask(task, `${path}.parallel[${index}]`)),
    ...concurrency !== undefined ? { concurrency } : {},
    ...value.failFast !== undefined ? { failFast: asBoolean(value.failFast, `${path}.failFast`) } : {},
    ...value.worktree !== undefined ? { worktree: asBoolean(value.worktree, `${path}.worktree`) } : {},
  }
}

export function parseChainSteps(value: unknown, path = 'chain'): ChainStep[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TemplateValidationError(`${path} must be a non-empty array`)
  }
  const steps = value.map((step, index) => {
    const stepPath = `${path}[${index}]`
    if (!isPlainObject(step)) {
      throw new TemplateValidationError(`${stepPath} must be an object`)
    }
    if ('parallel' in step) {
      return parseParallelStep(step, stepPath)
    }
    return parseSequentialStep(step, stepPath)
  })
  try {
    validateChainOutputBindings(steps)
  } catch (error) {
    throw new TemplateValidationError(error instanceof Error ? error.message : String(error))
  }
  return steps
}

export function parseTemplateDocument(content: string): TemplateParseResult {
  const normalized = content.replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---')) {
    throw new TemplateValidationError('template must start with YAML frontmatter delimited by ---')
  }
  const endIndex = normalized.indexOf('\n---', 3)
  if (endIndex === -1) {
    throw new TemplateValidationError('template frontmatter is missing the closing --- delimiter')
  }
  const rawYaml = normalized.slice(4, endIndex)
  const body = normalized.slice(endIndex + 4).replace(/^\n/, '')
  let parsed: unknown
  try {
    parsed = parseYaml(rawYaml)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new TemplateValidationError(`invalid YAML frontmatter: ${message}`)
  }
  if (parsed === null || parsed === undefined) {
    throw new TemplateValidationError('frontmatter cannot be empty')
  }
  if (!isPlainObject(parsed)) {
    throw new TemplateValidationError('frontmatter must be a YAML mapping')
  }
  assertNoExtraKeys(parsed, FRONTMATTER_KEYS, 'frontmatter')
  const description = asString(parsed.description, 'description')
  const subagent = parsed.subagent
  if (subagent !== undefined && typeof subagent !== 'boolean' && typeof subagent !== 'string') {
    throw new TemplateValidationError('subagent must be a boolean or persona string')
  }
  if (typeof subagent === 'string' && subagent.trim() === '') {
    throw new TemplateValidationError('subagent persona must be a non-empty string')
  }
  const loop = parsed.loop
  if (loop !== undefined && (typeof loop !== 'number' || !Number.isInteger(loop) || loop < 1 || loop > 99)) {
    throw new TemplateValidationError('loop must be an integer between 1 and 99')
  }
  const frontmatter: TemplateFrontmatter = {
    description,
    ...parsed.model !== undefined ? { model: asString(parsed.model, 'model') } : {},
    ...parsed.restore !== undefined ? { restore: asBoolean(parsed.restore, 'restore') } : {},
    ...subagent !== undefined ? { subagent } : {},
    ...parsed.context !== undefined ? { context: parseContext(parsed.context, 'context') } : {},
    ...parsed.tools !== undefined ? { tools: parseToolFilter(parsed.tools, 'tools') } : {},
    ...parsed.skills !== undefined ? { skills: asStringArray(parsed.skills, 'skills') } : {},
    ...parsed.chain !== undefined ? { chain: parseChainSteps(parsed.chain) } : {},
    ...loop !== undefined ? { loop } : {},
    ...parsed.converge !== undefined ? { converge: asBoolean(parsed.converge, 'converge') } : {},
    ...parsed.worktree !== undefined ? { worktree: asBoolean(parsed.worktree, 'worktree') } : {},
  }
  return { frontmatter, body }
}

export function commandNameFromRelativePath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\.\//, '')
  if (!normalized.toLowerCase().endsWith('.md')) {
    throw new TemplateValidationError(`template file must use a .md extension: ${relativePath}`)
  }
  return normalized.slice(0, -3)
}
