import type { HostToolDefinition } from '../types/host.js'
import type { CommandRunner } from '../engine/command-runner.js'
import type { RuntimeOverrides } from '../types/template.js'

export function createRunSmartCommandTool(runner: CommandRunner): HostToolDefinition {
  return {
    name: 'smart_command_run',
    description: '执行已配置的智能指令模板或 Chain 工作流。支持模型路由切换、上下文 Fork 继承、子代理隔离委托及多阶段任务流转。',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的智能指令名称' },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: '传递给模板的参数列表',
        },
        overrides: {
          type: 'object',
          description: '运行时临时覆盖参数 (model, context, subagent 等)',
        },
      },
      required: ['command'],
    },
    async execute(args, exec) {
      if (exec.signal.aborted) {
        return { ok: false, error: 'Operation cancelled by user' }
      }
      const command = typeof args.command === 'string' ? args.command : ''
      if (!command) return { ok: false, error: 'command is required' }
      const rawArgs = args.args
      const normalizedArgs = Array.isArray(rawArgs)
        ? rawArgs.map(String)
        : typeof rawArgs === 'string'
          ? rawArgs
          : undefined
      return runner.run({
        command,
        ...normalizedArgs !== undefined ? { args: normalizedArgs } : {},
        ...args.overrides && typeof args.overrides === 'object' && !Array.isArray(args.overrides)
          ? { overrides: args.overrides as RuntimeOverrides }
          : {},
      }, exec.signal, exec.agent)
    },
  }
}
