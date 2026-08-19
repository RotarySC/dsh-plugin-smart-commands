/**
 * Cordis plugin entry for Smart Commands.
 * Named exports keep Loader injection metadata; there is no default export.
 */

export const name = 'smart-commands'
export const inject = ['tools']

export { DEFAULT_PLUGIN_CONFIG, type PluginConfig } from './types/host.ts'
export type { CommandTemplate, RuntimeOverrides } from './types/template.ts'
export type { CommandRunResult, ListCommandItem } from './types/execution.ts'

export function apply(): void {
  // Wired in a later slice once tools, loader, and executor exist.
}
