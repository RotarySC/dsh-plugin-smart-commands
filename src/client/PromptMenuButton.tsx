import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { InventoryTemplate, TemplateInventory } from '../types/catalog.js'
import { filterInventory } from '../catalog-query.js'
import { getActiveSmartCommandsConnect } from './connect.js'
import type { SmartCommandsLocaleKey } from './locales.js'
import type { SmartCommandsRemote } from './SmartCommandsSection.js'
import { PROMPT_MENU_CSS } from './prompt-menu.css.js'
import { ChevronDownIcon, PromptNerdIcon } from './icons.js'
import { formatTemplateDraft } from './draft-format.js'

const MENU_STYLE_ID = '@deepseek-ai/dsh-plugin-smart-commands/prompt-menu.css'

export interface InputActionsLike {
  setDraft(text: string): void
}

export interface InputZoneLike {
  readonly input?: { readonly text?: string }
}

export interface PromptMenuButtonProps {
  t: (key: SmartCommandsLocaleKey) => string
  api?: SmartCommandsRemote
  connect?: () => Promise<SmartCommandsRemote | undefined>
  workspaceRoot?: () => string | undefined
  inputActions?: InputActionsLike
  ownerProps?: InputZoneLike
  input?: { text?: string }
}

interface InventoryCacheEntry {
  inventory: TemplateInventory
  timestamp: number
}

const inventoryCache = new Map<string, InventoryCacheEntry>()
const CACHE_TTL_MS = 5000

