import { TemplateLoader } from '../loader/template-loader.js'
import { KeywordLoader } from '../loader/keyword-loader.js'
import { TemplateValidationError } from '../loader/frontmatter-parser.js'
import { assertTemplateName, assertTemplateSize } from '../loader/names.js'
import type {
  CatalogMutationResult,
  TemplateCopyRequest,
  TemplateDocument,
  TemplateIdentity,
  TemplateInventory,
  TemplateWriteRequest,
} from '../types/catalog.js'
import type {
  KeywordInventory,
  KeywordMutationResult,
  KeywordWriteRequest,
} from '../types/keywords.js'

export type { TemplateCopyRequest, TemplateIdentity, TemplateWriteRequest } from '../types/catalog.js'
export type { KeywordInventory, KeywordMutationResult, KeywordWriteRequest } from '../types/keywords.js'

function asError(error: unknown): string {
  return error instanceof TemplateValidationError || error instanceof Error ? error.message : String(error)
}

function isMissingFile(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'ENOENT')
}

export class SmartCommandsCatalogApi {
  private readonly keywordLoader: KeywordLoader

  constructor(
    private readonly loader: TemplateLoader,
    keywordLoader?: KeywordLoader,
  ) {
    this.keywordLoader = keywordLoader ?? new KeywordLoader(loader.directories.projectDir)
  }

  private retarget(workspaceRoot?: string): void {
    if (workspaceRoot) {
      this.loader.retargetProject(workspaceRoot)
      this.keywordLoader.retargetProject(workspaceRoot)
    }
  }

  async listKeywords(request: { workspaceRoot?: string } = {}): Promise<KeywordInventory> {
    this.retarget(request.workspaceRoot)
    return await this.keywordLoader.loadInventory(request.workspaceRoot)
  }

  async writeKeywords(request: KeywordWriteRequest): Promise<KeywordMutationResult> {
    this.retarget(request.workspaceRoot)
    return await this.keywordLoader.writeCategories(request.origin, request.categories, request.workspaceRoot)
  }

  async list(request: { workspaceRoot?: string } = {}): Promise<TemplateInventory> {
    this.retarget(request.workspaceRoot)
    await this.loader.ready()
    return this.loader.inventory
  }

  async read(request: TemplateIdentity): Promise<TemplateDocument> {
    this.retarget(request.workspaceRoot)
    await this.loader.ready()
    assertTemplateName(request.name)
    try {
      return await this.loader.readTemplate(request.name, request.origin)
    } catch (error) {
      if (isMissingFile(error)) {
        throw new TemplateValidationError(`template not found: ${request.origin}/${request.name}`)
      }
      throw error
    }
  }

  async write(request: TemplateWriteRequest): Promise<CatalogMutationResult> {
    this.retarget(request.workspaceRoot)
    await this.loader.ready()
    try {
      assertTemplateName(request.name)
      assertTemplateSize(request.content)
      const exists = await this.loader.templateExists(request.name, request.origin)
      if (request.mode === 'create' && exists) {
        return { ok: false, error: `template already exists: ${request.origin}/${request.name}` }
      }
      if (request.mode === 'update' && !exists) {
        return { ok: false, error: `template not found: ${request.origin}/${request.name}` }
      }
      await this.loader.writeTemplate(request.name, request.content, request.origin)
      return { ok: true, name: request.name, origin: request.origin }
    } catch (error) {
      return { ok: false, error: asError(error) }
    }
  }

  async remove(request: TemplateIdentity): Promise<CatalogMutationResult> {
    this.retarget(request.workspaceRoot)
    await this.loader.ready()
    try {
      assertTemplateName(request.name)
      if (!await this.loader.templateExists(request.name, request.origin)) {
        return { ok: false, error: `template not found: ${request.origin}/${request.name}` }
      }
      await this.loader.deleteTemplate(request.name, request.origin)
      return { ok: true, name: request.name, origin: request.origin }
    } catch (error) {
      return { ok: false, error: asError(error) }
    }
  }

  async copy(request: TemplateCopyRequest): Promise<CatalogMutationResult> {
    this.retarget(request.workspaceRoot)
    await this.loader.ready()
    try {
      assertTemplateName(request.fromName)
      assertTemplateName(request.toName)
      const source = await this.loader.readTemplate(request.fromName, request.fromOrigin)
      if (await this.loader.templateExists(request.toName, request.toOrigin)) {
        return { ok: false, error: `template already exists: ${request.toOrigin}/${request.toName}` }
      }
      await this.loader.writeTemplate(request.toName, source.content, request.toOrigin)
      return { ok: true, name: request.toName, origin: request.toOrigin }
    } catch (error) {
      if (isMissingFile(error)) {
        return { ok: false, error: `template not found: ${request.fromOrigin}/${request.fromName}` }
      }
      return { ok: false, error: asError(error) }
    }
  }
}
