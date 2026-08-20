const HOST_SLASH_COMMAND_NAME = /^[a-z][a-z0-9_-]*$/u
const RESERVED_SLASH_COMMANDS = new Set(['smart', 'help'])

/**
 * DSH host commands only accept `/[a-z][a-z0-9_-]*`.
 * Template files may use digits, uppercase, or nested paths such as `001-research`.
 */
export function slashCommandNameFor(templateName: string): string | undefined {
  if (RESERVED_SLASH_COMMANDS.has(templateName)) return undefined
  let mapped = templateName
    .replaceAll('/', '-')
    .replaceAll(/[^A-Za-z0-9_-]/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .toLowerCase()
  mapped = mapped.replace(/^[0-9]+(?:-+)?/, '').replace(/^-+/, '')
  if (!mapped) {
    mapped = templateName.replaceAll(/[^A-Za-z0-9]/g, '').toLowerCase()
    if (!mapped) return undefined
  }
  const withLetter = HOST_SLASH_COMMAND_NAME.test(mapped) ? mapped : `cmd-${mapped}`
  if (!HOST_SLASH_COMMAND_NAME.test(withLetter) || RESERVED_SLASH_COMMANDS.has(withLetter)) return undefined
  return withLetter
}

export { HOST_SLASH_COMMAND_NAME, RESERVED_SLASH_COMMANDS }
