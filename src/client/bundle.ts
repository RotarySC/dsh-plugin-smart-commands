import { packTemplatesZip, unpackTemplatesZip, type ExportedTemplate } from './zip.js'

export const EXPORT_VERSION = 1 as const

export type { ExportedTemplate }

export interface ExportBundle {
  readonly version: typeof EXPORT_VERSION
  readonly templates: ExportedTemplate[]
}

export { packTemplatesZip, unpackTemplatesZip, zipEntryName } from './zip.js'

function asText(payload: string | Uint8Array | ArrayBuffer): string {
  if (typeof payload === 'string') return payload
  return new TextDecoder().decode(payload instanceof Uint8Array ? payload : new Uint8Array(payload))
}

export function parseImportPayload(fileName: string, payload: string | Uint8Array | ArrayBuffer): ExportedTemplate[] {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.zip')) {
    if (typeof payload === 'string') throw new Error('zip import requires binary contents')
    return unpackTemplatesZip(payload)
  }
  const text = asText(payload)
  if (lower.endsWith('.json')) {
    const parsed = JSON.parse(text) as ExportBundle
    if (parsed?.version !== EXPORT_VERSION || !Array.isArray(parsed.templates)) {
      throw new Error('unsupported smart-commands export')
    }
    return parsed.templates.filter(item => typeof item?.name === 'string' && typeof item?.content === 'string')
  }
  const stem = fileName.replace(/\\/g, '/').split('/').pop() ?? 'imported'
  const name = stem.replace(/\.md$/i, '')
  return [{ name, content: text }]
}

export function buildExportBundle(templates: ExportedTemplate[]): string {
  const bundle: ExportBundle = { version: EXPORT_VERSION, templates }
  return JSON.stringify(bundle, null, 2)
}

export function downloadBytes(filename: string, bytes: Uint8Array, mime: string): void {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const blob = new Blob([copy], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  try {
    anchor.click()
  } finally {
    anchor.remove()
    URL.revokeObjectURL(url)
  }
}

export function downloadText(filename: string, text: string, mime: string): void {
  downloadBytes(filename, new TextEncoder().encode(text), mime)
}
