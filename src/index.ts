/**
 * Cordis plugin entry for Smart Commands.
 * Named exports keep Loader injection metadata; there is no default export.
 */

import { homedir } from 'node:os'
import { asHostSubagents, modelRegistryFromContext, modelSessionFromConfiguration } from './host/dsh-adapter.js'
import { registerHostSlashCommands, startSmartCommands } from './plugin.js'
import { DEFAULT_PLUGIN_CONFIG, type PluginConfig, type SmartCommandsHost } from './types/host.js'

export const name = 'smart-commands'
export const inject = ['tools']

export { DEFAULT_PLUGIN_CONFIG, type PluginConfig }
export type { CommandTemplate, RuntimeOverrides } from './types/template.js'
export type { CommandRunResult, ListCommandItem } from './types/execution.js'
export { startSmartCommands } from './plugin.js'
export { parseTemplateDocument, TemplateValidationError } from './loader/frontmatter-parser.js'
export { TemplateLoader, loadTemplates, resolveTemplateDirectories } from './loader/template-loader.js'
export { parseCommandArgs, renderTemplate, substituteArgs } from './engine/template-engine.js'
export { selectModel, withModelOverride } from './engine/model-router.js'
export { validateChainOutputBindings } from './engine/chain-validation.js'
export { ChainExecutor } from './engine/chain-executor.js'
export { SubagentBridge } from './engine/subagent-bridge.js'

export interface CordisLikeContext {
  get?(name: string, strict?: boolean): unknown
  inject?(deps: string[], callback: (scoped: CordisLikeContext) => void): void
  effect?(callback: () => () => void): void
}

function service<T>(ctx: CordisLikeContext, name: string): T | undefined {
  if (typeof ctx.get !== 'function') return undefined
  try {
    return ctx.get(name, false) as T | undefined
  } catch {
    return undefined
  }
}

function workspaceRootOf(ctx: CordisLikeContext): string {
  const workspace = service<{ cwd?: string }>(ctx, 'workspace')
  return typeof workspace?.cwd === 'string' && workspace.cwd ? workspace.cwd : process.cwd()
}

export interface Config extends Partial<PluginConfig> {}

export function apply(ctx: CordisLikeContext, config: Config = {}): void {
  const pluginConfig = { ...DEFAULT_PLUGIN_CONFIG, ...config }
  const tools = service<{ register(tool: unknown): () => void }>(ctx, 'tools')
  const host: SmartCommandsHost = {
    workspaceRoot: workspaceRootOf(ctx),
    userHome: homedir(),
    config: pluginConfig,
    get configuration() {
      return service<SmartCommandsHost['configuration']>(ctx, 'configuration')
    },
    ...tools ? {
      tools: {
        register(tool) {
          return tools.register({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
            output: tool.output,
            execute: tool.execute,
          })
        },
      },
    } : {},
    get commands() {
      return service<SmartCommandsHost['commands']>(ctx, 'commands')
    },
    get subagents() {
      return asHostSubagents(service(ctx, 'subagents'))
    },
    get llm() {
      return service<SmartCommandsHost['llm']>(ctx, 'llm')
    },
    get modelRegistry() {
      const llm = service<SmartCommandsHost['llm']>(ctx, 'llm')
      const sessionModel = modelSessionFromConfiguration(
        service<SmartCommandsHost['configuration']>(ctx, 'configuration'),
      )?.getModel()
      return modelRegistryFromContext({
        ...llm ? { llm } : {},
        ...sessionModel ? { sessionModel } : {},
      })
    },
    get modelSession() {
      return modelSessionFromConfiguration(service(ctx, 'configuration'))
    },
  }
  const activated = startSmartCommands(host)
  if (typeof ctx.inject === 'function' && !host.commands) {
    ctx.inject(['commands'], scoped => {
      const commands = service<NonNullable<SmartCommandsHost['commands']>>(scoped, 'commands')
      if (!commands) return
      const disposeCommand = registerHostSlashCommands(commands, activated.loader, activated.runner)
      if (typeof scoped.effect === 'function') {
        scoped.effect(() => disposeCommand)
      }
    })
  }
  if (typeof ctx.effect === 'function') {
    ctx.effect(() => () => { activated.dispose() })
  }
}
