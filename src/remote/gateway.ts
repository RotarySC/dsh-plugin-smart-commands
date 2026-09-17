import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { TemplateLoader } from '../loader/template-loader.js'
import { ChainRunRegistry } from '../engine/run-registry.js'
import { SmartCommandsCatalogApi } from './catalog-api.js'
import { SmartCommandsRunApi } from './run-api.js'
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
import type {
  ChainRunCancelRequest,
  ChainRunCancelResult,
  ChainRunInventory,
  ChainRunScope,
} from '../types/runs.js'

export type {
  TemplateCopyRequest,
  TemplateIdentity,
  TemplateWriteRequest,
} from '../types/catalog.js'
export type {
  KeywordInventory,
  KeywordMutationResult,
  KeywordWriteRequest,
} from '../types/keywords.js'
export type {
  ChainRunCancelRequest,
  ChainRunCancelResult,
  ChainRunInventory,
  ChainRunRecord,
  ChainRunScope,
  ChainRunStep,
} from '../types/runs.js'
export { SmartCommandsCatalogApi } from './catalog-api.js'
export { SmartCommandsRunApi } from './run-api.js'

const GLOBAL_KEY = Symbol.for('dsh.smartCommands.catalogApi')
const RUN_KEY = Symbol.for('dsh.smartCommands.runApi')

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

function bindRunApi(api: SmartCommandsRunApi): void {
  const globalStore = globalThis as Record<symbol, unknown>
  globalStore[RUN_KEY] = api
}

function runApiOf(): SmartCommandsRunApi {
  const api = (globalThis as Record<symbol, unknown>)[RUN_KEY]
  if (!api || typeof api !== 'object' || typeof (api as SmartCommandsRunApi).listRuns !== 'function') {
    throw new Error('smartCommands run gateway is not initialized')
  }
  return api as SmartCommandsRunApi
}

export class SmartCommandsGateway extends TypertRemoteService {
  constructor(ctx: Context, loader: TemplateLoader, runs?: ChainRunRegistry) {
    // Cordis Service constructors return a tracker proxy; instance fields on
    // `this` after super() are not visible when Gateway later invokes methods.
    bindCatalogApi(new SmartCommandsCatalogApi(loader))
    bindRunApi(new SmartCommandsRunApi(runs ?? new ChainRunRegistry()))
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

  @Remote('listKeywords')
  listKeywords(request: { workspaceRoot?: string } = {}): Promise<KeywordInventory> {
    return catalogApiOf().listKeywords(request)
  }

  @Remote('writeKeywords')
  writeKeywords(request: KeywordWriteRequest): Promise<KeywordMutationResult> {
    return catalogApiOf().writeKeywords(request)
  }

  @Remote('listRuns')
  listRuns(request: ChainRunScope = {}): Promise<ChainRunInventory> {
    return runApiOf().listRuns(request)
  }

  @Remote('cancelRun')
  cancelRun(request: ChainRunCancelRequest): Promise<ChainRunCancelResult> {
    return runApiOf().cancelRun(request)
  }
}

export function tryStartSmartCommandsGateway(
  ctx: unknown,
  loader: TemplateLoader,
  runs?: ChainRunRegistry,
): SmartCommandsGateway | undefined {
  if (!ctx || typeof ctx !== 'object') return undefined
  try {
    return new SmartCommandsGateway(ctx as Context, loader, runs)
  } catch {
    bindCatalogApi(new SmartCommandsCatalogApi(loader))
    bindRunApi(new SmartCommandsRunApi(runs ?? new ChainRunRegistry()))
    return undefined
  }
}
