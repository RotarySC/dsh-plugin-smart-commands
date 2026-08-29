import { realpathSync, watch, type FSWatcher } from 'node:fs'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { isSubagentTemplate } from '../catalog-query.js'
import { slashCommandNameFor } from '../engine/slash-name.js'
import { extractTemplateSlots, splitModelSpecs } from '../engine/template-engine.js'
import type { InventoryError, InventoryTemplate, TemplateDocument, TemplateInventory, TemplateOrigin } from '../types/catalog.js'
import type { CommandTemplate } from '../types/template.js'
import { commandNameFromRelativePath, parseTemplateDocument, TemplateValidationError } from './frontmatter-parser.js'
import { assertTemplateSize, resolveContainedTemplatePath } from './names.js'

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

export function pickWorkspaceRoot(
  candidates: readonly unknown[],
  home = homedir(),
  userTemplatesDir = '~/.dsh/commands',
  projectTemplatesDir = '.dsh/commands',
): string | undefined {
  const roots = candidates.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  for (const root of roots) {
    const dirs = resolveTemplateDirectories(root, userTemplatesDir, projectTemplatesDir, home)
    if (!sameTemplateDirectory(dirs.userDir, dirs.projectDir)) return root
  }
  return roots[0]
}

function canonicalizeDir(path: string): string {
  const resolved = resolve(path)
  try {
    return realpathSync(resolved)
  } catch {
    return resolved
  }
}

