import type { HostToolDefinition } from '../types/host.js'
import type { CommandRunner } from '../engine/command-runner.js'

export function createListSmartCommandsTool(runner: CommandRunner): HostToolDefinition {
  return {
    name: 'smart_command_list',
    description: '查询当前可用的智能指令模板清单、参数说明及功能描述。',
    parameters: {
      type: 'object',
      properties: {},
    },
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
