import { randomUUID } from 'node:crypto'
import type { HostAgent, HostLlm, HostSubagents, HostTurnResult, ModelRef, ModelRegistry, ModelSession, SubagentRunResult } from '../types/host.js'
import { parseModelRef } from '../engine/model-router.js'
import { NOTICE_SUMMARY_MAX_CHARS, bound, firstLine } from '../run-format.js'

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
    // DSH delegation reads the parent's session/ctx/options — a duck-typed
    // HostAgent wrapper (from asHostAgent) would crash with "Cannot read
    // properties of undefined (reading 'header')". Forward the original agent.
    ...request.parent ? { parent: request.parent.original ?? request.parent } : {},
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

/**
 * Duck-typed DSH `Agent` (from `@deepseek-ai/dsh-agent`): the object handed to
 * command handlers as `invocation.agent`. Its turn-driving surface is
 * `followup(message)` — queue a model-visible user message and wake the agent
 * loop. There is no `submit` on the real agent; this adapter is what makes
 * in-session template runs reach the main agent at all.
 */
interface DshAgentLike {
  readonly id?: unknown
  readonly options?: { provider?: string; model?: string }
  followup?(message: unknown): void
}

/** The plugin's own name in message provenance; §5.1 of the maintainers' internal notes fixes the literal. */
const PLUGIN_NAME = 'smart-commands'

function enqueue(agent: DshAgentLike, text: string, source: Record<string, unknown>): void {
  agent.followup!({
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source,
  })
}

/**
 * The one-line account for a `notice` source: the message's first line, inside
 * the bound DSH applies. Both halves come from `run-format.ts`, the same place
 * the settled-run report gets them, so the two cannot drift apart.
 */
function noticeSummary(text: string): string {
  return bound(firstLine(text), NOTICE_SUMMARY_MAX_CHARS)
}

/**
 * Queue `prompt` as one model-visible user message and return immediately.
 * Deliberately does NOT `await whenIdle()`: the composer keeps the slash-claim
 * in the input and locks editing for the whole `commands.execute` transaction,
 * so a handler that blocks on the full LLM turn leaves a ghost command and a
 * dead input until the turn ends. The model reply streams below as an ordinary
 * assistant message; the `text` of a fire-and-forget submission is empty.
 */
async function submitMainAgentTurn(agent: DshAgentLike, prompt: string): Promise<HostTurnResult> {
  enqueue(agent, prompt, { kind: 'user' })
  return { text: '' }
}

/**
 * Queue a report the plugin produced itself.
 *
 * `kind: 'plugin'` is the honest provenance and the reason this is not folded
 * into {@link submitMainAgentTurn}: the transcript renders it as an injected
 * context row labeled `smart-commands` rather than as a user bubble, and
 * `form: 'notice'` (the same shape `dsh-plan-mode` uses for its own narration)
 * gives that row a one-line account the user reads without expanding it.
 */
function notifyMainAgent(agent: DshAgentLike, text: string): void {
  enqueue(agent, text, {
    kind: 'plugin',
    plugin: PLUGIN_NAME,
    form: 'notice',
    summary: noticeSummary(text),
  })
}

/**
 * Adapt a DSH `Agent` (as received on `invocation.agent` / `exec.agent`) into
 * the plugin's {@link HostAgent}. `submit` and `notify` are only attached when
 * the agent can actually queue turn input (`followup`); hosts that only echo the
 * rendered prompt to the caller (model-facing `smart_command_run`) must keep
 * passing the raw agent so both stay absent — submitting into the caller's own
 * running turn would deadlock the loop.
 */
export function asHostAgent(raw: unknown): HostAgent | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const agent = raw as DshAgentLike
  if (typeof agent.id !== 'string' || !agent.id) return undefined
  return {
    id: agent.id,
    original: raw,
    ...agent.options?.provider && agent.options.model
      ? { options: { provider: agent.options.provider, model: agent.options.model } }
      : {},
    ...typeof agent.followup === 'function'
      ? {
          notify: (text: string) => { notifyMainAgent(agent, text) },
          submit: (prompt: string, signal: AbortSignal) => {
            if (signal.aborted) return Promise.reject(new Error('Operation cancelled by user'))
            return submitMainAgentTurn(agent, prompt)
          },
        }
      : {},
  }
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