function ensureMenuStyles(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-plugin-css="${MENU_STYLE_ID}"]`)) return
  const tag = document.createElement('style')
  tag.dataset.plugin = '@deepseek-ai/dsh-plugin-smart-commands'
  tag.dataset.pluginCss = MENU_STYLE_ID
  tag.textContent = PROMPT_MENU_CSS
  document.head.appendChild(tag)
}

export function PromptMenuButton(props: PromptMenuButtonProps): ReactNode {
  const { t, api, connect, workspaceRoot, inputActions, ownerProps, input } = props
  ensureMenuStyles()

  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [templates, setTemplates] = useState<InventoryTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null)

  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const resolveApi = useCallback(async (): Promise<SmartCommandsRemote | undefined> => {
    if (api) return api
    if (connect) return await connect()
    const activeConnect = getActiveSmartCommandsConnect()
    if (activeConnect) return await activeConnect()
    return undefined
  }, [api, connect])

  const fetchInventory = useCallback(async () => {
    const ws = workspaceRoot?.()
    const cacheKey = ws || '__global__'
    const cached = inventoryCache.get(cacheKey)

    if (cached) {
      setTemplates(cached.inventory.templates)
      if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return
      }
    } else {
      setLoading(true)
    }

    try {
      const client = await resolveApi()
      if (!client) {
        if (!cached) setTemplates([])
        return
      }
      const res = await client.list({ workspaceRoot: ws })
      if (res.ok) {
        inventoryCache.set(cacheKey, { inventory: res.value, timestamp: Date.now() })
        setTemplates(res.value.templates)
      } else if (!cached) {
        setTemplates([])
      }
    } catch {
      if (!cached) setTemplates([])
    } finally {
      setLoading(false)
    }
  }, [resolveApi, workspaceRoot])

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const popoverWidth = 360
    const popoverHeight = 380
    const margin = 8

    let left = rect.left
    if (left + popoverWidth > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - popoverWidth - 12)
    }

    let top = rect.top - popoverHeight - margin
    if (top < 12) {
      top = rect.bottom + margin
    }

    setPopoverPos({ top, left })
  }, [])

  const handleOpen = useCallback(() => {
    setIsOpen(prev => {
      const next = !prev
      if (next) {
        setQuery('')
        setHighlightedIndex(0)
        fetchInventory()
      }
      return next
    })
  }, [fetchInventory])

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition()
      searchInputRef.current?.focus()
    }
  }, [isOpen, updatePosition])

  useEffect(() => {
    if (!isOpen) return

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (
        triggerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return
      }
      setIsOpen(false)
    }

    const handleScrollOrResize = () => {
      updatePosition()
    }

    document.addEventListener('mousedown', handleOutsideClick, true)
    window.addEventListener('resize', handleScrollOrResize, true)
    window.addEventListener('scroll', handleScrollOrResize, true)

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick, true)
      window.removeEventListener('resize', handleScrollOrResize, true)
      window.removeEventListener('scroll', handleScrollOrResize, true)
    }
  }, [isOpen, updatePosition])

  const filteredTemplates = useMemo(() => {
    return filterInventory(templates, query, 'all')
  }, [templates, query])

  useEffect(() => {
    setHighlightedIndex(0)
  }, [query])

  const restoreFocusToComposer = useCallback(() => {
    if (typeof document === 'undefined') return
    const textarea = document.querySelector('textarea')
    if (textarea) {
      textarea.focus()
    }
  }, [])

  const handleSelectTemplate = useCallback((template: InventoryTemplate) => {
    const currentDraft = input?.text ?? ownerProps?.input?.text ?? (typeof document !== 'undefined' ? document.querySelector('textarea')?.value ?? '' : '')
    const nextDraft = formatTemplateDraft(currentDraft, template)

    if (inputActions?.setDraft) {
      inputActions.setDraft(nextDraft)
    }

    setIsOpen(false)
    setTimeout(restoreFocusToComposer, 0)
  }, [input, ownerProps, inputActions, restoreFocusToComposer])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setIsOpen(false)
      restoreFocusToComposer()
      return
    }

    if (filteredTemplates.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex(idx => (idx + 1) % filteredTemplates.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex(idx => (idx - 1 + filteredTemplates.length) % filteredTemplates.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const selected = filteredTemplates[highlightedIndex]
      if (selected) {
        handleSelectTemplate(selected)
      }
    }
  }, [filteredTemplates, highlightedIndex, handleSelectTemplate, restoreFocusToComposer])

  const activeOptionId = filteredTemplates[highlightedIndex]
    ? `prompt-opt-${filteredTemplates[highlightedIndex]?.origin}-${filteredTemplates[highlightedIndex]?.name}`
    : undefined

  return (
    <div className="sc-prompt-menu-container">
      <button
        ref={triggerRef}
        type="button"
        className="sc-prompt-trigger"
        data-active={isOpen}
        onClick={handleOpen}
        title={t('promptButton')}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="sc-prompt-trigger-icon" aria-hidden="true">
          <PromptNerdIcon />
        </span>
        <span className="sc-prompt-trigger-label">{t('promptButton')}</span>
        <span className="sc-prompt-trigger-arrow" aria-hidden="true">
          <ChevronDownIcon />
        </span>
      </button>

      {isOpen && typeof document !== 'undefined' && popoverPos &&
        createPortal(
          <div
            ref={popoverRef}
            className="sc-prompt-popover"
            style={{
              top: `${popoverPos.top}px`,
              left: `${popoverPos.left}px`,
            }}
            onKeyDown={handleKeyDown}
          >
            <div className="sc-prompt-search-wrapper">
              <input
                ref={searchInputRef}
                type="text"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={isOpen}
                aria-controls="sc-prompt-listbox"
                aria-activedescendant={activeOptionId}
                className="sc-prompt-search-input"
                placeholder={t('searchPlaceholder')}
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>

            <div id="sc-prompt-listbox" className="sc-prompt-list" role="listbox">
              {loading ? (
                <div className="sc-prompt-status-view">{t('loadingTemplates')}</div>
              ) : filteredTemplates.length === 0 ? (
                <div className="sc-prompt-status-view">
                  {templates.length === 0 ? t('empty') : t('noMatchingTemplates')}
                </div>
              ) : (
                filteredTemplates.map((item, index) => {
                  const isHighlighted = index === highlightedIndex
                  const optionId = `prompt-opt-${item.origin}-${item.name}`
                  return (
                    <div
                      id={optionId}
                      key={`${item.origin}:${item.name}`}
                      className="sc-prompt-item"
                      data-highlighted={isHighlighted}
                      role="option"
                      aria-selected={isHighlighted}
                      onClick={() => handleSelectTemplate(item)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                    >
                      <div className="sc-prompt-item-main">
                        <div className="sc-prompt-item-header">
                          <span className="sc-prompt-item-title">{item.slashName ?? item.name}</span>
                          {item.origin === 'project' && (
                            <span className="sc-prompt-badge sc-prompt-badge-project">
                              {item.sourceLabel || t('originProject')}
                            </span>
                          )}
                          {item.isSubagent && (
                            <span className="sc-prompt-badge sc-prompt-badge-subagent">
                              {t('subagent')}
                            </span>
                          )}
                          {item.hasChain && (
                            <span className="sc-prompt-badge sc-prompt-badge-chain">
                              {t('chain')}
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <div className="sc-prompt-item-desc">{item.description}</div>
                        )}
                      </div>
                      <div className="sc-prompt-item-aside">
                        <span className="sc-prompt-slash-pill">
                          /{item.slashName ?? item.name}
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
