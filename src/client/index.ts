import { TYPERT_REMOTE } from './remote-contribution.js'
import { setActiveSmartCommandsConnect } from './connect.js'
import { SmartCommandsSection, type SmartCommandsRemote } from './SmartCommandsSection.js'
import { en, zh, type SmartCommandsLocaleKey } from './locales.js'
import { currentWorkspacePath } from './workspace.js'

export const NS = 'settings.smartCommands'
export const inject = ['slots', 'locale', 'remote', 'typert']

interface LocaleService {
  register(ns: string, dictionaries: { zh: typeof zh; en: typeof en }): () => void
  bind(ns: string): (key: SmartCommandsLocaleKey) => string
}

interface SlotService {
  inject(name: string, callback: () => () => void): void
  register(options: Record<string, unknown>, component: unknown): () => void
}

interface RemoteService {
  $mount(contribution: typeof TYPERT_REMOTE): Promise<unknown>
}

export interface ClientContext {
  locale: LocaleService
  slots: SlotService
  remote: RemoteService
  get?(name: string, strict?: boolean): unknown
  inject?(deps: string[], callback: (scoped: ClientContext) => void): void
  effect(callback: () => (() => void) | void, label?: string): void
}

function asRemote(value: unknown): SmartCommandsRemote | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Partial<SmartCommandsRemote>
  if (typeof record.list !== 'function') return undefined
  return record as SmartCommandsRemote
}

function lookupSmartCommandsRemote(ctx: ClientContext): SmartCommandsRemote | undefined {
  if (typeof ctx.get !== 'function') return undefined
  try {
    return asRemote(ctx.get('remote.smartCommands', false))
  } catch {
    return undefined
  }
}

function lookupOptional<T>(ctx: ClientContext, name: string): T | undefined {
  if (typeof ctx.get !== 'function') return undefined
  try {
    return ctx.get(name, false) as T | undefined
  } catch {
    return undefined
  }
}

function waitForSmartCommandsRemote(ctx: ClientContext): Promise<SmartCommandsRemote> {
  if (typeof ctx.inject !== 'function') {
    return Promise.reject(new Error('remote.smartCommands did not start after $mount'))
  }
  return new Promise((resolve, reject) => {
    try {
      ctx.inject!(['remote.smartCommands'], scoped => {
        const api = lookupSmartCommandsRemote(scoped)
        if (!api) reject(new Error('remote.smartCommands did not start after $mount'))
        else resolve(api)
      })
    } catch (error) {
      reject(error)
    }
  })
}

export async function mountSmartCommandsRemote(ctx: ClientContext): Promise<SmartCommandsRemote> {
  const existing = lookupSmartCommandsRemote(ctx)
  if (existing) return existing
  await ctx.remote.$mount(TYPERT_REMOTE)
  return lookupSmartCommandsRemote(ctx) ?? await waitForSmartCommandsRemote(ctx)
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'smart-commands: dictionaries')
  const t = ctx.locale.bind(NS)
  const connect = () => mountSmartCommandsRemote(ctx)
  ctx.effect(() => setActiveSmartCommandsConnect(connect), 'smart-commands: connect')
  let workspaceRoot = (): string | undefined => currentWorkspacePath({
    workspaces: lookupOptional(ctx, 'workspaces'),
    sessions: lookupOptional(ctx, 'sessions'),
  })
  if (typeof ctx.inject === 'function') {
    try {
      ctx.inject(['workspaces', 'sessions'], scoped => {
        workspaceRoot = () => currentWorkspacePath({
          workspaces: lookupOptional(scoped, 'workspaces'),
          sessions: lookupOptional(scoped, 'sessions'),
        })
      })
    } catch {
      // Optional: settings still work against the user catalog.
    }
  }
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'smart-commands',
    order: 25,
    label: () => t('nav'),
    locale: NS,
    inject: () => ({ t, connect, workspaceRoot }),
  }, SmartCommandsSection))
}
