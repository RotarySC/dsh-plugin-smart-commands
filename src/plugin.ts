import { homedir } from 'node:os'
import { DEFAULT_PLUGIN_CONFIG, type HostAgent, type PluginConfig, type SmartCommandsHost } from './types/host.js'
import { asHostAgent } from './host/dsh-adapter.js'
import { CommandRunner } from './engine/command-runner.js'
import { ChainRunRegistry } from './engine/run-registry.js'
import { slashCommandNameFor } from './engine/slash-name.js'
import { extractTemplateSlots, parseCommandArgs } from './engine/template-engine.js'
import { resolveTemplateDirectories, TemplateLoader } from './loader/template-loader.js'
import { createListSmartCommandsTool } from './tools/list-smart-commands.js'
import { createManageTemplateTool } from './tools/manage-template.js'
import { createRunSmartCommandTool } from './tools/run-smart-command.js'
import type { CommandTemplate } from './types/template.js'

export interface ActivatedPlugin {
  readonly loader: TemplateLoader
  readonly runner: CommandRunner
  /** Live table of detached chain runs (the run panel's data source). */
  readonly runs: ChainRunRegistry
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
    notifyOnRunSettle: configuration?.get('smartCommands.notifyOnRunSettle', DEFAULT_PLUGIN_CONFIG.notifyOnRunSettle)
      ?? host?.config?.notifyOnRunSettle
      ?? DEFAULT_PLUGIN_CONFIG.notifyOnRunSettle,
  }
}

function parameterHint(template: CommandTemplate): string {
  return extractTemplateSlots(template).join(' ') || '[args]'
}

function signatureOf(template: CommandTemplate): string {
  return [
    template.description,
    parameterHint(template),
    template.origin,
    template.sourcePath,
  ].join('\0')
}

async function runTemplateCommand(
  runner: CommandRunner,
  command: string,
  rawInput: string,
  signal: AbortSignal,
  agent?: HostAgent,
): Promise<{ kind: 'success' | 'error'; text: string }> {
  const result = await runner.run({
    command,
    args: parseCommandArgs(rawInput),
  }, signal, agent)
  return result.ok
    ? { kind: 'success', text: result.text }
    : { kind: 'error', text: result.error }
}

function formatSmartCatalog(runner: CommandRunner): string {
  const listed = runner.list().map(item => {
    const slash = item.slashName ?? item.name
    return slash === item.name
      ? `/${slash} — ${item.description}`
      : `/${slash} — ${item.description} (${item.name})`
  }).join('\n')
  if (!listed) return 'No smart commands loaded.'
  return `Run a template with /<name>, not /smart <name>.\n\n${listed}`
}

export function registerSmartSlashCommand(
  commands: NonNullable<SmartCommandsHost['commands']>,
  runner: CommandRunner,
): () => void {
  return commands.register({
    name: 'smart',
    description: 'List Smart Command templates',
    handler: async invocation => {
      await runner.ready()
      const extra = invocation.rawInput.trim()
      if (extra) {
        const tokens = parseCommandArgs(invocation.rawInput)
        const suggested = tokens[0] ? slashCommandNameFor(tokens[0]) ?? tokens[0] : undefined
        return {
          kind: 'error',
          text: suggested
            ? `Use /${suggested} to run this template. /smart only lists commands.`
            : 'Use /<name> to run a template. /smart only lists commands.',
        }
      }
      return { kind: 'success', text: formatSmartCatalog(runner) }
    },
  })
}

/**
 * Register a host slash command for each loaded template so the user can
 * invoke `/<templateName> [args]` directly, without a model tool call.
 */
export function registerTemplateSlashCommands(
  commands: NonNullable<SmartCommandsHost['commands']>,
  loader: TemplateLoader,
  runner: CommandRunner,
): () => void {
  const active = new Map<string, { signature: string; dispose: () => void }>()

  const sync = (): void => {
    const next = new Map<string, CommandTemplate>()
    for (const template of loader.list()) {
      const slashName = slashCommandNameFor(template.name)
      if (!slashName) continue
      if (!next.has(slashName)) next.set(slashName, template)
    }

    for (const [name, registration] of active) {
      const template = next.get(name)
      if (template && registration.signature === signatureOf(template)) continue
      registration.dispose()
      active.delete(name)
    }

    for (const [name, template] of next) {
      if (active.has(name)) continue
      try {
        const dispose = commands.register({
          name,
          description: template.description,
          input: { hint: parameterHint(template) },
          handler: async invocation => {
            await runner.ready()
            const agent = asHostAgent(invocation.agent)
            // A chain is delegated to detached runs: awaiting it here would hold
            // the composer's command transaction for the whole pipeline.
            if (agent?.id && runner.resolve(template.name)?.chain?.length) {
              const detached = await runner.startDetached(
                { command: template.name, args: parseCommandArgs(invocation.rawInput) },
                invocation.signal,
                agent,
              )
              return detached.ok
                ? { kind: 'success', text: detached.text }
                : { kind: 'error', text: detached.error }
            }
            return runTemplateCommand(
              runner,
              template.name,
              invocation.rawInput,
              invocation.signal,
              agent,
            )
          },
        })
        active.set(name, { signature: signatureOf(template), dispose })
      } catch {
        // Host command names are stricter than template names; skip invalid ones.
      }
    }
  }

  let disposed = false
  sync()
  const stopListening = loader.onChange(() => {
    if (!disposed) sync()
  })
  void loader.ready().then(() => {
    if (!disposed) sync()
  })
  return () => {
    disposed = true
    stopListening()
    for (const registration of active.values()) registration.dispose()
    active.clear()
  }
}

export function registerHostSlashCommands(
  commands: NonNullable<SmartCommandsHost['commands']>,
  loader: TemplateLoader,
  runner: CommandRunner,
): () => void {
  const disposeSmart = registerSmartSlashCommand(commands, runner)
  const disposeTemplates = registerTemplateSlashCommands(commands, loader, runner)
  return () => {
    disposeTemplates()
    disposeSmart()
  }
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
  const runs = new ChainRunRegistry()
  const runner = new CommandRunner({ host, loader, config, runs })
  const disposers: Array<() => void> = []
  if (host.tools) {
    disposers.push(host.tools.register(createRunSmartCommandTool(runner)))
    disposers.push(host.tools.register(createListSmartCommandsTool(runner)))
    disposers.push(host.tools.register(createManageTemplateTool(runner)))
  }
  if (host.commands) {
    disposers.push(registerHostSlashCommands(host.commands, loader, runner))
  }
  return {
    loader,
    runner,
    runs,
    dispose() {
      loader.stopWatching()
      // Detached runs outlive their command; unloading the plugin must abort
      // them instead of leaving orphan pipelines behind.
      runs.cancelAll()
      for (const dispose of disposers) dispose()
    },
  }
}

export async function activateSmartCommands(host: SmartCommandsHost): Promise<ActivatedPlugin> {
  const activated = startSmartCommands(host)
  await activated.loader.ready()
  return activated
}
