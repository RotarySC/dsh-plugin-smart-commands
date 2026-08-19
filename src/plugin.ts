import { homedir } from 'node:os'
import { DEFAULT_PLUGIN_CONFIG, type PluginConfig, type SmartCommandsHost } from './types/host.js'
import { CommandRunner } from './engine/command-runner.js'
import { parseCommandArgs } from './engine/template-engine.js'
import { resolveTemplateDirectories, TemplateLoader } from './loader/template-loader.js'
import { createListSmartCommandsTool } from './tools/list-smart-commands.js'
import { createManageTemplateTool } from './tools/manage-template.js'
import { createRunSmartCommandTool } from './tools/run-smart-command.js'

export interface ActivatedPlugin {
  readonly loader: TemplateLoader
  readonly runner: CommandRunner
  dispose(): void
}

function readConfig(host: Partial<SmartCommandsHost> | undefined): PluginConfig {
  const configuration = host?.configuration
  return {
    userTemplatesDir: configuration?.get('smartCommands.userTemplatesDir', DEFAULT_PLUGIN_CONFIG.userTemplatesDir)
      ?? host?.config?.userTemplatesDir
      ?? DEFAULT_PLUGIN_CONFIG.userTemplatesDir,
    projectTemplatesDir: configuration?.get('smartCommands.projectTemplatesDir', DEFAULT_PLUGIN_CONFIG.projectTemplatesDir)
      ?? host?.config?.projectTemplatesDir
      ?? DEFAULT_PLUGIN_CONFIG.projectTemplatesDir,
    maxChainSteps: configuration?.get('smartCommands.maxChainSteps', DEFAULT_PLUGIN_CONFIG.maxChainSteps)
      ?? host?.config?.maxChainSteps
      ?? DEFAULT_PLUGIN_CONFIG.maxChainSteps,
    maxConcurrency: configuration?.get('smartCommands.maxConcurrency', DEFAULT_PLUGIN_CONFIG.maxConcurrency)
      ?? host?.config?.maxConcurrency
      ?? DEFAULT_PLUGIN_CONFIG.maxConcurrency,
    maxDelegationDepth: host?.config?.maxDelegationDepth ?? DEFAULT_PLUGIN_CONFIG.maxDelegationDepth,
    spawnProvider: host?.config?.spawnProvider ?? DEFAULT_PLUGIN_CONFIG.spawnProvider,
    forkProvider: host?.config?.forkProvider ?? DEFAULT_PLUGIN_CONFIG.forkProvider,
  }
}

export function registerSmartSlashCommand(
  commands: NonNullable<SmartCommandsHost['commands']>,
  runner: CommandRunner,
): () => void {
  return commands.register({
    name: 'smart',
    description: 'Run a Smart Command template or Chain workflow',
    input: { hint: '<command> [args]' },
    handler: async invocation => {
      await runner.ready()
      const tokens = parseCommandArgs(invocation.rawInput)
      if (tokens.length === 0) {
        const listed = runner.list().map(item => `/${item.name} — ${item.description}`).join('\n')
        return { kind: 'success', text: listed || 'No smart commands loaded.' }
      }
      const [command, ...rest] = tokens
      const result = await runner.run({
        command: command!,
        args: rest,
      }, invocation.signal, invocation.agent)
      return result.ok
        ? { kind: 'success', text: result.text }
        : { kind: 'error', text: result.error }
    },
  })
}

export function startSmartCommands(host: SmartCommandsHost): ActivatedPlugin {
  const config = { ...DEFAULT_PLUGIN_CONFIG, ...host.config, ...readConfig(host) }
  const dirs = resolveTemplateDirectories(
    host.workspaceRoot,
    config.userTemplatesDir,
    config.projectTemplatesDir,
    host.userHome ?? homedir(),
  )
  const loader = new TemplateLoader(dirs)
  void loader.reload()
  loader.startWatching()
  const runner = new CommandRunner({ host, loader, config })
  const disposers: Array<() => void> = []
  if (host.tools) {
    disposers.push(host.tools.register(createRunSmartCommandTool(runner)))
    disposers.push(host.tools.register(createListSmartCommandsTool(runner)))
    disposers.push(host.tools.register(createManageTemplateTool(runner)))
  }
  if (host.commands) {
    disposers.push(registerSmartSlashCommand(host.commands, runner))
  }
  return {
    loader,
    runner,
    dispose() {
      loader.stopWatching()
      for (const dispose of disposers) dispose()
    },
  }
}

export async function activateSmartCommands(host: SmartCommandsHost): Promise<ActivatedPlugin> {
  const activated = startSmartCommands(host)
  await activated.loader.ready()
  return activated
}
