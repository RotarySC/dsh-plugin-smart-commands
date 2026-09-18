import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { ChainRunRecord, ChainRunScope, ChainRunStatus } from '../types/runs.js'
import type { SmartCommandsRemote } from './SmartCommandsSection.js'
import type { SmartCommandsLocaleKey } from './locales.js'
import { getActiveSmartCommandsConnect } from './connect.js'
import {
  ChainIcon,
  CheckIcon,
  ChevronDownIcon,
  CloseIcon,
  CrossIcon,
  DashIcon,
  SpinnerIcon,
} from './icons.js'
import { RUN_DOCK_CSS } from './run-dock.css.js'
import { formatDuration } from '../run-format.js'
import { currentStep, elapsedMs, isLive, runProgress, runStatusCounts, visibleRuns } from './run-view.js'

const STYLE_ID = '@deepseek-ai/dsh-plugin-smart-commands/run-dock.css'
/** A live run refreshes every second so its elapsed clock and step tick. */
const LIVE_POLL_MS = 1_000
/** Idle discovery cadence: cheap enough to notice the next `/<chain>` start. */
const IDLE_POLL_MS = 4_000
/** After a failed read, wait longer before retrying (the panel is an enhancement). */
const BACKOFF_POLL_MS = 8_000

export interface SessionSelectorHookLike {
  <Selected>(selector: (state: { readonly sessionId?: string } | undefined) => Selected): Selected
}

export interface RunDockProps {
  t: (key: SmartCommandsLocaleKey) => string
  /** Direct remote handle (tests / eager wiring). */
  api?: SmartCommandsRemote
  connect?: () => Promise<SmartCommandsRemote | undefined>
  /** Standard `conversation.input.dock` props injected by the slot. */
  sessionId?: string
  useSession?: SessionSelectorHookLike
}

