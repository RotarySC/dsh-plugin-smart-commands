import type { CommandRunResult, ListCommandItem, ManageTemplateRequest, RunCommandRequest, StepResult } from '../types/execution.js'
import type { CommandTemplate, RuntimeOverrides } from '../types/template.js'
import type { HostAgent, PluginConfig, SmartCommandsHost } from '../types/host.js'
import { TemplateLoader } from '../loader/template-loader.js'
import { TemplateValidationError } from '../loader/frontmatter-parser.js'
import { TEMPLATE_NAME_PATTERN } from '../loader/names.js'
import { extractTemplateSlots, normalizeArgs, renderTemplate, splitModelSpecs, type ResolvedModelRef } from './template-engine.js'
import { formatModel, parseModelRef, selectModel, withModelOverride } from './model-router.js'
import { loadAvailableModels } from '../host/dsh-adapter.js'
import { slashCommandNameFor } from './slash-name.js'
import { ChainExecutor } from './chain-executor.js'
import { ChainRunRegistry } from './run-registry.js'
import { formatRunSummary } from './run-summary.js'
import { SubagentBridge } from './subagent-bridge.js'
import type { ChainRunRecord, ChainStepProgress } from '../types/runs.js'

const COMMAND_NAME_PATTERN = TEMPLATE_NAME_PATTERN

export interface CommandRunnerOptions {
  readonly host: SmartCommandsHost
  readonly loader: TemplateLoader
  readonly config: PluginConfig
  /** Live run table for detached chain runs; absent in unit tests that never detach. */
  readonly runs?: ChainRunRegistry
}

function applyOverrides(template: CommandTemplate, overrides?: RuntimeOverrides): CommandTemplate {
  if (!overrides) return template
  return {
    ...template,
    models: overrides.model ? splitModelSpecs(overrides.model) : template.models,
    restore: overrides.restore ?? template.restore,
    subagent: overrides.subagent ?? template.subagent,
    continuable: overrides.continuable ?? template.continuable,
    context: overrides.context ?? template.context,
    tools: overrides.tools ?? template.tools,
    loop: overrides.loop ?? template.loop,
    converge: overrides.converge ?? template.converge,
    worktree: overrides.worktree ?? template.worktree,
  }
}

function modelRefFromSelected(selected: { model: ResolvedModelRef } | undefined, fallback?: string): ResolvedModelRef {
  if (selected) return selected.model
  if (fallback) return parseModelRef(fallback)
  return { id: 'session-default' }
}

function uniqueFiles(steps: StepResult[]): string[] {
  return [...new Set(steps.flatMap(step => step.changedFiles))]
}

function bindSkills(prompt: string, skills?: string[]): string {
  if (!skills?.length) return prompt
  return `Bound skills (load before acting): ${skills.join(', ')}\n\n${prompt}`
}

export class CommandRunner {
  constructor(private readonly options: CommandRunnerOptions) {}

  async ready(): Promise<void> {
    await this.options.loader.ready()
  }

  catalogErrors(): Array<{ path: string; error: string }> {
    return this.options.loader.catalog.errors
  }

  resolve(name: string): CommandTemplate | undefined {
    return this.options.loader.get(name)
      ?? this.options.loader.list().find(template => slashCommandNameFor(template.name) === name)
  }

  list(): ListCommandItem[] {
    return this.options.loader.list().map(template => {
      const slashName = slashCommandNameFor(template.name)
      return {
        name: template.name,
        ...slashName ? { slashName } : {},
        description: template.description,
        origin: template.origin,
        sourcePath: template.sourcePath,
        hasChain: Boolean(template.chain?.length),
        models: template.models,
        subagent: template.subagent,
        continuable: template.continuable,
        context: template.context,
        parameters: extractTemplateSlots(template),
      }
    })
  }

