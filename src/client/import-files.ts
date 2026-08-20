const IMPORT_EXTENSIONS = ['.md', '.json', '.zip']

export interface ImportSource {
  readonly name: string
  readonly size: number
  readonly lastModified: number
}

export function isImportableName(name: string): boolean {
  const lower = name.toLowerCase()
  return IMPORT_EXTENSIONS.some(ext => lower.endsWith(ext))
}

export function sourceKey(file: ImportSource): string {
  return file.name.toLowerCase()
}

export function collectImportFiles(list: ArrayLike<{ name: string; size: number; lastModified: number }>): ImportSource[] {
  return Array.from(list)
    .filter(file => isImportableName(file.name))
    .map(file => ({
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
    }))
}

export function mergeImportSources(current: readonly ImportSource[], incoming: readonly ImportSource[]): ImportSource[] {
  const byKey = new Map(current.map(file => [sourceKey(file), file]))
  for (const file of incoming) byKey.set(sourceKey(file), file)
  return [...byKey.values()]
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`
  return `${Math.round(bytes / 1024 / 102.4) / 10} MB`
}
