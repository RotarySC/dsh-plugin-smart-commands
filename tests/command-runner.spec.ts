import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CommandRunner } from '../src/engine/command-runner.ts'
import { ChainRunRegistry } from '../src/engine/run-registry.ts'
import { activateSmartCommands } from '../src/plugin.ts'
import { TemplateLoader } from '../src/loader/template-loader.ts'
import { wrapDshSubagents } from '../src/host/dsh-adapter.ts'
import { DEFAULT_PLUGIN_CONFIG, type HostAgent, type HostToolDefinition, type SmartCommandsHost } from '../src/types/host.ts'

const simple = `---
description: Review one file
model: deepseek-reasoner, missing-model
subagent: true
---
Review $1 with $@
`

const chain = `---
description: Scan then fix
chain:
  - name: scan
    agent: scout
    task: "scan {task}"
    as: findings
  - name: fix
    agent: worker
    task: "fix {outputs.findings}"
---
`

describe('command runner and tools', () => {
  const disposers: Array<() => void> = []
  afterEach(() => {
    for (const dispose of disposers) dispose()
    disposers.length = 0
  })

  async function workspace(overrides: {
    subagentStart?: (request: { prompt: string }) => Promise<{ text: string; stopReason: string; changedFiles: string[] }>
  } = {}): Promise<{
    root: string
    loader: TemplateLoader
    runner: CommandRunner
    runs: ChainRunRegistry
    session: {
      seen: Array<string | undefined>
      getModel(): string | undefined
      setModel(model?: string): void
    }
  }> {
    const root = await mkdtemp(join(tmpdir(), 'smart-runner-'))
    const userDir = join(root, 'user')
    const projectDir = join(root, 'project')
    await mkdir(userDir, { recursive: true })
    await mkdir(projectDir, { recursive: true })
    await writeFile(join(projectDir, 'review.md'), simple)
    await writeFile(join(projectDir, 'pipeline.md'), chain)
    const loader = new TemplateLoader({ userDir, projectDir })
    await loader.reload()
    let current: string | undefined = 'deepseek-chat'
    const session = {
      seen: [] as Array<string | undefined>,
      getModel: () => current,
      setModel: (model?: string) => {
        session.seen.push(model)
        current = model
      },
    }
    const host: SmartCommandsHost = {
      workspaceRoot: root,
      userHome: root,
      config: DEFAULT_PLUGIN_CONFIG,
      modelRegistry: {
        current: { id: 'deepseek-chat' },
        available: [{ id: 'deepseek-reasoner' }],
      },
      modelSession: session,
      subagents: {
        list: () => ['spawn', 'fork'],
        start: overrides.subagentStart ?? (async request => ({
          text: `child:${request.prompt}`,
          stopReason: 'completed',
          changedFiles: [],
        })),
      },
    }
    const runs = new ChainRunRegistry()
    const runner = new CommandRunner({ host, loader, config: DEFAULT_PLUGIN_CONFIG, runs })
    return { root, loader, runner, runs, session }
  }

  it('lists templates and runs a single-command delegation with model fallback', async () => {
    const { runner } = await workspace()
    const listed = runner.list()
    expect(listed.map(item => item.name).sort()).toEqual(['pipeline', 'review'])
    expect(listed.find(item => item.name === 'pipeline')?.hasChain).toBe(true)
    expect(listed.find(item => item.name === 'review')?.parameters).toEqual(['$1', '$@'])

    const result = await runner.run({
      command: 'review',
      args: ['auth.ts', 'focus=types'],
    }, new AbortController().signal)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.model).toBe('deepseek-reasoner')
    expect(result.text).toBe('child:Review auth.ts with auth.ts focus=types')
    expect(result.restored).toBe(false)
  })

  it('does not switch the parent session model when delegating to a subagent', async () => {
    const { runner, session } = await workspace()
    const result = await runner.run({
      command: 'review',
      args: ['auth.ts'],
    }, new AbortController().signal)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.model).toBe('deepseek-reasoner')
    expect(session.seen).toEqual([])
    expect(session.getModel()).toBe('deepseek-chat')
  })

  it('does not switch the parent session model when running a chain', async () => {
    const { runner, session } = await workspace()
    const created = await runner.manage({
      action: 'create',
      name: 'scan-fix',
      content: `---
description: Scan then fix with a model
model: deepseek-reasoner
chain:
  - name: scan
    agent: scout
    task: "scan {task}"
    as: findings
  - name: fix
    agent: worker
    task: "fix {outputs.findings}"
---
`,
    })
    expect(created.ok).toBe(true)
    const result = await runner.run({ command: 'scan-fix', args: ['auth'] }, new AbortController().signal)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(session.seen).toEqual([])
    expect(session.getModel()).toBe('deepseek-chat')
  })

  it('snapshots and restores the parent session model for in-session runs', async () => {
    const { runner, session } = await workspace()
    const created = await runner.manage({
      action: 'create',
      name: 'draft',
      content: `---
description: Draft in the current session
model: deepseek-reasoner
---
Draft $@
`,
    })
    expect(created.ok).toBe(true)
    const result = await runner.run({ command: 'draft', args: ['auth'] }, new AbortController().signal)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.text).toContain('Draft auth')
    expect(session.seen).toEqual(['deepseek-reasoner', 'deepseek-chat'])
    expect(session.getModel()).toBe('deepseek-chat')
  })

  it('runs a chain and interpolates named outputs', async () => {
    const { runner } = await workspace()
    const result = await runner.run({ command: 'pipeline', args: ['auth'] }, new AbortController().signal)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.text).toBe('child:fix child:scan auth')
    expect(result.steps.map(step => step.name)).toEqual(['scan', 'fix'])
  })

  it('creates a project template through manage and exposes it to list', async () => {
    const { runner } = await workspace()
    const created = await runner.manage({
      action: 'create',
      name: 'lint',
      content: simple,
    })
    expect(created.ok).toBe(true)
    expect(runner.list().some(item => item.name === 'lint')).toBe(true)
  })

  it('registers /smart as a catalog-only command', async () => {
    const { root } = await workspace()
    const commands = new Map<string, {
      name: string
      handler: (invocation: { rawInput: string; signal: AbortSignal }) => Promise<{ kind: string; text: string }>
    }>()
    const activated = await activateSmartCommands({
      workspaceRoot: root,
      userHome: root,
      config: {
        ...DEFAULT_PLUGIN_CONFIG,
        userTemplatesDir: join(root, 'user'),
        projectTemplatesDir: 'project',
      },
      modelRegistry: {
        current: { id: 'deepseek-chat' },
        available: [{ id: 'deepseek-reasoner' }],
      },
      subagents: {
        list: () => ['spawn', 'fork'],
        start: async request => ({
          text: `child:${request.prompt}`,
          stopReason: 'completed',
        }),
      },
      commands: {
        register(definition) {
          commands.set(definition.name, definition)
          return () => { commands.delete(definition.name) }
        },
      },
    })
    disposers.push(() => activated.dispose())
    expect([...commands.keys()].sort()).toEqual(['pipeline', 'review', 'smart'])
    const listed = await commands.get('smart')!.handler({
      rawInput: '',
      signal: new AbortController().signal,
    })
    expect(listed.kind).toBe('success')
    expect(listed.text).toContain('/review')
    expect(listed.text).toContain('not /smart <name>')
    const rejected = await commands.get('smart')!.handler({
      rawInput: 'review "src/auth.ts"',
      signal: new AbortController().signal,
    })
    expect(rejected).toEqual({
      kind: 'error',
      text: 'Use /review to run this template. /smart only lists commands.',
    })
  })

  it('registers a direct /<templateName> slash command for user invocation', async () => {
    const { root } = await workspace()
    const commands = new Map<string, {
      name: string
      description: string
      input?: { hint: string }
      handler: (invocation: { rawInput: string; signal: AbortSignal }) => Promise<{ kind: string; text: string }>
    }>()
    const activated = await activateSmartCommands({
      workspaceRoot: root,
      userHome: root,
      config: {
        ...DEFAULT_PLUGIN_CONFIG,
        userTemplatesDir: join(root, 'user'),
        projectTemplatesDir: 'project',
      },
      modelRegistry: {
        current: { id: 'deepseek-chat' },
        available: [{ id: 'deepseek-reasoner' }],
      },
      subagents: {
        list: () => ['spawn', 'fork'],
        start: async request => ({
          text: `child:${request.prompt}`,
          stopReason: 'completed',
        }),
      },
      commands: {
        register(definition) {
          commands.set(definition.name, definition)
          return () => { commands.delete(definition.name) }
        },
      },
    })
    disposers.push(() => activated.dispose())
    expect(commands.get('review')?.description).toBe('Review one file')
    expect(commands.get('review')?.input?.hint).toBe('$1 $@')
    const result = await commands.get('review')!.handler({
      rawInput: '"src/auth.ts" focus=types',
      signal: new AbortController().signal,
    })
    expect(result).toEqual({
      kind: 'success',
      text: 'child:Review src/auth.ts with src/auth.ts focus=types',
    })
  })

  it('submits in-session templates to the main agent via the DSH agent turn driver', async () => {
    const { root } = await workspace()
    const followed: Array<{ content?: unknown[] }> = []
    const commands = new Map<string, {
      name: string
      handler: (invocation: { rawInput: string; signal: AbortSignal; agent?: HostAgent }) => Promise<{ kind: string; text: string }>
    }>()
    const activated = await activateSmartCommands({
      workspaceRoot: root,
      userHome: root,
      config: {
        ...DEFAULT_PLUGIN_CONFIG,
        userTemplatesDir: join(root, 'user'),
        projectTemplatesDir: 'project',
      },
      modelRegistry: {
        current: { id: 'deepseek-chat' },
        available: [{ id: 'deepseek-chat' }],
      },
      commands: {
        register(definition) {
          commands.set(definition.name, definition)
          return () => { commands.delete(definition.name) }
        },
      },
    })
    disposers.push(() => activated.dispose())
    const created = await activated.runner.manage({
      action: 'create',
      name: 'draft',
      content: `---
description: Draft in the current session
---
Draft $@
`,
    })
    expect(created.ok).toBe(true)

    // The DSH Agent shape handed to command handlers: no `submit`, only the
    // inbox turn driver. The plugin must adapt it, or the template prompt
    // never reaches the main agent (silent echo bug).
    const dshAgent = {
      id: 'session-1',
      options: { provider: 'deepseek', model: 'deepseek-chat' },
      followup: (message: { content?: unknown[] }) => { followed.push(message) },
    }
    const result = await commands.get('draft')!.handler({
      rawInput: 'auth.ts',
      signal: new AbortController().signal,
      agent: dshAgent as unknown as HostAgent,
    })
    expect(result.kind).toBe('success')
    // The command settles immediately (fire-and-forget) so the composer never
    // locks on the slash claim; the model reply streams as an assistant message.
    expect(result.text).toBe('')
    expect(followed).toHaveLength(1)
    expect(followed[0]?.content).toEqual([{ type: 'text', text: 'Draft auth.ts' }])
  })

  it('forwards the original DSH agent to subagent delegation, not the adapted wrapper', async () => {
    const { root } = await workspace()
    const started: Array<{ parent: unknown }> = []
    const commands = new Map<string, {
      name: string
      handler: (invocation: { rawInput: string; signal: AbortSignal; agent?: HostAgent }) => Promise<{ kind: string; text: string }>
    }>()
    const activated = await activateSmartCommands({
      workspaceRoot: root,
      userHome: root,
      config: {
        ...DEFAULT_PLUGIN_CONFIG,
        userTemplatesDir: join(root, 'user'),
        projectTemplatesDir: 'project',
      },
      modelRegistry: {
        current: { id: 'deepseek-chat' },
        available: [{ id: 'deepseek-reasoner' }],
      },
      // DSH-shaped two-argument subagents service (would crash reading
      // parent.session.header if the adapter wrapper leaked through).
      subagents: wrapDshSubagents({
        list: () => ['spawn'],
        start: async (_name, request) => {
          started.push({ parent: request.parent })
          return {
            result: Promise.resolve({ output: [{ type: 'text', text: 'child-ok' }], stopReason: 'completed' }),
          }
        },
      }),
      commands: {
        register(definition) {
          commands.set(definition.name, definition)
          return () => { commands.delete(definition.name) }
        },
      },
    })
    disposers.push(() => activated.dispose())
    const dshAgent = {
      id: 'session-1',
      session: { header: { id: 'session-1' } },
      ctx: {},
      options: { provider: 'deepseek', model: 'deepseek-chat' },
      followup: () => {},
    }
    const result = await commands.get('review')!.handler({
      rawInput: 'auth.ts',
      signal: new AbortController().signal,
      agent: dshAgent as unknown as HostAgent,
    })
    expect(result.kind).toBe('success')
    expect(result.text).toBe('child-ok')
    expect(started[0]?.parent).toBe(dshAgent)
  })

  it('registers and unregisters direct slash commands when templates change', async () => {
    const { root } = await workspace()
    const commands = new Map<string, { name: string }>()
    const activated = await activateSmartCommands({
      workspaceRoot: root,
      userHome: root,
      config: {
        ...DEFAULT_PLUGIN_CONFIG,
        userTemplatesDir: join(root, 'user'),
        projectTemplatesDir: 'project',
      },
      commands: {
        register(definition) {
          commands.set(definition.name, definition)
          return () => { commands.delete(definition.name) }
        },
      },
    })
    disposers.push(() => activated.dispose())
    expect([...commands.keys()].sort()).toEqual(['pipeline', 'review', 'smart'])

    const created = await activated.runner.manage({
      action: 'create',
      name: 'lint',
      content: simple,
    })
    expect(created.ok).toBe(true)
    expect(commands.has('lint')).toBe(true)

    const deleted = await activated.runner.manage({ action: 'delete', name: 'lint' })
    expect(deleted.ok).toBe(true)
    expect(commands.has('lint')).toBe(false)
    expect(commands.has('review')).toBe(true)
  })

  it('maps numbered template files onto host-legal slash commands', async () => {
    const { root } = await workspace()
    await writeFile(join(root, 'project', '001-research.md'), simple)
    const commands = new Map<string, {
      name: string
      handler: (invocation: { rawInput: string; signal: AbortSignal }) => Promise<{ kind: string; text: string }>
    }>()
    const activated = await activateSmartCommands({
      workspaceRoot: root,
      userHome: root,
      config: {
        ...DEFAULT_PLUGIN_CONFIG,
        userTemplatesDir: join(root, 'user'),
        projectTemplatesDir: 'project',
      },
      modelRegistry: {
        current: { id: 'deepseek-chat' },
        available: [{ id: 'deepseek-reasoner' }],
      },
      subagents: {
        list: () => ['spawn', 'fork'],
        start: async request => ({
          text: `child:${request.prompt}`,
          stopReason: 'completed',
        }),
      },
      commands: {
        register(definition) {
          if (!/^[a-z][a-z0-9_-]*$/.test(definition.name)) {
            throw new TypeError(`command name "${definition.name}" must match /^[a-z][a-z0-9_-]*$/`)
          }
          commands.set(definition.name, definition)
          return () => { commands.delete(definition.name) }
        },
      },
    })
    disposers.push(() => activated.dispose())
    expect(commands.has('research')).toBe(true)
    expect(commands.has('001-research')).toBe(false)
    const result = await commands.get('research')!.handler({
      rawInput: 'auth.ts',
      signal: new AbortController().signal,
    })
    expect(result.kind).toBe('success')
  })

  it('does not register a help template over the host /help command', async () => {
    const { root } = await workspace()
    await writeFile(join(root, 'project', 'help.md'), simple)
    const commands = new Map<string, { name: string }>()
    const activated = await activateSmartCommands({
      workspaceRoot: root,
      userHome: root,
      config: {
        ...DEFAULT_PLUGIN_CONFIG,
        userTemplatesDir: join(root, 'user'),
        projectTemplatesDir: 'project',
      },
      commands: {
        register(definition) {
          commands.set(definition.name, definition)
          return () => { commands.delete(definition.name) }
        },
      },
    })
    disposers.push(() => activated.dispose())
    expect(commands.has('help')).toBe(false)
    expect([...commands.keys()].sort()).toEqual(['pipeline', 'review', 'smart'])
  })

  it('falls back to the current session model when the template chain is unavailable', async () => {
    const { runner } = await workspace()
    const created = await runner.manage({
      action: 'create',
      name: 'research',
      content: `---
description: Research a topic
model: deepseek/deepseek-r1, openai/gpt-4o
subagent: true
---
Research $@
`,
    })
    expect(created.ok).toBe(true)
    const result = await runner.run({ command: 'research', args: ['auth'] }, new AbortController().signal)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.text).toContain('Research auth')
  })

  it('starts a continuable subagent and returns its child id', async () => {
    const { root } = await workspace()
    await writeFile(join(root, 'project', 'chat.md'), `---
description: Keep chatting
subagent: continuable
---
Talk about $@
`)
    const loader = new TemplateLoader({ userDir: join(root, 'user'), projectDir: join(root, 'project') })
    await loader.reload()
    const started: Array<{ prompt: string }> = []
    const runner = new CommandRunner({
      host: {
        workspaceRoot: root,
        userHome: root,
        config: DEFAULT_PLUGIN_CONFIG,
        modelRegistry: { current: { id: 'deepseek-chat' }, available: [{ id: 'deepseek-chat' }] },
        subagents: {
          list: () => ['spawn'],
          start: async () => ({ text: 'one-shot', stopReason: 'completed' }),
          startContinuable: async request => {
            started.push({ prompt: request.prompt })
            return { childId: 'sess-chat' }
          },
        },
      },
      loader,
      config: DEFAULT_PLUGIN_CONFIG,
    })
    const result = await runner.run({ command: 'chat', args: ['auth'] }, new AbortController().signal)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.continuable).toBe(true)
    expect(result.subagentId).toBe('sess-chat')
    expect(result.text).toBe('started continuable subagent sess-chat')
    expect(started[0]?.prompt).toContain('Talk about auth')
  })

  it('registers the three tools on activate', async () => {
    const root = await mkdtemp(join(tmpdir(), 'smart-activate-'))
    const tools = new Map<string, HostToolDefinition>()
    const activated = await activateSmartCommands({
      workspaceRoot: root,
      userHome: root,
      config: DEFAULT_PLUGIN_CONFIG,
      tools: {
        register(tool) {
          tools.set(tool.name, tool)
          return () => { tools.delete(tool.name) }
        },
      },
    })
    disposers.push(() => activated.dispose())
    expect([...tools.keys()].sort()).toEqual([
      'smart_command_list',
      'smart_command_manage',
      'smart_command_run',
    ])
    for (const tool of tools.values()) {
      expect(tool.output.schema).toMatchObject({ type: 'object' })
      expect(typeof tool.output.render).toBe('function')
    }
    const listed = await tools.get('smart_command_list')!.execute({}, {
      signal: new AbortController().signal,
    })
    expect(listed).toMatchObject({ ok: true, count: 0, commands: [] })
    expect(tools.get('smart_command_list')!.output.render({}, listed)).toEqual([
      { type: 'text', text: 'No smart commands loaded.' },
    ])
  })

  it('starts a chain as a detached run and settles the command immediately', async () => {
    const { runner, runs } = await workspace()
    const result = await runner.startDetached(
      { command: 'pipeline', args: ['auth'] },
      new AbortController().signal,
      { id: 'session-1', original: {} },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.text).toContain('pipeline')
    expect(result.steps).toEqual([])
    expect(result.rounds).toBe(0)

    const [started] = runs.list()
    expect(started).toBeDefined()
    expect(started!.command).toBe('pipeline')
    expect(started!.sessionId).toBe('session-1')
    expect(started!.status).toBe('running')
    expect(started!.steps.map(step => step.name)).toEqual(['scan', 'fix'])

    await vi.waitFor(() => { expect(runs.list()[0]!.status).toBe('succeeded') })
    const settled = runs.list()[0]!
    expect(settled.steps.map(step => step.status)).toEqual(['done', 'done'])
    expect(settled.text).toContain('child:')
    expect(settled.endedAt).toBeGreaterThanOrEqual(settled.startedAt)
  })

  it('cancels a live detached chain through the run table', async () => {
    const { runner, runs } = await workspace({ subagentStart: () => new Promise(() => {}) })
    const result = await runner.startDetached(
      { command: 'pipeline' },
      new AbortController().signal,
      { id: 'session-1', original: {} },
    )
    expect(result.ok).toBe(true)

    const run = runs.list()[0]!
    expect(run.status).toBe('running')
    await vi.waitFor(() => { expect(runs.list()[0]!.steps[0]?.status).toBe('running') })

    expect(runs.cancel(run.id, 'session-1')).toEqual({ ok: true, runId: run.id })
    expect(runs.list()[0]!.status).toBe('cancelled')
  })

  it('aborts a detached run when the command transaction signal fires', async () => {
    const { runner, runs } = await workspace({ subagentStart: () => new Promise(() => {}) })
    const gate = new AbortController()
    await runner.startDetached({ command: 'pipeline' }, gate.signal, { id: 'session-1', original: {} })

    gate.abort()

    expect(runs.list()[0]!.status).toBe('cancelled')
  })

  it('keeps non-chain templates on the blocking path and leaves the run table empty', async () => {
    const { runner, runs } = await workspace()
    const result = await runner.startDetached(
      { command: 'review', args: ['src/a.ts'] },
      new AbortController().signal,
      { id: 'session-1', original: {} },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.text).toContain('child:')
    expect(runs.list()).toEqual([])
  })

  it('never detaches without a session identity', async () => {
    const { runner, runs } = await workspace()
    const result = await runner.startDetached({ command: 'pipeline' }, new AbortController().signal)

    expect(result.ok).toBe(true)
    expect(runs.list()).toEqual([])
  })

  it('reports an unknown command from the detached path', async () => {
    const { runner, runs } = await workspace()
    const result = await runner.startDetached(
      { command: 'nope' },
      new AbortController().signal,
      { id: 'session-1', original: {} },
    )

    expect(result).toMatchObject({ ok: false, error: 'unknown smart command: nope' })
    expect(runs.list()).toEqual([])
  })
})
