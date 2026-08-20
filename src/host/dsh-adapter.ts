import type { HostAgent, HostLlm, HostSubagents, ModelRef, ModelRegistry, ModelSession, SubagentRunResult } from '../types/host.js'
import { parseModelRef } from '../engine/model-router.js'

interface DshContentBlock {
  type?: string
  text?: string
}

interface DshSubagentResult {
  output?: DshContentBlock[]
  stopReason?: string
}

interface DshSubagentRun {
  result: Promise<DshSubagentResult>
  dispose?: () => Promise<void> | void
}

interface DshSubagentService {
  list?: () => string[]
  start: (name: string, request: Record<string, unknown>) => Promise<DshSubagentRun>
  startContinuable?: (spec: {
    provider: string
    label: string
    request: Record<string, unknown>
    signal: AbortSignal
  }) => Promise<{ childId?: string; messageId?: string }>
}

function outputText(blocks: DshContentBlock[] | undefined): string {
  if (!blocks) return ''
  return blocks
    .filter(block => block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('')
}

function toDshStartBody(request: Parameters<HostSubagents['start']>[0]): Record<string, unknown> {
  return {
    prompt: [{ type: 'text', text: request.prompt }],
    label: request.label,
    ...request.parent ? { parent: request.parent } : {},
    ...request.agentOptions ? { agentOptions: request.agentOptions } : {},
    ...request.persona ? { persona: request.persona } : {},
    ...request.toolFilter ? { toolFilter: request.toolFilter } : {},
    ...request.maxDepth !== undefined ? { maxDepth: request.maxDepth } : {},
    ...request.cwd ? { cwd: request.cwd } : {},
  }
}

export function wrapDshSubagents(service: DshSubagentService): HostSubagents {
  return {
    list: () => service.list?.() ?? [],
    async start(request): Promise<SubagentRunResult> {
      const run = await service.start(request.provider, {
        ...toDshStartBody(request),
        signal: request.signal,
      })
      try {
        const result = await run.result
        return {
          text: outputText(result.output),
          stopReason: result.stopReason ?? 'completed',
        }
      } finally {
        await run.dispose?.()
      }
    },
    ...typeof service.startContinuable === 'function' ? {
      async startContinuable(request) {
        const started = await service.startContinuable!({
          provider: request.provider,
          label: request.label,
          request: toDshStartBody(request),
          signal: request.signal,
        })
        const childId = typeof started.childId === 'string' ? started.childId : ''
        if (!childId) throw new Error('ctx.subagents.startContinuable did not return a childId')
        return {
          childId,
          ...typeof started.messageId === 'string' ? { messageId: started.messageId } : {},
        }
      },
    } : {},
  }
}

export function asHostSubagents(raw: unknown): HostSubagents | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const service = raw as {
    start?: (...args: unknown[]) => unknown
    startContinuable?: (...args: unknown[]) => unknown
    list?: () => string[]
  }
  if (typeof service.start !== 'function') return undefined
  if (service.start.length >= 2 || typeof service.startContinuable === 'function') {
    return wrapDshSubagents(service as DshSubagentService)
  }
  return service as HostSubagents
}

function listedModelRefs(list: unknown): Array<{ id: string; provider?: string }> {
  if (!Array.isArray(list)) return []
  const refs: Array<{ id: string; provider?: string }> = []
  for (const item of list) {
    if (typeof item === 'string' && item.trim()) {
      refs.push(parseModelRef(item.trim()))
      continue
    }
    if (item && typeof item === 'object') {
      const record = item as { id?: unknown; model?: unknown; provider?: unknown }
      const id = typeof record.id === 'string' ? record.id : typeof record.model === 'string' ? record.model : undefined
      if (!id) continue
      refs.push({
        id,
        ...typeof record.provider === 'string' ? { provider: record.provider } : {},
      })
    }
  }
  return refs
}

function sameRef(a: ModelRef, b: ModelRef): boolean {
  return a.id === b.id && (a.provider ?? undefined) === (b.provider ?? undefined)
}

function pushUnique(target: ModelRef[], next: ModelRef): void {
  if (!target.some(item => sameRef(item, next))) target.push(next)
}

export async function loadAvailableModels(llm: HostLlm | undefined): Promise<ModelRef[]> {
  if (!llm) return []
  const available: ModelRef[] = []
  for (const item of listedModelRefs(llm.list?.())) pushUnique(available, item)

  const providers = typeof llm.listProviders === 'function'
    ? llm.listProviders().map(item => item?.id).filter((id): id is string => typeof id === 'string' && id.length > 0)
    : []
  for (const provider of providers) {
    if (typeof llm.listModels !== 'function') continue
    try {
      const models = await llm.listModels(provider)
      for (const item of listedModelRefs(models)) {
        pushUnique(available, { id: item.id, provider: item.provider ?? provider })
      }
    } catch {
      // One provider catalog failure must not hide the rest.
    }
  }
  return available
}

export function modelRegistryFromContext(ctx: {
  llm?: HostLlm
  parentAgent?: HostAgent
  sessionModel?: string
  available?: readonly ModelRef[]
}): ModelRegistry | undefined {
  const session = ctx.sessionModel ? parseModelRef(ctx.sessionModel) : undefined
  const currentId = ctx.parentAgent?.options?.model ?? session?.id
  const currentProvider = ctx.parentAgent?.options?.provider ?? session?.provider
  const available = [...(ctx.available ?? listedModelRefs(ctx.llm?.list?.()))]
  if (!currentId && available.length === 0) return undefined
  const current = currentId
    ? { id: currentId, ...currentProvider ? { provider: currentProvider } : {} }
    : undefined
  if (current) pushUnique(available, current)
  return {
    ...current ? { current } : {},
    available,
  }
}

function sessionModelFromConfiguration(configuration: {
  get<T>(key: string, defaultValue?: T): T | undefined
}): string | undefined {
  const namespaced = configuration.get<{ provider?: string; model?: string }>('agent-default-model')
  if (namespaced && typeof namespaced === 'object') {
    if (typeof namespaced.provider === 'string' && typeof namespaced.model === 'string') {
      return `${namespaced.provider}/${namespaced.model}`
    }
    if (typeof namespaced.model === 'string') return namespaced.model
  }
  const provider = configuration.get<string>('agent-default-model.provider')
  const model = configuration.get<string>('agent-default-model.model')
    ?? configuration.get<string>('llm.model')
  if (typeof provider === 'string' && typeof model === 'string') return `${provider}/${model}`
  if (typeof model === 'string') return model
  return undefined
}

export function modelSessionFromConfiguration(configuration?: {
  get<T>(key: string, defaultValue?: T): T | undefined
  update?(key: string, value: unknown): Promise<void> | void
}): ModelSession | undefined {
  if (!configuration) return undefined
  return {
    getModel: () => sessionModelFromConfiguration(configuration),
    setModel: async model => {
      if (!configuration.update) return
      const parsed = typeof model === 'string' ? parseModelRef(model) : undefined
      if (parsed?.provider) {
        await configuration.update('agent-default-model.provider', parsed.provider)
      }
      await configuration.update('agent-default-model.model', parsed?.id ?? model)
    },
  }
}
