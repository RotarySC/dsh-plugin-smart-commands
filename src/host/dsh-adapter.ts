import type { HostAgent, HostSubagents, ModelRegistry, ModelSession, SubagentRunResult } from '../types/host.js'

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
}

function outputText(blocks: DshContentBlock[] | undefined): string {
  if (!blocks) return ''
  return blocks
    .filter(block => block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('')
}

export function wrapDshSubagents(service: DshSubagentService): HostSubagents {
  return {
    list: () => service.list?.() ?? [],
    async start(request): Promise<SubagentRunResult> {
      const run = await service.start(request.provider, {
        prompt: [{ type: 'text', text: request.prompt }],
        label: request.label,
        ...request.parent ? { parent: request.parent } : {},
        signal: request.signal,
        ...request.agentOptions ? { agentOptions: request.agentOptions } : {},
        ...request.persona ? { persona: request.persona } : {},
        ...request.toolFilter ? { toolFilter: request.toolFilter } : {},
        ...request.maxDepth !== undefined ? { maxDepth: request.maxDepth } : {},
        ...request.cwd ? { cwd: request.cwd } : {},
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
  }
}

export function asHostSubagents(raw: unknown): HostSubagents | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const service = raw as { start?: (...args: unknown[]) => unknown; list?: () => string[] }
  if (typeof service.start !== 'function') return undefined
  if (service.start.length >= 2) {
    return wrapDshSubagents(service as DshSubagentService)
  }
  return service as HostSubagents
}

export function modelRegistryFromContext(ctx: {
  llm?: { list?: () => string[] }
  parentAgent?: HostAgent
}): ModelRegistry | undefined {
  const currentId = ctx.parentAgent?.options?.model
  const currentProvider = ctx.parentAgent?.options?.provider
  const available = (ctx.llm?.list?.() ?? []).map(id => ({ id }))
  if (!currentId && available.length === 0) return undefined
  return {
    ...currentId ? { current: { id: currentId, ...currentProvider ? { provider: currentProvider } : {} } } : {},
    available: currentId && !available.some(model => model.id === currentId)
      ? [...available, { id: currentId, ...currentProvider ? { provider: currentProvider } : {} }]
      : available,
  }
}

export function modelSessionFromConfiguration(configuration?: {
  get<T>(key: string, defaultValue?: T): T | undefined
  update?(key: string, value: unknown): Promise<void> | void
}): ModelSession | undefined {
  if (!configuration?.update) return undefined
  return {
    getModel: () => configuration.get<string>('llm.model'),
    setModel: async model => { await configuration.update?.('llm.model', model) },
  }
}
