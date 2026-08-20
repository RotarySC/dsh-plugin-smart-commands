import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { compareInventory, filterInventory, groupInventory, type CatalogFilter } from '../catalog-query.js'
import type { InventoryTemplate, TemplateInventory, TemplateOrigin } from '../types/catalog.js'
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
  onToggle: () => void
  onEdit: () => void
  onCopy: () => void
  onDelete: () => void
}): ReactNode {
  const key = itemKey(template)
  const checkId = `sc-check-${key.replace(/[^A-Za-z0-9_-]/g, '-')}`
  return (
    <li className="sc-row">
      <label className="sc-check" htmlFor={checkId}>
        <input
          id={checkId}
          type="checkbox"
          checked={selected}
          onChange={onToggle}
        />
        <span className="sc-visually-hidden">{t('selectOne')}</span>
      </label>
      <div className="sc-row-main">
        <div className="sc-row-head">
          <h3 title={template.name}>{titleOf(template)}</h3>
          <div className="sc-row-actions">
            <button type="button" className="sc-link" onClick={onCopy}>{t('copy')}</button>
            <button type="button" className="sc-link" onClick={onEdit}>{t('edit')}</button>
            <button type="button" className="sc-link sc-link-danger" onClick={onDelete}>{t('delete')}</button>
          </div>
        </div>
        <div className="sc-meta">
          <span className="sc-tag" title={template.sourceLabel}>{originLabel(t, template)}</span>
          {template.isSubagent ? <span className="sc-tag">{t('subagent')}</span> : null}
          {template.hasChain ? <span className="sc-tag">{t('chain')}</span> : null}
          {template.continuable ? <span className="sc-tag">{t('continuable')}</span> : null}
          {overridden ? <span className="sc-tag sc-tag-warn">{t('overridden')}</span> : null}
        </div>
        <p className="sc-desc">{template.description}</p>
      </div>
    </li>
  )
}

export function SmartCommandsSection({ t, api: apiProp, connect, workspaceRoot }: SmartCommandsSectionProps): ReactNode {
  const connectRemote = connect ?? getActiveSmartCommandsConnect()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<CatalogFilter>('all')
  const [inventory, setInventory] = useState<TemplateInventory | undefined>()
  const [selected, setSelected] = useState<string[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>(apiProp || connectRemote ? 'loading' : 'idle')
  const [error, setError] = useState<string | undefined>()
  const [editor, setEditor] = useState<EditorState | undefined>()
  const [importer, setImporter] = useState<ImportState | undefined>()
  const [busy, setBusy] = useState(false)
  const [api, setApi] = useState<SmartCommandsRemote | undefined>(apiProp)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => { ensureStyles() }, [])

  const scope = (): { workspaceRoot?: string } => {
    const root = workspaceRoot?.()
    return root ? { workspaceRoot: root } : {}
  }

  const load = useCallback(async () => {
    let remote = api
    if (!remote && connectRemote) {
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
      setInventory(unwrap(await remote.list(scope())))
      setStatus('idle')
    } catch (caught) {
      setStatus('error')
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }, [api, connectRemote, workspaceRoot])

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

  const addImportFiles = (list: ArrayLike<File>): void => {
    setImporter(current => {
      if (!current) return current
      const incoming = Array.from(list).filter(file => collectImportFiles([file]).length > 0)
      if (incoming.length === 0) return current
      const merged = mergeImportSources(current.files, incoming)
      const nextFiles = merged.map(meta =>
        incoming.find(file => sourceKey(file) === sourceKey(meta))
        ?? current.files.find(file => sourceKey(file) === sourceKey(meta))
      ).filter((file): file is File => Boolean(file))
      return { ...current, files: nextFiles, error: undefined }
    })
  }

  const pickImportFiles = (event: ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return
    addImportFiles(files)
  }

  const removeImportFile = (file: ImportSource): void => {
    setImporter(current => current
      ? { ...current, files: current.files.filter(item => sourceKey(item) !== sourceKey(file)) }
      : current)
  }

  const confirmImport = async (): Promise<void> => {
    if (!api || !importer || importer.files.length === 0) return
    setBusy(true)
    try {
      for (const file of importer.files) {
        const payload = file.name.toLowerCase().endsWith('.zip')
          ? await file.arrayBuffer()
          : await file.text()
        for (const item of parseImportPayload(file.name, payload)) {
          const result = unwrap(await api.write({
            name: item.name,
            origin: importer.origin,
            content: item.content,
            mode: 'create',
            ...scope(),
          }))
          if (!result.ok) {
            setImporter({ ...importer, error: result.error ?? t('validation') })
            return
          }
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

  const renderRows = (items: InventoryTemplate[]): ReactNode => (
    <ul className="sc-list">
      {items.map(template => {
        const key = itemKey(template)
        return (
          <TemplateRow
            key={key}
            template={template}
            overridden={template.origin === 'user' && projectNames.has(template.name)}
            selected={selectedSet.has(key)}
            t={t}
            onToggle={() => { toggleSelected(key) }}
            onEdit={() => { void openEdit(template) }}
            onCopy={() => { openCopy(template) }}
            onDelete={() => { void remove(template) }}
          />
        )
      })}
    </ul>
  )

  if (!api && status !== 'loading' && !connectRemote) {
    return <div className="sc-root"><p className="sc-empty">{t('unavailable')}</p></div>
  }

  return (
    <div className="sc-root">
      <div className="sc-header">
        <h2>{t('title')}</h2>
        <p>{t('subtitle')}</p>
      </div>
      <div className="sc-toolbar">
        <div className="sc-toolbar-row">
          <label className="sc-search">
            <span className="sc-visually-hidden">{t('search')}</span>
            <input value={query} onChange={event => { setQuery(event.target.value) }} placeholder={t('search')} />
          </label>
          <div className="sc-toolbar-actions">
            <button type="button" className="sc-btn sc-btn-primary" onClick={openCreate} disabled={busy || !api}>{t('new')}</button>
            <button type="button" className="sc-btn" onClick={openImport} disabled={busy || !api}>{t('import')}</button>
            <button
              type="button"
              className="sc-btn"
              onClick={() => { void exportSelected() }}
              disabled={busy || !api || selectedVisible.length === 0}
            >
              {t('export')}
            </button>
          </div>
        </div>
        <div className="sc-toolbar-row">
          <div className="sc-seg" role="group" aria-label={t('filterAll')}>
            <button
              type="button"
              aria-pressed={filter === 'all'}
              data-on={filter === 'all'}
              onClick={() => { setFilter('all') }}
            >
              {t('filterAll')}
            </button>
            <span className="sc-seg-divider" aria-hidden="true" />
            <button
              type="button"
              aria-pressed={filter === 'subagent'}
              data-on={filter === 'subagent'}
              onClick={() => { setFilter('subagent') }}
            >
              {t('filterSubagent')}
            </button>
          </div>
          {visible.length > 0 ? (
            <div className="sc-select-tools">
              <button type="button" className="sc-link" onClick={selectAllVisible} disabled={busy}>{t('selectAll')}</button>
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
    </div>
  )
}
