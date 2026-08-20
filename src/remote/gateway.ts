import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { TemplateLoader } from '../loader/template-loader.js'
import { SmartCommandsCatalogApi } from './catalog-api.js'
import type {
  CatalogMutationResult,
  TemplateCopyRequest,
  TemplateDocument,
  TemplateIdentity,
  TemplateInventory,
  TemplateWriteRequest,
} from '../types/catalog.js'

export type {
  TemplateCopyRequest,
  TemplateIdentity,
  TemplateWriteRequest,
} from '../types/catalog.js'
export { SmartCommandsCatalogApi } from './catalog-api.js'

const GLOBAL_KEY = Symbol.for('dsh.smartCommands.catalogApi')

function bindCatalogApi(api: SmartCommandsCatalogApi): void {
  const globalStore = globalThis as Record<symbol, unknown>
  globalStore[GLOBAL_KEY] = api
}

function catalogApiOf(): SmartCommandsCatalogApi {
  const api = (globalThis as Record<symbol, unknown>)[GLOBAL_KEY]
  if (!api || typeof api !== 'object' || typeof (api as SmartCommandsCatalogApi).list !== 'function') {
    throw new Error('smartCommands gateway is not initialized')
  }
  return api as SmartCommandsCatalogApi
}

export class SmartCommandsGateway extends TypertRemoteService {
  constructor(ctx: Context, loader: TemplateLoader) {
    // Cordis Service constructors return a tracker proxy; instance fields on
    // `this` after super() are not visible when Gateway later invokes methods.
    bindCatalogApi(new SmartCommandsCatalogApi(loader))
    super(ctx, 'smartCommands')
  }

  @Remote('list')
  list(request: { workspaceRoot?: string } = {}): Promise<TemplateInventory> {
    return catalogApiOf().list(request)
  }

  @Remote('read')
  read(request: TemplateIdentity): Promise<TemplateDocument> {
    return catalogApiOf().read(request)
  }

  @Remote('write')
  write(request: TemplateWriteRequest): Promise<CatalogMutationResult> {
    return catalogApiOf().write(request)
  }

  @Remote('deleteTemplate')
  remove(request: TemplateIdentity): Promise<CatalogMutationResult> {
    return catalogApiOf().remove(request)
  }

  @Remote('copy')
  copy(request: TemplateCopyRequest): Promise<CatalogMutationResult> {
    return catalogApiOf().copy(request)
  }
}

export function tryStartSmartCommandsGateway(ctx: unknown, loader: TemplateLoader): SmartCommandsGateway | undefined {
  if (!ctx || typeof ctx !== 'object') return undefined
  try {
    return new SmartCommandsGateway(ctx as Context, loader)
  } catch {
    bindCatalogApi(new SmartCommandsCatalogApi(loader))
    return undefined
  }
}
