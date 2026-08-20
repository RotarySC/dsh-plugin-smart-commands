import type { HostToolDefinition } from '../types/host.js'
import type { CommandRunner } from '../engine/command-runner.js'
import { integerField, jsonObjectSchema, objectOutput, renderOkOrError, stringField } from './tool-output.js'

const listOutputSchema = jsonObjectSchema({
  ok: { type: 'boolean' },
  count: integerField('Number of loaded templates'),
  commands: {
    type: 'array',
    items: jsonObjectSchema({
      name: stringField(),
      slashName: stringField('Host slash command without the leading slash'),
      description: stringField(),
      origin: stringField(),
      sourcePath: stringField(),
      hasChain: { type: 'boolean' },
      models: { type: 'array', items: { type: 'string' } },
      subagent: { oneOf: [{ type: 'boolean' }, { type: 'string' }] },
      continuable: { type: 'boolean' },
      context: stringField(),
      parameters: { type: 'array', items: { type: 'string' } },
    }),
  },
  errors: {
    type: 'array',
    items: jsonObjectSchema({
      path: stringField(),
      error: stringField(),
    }),
  },
})

export function createListSmartCommandsTool(runner: CommandRunner): HostToolDefinition {
  return {
    name: 'smart_command_list',
    description: '查询当前可用的智能指令模板清单、参数说明及功能描述。',
    parameters: {
      type: 'object',
      properties: {},
    },
    output: objectOutput(listOutputSchema, (_args, value) => renderOkOrError(value, record => {
      const count = typeof record.count === 'number' ? record.count : 0
      return count === 0 ? 'No smart commands loaded.' : `Loaded ${count} smart command(s).`
    })),
    async execute() {
      await runner.ready()
      const commands = runner.list()
      const errors = runner.catalogErrors()
      return {
        ok: true,
        count: commands.length,
        commands,
        ...errors.length > 0 ? { errors } : {},
      }
    },
  }
}
