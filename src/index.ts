/**
 * Cordis plugin entry for Smart Commands.
 * Named exports keep Loader injection metadata; there is no default export.
 */

import { homedir } from 'node:os'
import { asHostSubagents, modelRegistryFromContext, modelSessionFromConfiguration } from './host/dsh-adapter.js'
import { registerSmartSlashCommand, startSmartCommands } from './plugin.js'
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

interface CordisLikeContext {
  tools?: {
    register(tool: unknown): () => void
  }
  commands?: SmartCommandsHost['commands']
  subagents?: unknown
  configuration?: SmartCommandsHost['configuration']
  llm?: { list?: () => string[] }
  workspace?: { cwd?: string }
  get?(name: string): unknown
  inject?(deps: string[], callback: (scoped: CordisLikeContext) => void): void
  effect?(callback: () => () => void): void
}

function service<T>(ctx: CordisLikeContext, name: string, direct: T | undefined): T | undefined {
  if (direct !== undefined) return direct
  const value = ctx.get?.(name)
  return value as T | undefined
}

export interface Config extends Partial<PluginConfig> {}

export function apply(ctx: CordisLikeContext, config: Config = {}): void {
  const pluginConfig = { ...DEFAULT_PLUGIN_CONFIG, ...config }
  const host: SmartCommandsHost = {
    workspaceRoot: ctx.workspace?.cwd ?? process.cwd(),
    userHome: homedir(),
    config: pluginConfig,
    get configuration() {
      return service(ctx, 'configuration', ctx.configuration)
    },
    ...ctx.tools ? {
      tools: {
        register(tool) {
          return ctx.tools!.register({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
            execute: tool.execute,
          })
        },
      },
    } : {},
    get commands() {
      return service(ctx, 'commands', ctx.commands)
    },
    get subagents() {
      return asHostSubagents(service(ctx, 'subagents', ctx.subagents))
    },
    get modelRegistry() {
      return modelRegistryFromContext({
        ...service(ctx, 'llm', ctx.llm) ? { llm: service(ctx, 'llm', ctx.llm) } : {},
      })
    },
    get modelSession() {
      return modelSessionFromConfiguration(service(ctx, 'configuration', ctx.configuration))
    },
  }
  const activated = startSmartCommands(host)
  if (typeof ctx.inject === 'function' && !host.commands) {
    ctx.inject(['commands'], scoped => {
      const commands = service(scoped, 'commands', scoped.commands)
      if (!commands) return
      const disposeCommand = registerSmartSlashCommand(commands, activated.runner)
      if (typeof scoped.effect === 'function') {
        scoped.effect(() => disposeCommand)
      }
    })
  }
  if (typeof ctx.effect === 'function') {
    ctx.effect(() => () => { activated.dispose() })
  }
}
