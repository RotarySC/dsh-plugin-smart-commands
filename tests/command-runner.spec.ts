import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CommandRunner } from '../src/engine/command-runner.ts'
import { activateSmartCommands } from '../src/plugin.ts'
import { TemplateLoader } from '../src/loader/template-loader.ts'
import { DEFAULT_PLUGIN_CONFIG, type HostToolDefinition, type SmartCommandsHost } from '../src/types/host.ts'

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

  async function workspace(): Promise<{ root: string; loader: TemplateLoader; runner: CommandRunner }> {
    const root = await mkdtemp(join(tmpdir(), 'smart-runner-'))
    const userDir = join(root, 'user')
    const projectDir = join(root, 'project')
    await mkdir(userDir, { recursive: true })
    await mkdir(projectDir, { recursive: true })
    await writeFile(join(projectDir, 'review.md'), simple)
    await writeFile(join(projectDir, 'pipeline.md'), chain)
    const loader = new TemplateLoader({ userDir, projectDir })
    await loader.reload()
    const host: SmartCommandsHost = {
      workspaceRoot: root,
      userHome: root,
      config: DEFAULT_PLUGIN_CONFIG,
      modelRegistry: {
        current: { id: 'deepseek-chat' },
        available: [{ id: 'deepseek-reasoner' }],
      },
      modelSession: (() => {
        let current: string | undefined = 'deepseek-chat'
        return {
          getModel: () => current,
          setModel: (model?: string) => { current = model },
        }
      })(),
      subagents: {
        list: () => ['spawn', 'fork'],
        start: async request => ({
          text: `child:${request.prompt}`,
          stopReason: 'completed',
          changedFiles: [],
        }),
      },
    }
    const runner = new CommandRunner({ host, loader, config: DEFAULT_PLUGIN_CONFIG })
    return { root, loader, runner }
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
    expect(result.restored).toBe(true)
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

  it('registers /smart and executes a quoted argument list', async () => {
    const { root } = await workspace()
    const commands: Array<{
      name: string
      handler: (invocation: { rawInput: string; signal: AbortSignal }) => Promise<{ kind: string; text: string }>
    }> = []
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
          commands.push(definition)
          return () => undefined
        },
      },
    })
    disposers.push(() => activated.dispose())
    expect(commands[0]?.name).toBe('smart')
    const result = await commands[0]!.handler({
      rawInput: 'review "src/auth.ts"',
      signal: new AbortController().signal,
    })
    expect(result).toEqual({
      kind: 'success',
      text: 'child:Review src/auth.ts with src/auth.ts',
    })
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
    const listed = await tools.get('smart_command_list')!.execute({}, {
      signal: new AbortController().signal,
    })
    expect(listed).toMatchObject({ ok: true, count: 0, commands: [] })
  })
})
