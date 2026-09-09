import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { InventoryTemplate, TemplateInventory } from '../types/catalog.js'
import type { InventoryKeywordCategory, KeywordInventory } from '../types/keywords.js'
import { filterInventory } from '../catalog-query.js'
import { getActiveSmartCommandsConnect } from './connect.js'
import type { SmartCommandsLocaleKey } from './locales.js'
import type { SmartCommandsRemote } from './SmartCommandsSection.js'
import { PROMPT_MENU_CSS } from './prompt-menu.css.js'
import { ChevronDownIcon, PromptNerdIcon, TagIcon } from './icons.js'
import { appendKeywordToDraft, focusComposer, formatTemplateDraft, readComposerDomDraft, resolveComposerDraft } from './draft-format.js'

const MENU_STYLE_ID = '@deepseek-ai/dsh-plugin-smart-commands/prompt-menu.css'

export interface InputActionsLike {
  setDraft(text: string): void
}

export interface InputZoneLike {
  readonly input?: { readonly text?: string; readonly draft?: string }
}

export interface InputStateLike {
  readonly draft?: string
}

export type SnapshotSelectorHookLike<T> = {
  (): T | undefined
  <Selected>(selector: (state: T) => Selected): Selected
}

export interface PromptMenuButtonProps {
  t: (key: SmartCommandsLocaleKey) => string
  api?: SmartCommandsRemote
  connect?: () => Promise<SmartCommandsRemote | undefined>
  workspaceRoot?: () => string | undefined
  inputActions?: InputActionsLike
  useInput?: SnapshotSelectorHookLike<InputStateLike>
  ownerProps?: InputZoneLike
  input?: { text?: string; draft?: string }
}

interface InventoryCacheEntry {
  inventory: TemplateInventory
  timestamp: number
}

interface KeywordCacheEntry {
  inventory: KeywordInventory
  timestamp: number
}

const inventoryCache = new Map<string, InventoryCacheEntry>()
const keywordCache = new Map<string, KeywordCacheEntry>()
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

type MenuActiveTab = 'prompts' | 'keywords'

