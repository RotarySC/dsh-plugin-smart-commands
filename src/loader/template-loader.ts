import { watch, type FSWatcher } from 'node:fs'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import type { CommandTemplate } from '../types/template.js'
import { commandNameFromRelativePath, parseTemplateDocument, TemplateValidationError } from './frontmatter-parser.js'
import { splitModelSpecs } from '../engine/template-engine.js'

export interface TemplateDirectories {
  readonly userDir: string
  readonly projectDir: string
}

export interface LoadedTemplateCatalog {
  readonly templates: CommandTemplate[]
  readonly errors: Array<{ path: string; error: string }>
}

function expandUserPath(raw: string, home: string): string {
  if (raw === '~') return home
  if (raw.startsWith('~/') || raw.startsWith('~\\')) return join(home, raw.slice(2))
  return raw
}

export function resolveTemplateDirectories(
  workspaceRoot: string,
  userTemplatesDir: string,
  projectTemplatesDir: string,
  home = homedir(),
): TemplateDirectories {
  return {
    userDir: resolve(expandUserPath(userTemplatesDir, home)),
    projectDir: resolve(workspaceRoot, projectTemplatesDir),
  }
}

async function listMarkdownFiles(root: string): Promise<string[]> {
  const files: string[] = []
  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: string }).code : undefined
      if (code === 'ENOENT') return
      throw error
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
        continue
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) files.push(full)
    }
  }
  await walk(root)
  return files.sort((a, b) => a.localeCompare(b))
}

function toTemplate(name: string, sourcePath: string, origin: 'user' | 'project', content: string): CommandTemplate {
  const parsed = parseTemplateDocument(content)
  return {
    name,
    sourcePath,
    origin,
    description: parsed.frontmatter.description,
    models: splitModelSpecs(parsed.frontmatter.model),
    restore: parsed.frontmatter.restore ?? true,
    subagent: parsed.frontmatter.subagent ?? false,
    continuable: parsed.frontmatter.continuable === true || parsed.frontmatter.subagent === 'continuable',
    context: parsed.frontmatter.context ?? 'fresh',
    ...parsed.frontmatter.tools ? { tools: parsed.frontmatter.tools } : {},
    ...parsed.frontmatter.skills ? { skills: parsed.frontmatter.skills } : {},
    ...parsed.frontmatter.chain ? { chain: parsed.frontmatter.chain } : {},
    ...parsed.frontmatter.loop !== undefined ? { loop: parsed.frontmatter.loop } : {},
    converge: parsed.frontmatter.converge ?? true,
    worktree: parsed.frontmatter.worktree ?? false,
    body: parsed.body,
  }
}

export async function loadTemplates(dirs: TemplateDirectories): Promise<LoadedTemplateCatalog> {
  const errors: Array<{ path: string; error: string }> = []
  const byName = new Map<string, CommandTemplate>()

  const layers: Array<{ root: string; origin: 'user' | 'project' }> = [
    { root: dirs.userDir, origin: 'user' },
    { root: dirs.projectDir, origin: 'project' },
  ]

  for (const layer of layers) {
    const files = await listMarkdownFiles(layer.root)
    for (const file of files) {
      const relativePath = relative(layer.root, file).split(sep).join('/')
      let name: string
      try {
        name = commandNameFromRelativePath(relativePath)
      } catch (error) {
        errors.push({ path: file, error: error instanceof Error ? error.message : String(error) })
        continue
      }
      try {
        const content = await readFile(file, 'utf8')
        byName.set(name, toTemplate(name, file, layer.origin, content))
      } catch (error) {
        errors.push({
          path: file,
          error: error instanceof TemplateValidationError || error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  return {
    templates: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)),
    errors,
  }
}

export class TemplateLoader {
  private cache: LoadedTemplateCatalog = { templates: [], errors: [] }
  private watchers: FSWatcher[] = []
  private reloadTimer: ReturnType<typeof setTimeout> | undefined
  private inFlight: Promise<LoadedTemplateCatalog> | undefined
  private readonly listeners = new Set<(catalog: LoadedTemplateCatalog) => void>()

  constructor(private readonly dirs: TemplateDirectories) {}

  get catalog(): LoadedTemplateCatalog {
    return this.cache
  }

  list(): CommandTemplate[] {
    return this.cache.templates
  }

  get(name: string): CommandTemplate | undefined {
    return this.cache.templates.find(template => template.name === name)
  }

  onChange(listener: (catalog: LoadedTemplateCatalog) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  ready(): Promise<LoadedTemplateCatalog> {
    return this.inFlight ?? Promise.resolve(this.cache)
  }

  reload(): Promise<LoadedTemplateCatalog> {
    this.inFlight = loadTemplates(this.dirs).then(catalog => {
      this.cache = catalog
      for (const listener of this.listeners) listener(this.cache)
      return this.cache
    })
    return this.inFlight
  }

  startWatching(): void {
    this.stopWatching()
    for (const dir of [this.dirs.userDir, this.dirs.projectDir]) {
      try {
        const watcher = watch(dir, { recursive: true }, () => this.scheduleReload())
        this.watchers.push(watcher)
      } catch {
        // Missing directories are created on manage-write; watching is best-effort.
      }
    }
  }

  stopWatching(): void {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer)
      this.reloadTimer = undefined
    }
    for (const watcher of this.watchers) watcher.close()
    this.watchers = []
  }

  async writeProjectTemplate(name: string, content: string): Promise<string> {
    parseTemplateDocument(content)
    const target = join(this.dirs.projectDir, `${name}.md`)
    if (relative(this.dirs.projectDir, resolve(target)).startsWith('..')) {
      throw new TemplateValidationError(`refusing to write template outside project directory: ${name}`)
    }
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, content, 'utf8')
    this.startWatching()
    await this.reload()
    return target
  }

  async deleteProjectTemplate(name: string): Promise<string> {
    const target = join(this.dirs.projectDir, `${name}.md`)
    await rm(target, { force: false })
    await this.reload()
    return target
  }

  async projectTemplateExists(name: string): Promise<boolean> {
    try {
      const info = await stat(join(this.dirs.projectDir, `${name}.md`))
      return info.isFile()
    } catch {
      return false
    }
  }

  private scheduleReload(): void {
    if (this.reloadTimer) clearTimeout(this.reloadTimer)
    this.reloadTimer = setTimeout(() => {
      void this.reload()
    }, 50)
  }
}
