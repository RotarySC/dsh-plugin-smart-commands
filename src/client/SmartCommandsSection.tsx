import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { compareInventory, filterInventory, groupInventory, type CatalogFilter } from '../catalog-query.js'
import type { InventoryTemplate, TemplateInventory, TemplateOrigin } from '../types/catalog.js'
import type {
  InventoryKeywordCategory,
  KeywordCategory,
  KeywordInventory,
  KeywordMutationResult,
  KeywordWriteRequest,
} from '../types/keywords.js'
import { downloadBytes, packTemplatesZip, parseImportPayload } from './bundle.js'
import { collectImportFiles, formatFileSize, mergeImportSources, sourceKey, type ImportSource } from './import-files.js'
import { SECTION_CSS } from './css.js'
import { getActiveSmartCommandsConnect } from './connect.js'
import type { SmartCommandsLocaleKey } from './locales.js'

const STYLE_ID = '@deepseek-ai/dsh-plugin-smart-commands/section.css'

export type RemoteResult<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } }

export interface SmartCommandsRemote {
  list(request?: { workspaceRoot?: string }): Promise<RemoteResult<TemplateInventory>>
  read(request: { name: string; origin: TemplateOrigin; workspaceRoot?: string }): Promise<RemoteResult<InventoryTemplate & { content: string }>>
  write(request: {
    name: string
    origin: TemplateOrigin
    content: string
    mode?: 'create' | 'update'
    workspaceRoot?: string
  }): Promise<RemoteResult<{ ok: boolean; name?: string; origin?: TemplateOrigin; error?: string }>>
  deleteTemplate(request: { name: string; origin: TemplateOrigin; workspaceRoot?: string }): Promise<RemoteResult<{ ok: boolean; error?: string }>>
  copy(request: {
    fromName: string
    fromOrigin: TemplateOrigin
    toName: string
    toOrigin: TemplateOrigin
    workspaceRoot?: string
  }): Promise<RemoteResult<{ ok: boolean; error?: string }>>
  listKeywords(request?: { workspaceRoot?: string }): Promise<RemoteResult<KeywordInventory>>
  writeKeywords(request: KeywordWriteRequest): Promise<RemoteResult<KeywordMutationResult>>
}

export interface SmartCommandsSectionProps {
  t: (key: SmartCommandsLocaleKey) => string
  api?: SmartCommandsRemote
  connect?: () => Promise<SmartCommandsRemote | undefined>
  workspaceRoot?: () => string | undefined
}

type EditorMode = 'create' | 'edit' | 'copy'

interface EditorState {
  mode: EditorMode
  name: string
  origin: TemplateOrigin
  content: string
  fromName?: string
  fromOrigin?: TemplateOrigin
  error?: string
}

interface ImportState {
  files: File[]
  origin: TemplateOrigin
  dragOver: boolean
  error?: string
}

interface CategoryEditorState {
  mode: 'create' | 'edit'
  id: string
  name: string
  description?: string
  origin: TemplateOrigin
  keywordsText: string
  error?: string
}

interface KeywordImportState {
  file?: File
  origin: TemplateOrigin
  dragOver: boolean
  error?: string
}

