import { isAbsolute, relative, resolve } from 'node:path'
import { TemplateValidationError } from './frontmatter-parser.js'

/**
 * A catalog identity is a template file stem under a layer directory, e.g.
 * `001-research`, `review/code`, or a hand-written name such as
 * `Video generation`. The loader lists whatever `.md` files exist, so the
 * settings API must be able to address the same names; this validation guards
 * path safety, not charset.
 */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

export function isValidTemplateName(name: string): boolean {
  if (typeof name !== 'string' || name.length === 0) return false
  if (name.includes('\\') || CONTROL_CHARS.test(name)) return false
  if (isAbsolute(name) || /^[A-Za-z]:/.test(name)) return false
  return name.split('/').every(part => part.length > 0 && part !== '.' && part !== '..')
}

export function assertTemplateName(name: string): void {
  if (!isValidTemplateName(name)) {
    throw new TemplateValidationError(`invalid template name: ${name}`)
  }
}

export const MAX_TEMPLATE_BYTES = 256 * 1024

export function assertTemplateSize(content: string): void {
  const bytes = Buffer.byteLength(content, 'utf8')
  if (bytes > MAX_TEMPLATE_BYTES) {
    throw new TemplateValidationError(`template exceeds ${MAX_TEMPLATE_BYTES} bytes`)
  }
}

export function resolveContainedTemplatePath(root: string, name: string): string {
  assertTemplateName(name)
  const target = resolve(root, `${name}.md`)
  const rel = relative(root, target)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new TemplateValidationError(`refusing to write template outside directory: ${name}`)
  }
  return target
}
