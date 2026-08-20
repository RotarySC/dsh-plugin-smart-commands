export interface ExportedTemplate {
  readonly name: string
  readonly origin?: 'user' | 'project'
  readonly content: string
}

const LOCAL_SIG = 0x04034b50
const CENTRAL_SIG = 0x02014b50
const EOCD_SIG = 0x06054b50
const UTF8_FLAG = 1 << 11

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let crc = i
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
    }
    table[i] = crc >>> 0
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function asBytes(payload: Uint8Array | ArrayBuffer): Uint8Array {
  return payload instanceof Uint8Array ? payload : new Uint8Array(payload)
}

export function zipEntryName(template: ExportedTemplate): string {
  const origin = template.origin ?? 'project'
  return `${origin}/${template.name}.md`
}

function assertSafeZipPath(path: string): string {
  const normalized = path.replaceAll('\\', '/').replace(/^\.\//, '')
  if (!normalized || normalized.startsWith('/') || normalized.split('/').some(part => part === '' || part === '.' || part === '..')) {
    throw new Error(`refusing unsafe zip path: ${path}`)
  }
  return normalized
}

function templateFromEntry(path: string, content: string): ExportedTemplate | undefined {
  if (!path.toLowerCase().endsWith('.md')) return undefined
  const normalized = assertSafeZipPath(path)
  const withoutExt = normalized.slice(0, -3)
  const slash = withoutExt.indexOf('/')
  if (slash > 0) {
    const head = withoutExt.slice(0, slash)
    const rest = withoutExt.slice(slash + 1)
    if ((head === 'user' || head === 'project') && rest) {
      return { name: rest, origin: head, content }
    }
  }
  return { name: withoutExt, content }
}

export function packTemplatesZip(templates: readonly ExportedTemplate[]): Uint8Array {
  if (templates.length === 0) throw new Error('no templates to export')
  const encoder = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const template of templates) {
    const nameBytes = encoder.encode(assertSafeZipPath(zipEntryName(template)))
    const data = encoder.encode(template.content)
    const crc = crc32(data)
    const local = new Uint8Array(30 + nameBytes.length + data.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, LOCAL_SIG, true)
    localView.setUint16(4, 20, true)
    localView.setUint16(6, UTF8_FLAG, true)
    localView.setUint32(14, crc, true)
    localView.setUint32(18, data.length, true)
    localView.setUint32(22, data.length, true)
    localView.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)
    local.set(data, 30 + nameBytes.length)

    const central = new Uint8Array(46 + nameBytes.length)
    const centralView = new DataView(central.buffer)
    centralView.setUint32(0, CENTRAL_SIG, true)
    centralView.setUint16(4, 20, true)
    centralView.setUint16(6, 20, true)
    centralView.setUint16(8, UTF8_FLAG, true)
    centralView.setUint32(16, crc, true)
    centralView.setUint32(20, data.length, true)
    centralView.setUint32(24, data.length, true)
    centralView.setUint16(28, nameBytes.length, true)
    centralView.setUint32(42, offset, true)
    central.set(nameBytes, 46)

    locals.push(local)
    centrals.push(central)
    offset += local.length
  }
  const cdSize = centrals.reduce((sum, part) => sum + part.length, 0)
  const eocd = new Uint8Array(22)
  const eocdView = new DataView(eocd.buffer)
  eocdView.setUint32(0, EOCD_SIG, true)
  eocdView.setUint16(8, templates.length, true)
  eocdView.setUint16(10, templates.length, true)
  eocdView.setUint32(12, cdSize, true)
  eocdView.setUint32(16, offset, true)
  const out = new Uint8Array(offset + cdSize + eocd.length)
  let cursor = 0
  for (const part of locals) {
    out.set(part, cursor)
    cursor += part.length
  }
  for (const part of centrals) {
    out.set(part, cursor)
    cursor += part.length
  }
  out.set(eocd, cursor)
  return out
}

export function unpackTemplatesZip(payload: Uint8Array | ArrayBuffer): ExportedTemplate[] {
  const bytes = asBytes(payload)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const decoder = new TextDecoder()
  const templates: ExportedTemplate[] = []
  let offset = 0
  while (offset + 30 <= bytes.length) {
    const signature = view.getUint32(offset, true)
    if (signature !== LOCAL_SIG) break
    const method = view.getUint16(offset + 8, true)
    const crc = view.getUint32(offset + 14, true)
    const size = view.getUint32(offset + 18, true)
    const nameLen = view.getUint16(offset + 26, true)
    const extraLen = view.getUint16(offset + 28, true)
    const nameStart = offset + 30
    const dataStart = nameStart + nameLen + extraLen
    if (dataStart + size > bytes.length) throw new Error('zip archive is truncated')
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLen))
    const data = bytes.subarray(dataStart, dataStart + size)
    if (method !== 0) throw new Error('unsupported zip compression')
    if (crc32(data) !== crc) throw new Error('zip crc mismatch')
    const parsed = templateFromEntry(name, decoder.decode(data))
    if (parsed) templates.push(parsed)
    offset = dataStart + size
  }
  if (templates.length === 0) throw new Error('zip archive contains no templates')
  return templates
}
