import type { HostToolDefinition } from '../types/host.js'
import type { CommandRunner } from '../engine/command-runner.js'
import type { ManageTemplateRequest } from '../types/execution.js'
import { jsonObjectSchema, objectOutput, renderOkOrError, stringField } from './tool-output.js'

const manageOutputSchema = jsonObjectSchema({
  ok: { type: 'boolean' },
  path: stringField('Written or deleted project template path'),
  error: stringField('Failure message'),
})

export function createManageTemplateTool(runner: CommandRunner): HostToolDefinition {
  return {
    name: 'smart_command_manage',
    description: '动态创建、更新或删除指令模板（写入 .dsh/commands/ 目录）。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'create、update 或 delete',
        },
        name: {
          type: 'string',
          description: '模板名称，对应 .dsh/commands/<name>.md',
        },
        content: {
          type: 'string',
          description: 'Markdown 模板全文，create/update 时必填',
        },
      },
      required: ['action', 'name'],
    },
    output: objectOutput(manageOutputSchema, (_args, value) => renderOkOrError(value, record => {
      const path = typeof record.path === 'string' ? record.path : ''
      return path ? `Updated ${path}` : 'Template updated.'
    })),
    async execute(args) {
      const action = args.action
      if (action !== 'create' && action !== 'update' && action !== 'delete') {
        return { ok: false, error: 'action must be create, update, or delete' }
      }
      const name = typeof args.name === 'string' ? args.name : ''
      if (!name) return { ok: false, error: 'name is required' }
      const request: ManageTemplateRequest = {
        action,
        name,
        ...typeof args.content === 'string' ? { content: args.content } : {},
      }
      return runner.manage(request)
    },
  }
}
