import type { HostToolDefinition } from '../types/host.js'
import type { CommandRunner } from '../engine/command-runner.js'
import type { RuntimeOverrides } from '../types/template.js'
import {
  booleanField,
  integerField,
  jsonObjectSchema,
  objectOutput,
  renderOkOrError,
  stringField,
} from './tool-output.js'

const runOutputSchema = jsonObjectSchema({
  ok: booleanField('Whether the command completed successfully'),
  command: stringField('Command name'),
  error: stringField('Failure message'),
  hint: stringField('Recovery hint'),
  model: stringField('Selected model'),
  restored: booleanField('Whether the parent session model was restored'),
  text: stringField('Final command output'),
  files: {
    type: 'array',
    items: { type: 'string' },
    description: 'Changed files',
  },
  durationMs: integerField('Wall-clock duration'),
  rounds: integerField('Completed loop rounds'),
  subagentId: stringField('Continuable child session id'),
  continuable: booleanField('Whether a follow-up subagent was started'),
})

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
    output: objectOutput(runOutputSchema, (_args, value) => renderOkOrError(value, record => {
      const command = typeof record.command === 'string' ? record.command : 'command'
      const text = typeof record.text === 'string' ? record.text : ''
      const child = typeof record.subagentId === 'string' ? `\nsubagentId: ${record.subagentId}` : ''
      return text ? `${command}\n${text}${child}` : `${command}${child}`
    })),
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