  async run(
    request: RunCommandRequest,
    signal: AbortSignal,
    parent?: HostAgent,
    runId?: string,
  ): Promise<CommandRunResult> {
    const started = this.now()
    try {
      await this.ready()
      const loaded = this.resolve(request.command)
      if (!loaded) {
        return {
          ok: false,
          command: request.command,
          error: `unknown smart command: ${request.command}`,
          hint: 'Call smart_command_list to inspect available templates.',
        }
      }
      const template = applyOverrides(loaded, request.overrides)
      const args = normalizeArgs(request.args)
      const available = await loadAvailableModels(this.options.host.llm)
      const sessionModel = this.options.host.modelSession?.getModel()
      const registry = {
        current: this.options.host.modelRegistry?.current
          ?? (sessionModel
            ? modelRefFromSelected(undefined, sessionModel)
            : undefined),
        available: available.length > 0
          ? available
          : this.options.host.modelRegistry?.available ?? [],
      }
      const selected = selectModel(template.models, registry)
      if (template.models.length > 0 && !selected && !this.options.host.modelSession?.getModel()) {
        return {
          ok: false,
          command: template.name,
          error: `no available model matched fallback chain: ${template.models.join(', ')}`,
          hint: 'Configure an available model or pass overrides.model.',
        }
      }
      const model = modelRefFromSelected(selected, this.options.host.modelSession?.getModel())
      const rendered = renderTemplate(template.body, args, model, template.name)
      if (rendered.error) {
        return { ok: false, command: template.name, error: rendered.error }
      }

      const shouldDelegate = template.subagent !== false || template.continuable
      const overrideParentSession = !shouldDelegate && !template.chain?.length
      const restored = overrideParentSession && template.restore
      const execute = async (): Promise<CommandRunResult> => {
        const loop = template.loop ?? 1
        const steps: StepResult[] = []
        let lastText = ''
        let rounds = 0
        const taskText = args.join(' ')
        const bridge = new SubagentBridge({
          ...this.options.host.subagents ? { subagents: this.options.host.subagents } : {},
          ...parent ? { parent } : this.options.host.parentAgent ? { parent: this.options.host.parentAgent } : {},
          config: this.options.config,
          ...parent?.submit ? { fallback: (prompt, runSignal) => parent.submit!(prompt, runSignal) } : {},
        })

        for (let round = 1; round <= loop; round++) {
          if (signal.aborted) {
            return { ok: false as const, command: template.name, error: 'Operation cancelled by user' }
          }
          rounds = round
          if (runId && round > 1) this.options.runs?.beginRound(runId, round)
          if (template.chain?.length) {
            const executor = new ChainExecutor(bridge, this.options.config, () => this.now(), template.context)
            const chainResult = await executor.run(template.chain, {
              task: taskText,
              args,
              depth: 1,
              signal,
              maxConcurrency: this.options.config.maxConcurrency,
              workspaceRoot: this.options.host.workspaceRoot,
              worktree: template.worktree,
              ...template.skills ? { skills: template.skills } : {},
              ...runId ? { onStep: (event: ChainStepProgress) => { this.reportStep(runId, event) } } : {},
            })
            steps.push(...chainResult.steps)
            lastText = chainResult.text
            if (template.converge && chainResult.files.length === 0) break
            continue
          }

          const prompt = bindSkills(rendered.content.trim(), template.skills)
          if (!prompt) {
            return { ok: false as const, command: template.name, error: `Prompt \`${template.name}\` rendered to an empty message.` }
          }
          if (shouldDelegate) {
            const result = await bridge.run({
              prompt,
              label: template.name,
              context: template.context,
              signal,
              depth: 1,
              ...template.continuable ? { continuable: true } : {},
              ...typeof template.subagent === 'string' && template.subagent !== 'continuable'
                ? { agent: template.subagent }
                : {},
              ...selected ? {
                model: selected.model.id,
                ...selected.model.provider ? { modelProvider: selected.model.provider } : {},
              } : {},
              ...template.tools ? { tools: template.tools } : {},
              ...template.skills ? { skills: template.skills } : {},
            })
            lastText = result.text
            steps.push({
              name: template.name,
              text: result.text,
              durationMs: 0,
              changedFiles: result.changedFiles ?? [],
              ...typeof template.subagent === 'string' && template.subagent !== 'continuable'
                ? { agent: template.subagent }
                : {},
              ...selected ? { model: formatModel(selected.model) } : {},
            })
            if (template.continuable) {
              return {
                ok: true as const,
                command: template.name,
                ...selected ? { model: formatModel(selected.model) } : {},
                restored,
                text: result.text,
                steps,
                files: uniqueFiles(steps),
                durationMs: this.now() - started,
                rounds,
                ...result.childId ? { subagentId: result.childId } : {},
                continuable: true,
              }
            }
            if (template.converge && (result.changedFiles?.length ?? 0) === 0) break
          } else if (parent?.submit) {
            const result = await parent.submit(prompt, signal)
            lastText = result.text
            steps.push({
              name: template.name,
              text: result.text,
              durationMs: 0,
              changedFiles: result.changedFiles ?? [],
            })
          } else {
            lastText = prompt
            steps.push({
              name: template.name,
              text: prompt,
              durationMs: 0,
              changedFiles: [],
            })
          }
        }

        return {
          ok: true as const,
          command: template.name,
          ...selected ? { model: formatModel(selected.model) } : {},
          restored,
          text: lastText,
          steps,
          files: uniqueFiles(steps),
          durationMs: this.now() - started,
          rounds,
        }
      }
      return overrideParentSession
        ? await withModelOverride(this.options.host.modelSession, selected, template.restore, execute)
        : await execute()
    } catch (error) {
      return {
        ok: false,
        command: request.command,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Start a chain template as a detached run and settle the call immediately.
   *
   * The slash-command transaction freezes the composer until its handler
   * resolves, so a chain must never be awaited on that path: the run owns its
   * own AbortSignal, reports per-step progress into the run table, and the run
   * panel cancels it. Any template that cannot detach (no run table, no session
   * identity, or no chain) falls back to the blocking {@link run}.
   */
  async startDetached(
    request: RunCommandRequest,
    signal: AbortSignal,
    parent?: HostAgent,
  ): Promise<CommandRunResult> {
    const started = this.now()
    await this.ready()
    const runs = this.options.runs
    const loaded = this.resolve(request.command)
    if (!loaded) {
      return {
        ok: false,
        command: request.command,
        error: `unknown smart command: ${request.command}`,
        hint: 'Call smart_command_list to inspect available templates.',
      }
    }
    const template = applyOverrides(loaded, request.overrides)
    if (!runs || !parent?.id || !template.chain?.length) {
      return await this.run(request, signal, parent)
    }

    const steps = template.chain
    const handle = runs.start({
      command: template.name,
      sessionId: parent.id,
      workspaceRoot: this.options.host.workspaceRoot,
      stepNames: steps.map(step => step.name),
      rounds: template.loop ?? 1,
      onSettled: record => { this.reportSettled(record, parent) },
    })
    // The command transaction's own signal still fires while the handler is
    // pending (connection loss, teardown before settlement); afterwards the run
    // is only reachable through the run table.
    const forwardAbort = (): void => { runs.cancel(handle.id) }
    signal.addEventListener('abort', forwardAbort)
    void (async () => {
      try {
        const result = await this.run(request, handle.signal, parent, handle.id)
        runs.finish(handle.id, result.ok
          ? { status: 'succeeded', text: result.text, files: result.files }
          : { status: handle.signal.aborted ? 'cancelled' : 'failed', error: result.error })
      } catch (error) {
        runs.finish(handle.id, {
          status: handle.signal.aborted ? 'cancelled' : 'failed',
          error: error instanceof Error ? error.message : String(error),
        })
      } finally {
        signal.removeEventListener('abort', forwardAbort)
      }
    })()

    const plural = steps.length === 1 ? '' : 's'
    return {
      ok: true,
      command: template.name,
      restored: false,
      text: `Started \`${template.name}\` (${steps.length} step${plural}) in the background. Progress and cancel are in the run panel.`,
      steps: [],
      files: [],
      durationMs: this.now() - started,
      rounds: 0,
    }
  }

  async manage(request: ManageTemplateRequest): Promise<{ ok: boolean; path?: string; error?: string }> {
    await this.ready()
    if (!COMMAND_NAME_PATTERN.test(request.name) || request.name.includes('..')) {
      return { ok: false, error: `invalid template name: ${request.name}` }
    }
    try {
      if (request.action === 'delete') {
        const path = await this.options.loader.deleteProjectTemplate(request.name)
        return { ok: true, path }
      }
      if (!request.content) {
        return { ok: false, error: 'content is required for create/update' }
      }
      if (request.action === 'create' && await this.options.loader.projectTemplateExists(request.name)) {
        return { ok: false, error: `template already exists: ${request.name}` }
      }
      if (request.action === 'update' && !await this.options.loader.projectTemplateExists(request.name)) {
        const existing = this.options.loader.get(request.name)
        if (!existing || existing.origin !== 'project') {
          return { ok: false, error: `project template not found: ${request.name}` }
        }
      }
      const path = await this.options.loader.writeProjectTemplate(request.name, request.content)
      return { ok: true, path }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof TemplateValidationError || error instanceof Error ? error.message : String(error),
      }
    }
  }

  /** Mirror one executor step boundary into the run table. */
  private reportStep(runId: string, event: ChainStepProgress): void {
    const runs = this.options.runs
    if (!runs) return
    if (event.phase === 'start') {
      runs.stepStarted(runId, event.index)
      return
    }
    runs.stepFinished(runId, event.index, event.error
      ? { status: 'failed', error: event.error }
      : { status: 'done' })
  }

  /**
   * Post a settled run's report back into its own session.
   *
   * Without it the run is a dead end twice over: the aggregate text would only
   * ever exist in the run panel's retention window, and a session whose first
   * input was a slash command ends up with no `turn/start` at all — which is the
   * flag the sidebar reads to keep a session visible. `notifyOnRunSettle` buys
   * this back at the price of one main-agent turn, which is the whole reason it
   * is a setting.
   *
   * Reporting is advice, not a result: a run that has already settled must never
   * be turned into a failure by the message that describes it.
   */
  private reportSettled(record: ChainRunRecord, parent: HostAgent): void {
    if (!this.options.config.notifyOnRunSettle) return
    if (!parent.notify) return
    try {
      parent.notify(formatRunSummary(record))
    } catch {
      // Advisory, exactly like the step-progress observer.
    }
  }

  private now(): number {
    return this.options.host.now?.() ?? Date.now()
  }
}