export function sameTemplateDirectory(a: string, b: string): boolean {
  const left = canonicalizeDir(a)
  const right = canonicalizeDir(b)
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right
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

function toTemplate(name: string, sourcePath: string, origin: TemplateOrigin, content: string): CommandTemplate {
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

export function sourceLabelFor(origin: TemplateOrigin, sourcePath: string, projectDir?: string): string {
  if (origin === 'user') return 'user'
  const folder = projectDir ?? dirname(sourcePath)
  const resolved = resolve(folder)
  const leaf = basename(resolved)
  const parent = dirname(resolved)
  if (leaf === 'commands' && basename(parent) === '.dsh') {
    return basename(dirname(parent)) || 'project'
  }
  return basename(parent) || leaf || 'project'
}

function toInventoryItem(template: CommandTemplate, projectDir?: string): InventoryTemplate {
  const slashName = slashCommandNameFor(template.name)
  return {
    name: template.name,
    ...slashName ? { slashName } : {},
    description: template.description,
    origin: template.origin,
    sourceLabel: sourceLabelFor(template.origin, template.sourcePath, projectDir),
    hasChain: Boolean(template.chain?.length),
    models: template.models,
    subagent: template.subagent,
    continuable: template.continuable,
    context: template.context,
    parameters: extractTemplateSlots(template),
    isSubagent: isSubagentTemplate(template),
  }
}

function layersOf(dirs: TemplateDirectories): Array<{ root: string; origin: TemplateOrigin }> {
  if (sameTemplateDirectory(dirs.userDir, dirs.projectDir)) {
    return [{ root: dirs.userDir, origin: 'user' }]
  }
  return [
    { root: dirs.userDir, origin: 'user' },
    { root: dirs.projectDir, origin: 'project' },
  ]
}

async function scanLayers(dirs: TemplateDirectories): Promise<{
  files: Array<{ name: string; origin: TemplateOrigin; path: string; template?: CommandTemplate }>
  errors: Array<{ path: string; origin: TemplateOrigin; name?: string; error: string }>
}> {
  const files: Array<{ name: string; origin: TemplateOrigin; path: string; template?: CommandTemplate }> = []
  const errors: Array<{ path: string; origin: TemplateOrigin; name?: string; error: string }> = []

  for (const layer of layersOf(dirs)) {
    const listed = await listMarkdownFiles(layer.root)
    for (const file of listed) {
      const relativePath = relative(layer.root, file).split(sep).join('/')
      let name: string
      try {
        name = commandNameFromRelativePath(relativePath)
      } catch (error) {
        errors.push({
          path: file,
          origin: layer.origin,
          error: error instanceof Error ? error.message : String(error),
        })
        continue
      }
      try {
        const content = await readFile(file, 'utf8')
        files.push({
          name,
          origin: layer.origin,
          path: file,
          template: toTemplate(name, file, layer.origin, content),
        })
      } catch (error) {
        errors.push({
          path: file,
          origin: layer.origin,
          name,
          error: error instanceof TemplateValidationError || error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  return { files, errors }
}

function catalogFromScan(scanned: Awaited<ReturnType<typeof scanLayers>>): LoadedTemplateCatalog {
  const byName = new Map<string, CommandTemplate>()
  for (const file of scanned.files) {
    if (file.template) byName.set(file.name, file.template)
  }
  return {
    templates: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)),
    errors: scanned.errors.map(error => ({ path: error.path, error: error.error })),
  }
}

function inventoryFromScan(
  scanned: Awaited<ReturnType<typeof scanLayers>>,
  projectDir?: string,
): TemplateInventory {
  const templates = scanned.files
    .flatMap(file => file.template ? [toInventoryItem(file.template, projectDir)] : [])
    .sort((a, b) => a.name.localeCompare(b.name) || a.origin.localeCompare(b.origin))
  const errors: InventoryError[] = scanned.errors.map(error => ({
    origin: error.origin,
    ...error.name ? { name: error.name } : {},
    error: error.error,
  }))
  return { templates, errors }
}

export async function loadTemplates(dirs: TemplateDirectories): Promise<LoadedTemplateCatalog> {
  return catalogFromScan(await scanLayers(dirs))
}

export async function loadInventory(dirs: TemplateDirectories): Promise<TemplateInventory> {
  return inventoryFromScan(await scanLayers(dirs), dirs.projectDir)
}

export class TemplateLoader {
  private cache: LoadedTemplateCatalog = { templates: [], errors: [] }
  private inventoryCache: TemplateInventory = { templates: [], errors: [] }
  private watchers: FSWatcher[] = []
  private reloadTimer: ReturnType<typeof setTimeout> | undefined
  private inFlight: Promise<LoadedTemplateCatalog> | undefined
  private readonly listeners = new Set<(catalog: LoadedTemplateCatalog) => void>()

  constructor(private dirs: TemplateDirectories) {}

  retargetProject(workspaceRoot: string, projectTemplatesDir = '.dsh/commands'): void {
    const next = {
      userDir: this.dirs.userDir,
      projectDir: resolve(workspaceRoot, projectTemplatesDir),
    }
    if (
      sameTemplateDirectory(next.userDir, this.dirs.userDir)
      && sameTemplateDirectory(next.projectDir, this.dirs.projectDir)
    ) return
    this.dirs = next
    this.startWatching()
    void this.reload()
  }

  get directories(): TemplateDirectories {
    return this.dirs
  }

  get catalog(): LoadedTemplateCatalog {
    return this.cache
  }

  get inventory(): TemplateInventory {
    return this.inventoryCache
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
    this.inFlight = scanLayers(this.dirs).then(scanned => {
      this.cache = catalogFromScan(scanned)
      this.inventoryCache = inventoryFromScan(scanned, this.dirs.projectDir)
      for (const listener of this.listeners) listener(this.cache)
      return this.cache
    })
    return this.inFlight
  }

  startWatching(): void {
    this.stopWatching()
    const roots = layersOf(this.dirs).map(layer => layer.root)
    for (const dir of roots) {
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
    return this.writeTemplate(name, content, 'project')
  }

  async deleteProjectTemplate(name: string): Promise<string> {
    return this.deleteTemplate(name, 'project')
  }

  async projectTemplateExists(name: string): Promise<boolean> {
    return this.templateExists(name, 'project')
  }

  async writeTemplate(name: string, content: string, origin: TemplateOrigin): Promise<string> {
    if (origin === 'project' && sameTemplateDirectory(this.dirs.userDir, this.dirs.projectDir)) {
      throw new TemplateValidationError('project templates directory is not distinct from the user directory')
    }
    assertTemplateSize(content)
    parseTemplateDocument(content)
    const target = resolveContainedTemplatePath(this.rootFor(origin), name)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, content, 'utf8')
    this.startWatching()
    await this.reload()
    return target
  }

  async deleteTemplate(name: string, origin: TemplateOrigin): Promise<string> {
    const target = resolveContainedTemplatePath(this.rootFor(origin), name)
    await rm(target, { force: false })
    await this.reload()
    return target
  }

  async templateExists(name: string, origin: TemplateOrigin): Promise<boolean> {
    try {
      const info = await stat(resolveContainedTemplatePath(this.rootFor(origin), name))
      return info.isFile()
    } catch {
      return false
    }
  }

  async readTemplate(name: string, origin: TemplateOrigin): Promise<TemplateDocument> {
    const target = resolveContainedTemplatePath(this.rootFor(origin), name)
    const content = await readFile(target, 'utf8')
    const template = toTemplate(name, target, origin, content)
    return { ...toInventoryItem(template, this.dirs.projectDir), content }
  }

  private rootFor(origin: TemplateOrigin): string {
    return origin === 'user' ? this.dirs.userDir : this.dirs.projectDir
  }

  private scheduleReload(): void {
    if (this.reloadTimer) clearTimeout(this.reloadTimer)
    this.reloadTimer = setTimeout(() => {
      void this.reload()
    }, 50)
  }
}
