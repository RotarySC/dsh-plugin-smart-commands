/**
 * Cordis plugin entry for Smart Commands.
 * Named exports keep Loader injection metadata; there is no default export.
 */

import { homedir } from 'node:os'
import { asHostSubagents, modelRegistryFromContext, modelSessionFromConfiguration } from './host/dsh-adapter.js'
import { pickWorkspaceRoot } from './loader/template-loader.js'
import { registerHostSlashCommands, startSmartCommands } from './plugin.js'
import { tryStartSmartCommandsGateway } from './remote/gateway.js'
import { TYPERT } from './typert.host.js'
import { DEFAULT_PLUGIN_CONFIG, type PluginConfig, type SmartCommandsHost } from './types/host.js'

export const name = 'smart-commands'
export const inject = ['tools']

export { DEFAULT_PLUGIN_CONFIG, type PluginConfig }
export type { CommandTemplate, RuntimeOverrides } from './types/template.js'
export type { CommandRunResult, ListCommandItem } from './types/execution.js'
export { startSmartCommands } from './plugin.js'
export { parseTemplateDocument, TemplateValidationError } from './loader/frontmatter-parser.js'
export {
  TemplateLoader,
  loadTemplates,
  loadInventory,
  pickWorkspaceRoot,
  resolveTemplateDirectories,
  sameTemplateDirectory,
} from './loader/template-loader.js'
export { SmartCommandsCatalogApi } from './remote/catalog-api.js'
export { SmartCommandsGateway, tryStartSmartCommandsGateway } from './remote/gateway.js'
export { TYPERT } from './typert.host.js'
export { TYPERT_REMOTE } from './typert.remote-client.js'
export type { InventoryTemplate, TemplateDocument, TemplateInventory, TemplateOrigin } from './types/catalog.js'
export { parseCommandArgs, renderTemplate, substituteArgs } from './engine/template-engine.js'
export { selectModel, withModelOverride } from './engine/model-router.js'
export { validateChainOutputBindings } from './engine/chain-validation.js'
export { ChainExecutor } from './engine/chain-executor.js'
export { ChainRunRegistry, type ChainRunRegistryOptions } from './engine/run-registry.js'
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

function workspacePathsFromRegistry(ctx: CordisLikeContext): string[] {
  const registry = service<{ list?: () => Array<{ path?: string }> }>(ctx, 'workspaceRegistry')
  if (typeof registry?.list !== 'function') return []
  try {
    return registry.list()
      .map(item => item?.path)
      .filter((path): path is string => typeof path === 'string' && path.trim().length > 0)
  } catch {
    return []
  }
}

function workspaceRootOf(ctx: CordisLikeContext): string {
  const workspace = service<{ cwd?: string; path?: string; workspaceRoot?: string }>(ctx, 'workspace')
  const sandboxPolicy = service<{ workspaceRoot?: string }>(ctx, 'sandboxPolicy')
  return pickWorkspaceRoot([
    ...workspacePathsFromRegistry(ctx),
    workspace?.path,
    workspace?.cwd,
    workspace?.workspaceRoot,
    sandboxPolicy?.workspaceRoot,
    process.cwd(),
  ]) ?? process.cwd()
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
  tryStartSmartCommandsGateway(ctx, activated.loader, activated.runs)
  if (typeof ctx.inject === 'function') {
    ctx.inject(['typert'], scoped => {
      const typert = service<{ register(contribution: typeof TYPERT): (() => void) | void }>(scoped, 'typert')
      if (typert) {
        try {
          const disposeTypert = typert.register(TYPERT)
          if (disposeTypert && typeof scoped.effect === 'function') {
            scoped.effect(() => disposeTypert)
          }
        } catch {
          // Duplicate registration from typert-loader is fine.
        }
      }
      tryStartSmartCommandsGateway(ctx, activated.loader, activated.runs)
    })
  }
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
