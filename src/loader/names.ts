import { isAbsolute, relative, resolve } from 'node:path'
import { TemplateValidationError } from './frontmatter-parser.js'

/** Catalog identity: loader file stems such as `001-research` and `review/code`. */
export const TEMPLATE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_/-]*$/
export const MAX_TEMPLATE_BYTES = 256 * 1024

export function assertTemplateName(name: string): void {
  if (
    !TEMPLATE_NAME_PATTERN.test(name)
    || name.includes('..')
    || name.split('/').some(part => part.length === 0)
  ) {
    throw new TemplateValidationError(`invalid template name: ${name}`)
  }
}

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
