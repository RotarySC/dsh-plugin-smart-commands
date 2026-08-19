import type { DelegationRequest } from '../types/execution.js'
import type { HostAgent, HostSubagents, HostTurnResult, PluginConfig, SubagentRunResult } from '../types/host.js'

export class DelegationDepthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DelegationDepthError'
  }
}

export interface SubagentBridgeOptions {
  readonly subagents?: HostSubagents
  readonly parent?: HostAgent
  readonly config: PluginConfig
  readonly fallback?: (prompt: string, signal: AbortSignal) => Promise<HostTurnResult>
}

function textFromStop(result: SubagentRunResult): string {
  if (result.stopReason === 'completed') return result.text
  const headline = result.stopReason === 'aborted'
    ? 'subagent run was cancelled'
    : result.stopReason === 'error'
      ? 'subagent run failed'
      : `subagent run ended abnormally (${result.stopReason})`
  return result.text.trim() ? `${headline}\nPartial output before the run ended:\n${result.text}` : headline
}

export class SubagentBridge {
  constructor(private readonly options: SubagentBridgeOptions) {}

  assertDepth(depth: number): void {
    if (depth > this.options.config.maxDelegationDepth) {
      throw new DelegationDepthError(
        `delegation depth ${depth} exceeds maxDepth ${this.options.config.maxDelegationDepth}`,
      )
    }
  }

  async run(request: DelegationRequest): Promise<HostTurnResult> {
    this.assertDepth(request.depth)
    if (request.signal.aborted) {
      throw new Error('Operation cancelled by user')
    }
    const provider = request.context === 'fork'
      ? this.options.config.forkProvider
      : this.options.config.spawnProvider
    const withSkills = request.skills?.length
      ? `Bound skills (load before acting): ${request.skills.join(', ')}\n\n${request.prompt}`
      : request.prompt
    const prompt = request.cwd
      ? `Isolated working directory (edit only files under this path):\n${request.cwd}\n\n${withSkills}`
      : withSkills
    if (this.options.subagents) {
      const result = await this.options.subagents.start({
        provider,
        prompt,
        label: request.label,
        ...this.options.parent ? { parent: this.options.parent } : {},
        signal: request.signal,
        ...request.model ? { agentOptions: { model: request.model } } : {},
        ...typeof request.agent === 'string' ? { persona: request.agent } : {},
        ...request.tools ? { toolFilter: request.tools } : {},
        maxDepth: this.options.config.maxDelegationDepth,
        ...request.cwd ? { cwd: request.cwd } : {},
      })
      if (result.stopReason !== 'completed') {
        throw new Error(textFromStop(result))
      }
      return { text: result.text, changedFiles: result.changedFiles ?? [] }
    }
    if (this.options.fallback) {
      return this.options.fallback(prompt, request.signal)
    }
    throw new Error('ctx.subagents is unavailable and no in-process fallback is configured')
  }
}
