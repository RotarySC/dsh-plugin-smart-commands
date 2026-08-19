export class JsonPointerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JsonPointerError'
  }
}

function decodeToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~')
}

export function getByPointer(document: unknown, pointer: string): unknown {
  if (pointer === '' || pointer === '/') {
    return pointer === '/' && document && typeof document === 'object' && !Array.isArray(document) && '' in document
      ? (document as Record<string, unknown>)['']
      : document
  }
  if (!pointer.startsWith('/')) {
    throw new JsonPointerError(`JSON Pointer must start with "/": ${pointer}`)
  }
  let current: unknown = document
  for (const raw of pointer.slice(1).split('/')) {
    const token = decodeToken(raw)
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/.test(token)) {
        throw new JsonPointerError(`JSON Pointer array index must be an integer: ${pointer}`)
      }
      const index = Number.parseInt(token, 10)
      current = current[index]
      continue
    }
    if (!current || typeof current !== 'object') {
      throw new JsonPointerError(`JSON Pointer ${pointer} does not resolve`)
    }
    current = (current as Record<string, unknown>)[token]
  }
  return current
}
