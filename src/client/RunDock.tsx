import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { ChainRunRecord, ChainRunScope, ChainRunStatus } from '../types/runs.js'
import type { SmartCommandsRemote } from './SmartCommandsSection.js'
import type { SmartCommandsLocaleKey } from './locales.js'
import { getActiveSmartCommandsConnect } from './connect.js'
import { ChevronDownIcon, CloseIcon } from './icons.js'
import { RUN_DOCK_CSS } from './run-dock.css.js'
import { formatDuration } from '../run-format.js'
import { currentStep, elapsedMs, isLive, runProgress, visibleRuns } from './run-view.js'

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

/**
 * Live view of detached chain runs, docked above the composer card.
 *
 * A chain slash command settles immediately (so the composer never freezes),
 * which means this panel — not the command transaction — is where progress and
 * cancellation live. It polls the plugin's own `listRuns`/`cancelRun` remote;
 * a failed read renders nothing rather than reporting an error, because the
 * panel is an enhancement over a fully working command surface.
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
  const [collapsed, setCollapsed] = useState(false)
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

  const dismiss = useCallback((id: string): void => {
    // Local-only by design: the host keeps the row (and its result) until its
    // own retention window expires, so a refresh can still bring it back.
    setDismissed(previous => new Set(previous).add(id))
  }, [])

  // A row the user opened stays put until dismissed; an unopened settled row
  // clears itself after FINISHED_VISIBLE_MS.
  const pinned = new Set(Object.keys(expanded).filter(id => expanded[id] === true))
  const roster = visibleRuns(runs, now, { dismissed, pinned })
  if (roster.length === 0) return null

  const liveCount = roster.filter(isLive).length
  return (
    <section className="sc-run-dock" aria-label={t('runPanelTitle')}>
      <button
        type="button"
        className="sc-run-head"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed(value => !value)}
      >
        <span>{t('runPanelTitle')}</span>
        {liveCount > 0 && <span className="sc-run-count">{liveCount}</span>}
        <ChevronDownIcon className="sc-run-chevron" />
      </button>
      {!collapsed && (
        <div className="sc-run-list">
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
            const phase = [round, position].filter(Boolean).join(' · ')
            const phaseLabel = [
              round,
              progress.total === 0 ? undefined : `${t('runStepLabel')} ${Math.min(progress.done + 1, progress.total)}`,
              step?.name,
            ].filter(Boolean).join(' · ')
            return (
              <div key={run.id} className="sc-run-row" data-status={run.status}>
                <div className="sc-run-line">
                  <span className="sc-run-name" title={run.command}>{run.command}</span>
                  <span className="sc-run-status">{statusText(t, run.status)}</span>
                  {phase !== '' && (
                    <span
                      className="sc-run-phase"
                      title={phaseLabel}
                      {...live ? { 'aria-live': 'polite' as const } : {}}
                    >
                      {phase}
                    </span>
                  )}
                  <span className="sc-run-time">{formatDuration(elapsedMs(run, now))}</span>
                  {live && (
                    <button
                      type="button"
                      className="sc-run-button"
                      aria-label={`${t('cancel')} ${run.command}`}
                      onClick={() => { void cancel(run.id) }}
                    >
                      {t('cancel')}
                    </button>
                  )}
                  {!live && detail && (
                    <button
                      type="button"
                      className="sc-run-button"
                      aria-expanded={open}
                      onClick={() => setExpanded(previous => ({ ...previous, [run.id]: !open }))}
                    >
                      {open ? t('runCollapse') : t('runExpand')}
                    </button>
                  )}
                  {!live && (
                    <button
                      type="button"
                      className="sc-run-close"
                      aria-label={`${t('runDismiss')} ${run.command}`}
                      onClick={() => dismiss(run.id)}
                    >
                      <CloseIcon />
                    </button>
                  )}
                </div>
                <div
                  className="sc-run-bar"
                  role="progressbar"
                  aria-label={run.command}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress.percent}
                >
                  <span className="sc-run-fill" style={{ width: `${progress.percent}%` }} />
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
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
