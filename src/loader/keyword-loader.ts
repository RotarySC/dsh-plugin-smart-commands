import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import type {
  InventoryKeywordCategory,
  KeywordCategory,
  KeywordDocument,
  KeywordInventory,
  KeywordInventoryError,
  KeywordMutationResult,
} from '../types/keywords.js'
import type { TemplateOrigin } from '../types/catalog.js'
import { sameTemplateDirectory } from './template-loader.js'

export const DEFAULT_KEYWORD_CATEGORIES: KeywordCategory[] = [
  {
    id: 'common-flags',
    name: '常用参数',
    description: '命令常用参数与开关',
    keywords: ['--verbose', '--fix', '--coverage', '--dry-run', '--watch'],
  },
  {
    id: 'common-modules',
    name: '常用模块',
    description: '核心源码目录与模块路径',
    keywords: ['src/engine', 'src/loader', 'src/tools', 'src/client', 'src/remote'],
  },
]

export interface KeywordDirectories {
  readonly userFile: string
  readonly projectFile: string
  readonly userDir: string
  readonly projectDir: string
}

function expandUserPath(raw: string, home: string): string {
  if (raw === '~') return home
  if (raw.startsWith('~/') || raw.startsWith('~\\')) return join(home, raw.slice(2))
  return raw
}

export function resolveKeywordPaths(
  workspaceRoot: string,
  home = homedir(),
): KeywordDirectories {
  const userDir = resolve(expandUserPath('~/.dsh', home))
  const projectDir = resolve(workspaceRoot, '.dsh')
  return {
    userDir,
    projectDir,
    userFile: join(userDir, 'keywords.json'),
    projectFile: join(projectDir, 'keywords.json'),
  }
}

function sourceLabelForWorkspace(workspaceRoot: string): string {
  const resolved = resolve(workspaceRoot)
  return basename(resolved) || 'project'
}

export function parseKeywordDocument(raw: string): KeywordDocument {
  const parsed = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Keywords payload must be an object')
  }
  const version = typeof parsed.version === 'number' ? parsed.version : 1
  if (!Array.isArray(parsed.categories)) {
    throw new Error('Keywords document must contain a "categories" array')
  }

  const categories: KeywordCategory[] = []
  for (const item of parsed.categories) {
    if (!item || typeof item !== 'object') continue
    const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `cat-${categories.length + 1}`
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : id
    const description = typeof item.description === 'string' ? item.description : undefined
    const keywords: string[] = Array.isArray(item.keywords)
      ? item.keywords.filter((k: unknown): k is string => typeof k === 'string' && k.trim().length > 0)
      : []

    categories.push({ id, name, ...description ? { description } : {}, keywords })
  }

  return { version, categories }
}

export class KeywordLoader {
  constructor(
    private readonly workspaceRoot: string,
    private readonly home = homedir(),
  ) {}

  retargetProject(workspaceRoot: string): KeywordLoader {
    if (workspaceRoot === this.workspaceRoot) return this
    return new KeywordLoader(workspaceRoot, this.home)
  }

  async loadInventory(workspaceRoot = this.workspaceRoot): Promise<KeywordInventory> {
    const paths = resolveKeywordPaths(workspaceRoot, this.home)
    const isSameDir = sameTemplateDirectory(paths.userDir, paths.projectDir)
    const errors: KeywordInventoryError[] = []
    const userCategories: KeywordCategory[] = []
    const projectCategories: KeywordCategory[] = []

    // 1. Read User File
    try {
      const content = await readFile(paths.userFile, 'utf8')
      const doc = parseKeywordDocument(content)
      userCategories.push(...doc.categories)
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : undefined
      if (code !== 'ENOENT') {
        errors.push({ origin: 'user', error: err instanceof Error ? err.message : String(err) })
      }
    }

    // 2. Read Project File (if not same dir)
    if (!isSameDir) {
      try {
        const content = await readFile(paths.projectFile, 'utf8')
        const doc = parseKeywordDocument(content)
        projectCategories.push(...doc.categories)
      } catch (err: unknown) {
        const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : undefined
        if (code !== 'ENOENT') {
          errors.push({ origin: 'project', error: err instanceof Error ? err.message : String(err) })
        }
      }
    }

    // If both empty and no errors, provide default preset under user origin
    if (userCategories.length === 0 && projectCategories.length === 0 && errors.length === 0) {
      return {
        categories: DEFAULT_KEYWORD_CATEGORIES.map(cat => ({
          ...cat,
          origin: 'user',
          sourceLabel: 'user',
        })),
        errors: [],
      }
    }

    const categories: InventoryKeywordCategory[] = []
    const projectSourceLabel = sourceLabelForWorkspace(workspaceRoot)

    for (const cat of userCategories) {
      categories.push({
        ...cat,
        origin: 'user',
        sourceLabel: 'user',
      })
    }

    for (const cat of projectCategories) {
      categories.push({
        ...cat,
        origin: 'project',
        sourceLabel: projectSourceLabel,
      })
    }

    return { categories, errors }
  }

  async writeCategories(
    origin: TemplateOrigin,
    categories: KeywordCategory[],
    workspaceRoot = this.workspaceRoot,
  ): Promise<KeywordMutationResult> {
    const paths = resolveKeywordPaths(workspaceRoot, this.home)
    const isSameDir = sameTemplateDirectory(paths.userDir, paths.projectDir)

    if (origin === 'project' && isSameDir) {
      return { ok: false, origin, error: 'Project keywords directory resolves to user directory.' }
    }

    const targetFile = origin === 'user' ? paths.userFile : paths.projectFile
    const targetDir = dirname(targetFile)

    try {
      await mkdir(targetDir, { recursive: true })
      const doc: KeywordDocument = {
        version: 1,
        categories: categories.map(cat => ({
          id: cat.id || `cat-${Math.random().toString(36).slice(2, 8)}`,
          name: cat.name || cat.id,
          ...cat.description ? { description: cat.description } : {},
          keywords: Array.isArray(cat.keywords) ? [...cat.keywords] : [],
        })),
      }
      await writeFile(targetFile, JSON.stringify(doc, null, 2) + '\n', 'utf8')
      return { ok: true, origin }
    } catch (err) {
      return { ok: false, origin, error: err instanceof Error ? err.message : String(err) }
    }
  }
}