function ensureStyles(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`)) return
  const tag = document.createElement('style')
  tag.dataset.plugin = '@deepseek-ai/dsh-plugin-smart-commands'
  tag.dataset.pluginCss = STYLE_ID
  tag.textContent = SECTION_CSS
  document.head.appendChild(tag)
}

function unwrap<T>(result: RemoteResult<T>): T {
  if (!result.ok) throw new Error(result.error.message || result.error.code)
  return result.value
}

function originLabel(t: SmartCommandsSectionProps['t'], template: InventoryTemplate): string {
  if (template.origin === 'user') return t('originUser')
  return template.sourceLabel || t('originProject')
}

function itemKey(template: Pick<InventoryTemplate, 'origin' | 'name'>): string {
  return `${template.origin}:${template.name}`
}

function titleOf(template: InventoryTemplate): string {
  return template.slashName ?? template.name
}

function TemplateRow({
  template,
  overridden,
  selected,
  t,
  onToggle,
  onEdit,
  onCopy,
  onDelete,
}: {
  template: InventoryTemplate
  overridden: boolean
  selected: boolean
  t: SmartCommandsSectionProps['t']
  onToggle: (key: string) => void
  onEdit: (template: InventoryTemplate) => void
  onCopy: (template: InventoryTemplate) => void
  onDelete: (template: InventoryTemplate) => void
}): ReactNode {
  return (
    <li className="sc-row">
      <label className="sc-check">
        <input
          type="checkbox"
          checked={selected}
          aria-label={t('selectOne')}
          onChange={() => { onToggle(itemKey(template)) }}
        />
      </label>
      <div className="sc-row-main">
        <div className="sc-row-head">
          <h3 title={titleOf(template)}>{titleOf(template)}</h3>
          <div className="sc-row-actions">
            <button type="button" className="sc-link" onClick={() => { onEdit(template) }}>{t('edit')}</button>
            <button type="button" className="sc-link" onClick={() => { onCopy(template) }}>{t('copy')}</button>
            <button type="button" className="sc-link sc-link-danger" onClick={() => { onDelete(template) }}>{t('delete')}</button>
          </div>
        </div>
        <p className="sc-desc" title={template.description}>{template.description}</p>
        <div className="sc-meta">
          <span className="sc-tag">{originLabel(t, template)}</span>
          {template.isSubagent ? <span className="sc-tag">{t('subagent')}</span> : null}
          {template.hasChain ? <span className="sc-tag">{t('chain')}</span> : null}
          {template.continuable ? <span className="sc-tag">{t('continuable')}</span> : null}
          {template.models.map(model => (
            <span key={model} className="sc-tag">{model}</span>
          ))}
          {overridden ? <span className="sc-tag sc-tag-warn">{t('overridden')}</span> : null}
        </div>
      </div>
    </li>
  )
}

export function SmartCommandsSection(props: SmartCommandsSectionProps): ReactNode {
  const { t, api: initialApi, connect, workspaceRoot } = props
  ensureStyles()

  const [activeMainTab, setActiveMainTab] = useState<'templates' | 'keywords'>('templates')
  const [api, setApi] = useState<SmartCommandsRemote | undefined>(initialApi)
  const [inventory, setInventory] = useState<TemplateInventory | undefined>(undefined)
  const [keywordInventory, setKeywordInventory] = useState<KeywordInventory | undefined>(undefined)
  const [status, setStatus] = useState<'loading' | 'idle' | 'error'>('loading')
  const [error, setError] = useState<string | undefined>(undefined)
  const [filter, setFilter] = useState<CatalogFilter>('all')
  const [keywordOriginFilter, setKeywordOriginFilter] = useState<'all' | TemplateOrigin>('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [editor, setEditor] = useState<EditorState | undefined>(undefined)
  const [categoryEditor, setCategoryEditor] = useState<CategoryEditorState | undefined>(undefined)
  const [importer, setImporter] = useState<ImportState | undefined>(undefined)
  const [keywordImporter, setKeywordImporter] = useState<KeywordImportState | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  const fileInput = useRef<HTMLInputElement | null>(null)
  const keywordFileInput = useRef<HTMLInputElement | null>(null)

  const connectRemote = useCallback(async (): Promise<SmartCommandsRemote | undefined> => {
    if (connect) return await connect()
    const active = getActiveSmartCommandsConnect()
    if (active) return await active()
    return undefined
  }, [connect])

  const scope = useCallback(() => {
    const root = workspaceRoot?.()
    return root ? { workspaceRoot: root } : {}
  }, [workspaceRoot])

  const load = useCallback(async (): Promise<void> => {
    let remote = api
    if (!remote) {
      setStatus('loading')
      try {
        remote = await connectRemote()
        setApi(remote)
      } catch (caught) {
        setStatus('error')
        setError(caught instanceof Error ? caught.message : String(caught))
        return
      }
    }
    if (!remote) {
      setStatus('idle')
      return
    }
    setStatus('loading')
    setError(undefined)
    try {
      const [invRes, kwRes] = await Promise.all([
        remote.list(scope()),
        typeof remote.listKeywords === 'function' ? remote.listKeywords(scope()) : Promise.resolve({ ok: true as const, value: { categories: [], errors: [] } }),
      ])
      setInventory(unwrap(invRes))
      if (kwRes.ok) {
        setKeywordInventory(kwRes.value)
      }
      setStatus('idle')
    } catch (caught) {
      setStatus('error')
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }, [api, connectRemote, scope])

  useEffect(() => { void load() }, [load])

  const projectNames = useMemo(() => {
    return new Set((inventory?.templates ?? []).filter(item => item.origin === 'project').map(item => item.name))
  }, [inventory])

  const visible = useMemo(() => {
    const filtered = filterInventory(inventory?.templates ?? [], query, filter)
    return [...filtered].sort(compareInventory)
  }, [inventory, query, filter])

  const grouped = useMemo(() => groupInventory(visible), [visible])
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const selectedVisible = useMemo(
    () => visible.filter(item => selectedSet.has(itemKey(item))),
    [visible, selectedSet],
  )

  const visibleCategories = useMemo(() => {
    const all = keywordInventory?.categories ?? []
    const q = query.trim().toLowerCase()
    return all.filter(cat => {
      if (keywordOriginFilter !== 'all' && cat.origin !== keywordOriginFilter) return false
      if (!q) return true
      if (cat.name.toLowerCase().includes(q)) return true
      if (cat.description?.toLowerCase().includes(q)) return true
      if (cat.keywords.some(k => k.toLowerCase().includes(q))) return true
      return false
    })
  }, [keywordInventory, keywordOriginFilter, query])

  useEffect(() => {
    const live = new Set((inventory?.templates ?? []).map(itemKey))
    setSelected(current => current.filter(key => live.has(key)))
  }, [inventory])

  const toggleSelected = (key: string): void => {
    setSelected(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key])
  }

  const selectAllVisible = (): void => {
    setSelected(visible.map(itemKey))
  }

  const clearSelection = (): void => {
    setSelected([])
  }

  const openCreate = (): void => {
    setEditor({
      mode: 'create',
      name: '',
      origin: 'project',
      content: t('placeholderBody'),
    })
  }

  const openEdit = async (template: InventoryTemplate): Promise<void> => {
    if (!api) return
    setBusy(true)
    try {
      const document = unwrap(await api.read({ name: template.name, origin: template.origin, ...scope() }))
      setEditor({
        mode: 'edit',
        name: document.name,
        origin: document.origin,
        content: document.content,
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  const openCopy = (template: InventoryTemplate): void => {
    setEditor({
      mode: 'copy',
      name: `${template.name}-copy`,
      origin: template.origin,
      content: '',
      fromName: template.name,
      fromOrigin: template.origin,
    })
  }

  const exportSelected = async (): Promise<void> => {
    if (!api || selectedVisible.length === 0) return
    setBusy(true)
    try {
      const templates = []
      for (const item of selectedVisible) {
        const document = unwrap(await api.read({ name: item.name, origin: item.origin, ...scope() }))
        templates.push({ name: item.name, origin: item.origin, content: document.content })
      }
      downloadBytes('smart-commands.zip', packTemplatesZip(templates), 'application/zip')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  const saveEditor = async (): Promise<void> => {
    if (!api || !editor) return
    setBusy(true)
    try {
      if (editor.mode === 'copy') {
        if (!editor.fromName || !editor.fromOrigin) return
        const result = unwrap(await api.copy({
          fromName: editor.fromName,
          fromOrigin: editor.fromOrigin,
          toName: editor.name.trim(),
          toOrigin: editor.origin,
          ...scope(),
        }))
        if (!result.ok) {
          setEditor({ ...editor, error: result.error ?? t('validation') })
          return
        }
      } else {
        const result = unwrap(await api.write({
          name: editor.name.trim(),
          origin: editor.origin,
          content: editor.content,
          mode: editor.mode === 'create' ? 'create' : 'update',
          ...scope(),
        }))
        if (!result.ok) {
          setEditor({ ...editor, error: result.error ?? t('validation') })
          return
        }
      }
      setEditor(undefined)
      await load()
    } catch (caught) {
      setEditor({ ...editor, error: caught instanceof Error ? caught.message : String(caught) })
    } finally {
      setBusy(false)
    }
  }

  const remove = async (template: InventoryTemplate): Promise<void> => {
    if (!api) return
    if (!window.confirm(t('confirmDelete'))) return
    setBusy(true)
    try {
      const result = unwrap(await api.deleteTemplate({ name: template.name, origin: template.origin, ...scope() }))
      if (!result.ok) setError(result.error ?? t('error'))
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  const removeSelected = async (): Promise<void> => {
    if (!api || selectedVisible.length === 0) return
    if (!window.confirm(t('confirmDeleteSelected'))) return
    setBusy(true)
    try {
      for (const template of selectedVisible) {
        const result = unwrap(await api.deleteTemplate({
          name: template.name,
          origin: template.origin,
          ...scope(),
        }))
        if (!result.ok) {
          setError(result.error ?? t('error'))
          break
        }
      }
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  const openImport = (): void => {
    setImporter({ files: [], origin: 'project', dragOver: false })
  }

  const addImportFiles = (list: FileList | File[] | null): void => {
    if (!importer || !list) return
    const incoming = Array.from(list)
    const existingNames = new Set(importer.files.map(f => f.name.toLowerCase()))
    const newFiles = incoming.filter(f => !existingNames.has(f.name.toLowerCase()))
    setImporter({
      ...importer,
      files: [...importer.files, ...newFiles],
      error: undefined,
    })
  }

  const pickImportFiles = (event: ChangeEvent<HTMLInputElement>): void => {
    addImportFiles(event.target.files)
    if (event.target) event.target.value = ''
  }

  const removeImportFile = (target: File): void => {
    if (!importer) return
    setImporter({
      ...importer,
      files: importer.files.filter(file => file !== target),
    })
  }

  const confirmImport = async (): Promise<void> => {
    if (!api || !importer || importer.files.length === 0) return
    setBusy(true)
    try {
      const parsed: Array<{ name: string; content: string }> = []
      for (const file of importer.files) {
        const buffer = await file.arrayBuffer()
        const payload = parseImportPayload(file.name, new Uint8Array(buffer))
        parsed.push(...payload)
      }
      for (const item of parsed) {
        const result = unwrap(await api.write({
          name: item.name,
          origin: importer.origin,
          content: item.content,
          mode: 'create',
          ...scope(),
        }))
        if (!result.ok) {
          setImporter({ ...importer, error: `${item.name}: ${result.error ?? t('validation')}` })
          return
        }
      }
      setImporter(undefined)
      await load()
    } catch (caught) {
      setImporter({ ...importer, error: caught instanceof Error ? caught.message : String(caught) })
    } finally {
      setBusy(false)
    }
  }

  // --- Category (Keywords) Operations ---

  const openCreateCategory = (): void => {
    setCategoryEditor({
      mode: 'create',
      id: `cat-${Date.now().toString(36)}`,
      name: '',
      description: '',
      origin: 'project',
      keywordsText: '',
    })
  }

  const openEditCategory = (cat: InventoryKeywordCategory): void => {
    setCategoryEditor({
      mode: 'edit',
      id: cat.id,
      name: cat.name,
      description: cat.description ?? '',
      origin: cat.origin,
      keywordsText: cat.keywords.join('\n'),
    })
  }

  const saveCategoryEditor = async (): Promise<void> => {
    if (!api || !categoryEditor || !keywordInventory) return
    setBusy(true)
    try {
      const keywords = categoryEditor.keywordsText
        .split(/[\n,]+/)
        .map(k => k.trim())
        .filter(Boolean)

      const targetOrigin = categoryEditor.origin
      const existingInOrigin = keywordInventory.categories
        .filter(c => c.origin === targetOrigin)
        .map(c => ({
          id: c.id,
          name: c.name,
          ...c.description ? { description: c.description } : {},
          keywords: [...c.keywords],
        }))

      let updatedCategories: KeywordCategory[]
      if (categoryEditor.mode === 'create') {
        updatedCategories = [
          ...existingInOrigin,
          {
            id: categoryEditor.id.trim() || `cat-${Date.now().toString(36)}`,
            name: categoryEditor.name.trim(),
            ...categoryEditor.description?.trim() ? { description: categoryEditor.description.trim() } : {},
            keywords,
          },
        ]
      } else {
        updatedCategories = existingInOrigin.map(c => {
          if (c.id === categoryEditor.id) {
            return {
              id: c.id,
              name: categoryEditor.name.trim(),
              ...categoryEditor.description?.trim() ? { description: categoryEditor.description.trim() } : {},
              keywords,
            }
          }
          return c
        })
      }

      const res = unwrap(await api.writeKeywords({
        origin: targetOrigin,
        categories: updatedCategories,
        ...scope(),
      }))

      if (!res.ok) {
        setCategoryEditor({ ...categoryEditor, error: res.error ?? t('validation') })
        return
      }

      setCategoryEditor(undefined)
      await load()
    } catch (caught) {
      setCategoryEditor({ ...categoryEditor, error: caught instanceof Error ? caught.message : String(caught) })
    } finally {
      setBusy(false)
    }
  }

  const deleteCategory = async (cat: InventoryKeywordCategory): Promise<void> => {
    if (!api || !keywordInventory) return
    if (!window.confirm(t('confirmDeleteCategory'))) return
    setBusy(true)
    try {
      const remaining = keywordInventory.categories
        .filter(c => c.origin === cat.origin && c.id !== cat.id)
        .map(c => ({
          id: c.id,
          name: c.name,
          ...c.description ? { description: c.description } : {},
          keywords: [...c.keywords],
        }))

      const res = unwrap(await api.writeKeywords({
        origin: cat.origin,
        categories: remaining,
        ...scope(),
      }))
      if (!res.ok) {
        setError(res.error ?? t('error'))
      }
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  const exportKeywordsJson = (): void => {
    if (!keywordInventory) return
    const exportData = {
      version: 1,
      categories: visibleCategories.map(c => ({
        id: c.id,
        name: c.name,
        ...c.description ? { description: c.description } : {},
        keywords: c.keywords,
      })),
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'keywords.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const confirmKeywordImport = async (): Promise<void> => {
    if (!api || !keywordImporter || !keywordImporter.file || !keywordInventory) return
    setBusy(true)
    try {
      const text = await keywordImporter.file.text()
      const parsed = JSON.parse(text)
      if (!parsed || !Array.isArray(parsed.categories)) {
        setKeywordImporter({ ...keywordImporter, error: 'Invalid keywords JSON: missing categories array' })
        return
      }

      const importedCats: KeywordCategory[] = parsed.categories.map((item: any, idx: number) => ({
        id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `cat-${idx + 1}`,
        name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : `Category ${idx + 1}`,
        ...typeof item.description === 'string' ? { description: item.description } : {},
        keywords: Array.isArray(item.keywords) ? item.keywords.filter((k: any) => typeof k === 'string') : [],
      }))

      const targetOrigin = keywordImporter.origin
      const existing = keywordInventory.categories
        .filter(c => c.origin === targetOrigin)
        .map(c => ({
          id: c.id,
          name: c.name,
          ...c.description ? { description: c.description } : {},
          keywords: [...c.keywords],
        }))

      // Merge imported categories
      const mergedMap = new Map<string, KeywordCategory>()
      for (const cat of existing) mergedMap.set(cat.id, cat)
      for (const cat of importedCats) mergedMap.set(cat.id, cat)

      const res = unwrap(await api.writeKeywords({
        origin: targetOrigin,
        categories: Array.from(mergedMap.values()),
        ...scope(),
      }))

      if (!res.ok) {
        setKeywordImporter({ ...keywordImporter, error: res.error ?? t('validation') })
        return
      }

      setKeywordImporter(undefined)
      await load()
    } catch (caught) {
      setKeywordImporter({ ...keywordImporter, error: caught instanceof Error ? caught.message : String(caught) })
    } finally {
      setBusy(false)
    }
  }

  const renderRows = (items: InventoryTemplate[]): ReactNode => {
    return (
      <ul className="sc-list">
        {items.map(template => (
          <TemplateRow
            key={itemKey(template)}
            template={template}
            overridden={template.origin === 'user' && projectNames.has(template.name)}
            selected={selectedSet.has(itemKey(template))}
            t={t}
            onToggle={toggleSelected}
            onEdit={item => { void openEdit(item) }}
            onCopy={openCopy}
            onDelete={item => { void remove(item) }}
          />
        ))}
      </ul>
    )
  }

  return (
    <div className="sc-root">
      <div className="sc-header">
        <h2>{activeMainTab === 'templates' ? t('title') : t('keywordsTitle')}</h2>
        <p>{activeMainTab === 'templates' ? t('subtitle') : t('keywordsSubtitle')}</p>
      </div>

      <div className="sc-top-tabs" role="tablist">
        <button
          type="button"
          className="sc-top-tab-btn"
          data-active={activeMainTab === 'templates'}
          onClick={() => {
            setActiveMainTab('templates')
            setQuery('')
          }}
          role="tab"
          aria-selected={activeMainTab === 'templates'}
        >
          {t('templatesTab')}
        </button>
        <button
          type="button"
          className="sc-top-tab-btn"
          data-active={activeMainTab === 'keywords'}
          onClick={() => {
            setActiveMainTab('keywords')
            setQuery('')
          }}
          role="tab"
          aria-selected={activeMainTab === 'keywords'}
        >
          {t('keywordsTab')}
        </button>
      </div>

      {activeMainTab === 'templates' ? (
        <>
          <div className="sc-toolbar">
            <div className="sc-toolbar-row">
              <label className="sc-search">
                <span className="sc-visually-hidden">{t('search')}</span>
                <input
                  type="search"
                  value={query}
                  placeholder={t('search')}
                  onChange={event => { setQuery(event.target.value) }}
                />
              </label>
              <div className="sc-toolbar-actions">
                <button type="button" className="sc-btn sc-btn-primary" disabled={busy || !api} onClick={openCreate}>{t('new')}</button>
                <button type="button" className="sc-btn" disabled={busy || !api} onClick={openImport}>{t('import')}</button>
                <button
                  type="button"
                  className="sc-btn"
                  disabled={busy || !api || selectedVisible.length === 0}
                  onClick={() => { void exportSelected() }}
                >
                  {t('export')}
                </button>
              </div>
            </div>
            <div className="sc-toolbar-row">
              <div className="sc-seg" role="group" aria-label={t('filterAll')}>
                <button
                  type="button"
                  data-on={filter === 'all'}
                  aria-pressed={filter === 'all'}
                  onClick={() => { setFilter('all') }}
                >
                  {t('filterAll')}
                </button>
                <div className="sc-seg-divider" aria-hidden="true" />
                <button
                  type="button"
                  data-on={filter === 'subagent'}
                  aria-pressed={filter === 'subagent'}
                  onClick={() => { setFilter('subagent') }}
                >
                  {t('filterSubagent')}
                </button>
              </div>
              <button
                type="button"
                className="sc-link"
                onClick={selectAllVisible}
                disabled={busy || visible.length === 0 || selectedVisible.length === visible.length}
              >
                {t('selectAll')}
              </button>
              {selectedVisible.length > 0 ? (
                <div className="sc-select-tools">
                  <button
                    type="button"
                    className="sc-link sc-link-danger"
                    onClick={() => { void removeSelected() }}
                    disabled={busy || selectedVisible.length === 0}
                  >
                    {t('deleteSelected')}
                  </button>
                  <button type="button" className="sc-link" onClick={clearSelection} disabled={busy || selected.length === 0}>{t('clearSelection')}</button>
                  <span className="sc-selected-count">{t('selected')}: {selectedVisible.length}</span>
                </div>
              ) : null}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept=".md,.json,.zip,text/markdown,application/json,application/zip"
              multiple
              hidden
              onChange={pickImportFiles}
            />
          </div>
          {status === 'loading' ? <p className="sc-status">{t('loading')}</p> : null}
          {status === 'error' ? (
            <div className="sc-error">
              <span>{error ?? t('error')}</span>
              <button type="button" className="sc-btn" onClick={() => { void load() }}>{t('retry')}</button>
            </div>
          ) : null}
          {status === 'idle' && error ? <p className="sc-error">{error}</p> : null}
          {status === 'idle' && !api ? <p className="sc-empty">{t('unavailable')}</p> : null}
          {status === 'idle' && api && visible.length === 0 ? (
            <p className="sc-empty">{(inventory?.templates.length ?? 0) === 0 ? t('empty') : t('emptySearch')}</p>
          ) : null}
          {grouped.subagent.length > 0 ? (
            <>
              <div className="sc-section-label">{t('subagentSection')} ({grouped.subagent.length})</div>
              {renderRows(grouped.subagent)}
            </>
          ) : null}
          {filter === 'all' && grouped.other.length > 0 ? (
            <>
              <div className="sc-section-label">{t('otherSection')} ({grouped.other.length})</div>
              {renderRows(grouped.other)}
            </>
          ) : null}
        </>
      ) : (
        <>
          <div className="sc-toolbar">
            <div className="sc-toolbar-row">
              <label className="sc-search">
                <span className="sc-visually-hidden">{t('searchKeywords')}</span>
                <input
                  type="search"
                  value={query}
                  placeholder={t('searchKeywords')}
                  onChange={event => { setQuery(event.target.value) }}
                />
              </label>
              <div className="sc-toolbar-actions">
                <button type="button" className="sc-btn sc-btn-primary" disabled={busy || !api} onClick={openCreateCategory}>
                  {t('new')}
                </button>
                <button
                  type="button"
                  className="sc-btn"
                  disabled={busy || !api}
                  onClick={() => setKeywordImporter({ origin: 'project', dragOver: false })}
                >
                  {t('import')}
                </button>
                <button
                  type="button"
                  className="sc-btn"
                  disabled={busy || !api || visibleCategories.length === 0}
                  onClick={exportKeywordsJson}
                >
                  {t('export')}
                </button>
              </div>
            </div>
            <div className="sc-toolbar-row">
              <div className="sc-seg" role="group" aria-label={t('filterAll')}>
                <button
                  type="button"
                  data-on={keywordOriginFilter === 'all'}
                  aria-pressed={keywordOriginFilter === 'all'}
                  onClick={() => { setKeywordOriginFilter('all') }}
                >
                  {t('filterAll')}
                </button>
                <div className="sc-seg-divider" aria-hidden="true" />
                <button
                  type="button"
                  data-on={keywordOriginFilter === 'project'}
                  aria-pressed={keywordOriginFilter === 'project'}
                  onClick={() => { setKeywordOriginFilter('project') }}
                >
                  {t('originProject')}
                </button>
                <div className="sc-seg-divider" aria-hidden="true" />
                <button
                  type="button"
                  data-on={keywordOriginFilter === 'user'}
                  aria-pressed={keywordOriginFilter === 'user'}
                  onClick={() => { setKeywordOriginFilter('user') }}
                >
                  {t('originUser')}
                </button>
              </div>
            </div>
            <input
              ref={keywordFileInput}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={e => {
                const file = e.target.files?.[0]
                if (file && keywordImporter) {
                  setKeywordImporter({ ...keywordImporter, file, error: undefined })
                }
                if (e.target) e.target.value = ''
              }}
            />
          </div>

          {status === 'loading' ? <p className="sc-status">{t('loadingKeywords')}</p> : null}
          {status === 'idle' && visibleCategories.length === 0 ? (
            <p className="sc-empty">{query ? t('noMatchingKeywords') : t('emptyKeywords')}</p>
          ) : null}

          <ul className="sc-list">
            {visibleCategories.map(cat => (
              <li key={`${cat.origin}:${cat.id}`} className="sc-category-card">
                <div className="sc-category-head">
                  <div className="sc-category-title-wrap">
                    <h3 className="sc-category-name">{cat.name}</h3>
                    <span className="sc-tag">{cat.origin === 'user' ? t('originUser') : (cat.sourceLabel || t('originProject'))}</span>
                  </div>
                  <div className="sc-row-actions">
                    <button type="button" className="sc-link" onClick={() => openEditCategory(cat)}>
                      {t('edit')}
                    </button>
                    <button type="button" className="sc-link sc-link-danger" onClick={() => { void deleteCategory(cat) }}>
                      {t('delete')}
                    </button>
                  </div>
                </div>
                {cat.description && <p className="sc-category-desc">{cat.description}</p>}
                <div className="sc-keyword-tags-wrap">
                  {cat.keywords.length === 0 ? (
                    <span className="sc-empty" style={{ fontSize: '11px' }}>{t('emptyKeywords')}</span>
                  ) : (
                    cat.keywords.map(kw => (
                      <span key={kw} className="sc-keyword-badge">
                        {kw}
                      </span>
                    ))
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {importer && typeof document !== 'undefined' ? createPortal((
        <div className="sc-backdrop" role="presentation" onClick={() => { if (!busy) setImporter(undefined) }}>
          <div className="sc-modal" role="dialog" aria-labelledby="sc-import-title" onClick={event => event.stopPropagation()}>
            <h2 id="sc-import-title">{t('importTitle')}</h2>
            <button
              type="button"
              className="sc-drop"
              data-over={importer.dragOver}
              disabled={busy}
              onClick={() => fileInput.current?.click()}
              onDragEnter={event => { event.preventDefault(); setImporter({ ...importer, dragOver: true }) }}
              onDragOver={event => { event.preventDefault(); if (!importer.dragOver) setImporter({ ...importer, dragOver: true }) }}
              onDragLeave={event => { event.preventDefault(); setImporter({ ...importer, dragOver: false }) }}
              onDrop={event => {
                event.preventDefault()
                setImporter({ ...importer, dragOver: false })
                addImportFiles(event.dataTransfer.files)
              }}
            >
              <span>{t('importDrop')}</span>
              <span className="sc-drop-sub">{t('importHint')}</span>
            </button>
            {importer.files.length > 0 ? (
              <ul className="sc-file-list">
                {importer.files.map(file => (
                  <li key={sourceKey(file)} className="sc-file-item">
                    <span className="sc-file-name" title={file.name}>{file.name}</span>
                    <span className="sc-file-size">{formatFileSize(file.size)}</span>
                    <button type="button" className="sc-link" disabled={busy} onClick={() => { removeImportFile(file) }}>{t('importRemove')}</button>
                  </li>
                ))}
              </ul>
            ) : <p className="sc-empty">{t('importEmpty')}</p>}
            <label className="sc-field">
              {t('importOrigin')}
              <select
                value={importer.origin}
                disabled={busy}
                onChange={event => { setImporter({ ...importer, origin: event.target.value as TemplateOrigin }) }}
              >
                <option value="project">{t('originProject')} ({t('originProjectHint')})</option>
                <option value="user">{t('originUser')} ({t('originUserHint')})</option>
              </select>
            </label>
            {importer.error ? <p className="sc-error">{importer.error}</p> : null}
            <div className="sc-modal-actions">
              <button type="button" className="sc-btn" disabled={busy} onClick={() => { setImporter(undefined) }}>{t('cancel')}</button>
              <button
                type="button"
                className="sc-btn sc-btn-primary"
                disabled={busy || importer.files.length === 0}
                onClick={() => { void confirmImport() }}
              >
                {t('importConfirm')}
              </button>
            </div>
          </div>
        </div>
      ), document.body) : null}

      {keywordImporter && typeof document !== 'undefined' ? createPortal((
        <div className="sc-backdrop" role="presentation" onClick={() => { if (!busy) setKeywordImporter(undefined) }}>
          <div className="sc-modal" role="dialog" aria-labelledby="sc-kw-import-title" onClick={event => event.stopPropagation()}>
            <h2 id="sc-kw-import-title">{t('importKeywordsTitle')}</h2>
            <button
              type="button"
              className="sc-drop"
              data-over={keywordImporter.dragOver}
              disabled={busy}
              onClick={() => keywordFileInput.current?.click()}
              onDragEnter={event => { event.preventDefault(); setKeywordImporter({ ...keywordImporter, dragOver: true }) }}
              onDragOver={event => { event.preventDefault(); if (!keywordImporter.dragOver) setKeywordImporter({ ...keywordImporter, dragOver: true }) }}
              onDragLeave={event => { event.preventDefault(); setKeywordImporter({ ...keywordImporter, dragOver: false }) }}
              onDrop={event => {
                event.preventDefault()
                const file = event.dataTransfer.files?.[0]
                setKeywordImporter({ ...keywordImporter, dragOver: false, file, error: undefined })
              }}
            >
              <span>{keywordImporter.file ? keywordImporter.file.name : t('importDrop')}</span>
              <span className="sc-drop-sub">{t('importKeywordsHint')}</span>
            </button>
            <label className="sc-field">
              {t('importOrigin')}
              <select
                value={keywordImporter.origin}
                disabled={busy}
                onChange={event => { setKeywordImporter({ ...keywordImporter, origin: event.target.value as TemplateOrigin }) }}
              >
                <option value="project">{t('originProject')} ({t('originProjectHint')})</option>
                <option value="user">{t('originUser')} ({t('originUserHint')})</option>
              </select>
            </label>
            {keywordImporter.error ? <p className="sc-error">{keywordImporter.error}</p> : null}
            <div className="sc-modal-actions">
              <button type="button" className="sc-btn" disabled={busy} onClick={() => { setKeywordImporter(undefined) }}>{t('cancel')}</button>
              <button
                type="button"
                className="sc-btn sc-btn-primary"
                disabled={busy || !keywordImporter.file}
                onClick={() => { void confirmKeywordImport() }}
              >
                {t('importConfirm')}
              </button>
            </div>
          </div>
        </div>
      ), document.body) : null}

      {editor && typeof document !== 'undefined' ? createPortal((
        <div className="sc-backdrop" role="presentation" onClick={() => { setEditor(undefined) }}>
          <div className="sc-modal" role="dialog" onClick={event => event.stopPropagation()}>
            <h2>{editor.mode === 'edit' ? t('editTitle') : editor.mode === 'copy' ? t('copyTitle') : t('newTitle')}</h2>
            <label className="sc-field">
              {editor.mode === 'copy' ? t('toName') : t('name')}
              <input
                value={editor.name}
                disabled={editor.mode === 'edit'}
                placeholder={t('placeholderName')}
                onChange={event => { setEditor({ ...editor, name: event.target.value }) }}
              />
            </label>
            <label className="sc-field">
              {editor.mode === 'copy' ? t('toOrigin') : t('origin')}
              <select
                value={editor.origin}
                disabled={editor.mode === 'edit'}
                onChange={event => { setEditor({ ...editor, origin: event.target.value as TemplateOrigin }) }}
              >
                <option value="project">{t('originProject')} ({t('originProjectHint')})</option>
                <option value="user">{t('originUser')} ({t('originUserHint')})</option>
              </select>
            </label>
            {editor.mode === 'copy' ? null : (
              <label className="sc-field">
                {t('content')}
                <textarea
                  value={editor.content}
                  onChange={event => { setEditor({ ...editor, content: event.target.value }) }}
                />
              </label>
            )}
            {editor.error ? <p className="sc-error">{editor.error}</p> : null}
            <div className="sc-modal-actions">
              <button type="button" className="sc-btn" onClick={() => { setEditor(undefined) }}>{t('cancel')}</button>
              <button type="button" className="sc-btn sc-btn-primary" disabled={busy || !editor.name.trim()} onClick={() => { void saveEditor() }}>{t('save')}</button>
            </div>
          </div>
        </div>
      ), document.body) : null}

      {categoryEditor && typeof document !== 'undefined' ? createPortal((
        <div className="sc-backdrop" role="presentation" onClick={() => { setCategoryEditor(undefined) }}>
          <div className="sc-modal" role="dialog" onClick={event => event.stopPropagation()}>
            <h2>{categoryEditor.mode === 'edit' ? t('editCategory') : t('addCategory')}</h2>
            <label className="sc-field">
              {t('categoryName')}
              <input
                value={categoryEditor.name}
                placeholder="例如：常用模块、Git 参数"
                onChange={event => { setCategoryEditor({ ...categoryEditor, name: event.target.value }) }}
              />
            </label>
            <label className="sc-field">
              {t('categoryDesc')}
              <input
                value={categoryEditor.description ?? ''}
                placeholder="可选分类说明"
                onChange={event => { setCategoryEditor({ ...categoryEditor, description: event.target.value }) }}
              />
            </label>
            <label className="sc-field">
              {t('origin')}
              <select
                value={categoryEditor.origin}
                disabled={categoryEditor.mode === 'edit'}
                onChange={event => { setCategoryEditor({ ...categoryEditor, origin: event.target.value as TemplateOrigin }) }}
              >
                <option value="project">{t('originProject')} ({t('originProjectHint')})</option>
                <option value="user">{t('originUser')} ({t('originUserHint')})</option>
              </select>
            </label>
            <label className="sc-field">
              {t('keywordsList')}
              <span className="sc-drop-sub">{t('keywordsHint')}</span>
              <textarea
                value={categoryEditor.keywordsText}
                placeholder="src/engine&#10;src/loader&#10;--verbose&#10;--fix"
                style={{ minHeight: '140px' }}
                onChange={event => { setCategoryEditor({ ...categoryEditor, keywordsText: event.target.value }) }}
              />
            </label>
            {categoryEditor.error ? <p className="sc-error">{categoryEditor.error}</p> : null}
            <div className="sc-modal-actions">
              <button type="button" className="sc-btn" onClick={() => { setCategoryEditor(undefined) }}>{t('cancel')}</button>
              <button
                type="button"
                className="sc-btn sc-btn-primary"
                disabled={busy || !categoryEditor.name.trim()}
                onClick={() => { void saveCategoryEditor() }}
              >
                {t('save')}
              </button>
            </div>
          </div>
        </div>
      ), document.body) : null}
    </div>
  )
}