function ensureStyles(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`)) return
  const tag = document.createElement('style')
  tag.dataset.plugin = '@deepseek-ai/dsh-plugin-smart-commands'
  tag.dataset.pluginCss = STYLE_ID
  tag.textContent = RUN_DOCK_CSS
  document.head.appendChild(tag)
}

async function resolveRemote(
  api: SmartCommandsRemote | undefined,
  connect: (() => Promise<SmartCommandsRemote | undefined>) | undefined,
): Promise<SmartCommandsRemote | undefined> {
  if (api) return api
  const factory = connect ?? getActiveSmartCommandsConnect()
  if (!factory) return undefined
  try {
    return await factory()
  } catch {
    return undefined
  }
}

function statusText(t: RunDockProps['t'], status: ChainRunStatus): string {
  if (status === 'running') return t('runStatusRunning')
  if (status === 'succeeded') return t('runStatusSucceeded')
  if (status === 'failed') return t('runStatusFailed')
  return t('runStatusCancelled')
}

/** One run's state glyph, in the outline weight DSH's own dock glyphs use. */
function statusGlyph(status: ChainRunStatus): ReactNode {
  if (status === 'running') return <SpinnerIcon className="sc-run-spin" />
  if (status === 'succeeded') return <CheckIcon />
  if (status === 'failed') return <CrossIcon />
  return <DashIcon />
}

/**
 * Header account, shaped like the todo dock's `8 已完成`: the counts of the
 * statuses actually present, most current first (see `runStatusCounts`).
 */
function summaryText(t: RunDockProps['t'], roster: readonly ChainRunRecord[]): string {
  return runStatusCounts(roster)
    .map(({ status, count }) => `${count} ${statusText(t, status)}`)
    .join(' · ')
}

/**
 * Live view of detached chain runs, docked above the composer card.
 *
 * A chain slash command settles immediately (so the composer never freezes),
 * which means this panel — not the command transaction — is where progress and
 * cancellation live. It polls the plugin's own `listRuns`/`cancelRun`/
 * `dismissRun` remote; a failed read renders nothing rather than reporting an
 * error, because the panel is an enhancement over a fully working command
 * surface.
 *
 * Styling follows the docks DSH already puts in this slot rather than inventing
 * one: the panel is `TodoPanel` (bordered tip surface, glyph + title + count
 * header, scrollable list) and a row is the queue dock's entry (36px, text
 * status, 28px round actions).
 */
export function RunDock(props: RunDockProps): ReactNode {
  const { t, api, connect, sessionId, useSession } = props
  ensureStyles()

  // Standard dock props are either handed down or readable from the session
  // snapshot; the presence of the hook is stable for a given registration.
  const hookSessionId = useSession ? useSession(state => state?.sessionId) : undefined
  const activeSessionId = sessionId ?? (typeof hookSessionId === 'string' ? hookSessionId : undefined)

  const [runs, setRuns] = useState<ChainRunRecord[]>([])
  const [now, setNow] = useState(() => Date.now())
  // Collapsed by default, like the todo dock: the header carries the at-a-glance
  // state (`1 进行中 · 2 已完成`), so a settled run costs one line above the
  // composer instead of a list the user did not ask for. Opening is one click and
  // is remembered for as long as the panel stays mounted.
  const [collapsed, setCollapsed] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set())

  const connectRef = useRef(connect)
  useEffect(() => {
    connectRef.current = connect
  }, [connect])

  const load = useCallback(async (): Promise<ChainRunRecord[] | undefined> => {
    const remote = await resolveRemote(api, connectRef.current)
    if (!remote) return undefined
    const scope: ChainRunScope | undefined = activeSessionId ? { sessionId: activeSessionId } : undefined
    const result = await remote.listRuns(scope)
    return result.ok ? result.value.runs : undefined
  }, [api, activeSessionId])

  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = (ms: number): void => {
      if (disposed) return
      timer = setTimeout(() => { void tick() }, ms)
    }
    const tick = async (): Promise<void> => {
      if (disposed) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        schedule(IDLE_POLL_MS)
        return
      }
      let loaded: ChainRunRecord[] | undefined
      try {
        loaded = await load()
      } catch {
        loaded = undefined
      }
      if (disposed) return
      if (!loaded) {
        schedule(BACKOFF_POLL_MS)
        return
      }
      setNow(Date.now())
      setRuns(loaded)
      schedule(loaded.some(isLive) ? LIVE_POLL_MS : IDLE_POLL_MS)
    }
    void tick()
    return () => {
      disposed = true
      if (timer) clearTimeout(timer)
    }
  }, [load])

  const cancel = useCallback(async (id: string): Promise<void> => {
    const remote = await resolveRemote(api, connectRef.current)
    if (!remote) return
    const result = await remote.cancelRun(activeSessionId ? { runId: id, sessionId: activeSessionId } : { runId: id })
    if (!result.ok) return
    // Optimistic: the host aborts the run asynchronously, but the button should
    // not invite a second click meanwhile.
    setRuns(previous => previous.map(run => run.id === id
      ? { ...run, status: 'cancelled' as const, endedAt: Date.now() }
      : run))
  }, [api, activeSessionId])

  const dismiss = useCallback(async (id: string): Promise<void> => {
    // Hide now, then have the host drop the row from the table. Hiding alone
    // would only last this mount: the panel is remounted per session, and the
    // next `listRuns` would list the row again.
    setDismissed(previous => new Set(previous).add(id))
    let remote: SmartCommandsRemote | undefined
    try {
      remote = await resolveRemote(api, connectRef.current)
    } catch {
      remote = undefined
    }
    // `dismissRun` is guarded because a newer bundle can meet an older host,
    // whose remote object has no such method.
    if (!remote || typeof remote.dismissRun !== 'function') return
    try {
      await remote.dismissRun(activeSessionId ? { runId: id, sessionId: activeSessionId } : { runId: id })
    } catch {
      // Unreachable host: the row stays hidden for this mount and may return.
    }
  }, [api, activeSessionId])

  // A row the user opened stays put until dismissed; an unopened settled row
  // clears itself after FINISHED_VISIBLE_MS.
  const pinned = new Set(Object.keys(expanded).filter(id => expanded[id] === true))
  const roster = visibleRuns(runs, now, { dismissed, pinned })
  if (roster.length === 0) return null

  return (
    <section className="sc-run-dock" aria-label={t('runPanelTitle')}>
      <div className="sc-run-body">
        <button
          type="button"
          className="sc-run-head"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(value => !value)}
        >
          <span className="sc-run-lead"><ChainIcon /></span>
          <span className="sc-run-title">{t('runPanelTitle')}</span>
          <span className="sc-run-summary">{summaryText(t, roster)}</span>
          <span className="sc-run-chevron" data-collapsed={collapsed}>
            <ChevronDownIcon />
          </span>
        </button>
        {!collapsed && (
          <ul className="sc-run-list">
            {roster.map(run => {
              const progress = runProgress(run)
              const live = isLive(run)
              const step = currentStep(run)
              const detail = Boolean(run.text || run.error || run.files.length > 0)
              const open = expanded[run.id] === true
              const position = progress.total === 0
                ? undefined
                : `${Math.min(progress.done + 1, progress.total)}/${progress.total}${step ? ` · ${step.name}` : ''}`
              const round = run.rounds > 1
                ? `${t('runRoundLabel')} ${run.round}/${run.rounds}`
                : undefined
              const state = [statusText(t, run.status), round, position].filter(Boolean).join(' · ')
              return (
                <li key={run.id} className="sc-run-item">
                  <div className="sc-run-row" data-status={run.status}>
                    <span className="sc-run-glyph" aria-hidden="true">{statusGlyph(run.status)}</span>
                    <span className="sc-run-name" title={run.command}>{run.command}</span>
                    <span
                      className="sc-run-phase"
                      title={[statusText(t, run.status), round, position].filter(Boolean).join(' · ')}
                      {...live ? { 'aria-live': 'polite' as const } : {}}
                    >
                      {state}
                    </span>
                    <span className="sc-run-time">{formatDuration(elapsedMs(run, now))}</span>
                    <span className="sc-run-actions">
                      {live && (
                        <button
                          type="button"
                          className="sc-run-action"
                          aria-label={`${t('cancel')} ${run.command}`}
                          onClick={() => { void cancel(run.id) }}
                        >
                          {t('cancel')}
                        </button>
                      )}
                      {!live && detail && (
                        <button
                          type="button"
                          className="sc-run-action"
                          aria-expanded={open}
                          onClick={() => setExpanded(previous => ({ ...previous, [run.id]: !open }))}
                        >
                          {open ? t('runCollapse') : t('runExpand')}
                        </button>
                      )}
                      {!live && (
                        <button
                          type="button"
                          className="sc-run-action"
                          data-icon="true"
                          aria-label={`${t('runDismiss')} ${run.command}`}
                          title={t('runDismiss')}
                          onClick={() => { void dismiss(run.id) }}
                        >
                          <CloseIcon />
                        </button>
                      )}
                    </span>
                  </div>
                  {open && detail && (
                    <div className="sc-run-detail">
                      {run.error && <p className="sc-run-error">{run.error}</p>}
                      {run.text && <pre className="sc-run-text">{run.text}</pre>}
                      {run.files.length > 0 && (
                        <p className="sc-run-files">{t('runFiles')}: {run.files.join(', ')}</p>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