export function PromptMenuButton(props: PromptMenuButtonProps): ReactNode {
  const { t, api, connect, workspaceRoot, inputActions, useInput, ownerProps, input } = props
  ensureMenuStyles()

  const liveDraft = useInput ? useInput(state => state?.draft) : undefined
  const draftRef = useRef('')
  const seenLiveDraftRef = useRef<string | undefined>(undefined)
  if (typeof liveDraft === 'string' && liveDraft !== seenLiveDraftRef.current) {
    seenLiveDraftRef.current = liveDraft
    draftRef.current = liveDraft
  }

  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<MenuActiveTab>('prompts')
  const [query, setQuery] = useState('')
  const [templates, setTemplates] = useState<InventoryTemplate[]>([])
  const [categories, setCategories] = useState<InventoryKeywordCategory[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all')
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

  const fetchKeywords = useCallback(async () => {
    const ws = workspaceRoot?.()
    const cacheKey = ws || '__global__'
    const cached = keywordCache.get(cacheKey)

    if (cached) {
      setCategories(cached.inventory.categories)
      if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return
      }
    } else {
      setLoading(true)
    }

    try {
      const client = await resolveApi()
      if (!client || typeof client.listKeywords !== 'function') {
        if (!cached) setCategories([])
        return
      }
      const res = await client.listKeywords({ workspaceRoot: ws })
      if (res.ok) {
        keywordCache.set(cacheKey, { inventory: res.value, timestamp: Date.now() })
        setCategories(res.value.categories)
      } else if (!cached) {
        setCategories([])
      }
    } catch {
      if (!cached) setCategories([])
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
        fetchKeywords()
      }
      return next
    })
  }, [fetchInventory, fetchKeywords])

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

  const visibleKeywords = useMemo(() => {
    const q = query.trim().toLowerCase()
    let pool: string[] = []
    if (selectedCategoryId === 'all') {
      const set = new Set<string>()
      for (const cat of categories) {
        for (const kw of cat.keywords) set.add(kw)
      }
      pool = [...set]
    } else {
      const found = categories.find(c => c.id === selectedCategoryId)
      pool = found ? [...found.keywords] : []
    }
    if (!q) return pool
    return pool.filter(k => k.toLowerCase().includes(q))
  }, [categories, selectedCategoryId, query])

  useEffect(() => {
    setHighlightedIndex(0)
  }, [query, activeTab])

  const restoreFocusToComposer = useCallback(() => {
    focusComposer()
  }, [])

  const resolveCurrentDraft = useCallback(() => {
    if (typeof liveDraft === 'string') return draftRef.current
    const resolved = resolveComposerDraft({
      input,
      ownerInput: ownerProps?.input,
      contentEditableText: readComposerDomDraft(),
    })
    if (resolved) draftRef.current = resolved
    return draftRef.current || resolved
  }, [liveDraft, input, ownerProps])

  const commitDraft = useCallback((nextDraft: string) => {
    draftRef.current = nextDraft
    inputActions?.setDraft(nextDraft)
  }, [inputActions])

  const handleSelectTemplate = useCallback((template: InventoryTemplate) => {
    commitDraft(formatTemplateDraft(resolveCurrentDraft(), template))
    setIsOpen(false)
    setTimeout(restoreFocusToComposer, 0)
  }, [resolveCurrentDraft, commitDraft, restoreFocusToComposer])

  const handleSelectKeyword = useCallback((keyword: string) => {
    commitDraft(appendKeywordToDraft(resolveCurrentDraft(), keyword))
    // Keep popover open to allow continuous clicking
    searchInputRef.current?.focus()
  }, [resolveCurrentDraft, commitDraft])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setIsOpen(false)
      restoreFocusToComposer()
      return
    }

    if (activeTab === 'prompts') {
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
    }
  }, [activeTab, filteredTemplates, highlightedIndex, handleSelectTemplate, restoreFocusToComposer])

  const activeOptionId = activeTab === 'prompts' && filteredTemplates[highlightedIndex]
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
                aria-controls={activeTab === 'prompts' ? 'sc-prompt-listbox' : undefined}
                aria-activedescendant={activeOptionId}
                className="sc-prompt-search-input"
                placeholder={t('searchPlaceholder')}
                value={query}
                onChange={e => setQuery(e.target.value)}
              />

              <div className="sc-prompt-tabs-switch" role="tablist">
                <button
                  type="button"
                  className="sc-prompt-tab-icon-btn"
                  data-active={activeTab === 'prompts'}
                  onClick={() => {
                    setActiveTab('prompts')
                    searchInputRef.current?.focus()
                  }}
                  title={t('tabPrompts')}
                  role="tab"
                  aria-selected={activeTab === 'prompts'}
                >
                  <PromptNerdIcon />
                </button>
                <button
                  type="button"
                  className="sc-prompt-tab-icon-btn"
                  data-active={activeTab === 'keywords'}
                  onClick={() => {
                    setActiveTab('keywords')
                    fetchKeywords()
                    searchInputRef.current?.focus()
                  }}
                  title={t('tabKeywords')}
                  role="tab"
                  aria-selected={activeTab === 'keywords'}
                >
                  <TagIcon />
                </button>
              </div>
            </div>

            {activeTab === 'prompts' ? (
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
            ) : (
              <>
                {categories.length > 0 && (
                  <div className="sc-prompt-category-bar">
                    <button
                      type="button"
                      className="sc-prompt-category-tab"
                      data-active={selectedCategoryId === 'all'}
                      onClick={() => {
                        setSelectedCategoryId('all')
                        searchInputRef.current?.focus()
                      }}
                    >
                      {t('allCategories')}
                    </button>
                    {categories.map(cat => (
                      <button
                        key={`${cat.origin}:${cat.id}`}
                        type="button"
                        className="sc-prompt-category-tab"
                        data-active={selectedCategoryId === cat.id}
                        onClick={() => {
                          setSelectedCategoryId(cat.id)
                          searchInputRef.current?.focus()
                        }}
                        title={cat.description || cat.name}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                )}

                <div className="sc-prompt-keywords-grid">
                  {loading && categories.length === 0 ? (
                    <div className="sc-prompt-status-view">{t('loadingKeywords')}</div>
                  ) : visibleKeywords.length === 0 ? (
                    <div className="sc-prompt-status-view">
                      {query ? t('noMatchingKeywords') : t('emptyKeywords')}
                    </div>
                  ) : (
                    visibleKeywords.map(kw => (
                      <button
                        key={kw}
                        type="button"
                        className="sc-prompt-keyword-pill"
                        onClick={() => handleSelectKeyword(kw)}
                        title={`+ ${kw}`}
                      >
                        {kw}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}

